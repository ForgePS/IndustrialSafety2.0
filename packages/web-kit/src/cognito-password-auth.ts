import { getApiBaseUrl } from "./api-client.js";
import { setBearerToken, setCsrfToken } from "./auth-storage.js";
import { CognitoOAuthError, type SessionAuthResponse } from "./cognito-oauth.js";

export type CognitoPasswordChallenge =
  | { kind: "new_password_required"; session: string; username: string }
  | { kind: "mfa_required"; session: string; username: string; delivery: "sms" | "totp" };

export class CognitoPasswordChallengeError extends Error {
  readonly challenge: CognitoPasswordChallenge;

  constructor(challenge: CognitoPasswordChallenge) {
    super(
      challenge.kind === "new_password_required"
        ? "A new password is required before you can sign in."
        : "Enter the multi-factor authentication code to finish signing in.",
    );
    this.name = "CognitoPasswordChallengeError";
    this.challenge = challenge;
  }
}

function requireBrowser(): void {
  if (typeof window === "undefined") {
    throw new CognitoOAuthError("Cognito password auth is only available in the browser");
  }
}

function sessionApiUrl(path: string): string {
  try {
    return `${getApiBaseUrl()}${path}`;
  } catch {
    return path;
  }
}

function passwordAuthErrorMessage(message: string | undefined, status: number): string {
  if (!message) return `Sign-in failed (${status})`;
  const lower = message.toLowerCase();
  if (lower.includes("incorrect") || lower.includes("not authorized")) {
    return "Incorrect email or password.";
  }
  return message;
}

type SessionPasswordBody = {
  data?:
    | (Partial<SessionAuthResponse> & { refreshToken?: string; refresh_token?: string })
    | {
        challenge?: {
          kind?: string;
          session?: string;
          username?: string;
          delivery?: "sms" | "totp";
        };
      };
  error?: { message?: string };
};

async function postSessionPassword(
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  requireBrowser();
  const response = await fetch(sessionApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: SessionPasswordBody = {};
  try {
    payload = (await response.json()) as SessionPasswordBody;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new CognitoOAuthError(
      passwordAuthErrorMessage(payload.error?.message, response.status),
    );
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    throw new CognitoOAuthError("Sign-in returned an empty response");
  }

  if ("challenge" in data && data.challenge) {
    const challenge = data.challenge;
    if (challenge.kind === "new_password_required" && challenge.session && challenge.username) {
      throw new CognitoPasswordChallengeError({
        kind: "new_password_required",
        session: challenge.session,
        username: challenge.username,
      });
    }
    if (challenge.kind === "mfa_required" && challenge.session && challenge.username) {
      throw new CognitoPasswordChallengeError({
        kind: "mfa_required",
        session: challenge.session,
        username: challenge.username,
        delivery: challenge.delivery === "totp" ? "totp" : "sms",
      });
    }
    throw new CognitoOAuthError("Unsupported sign-in challenge");
  }

  if ("refreshToken" in data || "refresh_token" in data) {
    throw new CognitoOAuthError("Session response must not include a refresh token");
  }

  const accessToken = "accessToken" in data ? data.accessToken : undefined;
  const csrfToken = "csrfToken" in data ? data.csrfToken : undefined;
  if (!accessToken || !csrfToken) {
    throw new CognitoOAuthError("Sign-in succeeded but no access token was returned");
  }

  setBearerToken(accessToken);
  setCsrfToken(csrfToken);
}

/**
 * Sign in with email/password via platform-api session BFF (Cognito USER_PASSWORD_AUTH).
 * Stores access + CSRF in memory only. Throws CognitoPasswordChallengeError when needed.
 */
export async function authenticateWithPassword(input: {
  username: string;
  password: string;
}): Promise<void> {
  const username = input.username.trim().toLowerCase();
  const password = input.password;
  if (!username || !password) {
    throw new CognitoOAuthError("Email and password are required");
  }

  await postSessionPassword("/api/v1/auth/session/password", { username, password });
}

/** Complete FORCE_CHANGE_PASSWORD / NEW_PASSWORD_REQUIRED after authenticateWithPassword. */
export async function completeNewPasswordChallenge(input: {
  username: string;
  session: string;
  newPassword: string;
}): Promise<void> {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.session || !input.newPassword) {
    throw new CognitoOAuthError("Username, session, and new password are required");
  }

  await postSessionPassword("/api/v1/auth/session/password/challenge", {
    username,
    session: input.session,
    challengeName: "NEW_PASSWORD_REQUIRED",
    newPassword: input.newPassword,
  });
}

/** Complete SMS or TOTP MFA after authenticateWithPassword. */
export async function completeMfaChallenge(input: {
  username: string;
  session: string;
  code: string;
  delivery: "sms" | "totp";
}): Promise<void> {
  const username = input.username.trim().toLowerCase();
  const code = input.code.trim();
  if (!username || !input.session || !code) {
    throw new CognitoOAuthError("Username, session, and MFA code are required");
  }

  const challengeName = input.delivery === "sms" ? "SMS_MFA" : "SOFTWARE_TOKEN_MFA";

  await postSessionPassword("/api/v1/auth/session/password/challenge", {
    username,
    session: input.session,
    challengeName,
    code,
    delivery: input.delivery,
  });
}

