import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  ChallengeNameType,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { verifyCognitoAccessToken } from "@forge/auth";
import {
  authBrowserSessions,
  lookupIdentity,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { hashOpaqueSecret } from "@forge/security";
import { and, eq, isNull, sql } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import {
  decryptRefreshToken,
  encryptRefreshToken,
  resolveAuthSessionEncryptionKey,
} from "./auth-session-crypto.js";

const DEFAULT_IDLE_SECONDS = 43_200;
const DEFAULT_ABSOLUTE_SECONDS = 86_400;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30;

export type AuthSessionTokens = {
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
  rawSessionToken: string;
  maxAgeSeconds: number;
};

export type PasswordChallengeResult =
  | {
      kind: "tokens";
      tokens: AuthSessionTokens;
    }
  | {
      kind: "challenge";
      challengeName: string;
      session: string;
      username: string;
      delivery?: "sms" | "totp";
    };

@Injectable()
export class AuthSessionService {
  private readonly cognitoIdp: CognitoIdentityProviderClient;
  private readonly encryptionKey: Buffer;
  private readonly idleSeconds: number;
  private readonly absoluteSeconds: number;

  constructor(
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    @Inject(DATABASE) private readonly db: Database,
  ) {
    this.cognitoIdp = new CognitoIdentityProviderClient({ region: env.AWS_REGION });
    this.encryptionKey = resolveAuthSessionEncryptionKey(
      env.APP_ENV,
      env.FORGE_AUTH_SESSION_ENCRYPTION_KEY,
    );
    this.idleSeconds = clampTtl(
      env.FORGE_AUTH_SESSION_IDLE_SECONDS ?? DEFAULT_IDLE_SECONDS,
      DEFAULT_IDLE_SECONDS,
    );
    this.absoluteSeconds = clampTtl(
      env.FORGE_AUTH_SESSION_ABSOLUTE_SECONDS ?? DEFAULT_ABSOLUTE_SECONDS,
      DEFAULT_ABSOLUTE_SECONDS,
    );
    if (this.idleSeconds > this.absoluteSeconds) {
      throw new Error("FORGE_AUTH_SESSION_IDLE_SECONDS must be <= ABSOLUTE_SECONDS");
    }
  }

  async createSessionFromTokens(input: {
    userId: string;
    homeTenantId: string;
    refreshToken: string;
    accessToken: string;
    expiresIn?: number | undefined;
    rotatedFromSessionId?: string | null | undefined;
  }): Promise<AuthSessionTokens> {
    const rawSessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const encrypted = encryptRefreshToken(input.refreshToken, this.encryptionKey);
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + this.absoluteSeconds * 1000);
    const idleExpiresAt = new Date(now.getTime() + this.idleSeconds * 1000);
    const expiresAt =
      idleExpiresAt.getTime() < absoluteExpiresAt.getTime() ? idleExpiresAt : absoluteExpiresAt;
    const sessionId = randomUUID();

    await withTenantTransaction(this.db, input.homeTenantId, async (tx) => {
      await tx.insert(authBrowserSessions).values({
        id: sessionId,
        userId: input.userId,
        homeTenantId: input.homeTenantId,
        sessionTokenHash: hashOpaqueSecret(rawSessionToken),
        refreshTokenCiphertext: encrypted.ciphertextBase64,
        refreshTokenNonce: encrypted.nonceBase64,
        csrfTokenHash: hashOpaqueSecret(csrfToken),
        expiresAt,
        idleExpiresAt,
        absoluteExpiresAt,
        rotatedFromSessionId: input.rotatedFromSessionId ?? null,
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      });
    });

    return {
      accessToken: input.accessToken,
      expiresIn: input.expiresIn ?? 3600,
      csrfToken,
      rawSessionToken,
      maxAgeSeconds: Math.max(
        60,
        Math.floor((absoluteExpiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  async exchangeOAuthCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<AuthSessionTokens> {
    const tokenPayload = await this.exchangeAuthorizationCode(input);
    if (!tokenPayload.refresh_token) {
      throw new ForgeError(
        "UNAUTHORIZED",
        "Cognito did not return a refresh token for this authorization code",
      );
    }
    const identity = await this.resolveIdentityFromAccessToken(tokenPayload.access_token);
    return this.createSessionFromTokens({
      userId: identity.userId,
      homeTenantId: identity.tenantId,
      refreshToken: tokenPayload.refresh_token,
      accessToken: tokenPayload.access_token,
      expiresIn: tokenPayload.expires_in,
    });
  }

  async passwordAuthenticate(input: {
    username: string;
    password: string;
  }): Promise<PasswordChallengeResult> {
    const username = input.username.trim().toLowerCase();
    if (!username || !input.password) {
      throw new ForgeError("VALIDATION_FAILED", "Email and password are required");
    }

    const result = await this.cognitoIdp.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.env.COGNITO_CLIENT_ID,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: input.password,
        },
      }),
    );

    return this.mapCognitoAuthResult(result, username);
  }

  async passwordChallenge(input: {
    username: string;
    session: string;
    challengeName: string;
    responses: Record<string, string>;
  }): Promise<PasswordChallengeResult> {
    const username = input.username.trim().toLowerCase();
    const result = await this.cognitoIdp.send(
      new RespondToAuthChallengeCommand({
        ClientId: this.env.COGNITO_CLIENT_ID,
        ChallengeName: input.challengeName as ChallengeNameType,
        Session: input.session,
        ChallengeResponses: {
          USERNAME: username,
          ...input.responses,
        },
      }),
    );
    return this.mapCognitoAuthResult(result, username);
  }

  async refreshSession(rawSessionToken: string): Promise<AuthSessionTokens> {
    const sessionHash = hashOpaqueSecret(rawSessionToken);
    const homeTenantId = await this.resolveSessionHomeTenant(sessionHash);
    if (!homeTenantId) {
      // May be a replay of a revoked session — attempt family revoke.
      await this.revokeFamilyIfReplay(sessionHash);
      throw new ForgeError("UNAUTHORIZED", "Session is invalid or expired");
    }

    const prior = await withTenantTransaction(this.db, homeTenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(authBrowserSessions)
        .where(
          and(
            eq(authBrowserSessions.sessionTokenHash, sessionHash),
            isNull(authBrowserSessions.revokedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (!prior) {
      await this.revokeFamilyIfReplay(sessionHash);
      throw new ForgeError("UNAUTHORIZED", "Session is invalid or expired");
    }

    if (prior.expiresAt.getTime() <= Date.now() || prior.absoluteExpiresAt.getTime() <= Date.now()) {
      await this.revokeSessionRow(homeTenantId, prior.id);
      throw new ForgeError("UNAUTHORIZED", "Session is invalid or expired");
    }

    const refreshToken = decryptRefreshToken(
      {
        ciphertextBase64: prior.refreshTokenCiphertext,
        nonceBase64: prior.refreshTokenNonce,
      },
      this.encryptionKey,
    );

    let tokenPayload: CognitoTokenPayload;
    try {
      tokenPayload = await this.refreshCognitoTokens(refreshToken);
    } catch {
      await this.revokeSessionRow(homeTenantId, prior.id);
      throw new ForgeError("UNAUTHORIZED", "Session refresh failed");
    }

    const nextRefresh = tokenPayload.refresh_token ?? refreshToken;

    // Rotate: revoke old, insert new. Concurrent replay of the old cookie fails.
    await withTenantTransaction(this.db, homeTenantId, async (tx) => {
      const updated = await tx
        .update(authBrowserSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authBrowserSessions.id, prior.id),
            isNull(authBrowserSessions.revokedAt),
          ),
        )
        .returning({ id: authBrowserSessions.id });
      if (updated.length === 0) {
        throw new ForgeError("UNAUTHORIZED", "Session was already rotated");
      }
    });

    return this.createSessionFromTokens({
      userId: prior.userId,
      homeTenantId: prior.homeTenantId,
      refreshToken: nextRefresh,
      accessToken: tokenPayload.access_token,
      expiresIn: tokenPayload.expires_in,
      rotatedFromSessionId: prior.id,
    });
  }

  async logoutSession(rawSessionToken: string): Promise<void> {
    const sessionHash = hashOpaqueSecret(rawSessionToken);
    const homeTenantId = await this.resolveSessionHomeTenant(sessionHash);
    if (!homeTenantId) return;

    await withTenantTransaction(this.db, homeTenantId, async (tx) => {
      await tx
        .update(authBrowserSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authBrowserSessions.sessionTokenHash, sessionHash),
            isNull(authBrowserSessions.revokedAt),
          ),
        );
    });
  }

  async assertCsrf(rawSessionToken: string, csrfHeader: string | undefined): Promise<void> {
    if (!csrfHeader?.trim()) {
      throw new ForgeError("FORBIDDEN", "Missing CSRF token");
    }
    const sessionHash = hashOpaqueSecret(rawSessionToken);
    const homeTenantId = await this.resolveSessionHomeTenant(sessionHash);
    if (!homeTenantId) {
      throw new ForgeError("UNAUTHORIZED", "Session is invalid or expired");
    }

    const row = await withTenantTransaction(this.db, homeTenantId, async (tx) => {
      const rows = await tx
        .select({ csrfTokenHash: authBrowserSessions.csrfTokenHash })
        .from(authBrowserSessions)
        .where(
          and(
            eq(authBrowserSessions.sessionTokenHash, sessionHash),
            isNull(authBrowserSessions.revokedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (!row || row.csrfTokenHash !== hashOpaqueSecret(csrfHeader.trim())) {
      throw new ForgeError("FORBIDDEN", "Invalid CSRF token");
    }
  }

  private async mapCognitoAuthResult(
    result: {
      ChallengeName?: string | undefined;
      Session?: string | undefined;
      ChallengeParameters?: Record<string, string> | undefined;
      AuthenticationResult?:
        | {
            AccessToken?: string | undefined;
            RefreshToken?: string | undefined;
            ExpiresIn?: number | undefined;
          }
        | undefined;
    },
    username: string,
  ): Promise<PasswordChallengeResult> {
    if (result.ChallengeName) {
      if (!result.Session) {
        throw new ForgeError(
          "UNAUTHORIZED",
          `Sign-in requires ${result.ChallengeName}, but Cognito returned no session`,
        );
      }
      if (result.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        return {
          kind: "challenge",
          challengeName: result.ChallengeName,
          session: result.Session,
          username,
        };
      }
      if (
        result.ChallengeName === "SMS_MFA" ||
        result.ChallengeName === "SOFTWARE_TOKEN_MFA"
      ) {
        return {
          kind: "challenge",
          challengeName: result.ChallengeName,
          session: result.Session,
          username,
          delivery: result.ChallengeName === "SMS_MFA" ? "sms" : "totp",
        };
      }
      throw new ForgeError(
        "UNAUTHORIZED",
        `This account requires an additional sign-in step (${result.ChallengeName}) that is not supported yet.`,
      );
    }

    const accessToken = result.AuthenticationResult?.AccessToken;
    const refreshToken = result.AuthenticationResult?.RefreshToken;
    if (!accessToken || !refreshToken) {
      throw new ForgeError("UNAUTHORIZED", "Sign-in succeeded but tokens were incomplete");
    }

    const identity = await this.resolveIdentityFromAccessToken(accessToken);
    const tokens = await this.createSessionFromTokens({
      userId: identity.userId,
      homeTenantId: identity.tenantId,
      refreshToken,
      accessToken,
      expiresIn: result.AuthenticationResult?.ExpiresIn,
    });
    return { kind: "tokens", tokens };
  }

  private async resolveIdentityFromAccessToken(accessToken: string) {
    const claims = await verifyCognitoAccessToken(accessToken, {
      region: this.env.AWS_REGION,
      userPoolId: this.env.COGNITO_USER_POOL_ID,
      clientId: this.env.COGNITO_CLIENT_ID,
    });
    const identity = await lookupIdentity(this.db, "COGNITO", claims.sub);
    if (!identity) {
      throw new ForgeError(
        "UNAUTHORIZED",
        "This Cognito account is not linked to a Forge user yet",
      );
    }
    if (identity.userStatus === "DISABLED" || identity.userStatus === "REVOKED") {
      throw new ForgeError("FORBIDDEN", "This account is not allowed to sign in");
    }
    return identity;
  }

  private async resolveSessionHomeTenant(sessionHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_auth_browser_session_home_tenant(${sessionHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  private async revokeSessionRow(homeTenantId: string, sessionId: string): Promise<void> {
    await withTenantTransaction(this.db, homeTenantId, async (tx) => {
      await tx
        .update(authBrowserSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authBrowserSessions.id, sessionId), isNull(authBrowserSessions.revokedAt)));
    });
  }

  /**
   * Replay of a rotated/revoked cookie: revoke all active sessions for that user.
   */
  private async revokeFamilyIfReplay(sessionHash: string): Promise<void> {
    const rows = [
      ...(await this.db.execute(
        sql`select home_tenant_id, user_id, is_revoked from forge_auth_browser_session_owner(${sessionHash})`,
      )),
    ] as Array<{ home_tenant_id?: string; user_id?: string; is_revoked?: boolean }>;

    const row = rows[0];
    if (!row?.home_tenant_id || !row.user_id || !row.is_revoked) return;

    await withTenantTransaction(this.db, String(row.home_tenant_id), async (tx) => {
      await tx
        .update(authBrowserSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authBrowserSessions.userId, String(row.user_id)),
            isNull(authBrowserSessions.revokedAt),
          ),
        );
    });
  }

  private async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<CognitoTokenPayload> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.env.COGNITO_CLIENT_ID,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
    return this.postCognitoToken(body);
  }

  private async refreshCognitoTokens(refreshToken: string): Promise<CognitoTokenPayload> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.env.COGNITO_CLIENT_ID,
      refresh_token: refreshToken,
    });
    return this.postCognitoToken(body);
  }

  private async postCognitoToken(body: URLSearchParams): Promise<CognitoTokenPayload> {
    const domain = this.env.COGNITO_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const res = await fetch(`https://${domain}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    let payload: CognitoTokenPayload & { error?: string; error_description?: string };
    try {
      payload = (await res.json()) as CognitoTokenPayload & {
        error?: string;
        error_description?: string;
      };
    } catch {
      throw new ForgeError("UNAUTHORIZED", `Cognito token request failed (${res.status})`);
    }

    if (!res.ok || !payload.access_token) {
      const detail = payload.error_description ?? payload.error ?? `HTTP ${res.status}`;
      throw new ForgeError("UNAUTHORIZED", `Cognito token request failed: ${detail}`);
    }

    return payload;
  }
}

type CognitoTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
};

function clampTtl(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < MIN_TTL_SECONDS || value > MAX_TTL_SECONDS) {
    return fallback;
  }
  return Math.floor(value);
}
