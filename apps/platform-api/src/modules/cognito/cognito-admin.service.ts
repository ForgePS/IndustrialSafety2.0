import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  MessageActionType,
  UserNotFoundException,
  UsernameExistsException,
} from "@aws-sdk/client-cognito-identity-provider";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { APP_ENV } from "../../tokens.js";

export interface ProvisionedCognitoUser {
  username: string;
  subject: string;
  /** Present only when Cognito issued a new temporary password. */
  temporaryPassword?: string;
  created: boolean;
}

export type PasswordResetDelivery = "reset" | "resend" | "simulated";

/** Confirmed users get ForgotPassword mail; invited users need a resent temp password. */
export function passwordResetMethodForStatus(
  status: string | undefined,
  enabled = true,
): Exclude<PasswordResetDelivery, "simulated"> {
  if (!enabled) {
    throw new ForgeError("CONFLICT", "Cannot reset password for a disabled Cognito user");
  }
  if (status === "FORCE_CHANGE_PASSWORD" || status === "UNCONFIRMED") {
    return "resend";
  }
  if (status === "CONFIRMED" || status === "RESET_REQUIRED") {
    return "reset";
  }
  throw new ForgeError(
    "CONFLICT",
    "This account cannot receive a password reset in its current state",
  );
}

/** Real user pool ids look like `us-east-1_AbCdEf123`. */
const USER_POOL_ID_PATTERN = /^[a-z]{2}(?:-[a-z]+)+-\d+_[A-Za-z0-9]+$/;

/**
 * Cognito administration for the invitation lifecycle (ADR-020).
 *
 * When no real user pool is configured (local placeholder environment), the
 * service runs in simulated mode: it derives a deterministic subject from the
 * email so the invitation flow can be exercised end to end without AWS. Every
 * response is marked so callers and audit records can tell the modes apart.
 */
@Injectable()
export class CognitoAdminService {
  private readonly client: CognitoIdentityProviderClient | null;

  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {
    this.client = this.enabled
      ? new CognitoIdentityProviderClient({ region: env.AWS_REGION })
      : null;
  }

  get enabled(): boolean {
    return USER_POOL_ID_PATTERN.test(this.env.COGNITO_USER_POOL_ID);
  }

