import { describe, expect, it } from "vitest";
import {
  evaluateAuthorization,
  evaluateTenantOperationalState,
  requireEntitlement,
  resolveEffectivePermissionCodes,
  resolveFeatureValue,
} from "./index.js";
import type { ForgePrincipal } from "@forge/tenant-context";
import {
  SAAS_ROLE_PERSONAS,
  permissionsForSaasPersona,
  saasPersonaHasPermission,
} from "@forge/contracts";

function principal(overrides: Partial<ForgePrincipal> = {}): ForgePrincipal {
  return {
    authenticationIdentityId: "a",
    userId: "u",
    personId: "p",
    tenantId: "tenant-a",
    organizationIds: [],
    permissions: new Set(["platform.person.read"]),
    activeProducts: new Set(["FORGE_ACADEMY"]),
    activeModules: new Set(["ACADEMY_CORE"]),
    correlationId: "c",
    requestId: "r",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
    ...overrides,
  };
}

function operationalActive() {
  return evaluateTenantOperationalState({
    tenantStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
  });
}

describe("evaluateAuthorization", () => {
  it("denies cross-tenant access", () => {
    const decision = evaluateAuthorization({
      principal: principal(),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-b",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("TENANT_MISMATCH");
  });

  it("applies explicit deny over allow", () => {
    const decision = evaluateAuthorization({
      principal: principal(),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operationalActive(),
      roleEffects: [
        { effect: "ALLOW", organizationId: null },
        { effect: "DENY", organizationId: null },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("EXPLICIT_DENY");
  });

  it("denies writes when subscription inactive", () => {
    const decision = evaluateAuthorization({
      principal: principal(),
      permissionCode: "platform.person.create",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: evaluateTenantOperationalState({
        tenantStatus: "ACTIVE",
        subscriptionStatus: "SUSPENDED",
      }),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("allows reads in READ_ONLY subscription mode", () => {
    const operational = evaluateTenantOperationalState({
      tenantStatus: "ACTIVE",
      subscriptionStatus: "READ_ONLY",
    });
    const readDecision = evaluateAuthorization({
      principal: principal({ permissions: new Set(["platform.person.read"]) }),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operational,
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    const writeDecision = evaluateAuthorization({
      principal: principal({ permissions: new Set(["platform.person.create"]) }),
      permissionCode: "platform.person.create",
      resourceType: "person",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operational,
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(readDecision.allowed).toBe(true);
    expect(writeDecision.allowed).toBe(false);
  });

  it("treats PAYMENT_DUE and GRACE_PERIOD as writable", () => {
    for (const status of ["PAYMENT_DUE", "GRACE_PERIOD"] as const) {
      const operational = evaluateTenantOperationalState({
        tenantStatus: "ACTIVE",
        subscriptionStatus: status,
      });
      expect(operational.canUseProducts).toBe(true);
    }
  });
});

describe("permission + entitlement matrix", () => {
  const permissionCode = "tenant.facilities.read";

  it("permission + entitlement = allow", () => {
    const decision = evaluateAuthorization({
      principal: principal({
        permissions: new Set([permissionCode]),
        activeProducts: new Set(["FORGE_INDUSTRIAL"]),
      }),
      permissionCode,
      resourceType: "facility",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
    });
    expect(decision.allowed).toBe(true);
  });

  it("permission + no entitlement = deny", () => {
    const decision = evaluateAuthorization({
      principal: principal({
        permissions: new Set([permissionCode]),
        activeProducts: new Set(),
      }),
      permissionCode,
      resourceType: "facility",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("PRODUCT_ENTITLEMENT_REQUIRED");
  });

  it("entitlement + no permission = deny", () => {
    const decision = evaluateAuthorization({
      principal: principal({
        permissions: new Set(),
        activeProducts: new Set(["FORGE_INDUSTRIAL"]),
      }),
      permissionCode,
      resourceType: "facility",
      resourceTenantId: "tenant-a",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("PERMISSION_MISSING");
  });

  it("cross-tenant entitlement denied", () => {
    const decision = evaluateAuthorization({
      principal: principal({
        permissions: new Set([permissionCode]),
        activeProducts: new Set(["FORGE_INDUSTRIAL"]),
      }),
      permissionCode,
      resourceType: "facility",
      resourceTenantId: "tenant-other",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("TENANT_MISMATCH");
  });
});

describe("requireEntitlement", () => {
  it("denies missing module entitlement", () => {
    expect(
      requireEntitlement(principal({ activeModules: new Set() }), {
        moduleCode: "PERSONNEL",
      }),
    ).toEqual({ allowed: false, reasonCode: "MODULE_ENTITLEMENT_REQUIRED" });
  });

  it("allows when product present", () => {
    expect(
      requireEntitlement(principal({ activeProducts: new Set(["FORGE_RMS"]) }), {
        productCode: "FORGE_RMS",
      }),
    ).toEqual({ allowed: true, reasonCode: "ALLOW" });
  });
});

describe("resolveEffectivePermissionCodes", () => {
  it("deny wins over allow for the same code", () => {
    const effective = resolveEffectivePermissionCodes([
      { code: "platform.person.create", effect: "ALLOW" },
      { code: "platform.person.create", effect: "DENY" },
      { code: "platform.person.read", effect: "ALLOW" },
    ]);
    expect(effective.has("platform.person.create")).toBe(false);
    expect(effective.has("platform.person.read")).toBe(true);
  });
});

describe("SaaS persona authorization matrix", () => {
  const actions = [
    "platform.organization.read",
    "platform.person.read",
    "platform.person.create",
    "platform.membership.manage",
    "platform.role.assign",
    "platform.audit.read",
  ] as const;

  for (const persona of SAAS_ROLE_PERSONAS) {
    for (const permissionCode of actions) {
      it(`${persona} ${saasPersonaHasPermission(persona, permissionCode) ? "allows" : "denies"} ${permissionCode}`, () => {
        const decision = evaluateAuthorization({
          principal: principal({
            permissions: new Set(permissionsForSaasPersona(persona)),
          }),
          permissionCode,
          resourceType: "platform",
          resourceTenantId: "tenant-a",
          tenantOperationalState: operationalActive(),
          roleEffects: [{ effect: "ALLOW", organizationId: null }],
        });
        expect(decision.allowed).toBe(saasPersonaHasPermission(persona, permissionCode));
      });
    }
  }

  it("other tenant is denied for owner with matching permission", () => {
    const decision = evaluateAuthorization({
      principal: principal({
        permissions: new Set(permissionsForSaasPersona("owner")),
      }),
      permissionCode: "platform.membership.manage",
      resourceType: "platform",
      resourceTenantId: "tenant-other",
      tenantOperationalState: operationalActive(),
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("TENANT_MISMATCH");
  });
});

describe("evaluateTenantOperationalState", () => {
  it("blocks product use for TERMINATED subscriptions while keeping auth", () => {
    const state = evaluateTenantOperationalState({
      tenantStatus: "ACTIVE",
      subscriptionStatus: "TERMINATED",
    });
    expect(state.canAuthenticate).toBe(true);
    expect(state.canUseProducts).toBe(false);
  });

  it("treats TRIAL like an operational tenant when subscription is writable", () => {
    const state = evaluateTenantOperationalState({
      tenantStatus: "TRIAL",
      subscriptionStatus: "ACTIVE",
    });
    expect(state.canAuthenticate).toBe(true);
    expect(state.canUseProducts).toBe(true);
    expect(state.reasonCode).toBeNull();
  });

  it("treats CANCELED as inactive", () => {
    const state = evaluateTenantOperationalState({
      tenantStatus: "CANCELED",
      subscriptionStatus: "ACTIVE",
    });
    expect(state.canAuthenticate).toBe(false);
    expect(state.canUseProducts).toBe(false);
    expect(state.reasonCode).toBe("TENANT_INACTIVE");
  });
});

describe("resolveFeatureValue", () => {
  it("uses user override first", () => {
    expect(
      resolveFeatureValue({
        user: true,
        tenant: false,
        defaultValue: false,
      }),
    ).toBe(true);
  });
});
