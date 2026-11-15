import { describe, expect, it } from "vitest";
import { INDUSTRIAL_MODULE_REGISTRY, INDUSTRIAL_PERMISSIONS } from "@forge/contracts";
import { buildScanActions } from "./scan-actions.js";

describe("Safety Supplies module foundation", () => {
  it("registers SAFETY_SUPPLIES in the industrial module registry", () => {
    const entry = INDUSTRIAL_MODULE_REGISTRY.find((m) => m.code === "SAFETY_SUPPLIES");
    expect(entry).toBeDefined();
    expect(entry?.route).toBe("/modules/safety-supplies");
    expect(entry?.implementationStatus).toBe("AVAILABLE");
  });

  it("includes industrial.supplies permission keys", () => {
    expect(INDUSTRIAL_PERMISSIONS).toContain("industrial.supplies.view");
    expect(INDUSTRIAL_PERMISSIONS).toContain("industrial.supplies.issue");
    expect(INDUSTRIAL_PERMISSIONS).toContain("industrial.supplies.receive");
    expect(INDUSTRIAL_PERMISSIONS).toContain("industrial.supplies.settings.manage");
  });

  it("exposes supply scan actions for SAFETY_SUPPLY targets", () => {
    const actions = buildScanActions({
      targetType: "SAFETY_SUPPLY",
      targetId: "item-1",
      accessMode: "AUTHENTICATED",
      actionConfig: {},
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("safety_supplies");
    expect(ids).toContain("supply_issue");
    expect(ids).toContain("supply_receive");
  });
});
