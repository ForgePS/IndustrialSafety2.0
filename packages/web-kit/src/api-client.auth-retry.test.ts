// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiGet,
  configureApiClient,
} from "./api-client.js";
import { clearAuthStorage, setBearerToken } from "./auth-storage.js";

function jwtWithExp(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("api client 401 refresh retry", () => {
  const fetchMock = vi.fn();
  const onUnauthorized = vi.fn();
  const tryRefreshSession = vi.fn();

  beforeEach(() => {
    clearAuthStorage();
    vi.stubGlobal("fetch", fetchMock);
    configureApiClient({
      baseUrl: "https://api.test",
      onUnauthorized,
      tryRefreshSession,
    });
    setBearerToken(jwtWithExp(3600));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    clearAuthStorage();
  });

  it("refreshes and retries once instead of clearing the session", async () => {
    tryRefreshSession.mockResolvedValue(true);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "expired" } }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { ok: true },
            meta: { requestId: "r1", correlationId: "c1" },
          }),
          { status: 200 },
        ),
      );

    await expect(apiGet<{ ok: boolean }>("/api/v1/auth/me")).resolves.toEqual({ ok: true });
    expect(tryRefreshSession).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("clears the session when refresh cannot recover", async () => {
    tryRefreshSession.mockResolvedValue(false);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "expired" } }), { status: 401 }),
    );

    await expect(apiGet("/api/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("allows empty baseUrl for same-origin /api proxy", async () => {
    configureApiClient({
      baseUrl: "",
      onUnauthorized,
      tryRefreshSession,
    });
    setBearerToken(jwtWithExp(3600));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { ok: true },
          meta: { requestId: "r", correlationId: "c" },
        }),
        { status: 200 },
      ),
    );
    await apiGet("/api/v1/auth/me");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/auth/me");
  });
});
