import { describe, expect, it } from "vitest";
import { filterNavigationGroups, type ForgeNavigationGroup } from "./navigation.js";

const groups: ForgeNavigationGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dash", label: "Dashboard", route: "/" },
      {
        id: "migrations",
        label: "Migrations",
        route: "/migrations",
        permission: "platform.tenant.read",
      },
    ],
  },
  {
    id: "industrial",
    label: "Industrial",
    items: [
      {
        id: "loto",
        label: "LOTO",
        route: "/modules/loto",
        entitlement: "FORGE_INDUSTRIAL",
        moduleEntitlement: "LOCKOUT_TAGOUT",
        featureFlag: "industrial.module.loto.enabled",
      },
    ],
  },
];

describe("filterNavigationGroups", () => {
  it("hides permission-gated items for regular users", () => {
    const filtered = filterNavigationGroups(groups, { permissions: [] });
    expect(filtered.find((g) => g.id === "overview")?.items.map((i) => i.id)).toEqual(["dash"]);
  });

  it("shows all for platform admin", () => {
    const filtered = filterNavigationGroups(groups, {
      isPlatformAdmin: true,
      products: ["FORGE_INDUSTRIAL"],
      modules: ["LOCKOUT_TAGOUT"],
      featureFlags: { "industrial.module.loto.enabled": true },
    });
    expect(filtered.flatMap((g) => g.items).map((i) => i.id)).toContain("migrations");
    expect(filtered.flatMap((g) => g.items).map((i) => i.id)).toContain("loto");
  });

  it("requires entitlement and feature flag together", () => {
    const filtered = filterNavigationGroups(groups, {
      isPlatformAdmin: true,
      products: ["FORGE_INDUSTRIAL"],
      modules: ["LOCKOUT_TAGOUT"],
      featureFlags: { "industrial.module.loto.enabled": false },
    });
    expect(filtered.find((g) => g.id === "industrial")).toBeUndefined();
  });

  it("hides module when product entitled but module not", () => {
    const filtered = filterNavigationGroups(groups, {
      permissions: ["platform.tenant.read"],
      products: ["FORGE_INDUSTRIAL"],
      modules: [],
      featureFlags: { "industrial.module.loto.enabled": true },
    });
    expect(filtered.find((g) => g.id === "industrial")).toBeUndefined();
  });
});
