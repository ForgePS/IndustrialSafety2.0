import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-api.js", () => ({
  authMe: vi.fn(),
  selectTenant: vi.fn(),
}));

vi.mock("./auth-storage.js", () => ({
  getActiveTenantId: vi.fn(),
  clearActiveTenantId: vi.fn(),
}));

import { authMe, selectTenant } from "./auth-api.js";
import { clearActiveTenantId, getActiveTenantId } from "./auth-storage.js";
import { resolveSession } from "./auth-provider.js";

const authMeMock = vi.mocked(authMe);
const selectTenantMock = vi.mocked(selectTenant);
const getActiveTenantIdMock = vi.mocked(getActiveTenantId);
const clearActiveTenantIdMock = vi.mocked(clearActiveTenantId);

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveSession", () => {
  it("does not retry authMe after a 401 when a tenant id was persisted", async () => {
    getActiveTenantIdMock.mockReturnValue("tenant-a");
    const unauthorized = Object.assign(new Error("Unauthorized"), { status: 401 });
    authMeMock.mockRejectedValueOnce(unauthorized);

    await expect(resolveSession()).rejects.toBe(unauthorized);
    expect(authMeMock).toHaveBeenCalledTimes(1);
    expect(clearActiveTenantIdMock).not.toHaveBeenCalled();
    expect(selectTenantMock).not.toHaveBeenCalled();
  });

  it("clears a bad persisted tenant and retries once for non-401 failures", async () => {
    getActiveTenantIdMock.mockReturnValue("tenant-a");
    authMeMock
      .mockRejectedValueOnce(Object.assign(new Error("network"), { status: 503 }))
      .mockResolvedValueOnce({
        userId: "u1",
        personId: null,
        tenantId: "tenant-b",
        organizationIds: [],
        permissions: [],
        activeProducts: [],
        activeModules: [],
        isPlatformAdmin: false,
        authProvider: "cognito",
        tenants: [],
      });

    const me = await resolveSession();
    expect(me.tenantId).toBe("tenant-b");
    expect(clearActiveTenantIdMock).toHaveBeenCalledTimes(1);
    expect(authMeMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry after abort", async () => {
    getActiveTenantIdMock.mockReturnValue("tenant-a");
    const abortErr = new DOMException("Aborted", "AbortError");
    authMeMock.mockRejectedValueOnce(abortErr);

    await expect(resolveSession()).rejects.toBe(abortErr);
    expect(authMeMock).toHaveBeenCalledTimes(1);
    expect(clearActiveTenantIdMock).not.toHaveBeenCalled();
  });
});
