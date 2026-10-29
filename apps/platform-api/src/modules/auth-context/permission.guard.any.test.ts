import { describe, expect, it } from "vitest";
import { hasAnyPermission, type ForgePrincipal } from "@forge/tenant-context";

function principal(perms: string[]): ForgePrincipal {
  return {
    authenticationIdentityId: "auth",
    userId: "user",
    personId: null,
    tenantId: "tenant",
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

describe("specialty reviewer permission sets", () => {
  it("allows review-comment access via specialty.review without incident.review", () => {
    const p = principal(["rms.neris.specialty.review", "rms.neris.incident.view"]);
    expect(hasAnyPermission(p, ["rms.neris.incident.review", "rms.neris.specialty.review"])).toBe(
      true,
    );
    expect(hasAnyPermission(p, ["rms.neris.incident.review"])).toBe(false);
  });

  it("does not grant civilian casualty view to hazmat-only reviewers", () => {
    const p = principal([
      "rms.neris.specialty.review",
      "rms.neris.hazmat.view",
      "rms.neris.incident.view",
    ]);
    expect(hasAnyPermission(p, ["rms.neris.civilian_casualty.view"])).toBe(false);
    expect(hasAnyPermission(p, ["rms.neris.fire_service_casualty.view"])).toBe(false);
  });
});
