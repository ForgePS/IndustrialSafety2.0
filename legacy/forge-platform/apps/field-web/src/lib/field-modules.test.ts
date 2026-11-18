import { describe, expect, it } from "vitest";
import { isFieldFeatureModuleEnabled, isFieldModuleEnabled } from "./field-modules";

describe("field-modules", () => {
  it("allows available modules when activeModules is empty", () => {
    expect(isFieldModuleEnabled([], "LOCKOUT_TAGOUT")).toBe(true);
    expect(isFieldFeatureModuleEnabled([], "more-loto")).toBe(true);
  });

  it("gates on activeModules when present", () => {
    expect(isFieldModuleEnabled(["TRAINING"], "LOCKOUT_TAGOUT")).toBe(false);
    expect(isFieldModuleEnabled(["LOCKOUT_TAGOUT"], "LOCKOUT_TAGOUT")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["SANITATION"], "more-sanitation")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["EMERGENCY_ALERTS"], "more-emergency")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "more-emergency")).toBe(false);
  });

  it("always allows CORE and unknown feature ids", () => {
    expect(isFieldModuleEnabled(["TRAINING"], "CORE")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "unknown-feature")).toBe(true);
  });
});
