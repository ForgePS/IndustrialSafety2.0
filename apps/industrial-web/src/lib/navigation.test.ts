import { INDUSTRIAL_MODULE_REGISTRY } from "@forge/contracts";
import { describe, expect, it } from "vitest";
import {
  buildIndustrialNavigation,
  featureFlagForModule,
  moduleUnavailableMessage,
} from "./navigation";

describe("industrial navigation foundation", () => {
  it("returns empty nav when not entitled", () => {
    const nav = buildIndustrialNavigation({
      entitled: false,
      permissions: ["industrial.access"],
      flags: { "industrial.enabled": true },
    });
    expect(nav).toEqual([]);
  });

  it("hides AVAILABLE modules when strict entitlements and none enabled", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: {},
      enabledModules: [],
      strictEntitlements: true,
      includeUnavailable: true,
    });
    const personnel = nav.find((n) => n.code === "PERSONNEL");
    expect(personnel?.available).toBe(false);
    expect(personnel?.implementationStatus).toBe("AVAILABLE");
    expect(personnel?.customerEnabled).toBe(false);
  });

  it("enables IND-3 module when entitled and module view permission granted", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access", "industrial.personnel.view"],
      flags: {},
      enabledModules: ["PERSONNEL"],
      strictEntitlements: true,
    });
    const personnel = nav.find((n) => n.code === "PERSONNEL");
    expect(personnel?.available).toBe(true);
  });

  it("hides entitled module when role lacks module view permission", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: {},
      enabledModules: ["PERSONNEL"],
      strictEntitlements: true,
    });
    expect(nav.find((n) => n.code === "PERSONNEL")).toBeUndefined();
  });

  it("never marks a module available unless it is AVAILABLE, whatever the entitlements", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: {},
      enabledModules: INDUSTRIAL_MODULE_REGISTRY.map((m) => m.code),
      strictEntitlements: true,
      includeUnavailable: true,
    });
    // Guards against this becoming vacuous if the registry is ever emptied.
    expect(nav.length).toBeGreaterThan(0);
    for (const item of nav) {
      if (item.implementationStatus !== "AVAILABLE") {
        expect(item.available, `${item.code} must not be available`).toBe(false);
      }
    }
  });

  it("does not treat feature flags as authorization bypass", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: [],
      flags: { "industrial.enabled": true, "industrial.module.personnel.enabled": true },
      enabledModules: ["PERSONNEL"],
      strictEntitlements: true,
    });
    expect(nav).toEqual([]);
  });

  it("marks CORE available with industrial.access when product entitled", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: {},
      enabledModules: [],
      strictEntitlements: true,
      includeUnavailable: true,
    });
    const core = nav.find((n) => n.code === "CORE");
    expect(core?.available).toBe(true);
    expect(core?.implementationStatus).toBe("AVAILABLE");
  });

  it("honors explicit feature-flag OFF for AVAILABLE modules", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: { "industrial.module.personnel.enabled": false },
      enabledModules: ["PERSONNEL"],
      strictEntitlements: true,
      includeUnavailable: true,
    });
    expect(nav.find((n) => n.code === "PERSONNEL")?.available).toBe(false);
  });

  it("maps JSAS to industrial.module.jsa.enabled", () => {
    expect(featureFlagForModule("JSAS")).toBe("industrial.module.jsa.enabled");
  });

  it("preserves distinct Scan and QR Links entries", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access"],
      flags: {},
      includeUnavailable: true,
    });
    expect(nav.some((n) => n.code === "SCAN")).toBe(true);
    expect(nav.some((n) => n.code === "QR_LINKS")).toBe(true);
  });

  it("uses explicit unavailable messaging", () => {
    expect(moduleUnavailableMessage("Personnel")).toContain("not available for your organization");
  });

  it("keeps hosting/infrastructure names out of customer-facing copy", () => {
    expect(moduleUnavailableMessage("Personnel")).not.toMatch(/AWS/i);
  });

  it("exposes Print Manager and hides legacy queue/history when hub is available", () => {
    expect(featureFlagForModule("PRINT_MANAGER")).toBe("industrial.module.print_manager.enabled");
    expect(INDUSTRIAL_MODULE_REGISTRY.some((m) => m.code === "PRINT_MANAGER")).toBe(true);

    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access", "industrial.printer.view"],
      flags: {},
      enabledModules: ["PRINT_QUEUE"],
      strictEntitlements: true,
    });
    expect(nav.some((n) => n.code === "PRINT_MANAGER")).toBe(true);
    expect(nav.some((n) => n.code === "PRINT_QUEUE")).toBe(false);
    expect(nav.some((n) => n.code === "PRINT_HISTORY")).toBe(false);
  });

  it("keeps Print Queue when Print Manager is not entitled", () => {
    const nav = buildIndustrialNavigation({
      entitled: true,
      permissions: ["industrial.access", "industrial.printer.view"],
      flags: { "industrial.module.print_manager.enabled": false },
      enabledModules: ["PRINT_QUEUE"],
      strictEntitlements: true,
    });
    expect(nav.some((n) => n.code === "PRINT_MANAGER")).toBe(false);
    expect(nav.some((n) => n.code === "PRINT_QUEUE")).toBe(true);
  });
});
