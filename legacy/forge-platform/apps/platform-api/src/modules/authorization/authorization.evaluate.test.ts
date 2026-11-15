import { describe, expect, it } from "vitest";
import { evaluateAuthorization, evaluateTenantOperationalState } from "@forge/authorization";
import type { ForgePrincipal } from "@forge/tenant-context";

function principal(overrides: Partial<ForgePrincipal> = {}): ForgePrincipal {
  return {
    authenticationIdentityId: "a",
    userId: "u",
    personId: "p",
    tenantId: "tenant-a",
    organizationIds: [],
    permissions: new Set(["platform.person.read", "platform.tenant.read"]),
    activeProducts: new Set(["FORGE_RMS"]),
    activeModules: new Set(["PERSONNEL"]),
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
    ...overrides,
  };
}

describe("authorization evaluateAuthorization integration", () => {
  it("allows tenant-scoped permission when active", () => {
    const decision = evaluateAuthorization({
      principal: principal(),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: evaluateTenantOperationalState({
        tenantStatus: "ACTIVE",
        subscriptionStatus: "ACTIVE",
      }),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("ALLOW");
  });

  it("denies product access when tenant is suspended", () => {
    const decision = evaluateAuthorization({
      principal: principal(),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: evaluateTenantOperationalState({
        tenantStatus: "SUSPENDED",
        subscriptionStatus: "ACTIVE",
      }),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("TENANT_SUSPENDED");
  });

  it("allows platform admin recovery actions when suspended", () => {
    const decision = evaluateAuthorization({
      principal: principal({ isPlatformAdmin: true }),
      permissionCode: "platform.tenant.suspend",
      resourceType: "tenant",
      resourceTenantId: "tenant-b",
      tenantOperationalState: evaluateTenantOperationalState({
        tenantStatus: "SUSPENDED",
        subscriptionStatus: "SUSPENDED",
      }),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      allowWhenSuspended: true,
    });
    expect(decision.allowed).toBe(true);
  });

  it("requires module entitlement when specified", () => {
    const decision = evaluateAuthorization({
      principal: principal({ activeModules: new Set() }),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: evaluateTenantOperationalState({
        tenantStatus: "ACTIVE",
        subscriptionStatus: "ACTIVE",
      }),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      requiresEntitlement: { moduleCode: "PERSONNEL" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("MODULE_ENTITLEMENT_REQUIRED");
  });
});
