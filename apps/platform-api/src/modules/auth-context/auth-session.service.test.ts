import { beforeEach, describe, expect, it, vi } from "vitest";

const withTenantTransaction = vi.fn(
  async (_db: unknown, _tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
);
const lookupIdentity = vi.fn();
const verifyCognitoAccessToken = vi.fn();
const hashOpaqueSecret = vi.fn((value: string) => `hash:${value}`);

const insertValues = vi.fn(async () => undefined);
const updateWhere = vi.fn(async () => [{ id: "session-1" }]);
const selectLimit = vi.fn();

const txMock = {
  insert: vi.fn(() => ({ values: insertValues })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: updateWhere,
      })),
    })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: selectLimit,
      })),
    })),
  })),
};

const dbExecute = vi.fn();

vi.mock("@forge/database", () => ({
  authBrowserSessions: {
    id: "id",
    userId: "user_id",
    homeTenantId: "home_tenant_id",
    sessionTokenHash: "session_token_hash",
    revokedAt: "revoked_at",
    csrfTokenHash: "csrf_token_hash",
  },
  withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  lookupIdentity: (...args: unknown[]) => lookupIdentity(...args),
}));

vi.mock("@forge/auth", () => ({
  verifyCognitoAccessToken: (...args: unknown[]) => verifyCognitoAccessToken(...args),
}));

vi.mock("@forge/security", () => ({
  hashOpaqueSecret: (value: string) => hashOpaqueSecret(value),
}));

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  class FakeClient {
    send = sendMock;
  }
  return {
    CognitoIdentityProviderClient: FakeClient,
    InitiateAuthCommand: class {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
    RespondToAuthChallengeCommand: class {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
    ChallengeNameType: {},
  };
});

const sendMock = vi.fn();

import { AuthSessionService } from "./auth-session.service.js";
import { encryptRefreshToken, resolveAuthSessionEncryptionKey } from "./auth-session-crypto.js";

const env = {
  APP_ENV: "local",
  AWS_REGION: "us-east-1",
  COGNITO_USER_POOL_ID: "us-east-1_TestPool",
  COGNITO_CLIENT_ID: "client-123",
  COGNITO_DOMAIN: "example.auth.us-east-1.amazoncognito.com",
  FORGE_AUTH_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  FORGE_AUTH_SESSION_IDLE_SECONDS: 43_200,
  FORGE_AUTH_SESSION_ABSOLUTE_SECONDS: 86_400,
  CORS_ORIGINS: "",
  CORS_ORIGIN_SUFFIXES: "",
} as never;

describe("AuthSessionService", () => {
  let service: AuthSessionService;
  const key = resolveAuthSessionEncryptionKey("local", env.FORGE_AUTH_SESSION_ENCRYPTION_KEY);

  beforeEach(() => {
    vi.clearAllMocks();
    updateWhere.mockResolvedValue([{ id: "session-1" }]);
    insertValues.mockResolvedValue(undefined);
    dbExecute.mockResolvedValue([{ tenant_id: "tenant-1" }]);
    lookupIdentity.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      userStatus: "ACTIVE",
      identityId: "id-1",
      sessionVersion: 1,
      sessionsRevokedAt: null,
    });
    verifyCognitoAccessToken.mockResolvedValue({ sub: "cognito-sub" });
    service = new AuthSessionService(env, { execute: dbExecute } as never);
  });

  it("password login response never includes refresh_token", async () => {
    sendMock.mockResolvedValue({
      AuthenticationResult: {
        AccessToken: "access-xyz",
        RefreshToken: "refresh-secret",
        ExpiresIn: 3600,
      },
    });

    const result = await service.passwordAuthenticate({
      username: "user@example.com",
      password: "SecretPass1!",
    });

    expect(result.kind).toBe("tokens");
    if (result.kind !== "tokens") return;
    const json = JSON.stringify(result.tokens);
    expect(json).not.toContain("refresh");
    expect(json).not.toContain("refresh-secret");
    expect(result.tokens.accessToken).toBe("access-xyz");
    expect(result.tokens.csrfToken).toBeTruthy();
    expect(insertValues).toHaveBeenCalled();
  });

  it("refresh rotates session and rejects replay of old token", async () => {
    const encrypted = encryptRefreshToken("refresh-secret", key);
    selectLimit.mockResolvedValueOnce([
      {
        id: "session-old",
        userId: "user-1",
        homeTenantId: "tenant-1",
        refreshTokenCiphertext: encrypted.ciphertextBase64,
        refreshTokenNonce: encrypted.nonceBase64,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 3_600_000),
        idleExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-new",
        expires_in: 3600,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rotated = await service.refreshSession("raw-old-session");
    expect(rotated.accessToken).toBe("access-new");
    expect(rotated.rawSessionToken).not.toBe("raw-old-session");
    expect(updateWhere).toHaveBeenCalled();

    // Replay: SECURITY DEFINER returns null tenant for revoked hash, owner says revoked.
    dbExecute
      .mockResolvedValueOnce([]) // home_tenant for active
      .mockResolvedValueOnce([
        { home_tenant_id: "tenant-1", user_id: "user-1", is_revoked: true },
      ]);

    await expect(service.refreshSession("raw-old-session")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    vi.unstubAllGlobals();
  });

  it("logout revokes the session row", async () => {
    dbExecute.mockResolvedValue([{ tenant_id: "tenant-1" }]);
    await service.logoutSession("raw-session");
    expect(withTenantTransaction).toHaveBeenCalled();
    expect(txMock.update).toHaveBeenCalled();
  });
});
