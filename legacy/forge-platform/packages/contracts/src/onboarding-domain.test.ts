import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONBOARDING_STEPS,
  isRequiredOnboardingStepKey,
  resolveOnboardingSteps,
} from "./onboarding-domain.js";

describe("onboarding-domain", () => {
  it("returns default steps when no overrides", () => {
    const steps = resolveOnboardingSteps();
    expect(steps).toHaveLength(DEFAULT_ONBOARDING_STEPS.length);
    expect(steps[0]?.key).toBe("CREATE_TENANT");
    expect(steps.at(-1)?.key).toBe("ACTIVATE_TENANT");
  });

  it("skips optional branding and renumbers", () => {
    const steps = resolveOnboardingSteps({ skipStepKeys: ["CONFIGURE_BRANDING"] });
    expect(steps.some((s) => s.key === "CONFIGURE_BRANDING")).toBe(false);
    expect(steps.map((s) => s.number)).toEqual(
      Array.from({ length: steps.length }, (_, i) => i + 1),
    );
    expect(steps.at(-1)?.key).toBe("ACTIVATE_TENANT");
  });

  it("never skips required CREATE_TENANT or ACTIVATE_TENANT", () => {
    const steps = resolveOnboardingSteps({
      skipStepKeys: ["CREATE_TENANT", "ACTIVATE_TENANT", "SELECT_MODULES"],
    });
    expect(steps.some((s) => s.key === "CREATE_TENANT")).toBe(true);
    expect(steps.some((s) => s.key === "ACTIVATE_TENANT")).toBe(true);
    expect(steps.some((s) => s.key === "SELECT_MODULES")).toBe(false);
    expect(isRequiredOnboardingStepKey("CREATE_TENANT")).toBe(true);
  });
});
