import { describe, expect, it } from "vitest";
import type { ForgeNavigationGroup } from "@forge/design-system";
import {
  filterNavigationForSession,
  sessionModuleEnabled,
  sessionProductEnabled,
} from "./entitlements.js";

const groups: ForgeNavigationGroup[] = [
  {
    id: "rms",
    label: "RMS",
    items: [
      {
        id: "neris",
        label: "NERIS",
        route: "/neris",
        entitlement: "FORGE_RMS",
        moduleEntitlement: "NERIS",
        permission: "rms.neris.incident.view",
      },
    ],
  },
];

describe("filterNavigationForSession", () => {
  it("hides module when permission present but module entitlement missing", () => {
    const filtered = filterNavigationForSession(groups, {
      activeProducts: ["FORGE_RMS"],
      activeModules: [],
      permissions: ["rms.neris.incident.view"],
      isPlatformAdmin: false,
    });
    expect(filtered).toEqual([]);
  });

  it("shows module when permission + product + module entitlements present", () => {
    const filtered = filterNavigationForSession(groups, {
      activeProducts: ["FORGE_RMS"],
      activeModules: ["NERIS"],
      permissions: ["rms.neris.incident.view"],
      isPlatformAdmin: false,
    });
    expect(filtered[0]?.items.map((i) => i.id)).toEqual(["neris"]);
  });
});

describe("sessionProductEnabled / sessionModuleEnabled", () => {
  it("reflects AuthMe entitlements", () => {
    const me = {
      activeProducts: ["FORGE_ACADEMY"],
      activeModules: ["COURSES"],
      isPlatformAdmin: false,
    };
    expect(sessionProductEnabled(me, "FORGE_ACADEMY")).toBe(true);
    expect(sessionProductEnabled(me, "FORGE_RMS")).toBe(false);
    expect(sessionModuleEnabled(me, "COURSES")).toBe(true);
    expect(sessionModuleEnabled(null, "COURSES")).toBe(false);
  });
});
