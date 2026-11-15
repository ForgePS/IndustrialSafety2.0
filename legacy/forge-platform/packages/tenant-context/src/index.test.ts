import { describe, expect, it } from "vitest";
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type ForgePrincipal,
} from "./index.js";

function principal(perms: string[]): ForgePrincipal {
  return {
    authenticationIdentityId: "a",
    userId: "u",
    personId: null,
    tenantId: "t",
    organizationIds: [],
    permissions: new Set(perms),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

describe("hasPermission", () => {
  it("checks membership", () => {
    expect(hasPermission(principal(["platform.tenant.read"]), "platform.tenant.read")).toBe(true);
    expect(hasPermission(principal([]), "platform.tenant.read")).toBe(false);
  });
});

describe("hasAnyPermission / hasAllPermissions", () => {
  it("evaluates capability sets", () => {
    const p = principal(["platform.person.read", "platform.organization.read"]);
    expect(hasAnyPermission(p, ["platform.person.create", "platform.person.read"])).toBe(true);
    expect(hasAnyPermission(p, ["platform.person.create"])).toBe(false);
    expect(hasAllPermissions(p, ["platform.person.read", "platform.organization.read"])).toBe(true);
    expect(hasAllPermissions(p, ["platform.person.read", "platform.person.create"])).toBe(false);
  });
});
