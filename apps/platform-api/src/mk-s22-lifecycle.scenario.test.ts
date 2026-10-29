/**
 * MK-S22 lifecycle matrix (no DB). Maps directive §49 steps → API / authZ evidence paths.
 * Runtime proof lives in mk-s22-lifecycle.e2e.test.ts (requires Postgres).
 */
import { describe, expect, it } from "vitest";
import {
  assertTenantStatusTransition,
  canTransitionTenantStatus,
  createBillingCustomerInputSchema,
  createFacilityInputSchema,
  createInvitationInputSchema,
  createNotificationInputSchema,
  createOrganizationInputSchema,
  createTenantInputSchema,
} from "@forge/contracts";

export type LifecycleEvidence = "API" | "AUTHZ_EVAL" | "UI_N_A" | "VIEWPORT_STATIC";

export type LifecycleStep = {
  step: number;
  title: string;
  evidence: LifecycleEvidence;
  /** Primary route or check used in the e2e orchestrator */
  path: string;
};

/** Supported Creator Console / Tenant Admin viewports (static layout; CSS width-device-width). */
export const MK_S22_SUPPORTED_VIEWPORTS = [
  { id: "mobile", width: 375, height: 812, apps: ["creator-console", "tenant-admin"] },
  { id: "tablet", width: 768, height: 1024, apps: ["creator-console", "tenant-admin"] },
  { id: "desktop", width: 1280, height: 800, apps: ["creator-console", "tenant-admin"] },
  { id: "wide", width: 1440, height: 900, apps: ["creator-console", "tenant-admin"] },
] as const;

export const MK_S22_LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  {
    step: 1,
    title: "Provision tenant",
    evidence: "API",
    path: "POST /api/v1/platform/tenants",
  },
  {
    step: 2,
    title: "Assign product",
    evidence: "API",
    path: "PUT /api/v1/tenants/:id/products/FORGE_INDUSTRIAL",
  },
  {
    step: 3,
    title: "Assign modules",
    evidence: "API",
    path: "PUT /api/v1/tenants/:id/modules/:code/entitlement",
  },
  {
    step: 4,
    title: "Owner invite",
    evidence: "API",
    path: "POST /api/v1/auth/invitations (TENANT_OWNER)",
  },
  {
    step: 5,
    title: "Owner accept",
    evidence: "API",
    path: "POST /api/v1/auth/invitations/accept",
  },
  {
    step: 6,
    title: "Owner authenticate",
    evidence: "API",
    path: "GET /api/v1/auth/me",
  },
  {
    step: 7,
    title: "Org settings updated",
    evidence: "API",
    path: "POST+PATCH /api/v1/tenants/:id/organizations",
  },
  {
    step: 8,
    title: "Facility added",
    evidence: "API",
    path: "POST /api/v1/tenants/:id/facilities",
  },
  {
    step: 9,
    title: "Admin invite",
    evidence: "API",
    path: "POST /api/v1/auth/invitations (TENANT_ADMIN)",
  },
  {
    step: 10,
    title: "Admin accept",
    evidence: "API",
    path: "POST /api/v1/auth/invitations/accept",
  },
  {
    step: 11,
    title: "Admin role assigned",
    evidence: "API",
    path: "PUT /api/v1/tenants/:id/memberships/:mid/roles",
  },
  {
    step: 12,
    title: "Permission verified",
    evidence: "API",
    path: "GET persons allowed; POST person denied for STANDARD_USER",
  },
  {
    step: 13,
    title: "Module accessible",
    evidence: "API",
    path: "GET facilities + principal.activeModules LOCKOUT_TAGOUT",
  },
  {
    step: 14,
    title: "Module disabled",
    evidence: "API",
    path: "POST .../modules/LOCKOUT_TAGOUT/suspend",
  },
  {
    step: 15,
    title: "UI removes module",
    evidence: "UI_N_A",
    path: "Static export shells — nav derived from entitlements; no live Playwright in CI",
  },
  {
    step: 16,
    title: "API rejects module use",
    evidence: "AUTHZ_EVAL",
    path: "evaluateAuthorization MODULE_ENTITLEMENT_REQUIRED + product-disabled facilities HTTP 403",
  },
  {
    step: 17,
    title: "Module restored",
    evidence: "API",
    path: "POST .../modules/LOCKOUT_TAGOUT/activate (+ product ACTIVE)",
  },
  {
    step: 18,
    title: "Billing updated",
    evidence: "API",
    path: "POST/PATCH /api/v1/tenants/:id/billing/customers (creator)",
  },
  {
    step: 19,
    title: "Tenant suspended",
    evidence: "API",
    path: "POST /api/v1/platform/tenants/:id/suspend",
  },
  {
    step: 20,
    title: "Protected access restricted",
    evidence: "API",
    path: "GET persons → 403 while SUSPENDED",
  },
  {
    step: 21,
    title: "Tenant restored",
    evidence: "API",
    path: "POST /api/v1/platform/tenants/:id/activate",
  },
  {
    step: 22,
    title: "Notification delivered",
    evidence: "API",
    path: "POST + GET /api/v1/tenants/:id/notifications",
  },
  {
    step: 23,
    title: "Audit verified",
    evidence: "API",
    path: "GET /api/v1/tenants/:id/audit-events",
  },
  {
    step: 24,
    title: "Tenant isolation",
    evidence: "API",
    path: "Cross-tenant GET persons → 403",
  },
] as const;

