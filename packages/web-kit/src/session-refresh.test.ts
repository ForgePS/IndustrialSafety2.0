import { afterEach, describe, expect, it, vi } from "vitest";

const refreshAccessTokenMock = vi.fn();
const getBearerTokenMock = vi.fn();

vi.mock("./cognito-oauth.js", () => ({
  refreshAccessToken: (...args: unknown[]) => refreshAccessTokenMock(...args),
}));

vi.mock("./auth-storage.js", () => ({
  getBearerToken: () => getBearerTokenMock(),
}));

import { tryRefreshSession } from "./session-refresh.js";

function jwtWithExp(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("tryRefreshSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips refresh when the access token is still fresh", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(3600));
    await expect(tryRefreshSession()).resolves.toBe(true);
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it("refreshes when there is no bearer (cookie session may still exist)", async () => {
    getBearerTokenMock.mockReturnValue(null);
    refreshAccessTokenMock.mockResolvedValue({ access_token: "new" });
    await expect(tryRefreshSession()).resolves.toBe(true);
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes when forced even if the JWT looks fresh", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(3600));
    refreshAccessTokenMock.mockResolvedValue({ access_token: "new" });
    await expect(tryRefreshSession({ force: true })).resolves.toBe(true);
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });

  it("single-flights concurrent refreshes", async () => {
    getBearerTokenMock.mockReturnValue(jwtWithExp(-10));
    let resolveRefresh!: (value: { access_token: string }) => void;
    refreshAccessTokenMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const a = tryRefreshSession({ force: true });
    const b = tryRefreshSession({ force: true });
    resolveRefresh({ access_token: "new" });
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });
});
