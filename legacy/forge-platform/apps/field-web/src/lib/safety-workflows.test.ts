import { describe, expect, it } from "vitest";
import {
  chemicalCriticalFields,
  enabledPermitTypes,
  enabledSafetyWorkflows,
  hasPersonAcknowledged,
  parsePermitType,
} from "./safety-workflows";
import { isFieldFeatureModuleEnabled, isPermitsFeatureEnabled } from "./field-modules";

describe("safety workflows", () => {
  it("filters workflows by enabled modules", () => {
    const enabled = enabledSafetyWorkflows((code) => code === "JSAS" || code === "SANITATION");
    expect(enabled.map((w) => w.id)).toEqual(["jsa", "food-safety", "sanitation"]);
  });

  it("filters permit types and parses type query", () => {
    const types = enabledPermitTypes((code) => code === "CONFINED_SPACE" || code === "HOT_WORK");
    expect(types.map((t) => t.id)).toEqual(["hot-work", "confined-space"]);
    expect(parsePermitType("electrical")).toBe("electrical-safety");
  });

  it("detects crew acknowledgments", () => {
    const record = {
      id: "1",
      sourcePayload: {
        acknowledgments: [{ personnelId: "p1", name: "Ada" }],
      },
    };
    expect(hasPersonAcknowledged(record, "p1", "Ada")).toBe(true);
    expect(hasPersonAcknowledged(record, "p2", "Bob")).toBe(false);
  });

  it("surfaces critical chemical fields", () => {
    const fields = chemicalCriticalFields({
      id: "c1",
      title: "Acetone",
      sourcePayload: { casNumber: "67-64-1", signalWord: "Danger", ppe: "Gloves, goggles" },
    });
    expect(fields.find((f) => f.label === "CAS")?.value).toBe("67-64-1");
    expect(fields.find((f) => f.label === "PPE")?.value).toContain("Gloves");
  });
});

describe("permits feature gating", () => {
  it("shows permits when any high-risk module is enabled", () => {
    expect(isPermitsFeatureEnabled(["CONFINED_SPACE"])).toBe(true);
    expect(isFieldFeatureModuleEnabled(["CONFINED_SPACE"], "more-permits")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "more-permits")).toBe(false);
  });
});
