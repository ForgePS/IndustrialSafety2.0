import { describe, expect, it } from "vitest";
import {
  SEASONAL_LIFECYCLE_FLAG,
  isSeasonalLifecycleEnabled,
  seasonalLifecycleBadge,
  seasonalLifecycleBadgeClass,
} from "./personnel-seasonal";

describe("seasonal lifecycle UI gates", () => {
  it("treats missing flags as disabled", () => {
    expect(isSeasonalLifecycleEnabled(undefined)).toBe(false);
    expect(isSeasonalLifecycleEnabled({})).toBe(false);
    expect(isSeasonalLifecycleEnabled({ "industrial.enabled": true })).toBe(false);
  });

  it("enables only when seasonalLifecycle flag is true", () => {
    expect(
      isSeasonalLifecycleEnabled({
        "industrial.enabled": true,
        "industrial.module.personnel.enabled": true,
        [SEASONAL_LIFECYCLE_FLAG]: true,
      }),
    ).toBe(true);
    expect(
      isSeasonalLifecycleEnabled({
        "industrial.enabled": true,
        "industrial.module.personnel.enabled": true,
        [SEASONAL_LIFECYCLE_FLAG]: false,
      }),
    ).toBe(false);
  });

  it("maps lifecycle fields to badges", () => {
    expect(seasonalLifecycleBadge({ personStatus: "PRE_HIRE", employmentType: "SEASONAL" })).toEqual({
      label: "SEASONAL PRE-HIRE",
      kind: "pre-hire",
    });
    expect(seasonalLifecycleBadge({ personStatus: "ACTIVE", employmentType: "SEASONAL" })).toEqual({
      label: "Active seasonal",
      kind: "active-seasonal",
    });
    expect(seasonalLifecycleBadge({ personStatus: "ACTIVE", employmentType: "FULL_TIME" })).toEqual({
      label: "Full-time",
      kind: "full-time",
    });
  });

  it("maps badge kinds to Sneat label classes", () => {
    expect(seasonalLifecycleBadgeClass("pre-hire")).toBe("bg-label-warning");
    expect(seasonalLifecycleBadgeClass("active-seasonal")).toBe("bg-label-success");
    expect(seasonalLifecycleBadgeClass("full-time")).toBe("bg-label-primary");
    expect(seasonalLifecycleBadgeClass("other")).toBe("bg-label-secondary");
  });
});