describe("MK-S22 lifecycle scenario matrix", () => {
  it("covers exactly the 24 directive steps in order", () => {
    expect(MK_S22_LIFECYCLE_STEPS).toHaveLength(24);
    expect(MK_S22_LIFECYCLE_STEPS.map((s) => s.step)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
  });

  it("marks step 15 UI module remove as N/A for static export", () => {
    const step15 = MK_S22_LIFECYCLE_STEPS.find((s) => s.step === 15);
    expect(step15?.evidence).toBe("UI_N_A");
  });

  it("defines supported viewports for Creator Console and Tenant Admin", () => {
    expect(MK_S22_SUPPORTED_VIEWPORTS.length).toBeGreaterThanOrEqual(3);
    for (const vp of MK_S22_SUPPORTED_VIEWPORTS) {
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.apps).toEqual(expect.arrayContaining(["creator-console", "tenant-admin"]));
    }
  });

  it("allows SaaS status transitions used by steps 1/19/21", () => {
    expect(canTransitionTenantStatus("PROVISIONING", "ACTIVE")).toBe(true);
    expect(canTransitionTenantStatus("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionTenantStatus("SUSPENDED", "ACTIVE")).toBe(true);
    expect(() => assertTenantStatusTransition("ACTIVE", "SUSPENDED")).not.toThrow();
    expect(() => assertTenantStatusTransition("SUSPENDED", "ACTIVE")).not.toThrow();
  });

  it("validates request schemas for primary lifecycle mutations", () => {
    expect(
      createTenantInputSchema.parse({
        tenantKey: "acme-uat",
        slug: "acme-uat",
        legalName: "Acme UAT LLC",
        displayName: "Acme UAT",
      }).tenantType,
    ).toBe("CUSTOMER");

    expect(
      createInvitationInputSchema.parse({
        tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "owner@example.test",
        roleCodes: ["TENANT_OWNER"],
        productCodes: ["FORGE_INDUSTRIAL"],
        moduleCodes: ["CORE", "LOCKOUT_TAGOUT"],
      }).send,
    ).toBe(true);

    expect(
      createOrganizationInputSchema.parse({
        organizationTypeCode: "SAFETY_COMPANY",
        slug: "acme-hq",
        legalName: "Acme HQ",
        displayName: "Acme HQ",
      }).slug,
    ).toBe("acme-hq");

    expect(
      createFacilityInputSchema.parse({
        facilityKey: "plant-1",
        name: "Plant 1",
      }).facilityType,
    ).toBe("SITE");

    expect(
      createBillingCustomerInputSchema.parse({
        displayName: "Acme Billing",
        billingEmail: "billing@example.test",
      }).billingProvider,
    ).toBe("NONE");

    expect(
      createNotificationInputSchema.parse({
        userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "system.uat",
        title: "UAT notice",
        body: "Lifecycle notification delivered.",
      }).destination,
    ).toBe("IN_APP");
  });
});
