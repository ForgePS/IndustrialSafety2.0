import { describe, expect, it } from "vitest";
import {
  enabledPageIdsFromPermissionCodes,
  filterModulePages,
  mergePermissionCodesWithModulePages,
  modulePagePermissionOk,
  pagePermissionCode,
  pagePermissionCodesForModule,
} from "./industrial-module-pages.js";
import { mergePermissionCodesWithModules } from "./industrial-module-permissions.js";

describe("industrial-module-pages", () => {
  it("builds page permission codes", () => {
    expect(pagePermissionCode("SANITATION", "pest")).toBe("industrial.sanitation.page.pest");
    expect(pagePermissionCode("SANITATION", "compressed-air")).toBe(
      "industrial.sanitation.page.compressed-air",
    );
    expect(pagePermissionCodesForModule("FORMS").length).toBe(3);
  });

  it("treats legacy view as all pages", () => {
    const perms = new Set(["industrial.sanitation.view"]);
    expect(modulePagePermissionOk("SANITATION", "pest", perms)).toBe(true);
    expect(modulePagePermissionOk("SANITATION", "settings", perms)).toBe(true);
    expect(enabledPageIdsFromPermissionCodes("SANITATION", [...perms])).toContain("pest");
  });

  it("restricts pages once any page code is present", () => {
    const perms = new Set([
      "industrial.sanitation.view",
      "industrial.sanitation.page.dashboard",
      "industrial.sanitation.page.start",
    ]);
    expect(modulePagePermissionOk("SANITATION", "dashboard", perms)).toBe(true);
    expect(modulePagePermissionOk("SANITATION", "pest", perms)).toBe(false);
  });

  it("ANDs tenant disabled tabs with role pages", () => {
    const tabs = [
      { id: "dashboard", label: "Dashboard" },
      { id: "pest", label: "Pest" },
    ];
    const visible = filterModulePages({
      tabs,
      moduleCode: "SANITATION",
      permissions: ["industrial.sanitation.view", "industrial.sanitation.page.pest"],
      tenantDisabledTabs: ["pest"],
    });
    expect(visible.map((t) => t.id)).toEqual([]);
  });

  it("merges page checklist for one module", () => {
    const next = mergePermissionCodesWithModulePages({
      currentPermissionCodes: [
        "industrial.access",
        "industrial.sanitation.view",
        "industrial.sanitation.page.dashboard",
        "industrial.loto.view",
      ],
      moduleCode: "SANITATION",
      enabledPageIds: ["start", "pest"],
    });
    expect(next).toContain("industrial.sanitation.page.start");
    expect(next).toContain("industrial.sanitation.page.pest");
    expect(next).not.toContain("industrial.sanitation.page.dashboard");
    expect(next).toContain("industrial.loto.view");
  });

  it("grants all pages when a module is newly selected", () => {
    const next = mergePermissionCodesWithModules({
      currentPermissionCodes: ["industrial.access", "industrial.personnel.view"],
      selectedModuleCodes: ["PERSONNEL", "SANITATION"],
    });
    expect(next).toContain("industrial.sanitation.view");
    expect(next).toContain("industrial.sanitation.page.pest");
    expect(next).toContain("industrial.personnel.view");
  });

  it("preserves customized pages when modules stay selected", () => {
    const next = mergePermissionCodesWithModules({
      currentPermissionCodes: [
        "industrial.access",
        "industrial.sanitation.view",
        "industrial.sanitation.page.dashboard",
        "industrial.sanitation.page.start",
      ],
      selectedModuleCodes: ["SANITATION", "LOCKOUT_TAGOUT"],
    });
    expect(next).toContain("industrial.sanitation.page.dashboard");
    expect(next).toContain("industrial.sanitation.page.start");
    expect(next).not.toContain("industrial.sanitation.page.pest");
    expect(next).toContain("industrial.loto.view");
    expect(next).toContain("industrial.loto.page.procedures");
  });

  it("removes page codes when a module is deselected", () => {
    const next = mergePermissionCodesWithModules({
      currentPermissionCodes: [
        "industrial.access",
        "industrial.sanitation.view",
        "industrial.sanitation.page.dashboard",
        "industrial.loto.view",
      ],
      selectedModuleCodes: ["LOCKOUT_TAGOUT"],
    });
    expect(next).not.toContain("industrial.sanitation.view");
    expect(next).not.toContain("industrial.sanitation.page.dashboard");
    expect(next).toContain("industrial.loto.view");
  });
});
