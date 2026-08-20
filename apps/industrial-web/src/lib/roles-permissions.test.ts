import { describe, expect, it } from "vitest";
import {
  assignablePermissionCodes,
  canAssignRoles,
  filterPermissionDirectory,
  formatPermissionDate,
  paginateRows,
  permissionDisplayName,
  roleChipTone,
  roleCodeFromName,
  toPermissionDirectory,
  toTenantRoles,
} from "./roles-permissions";

describe("role helpers", () => {
  it("maps admin-like codes to primary chips and operators to success", () => {
    expect(roleChipTone("IND3V_INDUSTRIAL_ADMIN", "Tenant Admin")).toBe("primary");
    expect(roleChipTone("IND3V_INDUSTRIAL_OPERATOR", "Operator")).toBe("success");
    expect(roleChipTone("SUPPORT_DESK", "Support")).toBe("info");
  });

  it("builds a role code from a display name", () => {
    expect(roleCodeFromName("Safety Lead")).toBe("SAFETY_LEAD");
    expect(roleCodeFromName("2nd Shift")).toBe("ROLE_2ND_SHIFT");
  });

  it("formats created dates like the Vuexy permissions table", () => {
    const formatted = formatPermissionDate("2021-04-14T18:00:00.000Z");
    expect(formatted).toMatch(/Apr 2021/);
    expect(formatted).not.toBe("—");
  });
});

describe("toPermissionDirectory", () => {
  const roles = toTenantRoles([
    {
      id: "r-admin",
      code: "IND3V_INDUSTRIAL_ADMIN",
      name: "Industrial Admin",
      permissions: [
        { code: "industrial.personnel.manage", name: "Manage personnel" },
        { code: "platform.membership.manage" },
      ],
    },
    {
      id: "r-ops",
      code: "IND3V_INDUSTRIAL_OPERATOR",
      name: "Operator",
      permissions: [{ code: "industrial.personnel.view", effect: "ALLOW" }],
    },
  ]);

  it("inverts role grants into permission rows with role chips", () => {
    const rows = toPermissionDirectory(roles, [
      {
        code: "industrial.personnel.manage",
        name: "Manage personnel",
        createdAt: "2021-04-14T20:43:00.000Z",
      },
      { code: "industrial.fleet.view", name: "View fleet" },
    ]);
    const manage = rows.find((row) => row.code === "industrial.personnel.manage");
    expect(manage?.assignedRoles.map((role) => role.code)).toEqual(["IND3V_INDUSTRIAL_ADMIN"]);
    expect(rows.some((row) => row.code === "industrial.fleet.view")).toBe(true);
  });

  it("filters by permission name or assigned role", () => {
    const rows = toPermissionDirectory(roles);
    expect(filterPermissionDirectory(rows, "operator").map((row) => row.code)).toEqual([
      "industrial.personnel.view",
    ]);
  });
});

describe("assignablePermissionCodes", () => {
  const catalog = [
    { code: "industrial.personnel.manage", name: "Manage personnel" },
    { code: "platform.tenant.create", name: "Create tenant" },
  ];

  it("lets platform admins see the catalog and tenant admins only what they hold", () => {
    expect(assignablePermissionCodes(catalog, { isPlatformAdmin: true, permissions: [] })).toHaveLength(
      2,
    );
    expect(
      assignablePermissionCodes(catalog, {
        isPlatformAdmin: false,
        permissions: ["industrial.personnel.manage"],
      }).map((row) => row.code),
    ).toEqual(["industrial.personnel.manage"]);
  });

  it("requires role.assign to mutate", () => {
    expect(canAssignRoles({ isPlatformAdmin: true, permissions: [] })).toBe(true);
    expect(canAssignRoles({ isPlatformAdmin: false, permissions: ["platform.role.assign"] })).toBe(
      true,
    );
    expect(canAssignRoles({ isPlatformAdmin: false, permissions: ["platform.permission.read"] })).toBe(
      false,
    );
  });
});

describe("paginateRows", () => {
  it("pages a permission list", () => {
    const page = paginateRows([1, 2, 3, 4, 5], 2, 2);
    expect(page.items).toEqual([3, 4]);
    expect(page.from).toBe(3);
    expect(page.to).toBe(4);
  });
});

describe("permissionDisplayName", () => {
  it("prefers a human name over the raw code", () => {
    expect(permissionDisplayName({ code: "industrial.access", name: "Industrial access" })).toBe(
      "Industrial access",
    );
    expect(permissionDisplayName({ code: "industrial.access", name: "industrial.access" })).toBe(
      "industrial · access",
    );
  });
});
