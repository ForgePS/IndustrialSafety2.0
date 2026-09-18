// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAMPLE_JWT =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidG9rZW5fdXNlIjoiYWNjZXNzIn0.signature";

describe("cognito password auth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_COGNITO_DOMAIN = "example.auth.us-east-1.amazoncognito.com";
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = "client-123";
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = "us-east-1_AbCdEf";
    process.env.NEXT_PUBLIC_APP_URL = "https://industrial.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              accessToken: SAMPLE_JWT,
              expiresIn: 3600,
              csrfToken: "csrf-token",
            },
            meta: { requestId: "r1", correlationId: "c1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores access in memory and never persists refresh to localStorage", async () => {
    const { authenticateWithPassword } = await import("./cognito-password-auth.js");
    const storage = await import("./auth-storage.js");
    storage.clearAuthStorage();

    await authenticateWithPassword({
      username: "Admin@Example.com",
      password: "SecretPass1!",
    });

    expect(storage.getBearerToken()).toBe(SAMPLE_JWT);
    expect(storage.getRefreshToken()).toBeNull();
    expect(storage.getCsrfToken()).toBe("csrf-token");
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
    expect(localStorage.getItem("forge-bearer-token")).toBeNull();

    storage.setRefreshToken("should-not-persist");
    expect(localStorage.getItem("forge-refresh-token")).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/session/password"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      username?: string;
    };
    expect(body.username).toBe("admin@example.com");
  });

  it("surfaces NEW_PASSWORD_REQUIRED as a typed challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              challenge: {
                kind: "new_password_required",
                session: "session-abc",
                username: "user@example.com",
              },
            },
            meta: { requestId: "r1", correlationId: "c1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { authenticateWithPassword, CognitoPasswordChallengeError } = await import(
      "./cognito-password-auth.js"
    );

    await expect(
      authenticateWithPassword({ username: "user@example.com", password: "TempPass1!" }),
    ).rejects.toBeInstanceOf(CognitoPasswordChallengeError);
  });
});
