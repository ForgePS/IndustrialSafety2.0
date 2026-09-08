import { describe, expect, it } from "vitest";
import { buildWorkspaceRegistry } from "./registry";
import {
  buildDefaultsFromKeys,
  canUserAddModule,
  canUserHideModule,
  enforceWorkspacePolicies,
  inferWorkspaceRoleCodes,
  layoutFromDefaultItems,
  policyMapFromDefaults,
  resolveTenantWorkspaceDefaults,
  selectEffectiveDefaultItems,
  starterRoleDefaultKeys,
} from "./tenant-defaults";

const seeds = [
  { code: "CALENDAR", name: "Calendar", route: "/modules/calendar" },
  { code: "TASKS", name: "Tasks", route: "/modules/tasks" },
  { code: "REMINDERS", name: "Reminders", route: "/modules/reminders" },
  { code: "PERSONNEL", name: "Personnel", route: "/modules/personnel" },
  { code: "TRAINING", name: "Training", route: "/modules/training" },
  { code: "FLEET", name: "Fleet", route: "/modules/fleet" },
];

function registry() {
  return buildWorkspaceRegistry(seeds, () => "bx-cube");
}

describe("tenant workspace defaults", () => {
  it("builds starter role keys", () => {
    expect(starterRoleDefaultKeys("INDUSTRIAL_EMPLOYEE")).toContain("TRAINING");
    expect(starterRoleDefaultKeys("INDUSTRIAL_FLEET_MANAGER")).toContain("FLEET");
  });

  it("builds defaults with required and optional policies", () => {
    const items = buildDefaultsFromKeys(["CALENDAR", "TASKS", "TRAINING"], registry(), {
      requiredKeys: ["CALENDAR", "TASKS"],
      policyForRest: "optional",
    });
    expect(items.find((i) => i.moduleKey === "CALENDAR")?.policy).toBe("required");
    expect(items.find((i) => i.moduleKey === "TRAINING")?.policy).toBe("default");
    expect(items.find((i) => i.moduleKey === "PERSONNEL")?.policy).toBe("optional");
  });

  it("converts defaults to layout visibility", () => {
    const items = buildDefaultsFromKeys(["CALENDAR", "TASKS"], registry(), {
      requiredKeys: ["CALENDAR"],
      policyForRest: "optional",
    });
    items.find((i) => i.moduleKey === "PERSONNEL")!.policy = "hidden";
    const layout = layoutFromDefaultItems(items, registry());
    expect(layout.items.find((i) => i.moduleKey === "CALENDAR")?.isVisible).toBe(true);
    expect(layout.items.find((i) => i.moduleKey === "PERSONNEL")?.isVisible).toBe(false);
    expect(layout.items.find((i) => i.moduleKey === "TASKS")?.isVisible).toBe(true);
  });

  it("enforces required and hidden policies", () => {
    const layout = {
      version: 1 as const,
      items: [
        { moduleKey: "CALENDAR", sortOrder: 0, size: "compact" as const, isVisible: false },
        { moduleKey: "PERSONNEL", sortOrder: 1, size: "compact" as const, isVisible: true },
      ],
    };
    const policies = new Map([
      ["CALENDAR", "required" as const],
      ["PERSONNEL", "hidden" as const],
    ]);
    const next = enforceWorkspacePolicies(layout, policies);
    expect(next.items[0]?.isVisible).toBe(true);
    expect(next.items[1]?.isVisible).toBe(false);
  });

  it("gates hide/add by policy", () => {
    const policies = policyMapFromDefaults([
      {
        moduleKey: "CALENDAR",
        sortOrder: 0,
        size: "compact",
        policy: "required",
      },
      {
        moduleKey: "PERSONNEL",
        sortOrder: 1,
        size: "compact",
        policy: "hidden",
      },
    ]);
    expect(canUserHideModule("CALENDAR", policies)).toBe(false);
    expect(canUserAddModule("PERSONNEL", policies)).toBe(false);
    expect(canUserAddModule("CALENDAR", policies)).toBe(true);
  });

  it("infers role codes from permissions", () => {
    expect(inferWorkspaceRoleCodes(["industrial.access"])).toEqual(["INDUSTRIAL_EMPLOYEE"]);
    expect(inferWorkspaceRoleCodes(["industrial.admin"])).toContain("INDUSTRIAL_SAFETY_MANAGER");
    expect(inferWorkspaceRoleCodes(["industrial.fleet.manage"])).toContain("INDUSTRIAL_FLEET_MANAGER");
  });

  it("selects highest priority role overlay", () => {
    const defaults = resolveTenantWorkspaceDefaults(null, registry());
    defaults.roleDefaults.INDUSTRIAL_EMPLOYEE = buildDefaultsFromKeys(
      ["CALENDAR", "TRAINING"],
      registry(),
      { requiredKeys: ["CALENDAR"], policyForRest: "optional" },
    );
    defaults.roleDefaults.INDUSTRIAL_SAFETY_MANAGER = buildDefaultsFromKeys(
      ["CALENDAR", "FLEET"],
      registry(),
      { requiredKeys: ["CALENDAR"], policyForRest: "optional" },
    );
    // Mark FLEET as default so we can detect the safety overlay
    const safety = defaults.roleDefaults.INDUSTRIAL_SAFETY_MANAGER.map((item) =>
      item.moduleKey === "FLEET" ? { ...item, policy: "default" as const } : item,
    );
    defaults.roleDefaults.INDUSTRIAL_SAFETY_MANAGER = safety;

    const selected = selectEffectiveDefaultItems(defaults, [
      "INDUSTRIAL_EMPLOYEE",
      "INDUSTRIAL_SAFETY_MANAGER",
    ]);
    expect(selected.find((i) => i.moduleKey === "FLEET")?.policy).toBe("default");
  });
});
