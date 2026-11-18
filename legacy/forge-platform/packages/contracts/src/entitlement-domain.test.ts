import { describe, expect, it } from "vitest";
import {
  getEntitlements,
  getTenantModules,
  getTenantProducts,
  isModuleEnabled,
  isModuleEntitlementWithinWindow,
  isProductEnabled,
  isPlatformProductCode,
} from "./entitlement-domain.js";

describe("entitlement-domain", () => {
  it("builds snapshots and list helpers", () => {
    const snap = getEntitlements({
      activeProducts: ["FORGE_RMS"],
      activeModules: new Set(["PERSONNEL"]),
    });
    expect(getTenantProducts(snap)).toEqual(["FORGE_RMS"]);
    expect(getTenantModules(snap)).toEqual(["PERSONNEL"]);
  });

  it("isProductEnabled / isModuleEnabled respect platform admin bypass", () => {
    expect(isProductEnabled([], "FORGE_RMS")).toBe(false);
    expect(isProductEnabled(["FORGE_RMS"], "FORGE_RMS")).toBe(true);
    expect(isProductEnabled([], "FORGE_RMS", { isPlatformAdmin: true })).toBe(true);
    expect(isModuleEnabled(["PERSONNEL"], "PERSONNEL")).toBe(true);
    expect(isModuleEnabled([], "PERSONNEL", { isPlatformAdmin: true })).toBe(true);
  });

  it("filters module entitlement time windows", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(
      isModuleEntitlementWithinWindow(
        { startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(isModuleEntitlementWithinWindow({ endsAt: "2026-08-01T00:00:00.000Z" }, now)).toBe(
      false,
    );
    expect(isModuleEntitlementWithinWindow({ startsAt: "2026-08-11T00:00:00.000Z" }, now)).toBe(
      false,
    );
  });

  it("recognizes platform product codes", () => {
    expect(isPlatformProductCode("FORGE_INDUSTRIAL")).toBe(true);
    expect(isPlatformProductCode("UNKNOWN")).toBe(false);
  });
});