  /**
   * Creates the Cognito user, or returns the existing one. Message delivery is
   * suppressed outside production so invitations never email synthetic addresses.
   */
  async createOrGetUser(input: {
    email: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
  }): Promise<ProvisionedCognitoUser> {
    if (!this.client) {
      return {
        username: input.email,
        subject: simulatedSubject(this.env.COGNITO_USER_POOL_ID, input.email),
        created: true,
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const attributes = [
      { Name: "email", Value: input.email },
      { Name: "email_verified", Value: "true" },
      ...(input.firstName ? [{ Name: "given_name", Value: input.firstName }] : []),
      ...(input.lastName ? [{ Name: "family_name", Value: input.lastName }] : []),
    ];

    try {
      const response = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: input.email,
          UserAttributes: attributes,
          TemporaryPassword: temporaryPassword,
          MessageAction: this.suppressDelivery ? MessageActionType.SUPPRESS : undefined,
          DesiredDeliveryMediums: this.suppressDelivery ? undefined : ["EMAIL"],
        }),
      );
      const subject = findSubject(response.User?.Attributes);
      if (!subject) {
        throw new ForgeError("INTERNAL_ERROR", "Cognito did not return a subject for the new user");
      }
      return {
        username: response.User?.Username ?? input.email,
        subject,
        temporaryPassword,
        created: true,
      };
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        const existing = await this.getUser(input.email);
        if (!existing) {
          throw new ForgeError("CONFLICT", "Cognito user exists but could not be read");
        }
        return { ...existing, created: false };
      }
      throw wrapCognitoError(error, "Failed to create the Cognito user");
    }
  }

  async getUser(username: string): Promise<{ username: string; subject: string } | null> {
    if (!this.client) {
      return {
        username,
        subject: simulatedSubject(this.env.COGNITO_USER_POOL_ID, username),
      };
    }
    try {
      const response = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
      const subject = findSubject(response.UserAttributes);
      return subject ? { username: response.Username ?? username, subject } : null;
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return null;
      }
      throw wrapCognitoError(error, "Failed to read the Cognito user");
    }
  }

  /**
   * Emails a password reset (confirmed users) or resends the invitation
   * (FORCE_CHANGE_PASSWORD / UNCONFIRMED). Never returns the temporary password.
   */
  async resetPassword(username: string): Promise<{ method: PasswordResetDelivery }> {
    if (!this.client) {
      return { method: "simulated" };
    }

    let status: string | undefined;
    let enabled = true;
    try {
      const response = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
      status = response.UserStatus;
      enabled = response.Enabled !== false;
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        throw new ForgeError("NOT_FOUND", "No Cognito account exists for this user");
      }
      throw wrapCognitoError(error, "Failed to read the Cognito user");
    }

    const method = passwordResetMethodForStatus(status, enabled);
    if (method === "resend") {
      await this.resendInvitation(username);
      return { method };
    }

    try {
      await this.client.send(
        new AdminResetUserPasswordCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
      return { method };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "LimitExceededException" || name === "TooManyRequestsException") {
        throw new ForgeError(
          "RATE_LIMITED",
          "Too many password reset attempts. Try again in a few minutes.",
        );
      }
      throw wrapCognitoError(error, "Failed to send the Cognito password reset");
    }
  }

  /**
   * Re-issues the temporary password for an invited user who has not finished
   * first sign-in.
   *
   * This user pool requires an email for AdminCreateUser (including RESEND).
   * Stored Cognito usernames are often UUIDs when email is an alias, so we
   * resolve the email attribute and pass that as Username. Also set
   * DesiredDeliveryMediums to EMAIL — Cognito defaults to SMS.
   */
  async resendInvitation(username: string): Promise<{ temporaryPassword?: string }> {
    if (!this.client) {
      return {};
    }

    let status: string | undefined;
    let email: string | undefined;
    try {
      const existing = await this.client.send(
        new AdminGetUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
      status = existing.UserStatus;
      email = findAttribute(existing.UserAttributes, "email") ?? undefined;
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        throw new ForgeError("NOT_FOUND", "No Cognito account exists for this invitation");
      }
      throw wrapCognitoError(error, "Failed to read the Cognito user");
    }

    if (status === "CONFIRMED" || status === "RESET_REQUIRED") {
      throw new ForgeError(
        "CONFLICT",
        "This account already completed sign-up. Send a password reset instead of resending the invitation.",
      );
    }
    if (status && status !== "FORCE_CHANGE_PASSWORD" && status !== "UNCONFIRMED") {
      throw new ForgeError(
        "CONFLICT",
        `Cannot resend an invitation while the Cognito account is in ${status} status`,
      );
    }

    const resendUsername = email ?? (looksLikeEmail(username) ? username : undefined);
    if (!resendUsername) {
      throw new ForgeError(
        "CONFLICT",
        "Cognito user has no email address to resend the invitation to",
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          // Pool sign-in is email-based; RESEND rejects non-email usernames.
          Username: resendUsername,
          TemporaryPassword: temporaryPassword,
          UserAttributes: email ? [{ Name: "email", Value: email }] : undefined,
          MessageAction: this.suppressDelivery
            ? MessageActionType.SUPPRESS
            : MessageActionType.RESEND,
          // Default Cognito delivery medium is SMS; email-only users need EMAIL.
          DesiredDeliveryMediums: this.suppressDelivery ? undefined : ["EMAIL"],
        }),
      );
      return { temporaryPassword };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "UnsupportedUserStateException") {
        throw new ForgeError(
          "CONFLICT",
          "This account already completed sign-up. Send a password reset instead of resending the invitation.",
        );
      }
      if (name === "LimitExceededException" || name === "TooManyRequestsException") {
        throw new ForgeError(
          "RATE_LIMITED",
          "Too many invitation resend attempts. Try again in a few minutes.",
        );
      }
      throw wrapCognitoError(error, "Failed to resend the Cognito invitation");
    }
  }

  async disableUser(username: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.send(
        new AdminDisableUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return;
      }
      throw wrapCognitoError(error, "Failed to disable the Cognito user");
    }
  }

  /** Invalidates every issued refresh token for the user. */
  async globalSignOut(username: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.send(
        new AdminUserGlobalSignOutCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return;
      }
      throw wrapCognitoError(error, "Failed to sign the Cognito user out");
    }
  }

  /** Used to roll back a half-created user when an invitation fails. */
  async deleteUser(username: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.send(
        new AdminDeleteUserCommand({
          UserPoolId: this.env.COGNITO_USER_POOL_ID,
          Username: username,
        }),
      );
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return;
      }
      throw wrapCognitoError(error, "Failed to delete the Cognito user");
    }
  }

  private get suppressDelivery(): boolean {
    return this.env.APP_ENV !== "production" && this.env.APP_ENV !== "govcloud-production";
  }
}

function findSubject(
  attributes: ReadonlyArray<{ Name?: string | undefined; Value?: string | undefined }> | undefined,
) {
  return findAttribute(attributes, "sub");
}

function findAttribute(
  attributes: ReadonlyArray<{ Name?: string | undefined; Value?: string | undefined }> | undefined,
  name: string,
) {
  return attributes?.find((attribute) => attribute.Name === name)?.Value;
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@") && !value.includes(" ");
}

/**
 * Stable pseudo-subject for simulated mode. Formatted as a UUID so it satisfies
 * the same storage and comparison rules as a real Cognito `sub`.
 */
function simulatedSubject(userPoolId: string, email: string): string {
  const digest = createHash("sha256").update(`${userPoolId}:${email.toLowerCase()}`).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

/** Meets the pool policy: 12+ chars with upper, lower, digit and symbol. */
function generateTemporaryPassword(): string {
  const raw = randomBytes(18).toString("base64url").slice(0, 16);
  return `Aa1!${raw}`;
}

/**
 * Cognito errors carry pool ids and request metadata. Keep the exception name
 * (and a short, non-PII hint from InvalidParameterException) for operators.
 */
function wrapCognitoError(error: unknown, message: string): ForgeError {
  const name = error instanceof Error ? error.name : "UnknownError";
  const cognitoMessage = error instanceof Error ? error.message : "";
  const safeHint =
    name === "InvalidParameterException" && /username should be an email/i.test(cognitoMessage)
      ? "Username should be an email"
      : undefined;
  return new ForgeError("INTERNAL_ERROR", safeHint ? `${message} (${safeHint})` : message, {
    details: [{ provider: "COGNITO", reason: name }],
  });
}
