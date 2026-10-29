import { describe, expect, it } from "vitest";
import {
  canAccessExecutiveWalkthrough,
  canManageConfiguration,
  canManageDropdowns,
  canManageSanitationSubmodules,
  isWalkthroughEligibleTenant,
} from "./platform-admin";

const forgePlatformMe = {
  isPlatformAdmin: false,
  isDemoTenant: true,
  tenantId: "fp",
  tenants: [{ tenantId: "fp", slug: "forge-platform", isDemoTenant: true }],
  permissions: ["industrial.access"] as string[],
};

const producersMe = {
  isPlatformAdmin: false,
  isDemoTenant: false,
  tenantId: "prm",
  tenants: [{ tenantId: "prm", slug: "producers-rice-mill", isDemoTenant: false }],
  permissions: ["industrial.admin", "industrial.access"] as string[],
};

describe("isWalkthroughEligibleTenant", () => {
  it("allows forge-platform / demo flag", () => {
    expect(isWalkthroughEligibleTenant(forgePlatformMe)).toBe(true);
    expect(
      isWalkthroughEligibleTenant({
        tenantId: "x",
        isDemoTenant: false,
        tenants: [{ tenantId: "x", slug: "forge-industrial-demo" }],
      }),
    ).toBe(true);
  });

  it("blocks Producers Rice Mill", () => {
    expect(isWalkthroughEligibleTenant(producersMe)).toBe(false);
  });
});

describe("canAccessExecutiveWalkthrough", () => {
  it("allows on Forge Platform demo tenant with grants", () => {
    expect(canAccessExecutiveWalkthrough({ ...forgePlatformMe, isPlatformAdmin: true })).toBe(true);
    expect(
      canAccessExecutiveWalkthrough({
        ...forgePlatformMe,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(canAccessExecutiveWalkthrough(forgePlatformMe)).toBe(true);
  });

  it("blocks Producers Rice even for admins and creators", () => {
    expect(canAccessExecutiveWalkthrough(producersMe)).toBe(false);
    expect(
      canAccessExecutiveWalkthrough({
        ...producersMe,
        isPlatformAdmin: true,
      }),
    ).toBe(false);
    expect(
      canAccessExecutiveWalkthrough({
        ...producersMe,
        activeProducts: ["FORGE_CREATOR"],
      }),
    ).toBe(false);
  });
});

describe("canManageSanitationSubmodules", () => {
  it("allows Tenant Admin, Creator, Super Admin, and sanitation manage", () => {
    expect(canManageSanitationSubmodules({ isPlatformAdmin: true })).toBe(true);
    expect(
      canManageSanitationSubmodules({
        isPlatformAdmin: false,
        activeProducts: ["FORGE_CREATOR"],
        permissions: [],
      }),
    ).toBe(true);
    expect(
      canManageSanitationSubmodules({
        isPlatformAdmin: false,
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
    expect(
      canManageSanitationSubmodules({
        isPlatformAdmin: false,
        permissions: ["industrial.sanitation.manage"],
      }),
    ).toBe(true);
  });

  it("blocks operators with only sanitation view", () => {
    expect(
      canManageSanitationSubmodules({
        isPlatformAdmin: false,
        permissions: ["industrial.sanitation.view", "industrial.access"],
      }),
    ).toBe(false);
  });
});

describe("canManageDropdowns", () => {
  it("allows tenant admins and configuration editors", () => {
    expect(
      canManageDropdowns({
        permissions: ["industrial.admin"],
      }),
    ).toBe(true);
  });
});

describe("canManageConfiguration", () => {
  it("allows configuration permissions", () => {
    expect(
      canManageConfiguration({
        permissions: ["tenant.configuration.update"],
      }),
    ).toBe(true);
  });
});
