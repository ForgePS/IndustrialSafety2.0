import { afterEach, describe, expect, it, vi } from "vitest";

const authMeMock = vi.fn();
const selectTenantMock = vi.fn();
const refreshAccessTokenMock = vi.fn();
const getBearerTokenMock = vi.fn();
const getActiveTenantIdMock = vi.fn();
const clearActiveTenantIdMock = vi.fn();

vi.mock("./auth-api.js", () => ({
  authMe: (...args: unknown[]) => authMeMock(...args),
  selectTenant: (...args: unknown[]) => selectTenantMock(...args),
}));

vi.mock("./cognito-oauth.js", () => ({
  refreshAccessToken: (...args: unknown[]) => refreshAccessTokenMock(...args),
  buildLogoutUrl: () => "/",
  redirectToCognitoLogin: vi.fn(),
}));

vi.mock("./auth-storage.js", () => ({
  getBearerToken: () => getBearerTokenMock(),
  getRefreshToken: () => null,
  getActiveTenantId: () => getActiveTenantIdMock(),
  clearActiveTenantId: () => clearActiveTenantIdMock(),
  clearAuthStorage: vi.fn(),
  getCachedAuthMe: vi.fn(),
  setCachedAuthMe: vi.fn(),
  clearCachedAuthMe: vi.fn(),
  setActiveTenantId: vi.fn(),
}));

import { establishSession } from "./auth-provider.js";

function jwtWithExp(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("establishSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips Cognito refresh when access token is still fresh", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(3600));
    getActiveTenantIdMock.mockReturnValue(null);
    authMeMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      tenants: [],
      permissions: [],
    });

    await establishSession();

    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
    expect(authMeMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes before /auth/me when access token is expired", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(-120));
    getActiveTenantIdMock.mockReturnValue(null);
    refreshAccessTokenMock.mockResolvedValue({ access_token: "x" });
    authMeMock.mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      tenants: [],
      permissions: [],
    });

    await establishSession();

    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(authMeMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes after a 401 and retries /auth/me", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(3600));
    getActiveTenantIdMock.mockReturnValue(null);
    const unauthorized = Object.assign(new Error("expired"), { status: 401 });
    authMeMock.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({
      userId: "u1",
      tenantId: "t1",
      tenants: [],
      permissions: [],
    });
    refreshAccessTokenMock.mockResolvedValue({ access_token: "x" });

    const me = await establishSession();

    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(authMeMock).toHaveBeenCalledTimes(2);
    expect(me.userId).toBe("u1");
  });
});
