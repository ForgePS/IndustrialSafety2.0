import { describe, expect, it } from "vitest";
import {
  applyRolePreviewToMe,
  permissionCodesFromRolePermissions,
  type RolePreviewState,
} from "./role-preview.js";
import type { AuthMe } from "./auth-api.js";

const baseMe: AuthMe = {
  userId: "u1",
  personId: null,
  tenantId: "t1",
  organizationIds: [],
  permissions: ["platform.role.assign", "industrial.admin"],
  activeProducts: ["FORGE_INDUSTRIAL"],
  activeModules: ["LOTO"],
  isPlatformAdmin: true,
  authProvider: "cognito",
  accessMode: "PLATFORM_ADMIN_SUPPORT",
  tenants: [],
};

const preview: RolePreviewState = {
  tenantId: "t1",
  roleId: "r1",
  roleCode: "SUPERVISOR",
  roleName: "Supervisor",
  permissionCodes: ["industrial.loto.view", "industrial.access"],
  startedAt: "2026-01-01T00:00:00.000Z",
};

describe("role-preview", () => {
  it("strips platform admin bypass and substitutes role permissions", () => {
    const next = applyRolePreviewToMe(baseMe, preview);
    expect(next.isPlatformAdmin).toBe(false);
    expect(next.accessMode).toBe("MEMBER");
    expect(next.permissions).toEqual(["industrial.loto.view", "industrial.access"]);
    expect(next.activeProducts).toEqual(["FORGE_INDUSTRIAL"]);
  });

  it("applies deny-wins when building role permission codes", () => {
    expect(
      permissionCodesFromRolePermissions([
        { code: "industrial.loto.view", effect: "ALLOW" },
        { code: "industrial.loto.edit", effect: "ALLOW" },
        { code: "industrial.loto.edit", effect: "DENY" },
        { code: "  ", effect: "ALLOW" },
      ]),
    ).toEqual(["industrial.loto.view"]);
  });
});
