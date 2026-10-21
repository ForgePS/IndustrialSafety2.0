import { describe, expect, it } from "vitest";
import {
  filterIndustrialDashboardAttentionItems,
  industrialDashboardAttentionAllowed,
} from "./industrial-dashboard-attention.js";

describe("industrial-dashboard-attention", () => {
  it("allows platform admin and industrial.admin", () => {
    expect(
      industrialDashboardAttentionAllowed({
        moduleCode: "INCIDENTS",
        permissions: [],
        activeModules: [],
        isPlatformAdmin: true,
      }),
    ).toBe(true);
    expect(
      industrialDashboardAttentionAllowed({
        moduleCode: "INCIDENTS",
        permissions: ["industrial.admin"],
        activeModules: new Set(),
      }),
    ).toBe(true);
  });

  it("requires module entitlement and view permission", () => {
    expect(
      industrialDashboardAttentionAllowed({
        moduleCode: "INCIDENTS",
        permissions: ["industrial.access", "industrial.incidents.view"],
        activeModules: ["TRAINING"],
      }),
    ).toBe(false);
    expect(
      industrialDashboardAttentionAllowed({
        moduleCode: "INCIDENTS",
        permissions: ["industrial.access"],
        activeModules: ["INCIDENTS"],
      }),
    ).toBe(false);
    expect(
      industrialDashboardAttentionAllowed({
        moduleCode: "INCIDENTS",
        permissions: ["industrial.access", "industrial.incidents.view"],
        activeModules: ["INCIDENTS"],
      }),
    ).toBe(true);
  });

  it("filters attention items by available modules", () => {
    const items = [
      { key: "openIncidents", count: 2 },
      { key: "trainingExpiring", count: 1 },
      { key: "tasks", count: 3 },
    ];
    const filtered = filterIndustrialDashboardAttentionItems(items, {
      permissions: [
        "industrial.access",
        "industrial.incidents.view",
        "industrial.training.view",
      ],
      activeModules: ["INCIDENTS", "TRAINING", "TASKS"],
      availableModuleCodes: ["INCIDENTS", "TASKS"],
    });
    expect(filtered.map((i) => i.key)).toEqual(["openIncidents", "tasks"]);
  });
});
