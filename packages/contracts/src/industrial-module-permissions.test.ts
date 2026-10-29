import { describe, expect, it } from "vitest";
import {
  industrialModuleNavPermissionOk,
  mergePermissionCodesWithModules,
  moduleCodesFromPermissionCodes,
} from "./industrial-module-permissions.js";

describe("industrial-module-permissions", () => {
  it("infers selected modules from view permissions", () => {
    expect(
      moduleCodesFromPermissionCodes([
        "industrial.access",
        "industrial.personnel.view",
        "industrial.loto.view",
      ]),
    ).toEqual(["PERSONNEL", "LOCKOUT_TAGOUT"]);
  });

  it("treats industrial.admin as all modules", () => {
    const codes = moduleCodesFromPermissionCodes(["industrial.admin"]);
    expect(codes).toContain("PERSONNEL");
    expect(codes).toContain("LOCKOUT_TAGOUT");
    expect(codes.length).toBeGreaterThan(10);
  });

  it("merges module grants without wiping manage permissions", () => {
    const next = mergePermissionCodesWithModules({
      currentPermissionCodes: [
        "industrial.access",
        "industrial.personnel.view",
        "industrial.personnel.manage",
        "platform.role.assign",
      ],
      selectedModuleCodes: ["LOCKOUT_TAGOUT"],
      catalogPermissionCodes: [
        "industrial.access",
        "industrial.personnel.view",
        "industrial.personnel.manage",
        "industrial.loto.view",
        "platform.role.assign",
      ],
    });
    expect(next).toContain("industrial.access");
    expect(next).toContain("industrial.loto.view");
    expect(next).toContain("industrial.personnel.manage");
    expect(next).toContain("platform.role.assign");
    expect(next).not.toContain("industrial.personnel.view");
  });

  it("gates nav by module access permissions", () => {
    const perms = new Set(["industrial.access", "industrial.personnel.view"]);
    expect(industrialModuleNavPermissionOk("CORE", perms)).toBe(true);
    expect(industrialModuleNavPermissionOk("PERSONNEL", perms)).toBe(true);
    expect(industrialModuleNavPermissionOk("LOCKOUT_TAGOUT", perms)).toBe(false);
    expect(
      industrialModuleNavPermissionOk(
        "LOCKOUT_TAGOUT",
        new Set(["industrial.access", "industrial.admin"]),
      ),
    ).toBe(true);
  });
});
