import { describe, expect, it, vi } from "vitest";
import { resolveActiveTenantId, syncTenantIdInUrl } from "./tenant-scoped.js";

describe("tenant-scoped (MK-S17)", () => {
  it("prefers session tenant when URL is stale for non-admins", () => {
    expect(
      resolveActiveTenantId({
        sessionTenantId: "tenant-b",
        queryTenantId: "tenant-a",
        isPlatformAdmin: false,
      }),
    ).toBe("tenant-b");
  });

  it("allows platform admin URL override", () => {
    expect(
      resolveActiveTenantId({
        sessionTenantId: "tenant-b",
        queryTenantId: "tenant-a",
        isPlatformAdmin: true,
      }),
    ).toBe("tenant-a");
  });

  it("falls back to session when query missing", () => {
    expect(
      resolveActiveTenantId({
        sessionTenantId: "tenant-b",
        queryTenantId: null,
      }),
    ).toBe("tenant-b");
  });

  it("syncTenantIdInUrl updates existing tenantId query", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { href: "https://app.example/members/?tenantId=old" },
      history: { replaceState },
    });
    syncTenantIdInUrl("new");
    expect(replaceState).toHaveBeenCalled();
    const next = String(replaceState.mock.calls[0]?.[2] ?? "");
    expect(next).toContain("tenantId=new");
    vi.unstubAllGlobals();
  });
});
