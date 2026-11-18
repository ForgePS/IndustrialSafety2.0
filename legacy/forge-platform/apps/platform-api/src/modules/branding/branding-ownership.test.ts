import { describe, expect, it } from "vitest";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";

/**
 * Branding ownership matrix (MK-S14) — pure guards used by BrandingService.
 * Full DB integration covered when migration is applied in non-prod environments.
 */
describe("branding ownership guards", () => {
  it("Tenant A cannot read Tenant B file key", () => {
    const bKey = "tenants/tenant-b/branding/logo/x.png";
    expect(objectKeyBelongsToTenant(bKey, "tenant-a")).toBe(false);
  });

  it("Tenant A cannot overwrite Tenant B document ownership", () => {
    expect(documentBelongsToTenant("tenant-b", "tenant-a")).toBe(false);
  });

  it("Tenant A can bind own branding key", () => {
    const aKey = "tenants/tenant-a/branding/icon/y.png";
    expect(objectKeyBelongsToTenant(aKey, "tenant-a")).toBe(true);
    expect(documentBelongsToTenant("tenant-a", "tenant-a")).toBe(true);
  });
});
