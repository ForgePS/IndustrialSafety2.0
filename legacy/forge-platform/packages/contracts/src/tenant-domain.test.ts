import { describe, expect, it } from "vitest";
import {
  assertTenantStatusTransition,
  canTransitionTenantStatus,
  createFacilityInputSchema,
  facilityBelongsToTenant,
  isTenantStatus,
  TENANT_STATUSES,
} from "./tenant-domain.js";

describe("tenant status registry", () => {
  it("includes SaaS lifecycle statuses", () => {
    expect(TENANT_STATUSES).toEqual([
      "PROVISIONING",
      "TRIAL",
      "ACTIVE",
      "SUSPENDED",
      "ARCHIVED",
      "CANCELED",
    ]);
  });

  it("rejects unknown status values", () => {
    expect(isTenantStatus("ACTIVE")).toBe(true);
    expect(isTenantStatus("trial")).toBe(false);
    expect(isTenantStatus("DELETED")).toBe(false);
  });

  it("allows provisioning to trial/active and blocks archive reactivation", () => {
    expect(canTransitionTenantStatus("PROVISIONING", "TRIAL")).toBe(true);
    expect(canTransitionTenantStatus("PROVISIONING", "ACTIVE")).toBe(true);
    expect(canTransitionTenantStatus("ARCHIVED", "ACTIVE")).toBe(false);
    expect(canTransitionTenantStatus("CANCELED", "ACTIVE")).toBe(false);
    expect(() => assertTenantStatusTransition("ACTIVE", "PROVISIONING")).toThrow(
      /Cannot transition/,
    );
    expect(() => assertTenantStatusTransition("ACTIVE", "BOGUS")).toThrow(/Invalid tenant status/);
  });
});

describe("facility ownership", () => {
  it("accepts matching tenant ids and rejects cross-tenant references", () => {
    const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(facilityBelongsToTenant(tenantA, tenantA)).toBe(true);
    expect(facilityBelongsToTenant(tenantA, tenantB)).toBe(false);
  });

  it("validates create facility input", () => {
    const parsed = createFacilityInputSchema.parse({
      facilityKey: "plant-1",
      name: "Plant 1",
    });
    expect(parsed.facilityType).toBe("SITE");
    expect(parsed.status).toBe("ACTIVE");
  });
});
