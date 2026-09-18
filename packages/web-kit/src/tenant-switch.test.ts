import { beforeEach, describe, expect, it, vi } from "vitest";
import { switchActiveTenant } from "./tenant-switch.js";

const clearCachedAuthMe = vi.fn();

vi.mock("./auth-storage.js", () => ({
  clearCachedAuthMe: (...args: unknown[]) => clearCachedAuthMe(...args),
}));

describe("switchActiveTenant", () => {
  beforeEach(() => {
    clearCachedAuthMe.mockClear();
  });

  it("binds the new tenant and returns the replacement AuthMe summary", async () => {
    const setActiveTenantId = vi.fn();
    const clearActiveTenantId = vi.fn();
    const selectTenant = vi.fn(async () => ({
      userId: "u1",
      tenantId: "tenant-b",
      permissions: ["tenant.settings.read"],
      tenants: [],
    })) as never;

    const me = await switchActiveTenant({
      tenantId: "tenant-b",
      previousTenantId: "tenant-a",
      selectTenant,
      setActiveTenantId,
      clearActiveTenantId,
    });

    expect(clearCachedAuthMe).toHaveBeenCalled();
    expect(setActiveTenantId).toHaveBeenCalledWith("tenant-b");
    expect(me.tenantId).toBe("tenant-b");
    expect(me.permissions).toEqual(["tenant.settings.read"]);
    expect(clearActiveTenantId).not.toHaveBeenCalled();
  });

  it("clears prior tenant auth-me cache before binding the new tenant", async () => {
    const order: string[] = [];
    clearCachedAuthMe.mockImplementation(() => order.push("clear-cache"));
    const setActiveTenantId = vi.fn(() => order.push("set-tenant"));
    await switchActiveTenant({
      tenantId: "tenant-b",
      previousTenantId: "tenant-a",
      selectTenant: async () => {
        order.push("select");
        return {
          userId: "u1",
          tenantId: "tenant-b",
          permissions: [],
          tenants: [],
        };
      },
      setActiveTenantId,
      clearActiveTenantId: vi.fn(),
    });
    expect(order).toEqual(["clear-cache", "set-tenant", "select"]);
  });

  it("restores the previous tenant when server membership verification fails", async () => {
    const setActiveTenantId = vi.fn();
    const clearActiveTenantId = vi.fn();
    const selectTenant = vi.fn(async () => {
      throw new Error("No active membership for the selected tenant");
    });

    await expect(
      switchActiveTenant({
        tenantId: "tenant-b",
        previousTenantId: "tenant-a",
        selectTenant,
        setActiveTenantId,
        clearActiveTenantId,
      }),
    ).rejects.toThrow(/No active membership/);

    expect(clearCachedAuthMe).toHaveBeenCalled();
    expect(setActiveTenantId).toHaveBeenNthCalledWith(1, "tenant-b");
    expect(setActiveTenantId).toHaveBeenNthCalledWith(2, "tenant-a");
    expect(clearActiveTenantId).not.toHaveBeenCalled();
  });

  it("clears active tenant when there was no previous selection and switch fails", async () => {
    const setActiveTenantId = vi.fn();
    const clearActiveTenantId = vi.fn();
    await expect(
      switchActiveTenant({
        tenantId: "tenant-b",
        previousTenantId: null,
        selectTenant: async () => {
          throw new Error("forbidden");
        },
        setActiveTenantId,
        clearActiveTenantId,
      }),
    ).rejects.toThrow(/forbidden/);
    expect(clearActiveTenantId).toHaveBeenCalled();
  });
});
