import { describe, expect, it } from "vitest";
import { orgLookupScopesAreIsolated, orgLookupTenantFilter } from "./org-lookups-scope.js";

describe("org lookup tenant isolation", () => {
  const tenantA = "019f0000-aaaa-7000-8000-000000000001";
  const tenantB = "019f0000-bbbb-7000-8000-000000000002";

  it("builds a filter scoped to the provided tenant only", () => {
    expect(orgLookupTenantFilter(tenantA)).toEqual({ tenantId: tenantA });
    expect(orgLookupTenantFilter(tenantB)).toEqual({ tenantId: tenantB });
  });

  it("never shares a lookup filter across two tenant ids", () => {
    expect(orgLookupScopesAreIsolated(tenantA, tenantB)).toBe(true);
    expect(orgLookupTenantFilter(tenantA).tenantId).not.toBe(
      orgLookupTenantFilter(tenantB).tenantId,
    );
  });

  it("rejects empty tenant ids", () => {
    expect(() => orgLookupTenantFilter("")).toThrow(/tenantId is required/);
  });
});
