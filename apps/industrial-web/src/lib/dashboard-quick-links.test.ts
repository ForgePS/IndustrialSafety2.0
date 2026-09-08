import { describe, expect, it } from "vitest";
import {
  addDashboardQuickLinkCode,
  removeDashboardQuickLinkCode,
  resolveDashboardQuickLinkCodes,
} from "./dashboard-quick-links";

describe("resolveDashboardQuickLinkCodes", () => {
  const available = ["PERSONNEL", "INCIDENTS", "TRAINING", "FORMS"];

  it("defaults to all available modules when unset", () => {
    expect(resolveDashboardQuickLinkCodes(null, available)).toEqual(available);
  });

  it("keeps stored order and drops unavailable codes", () => {
    expect(resolveDashboardQuickLinkCodes(["TRAINING", "MISSING", "PERSONNEL"], available)).toEqual([
      "TRAINING",
      "PERSONNEL",
    ]);
  });

  it("falls back to all available when stored list is empty after filtering", () => {
    expect(resolveDashboardQuickLinkCodes(["MISSING"], available)).toEqual(available);
  });
});

describe("addDashboardQuickLinkCode", () => {
  it("appends without duplicates", () => {
    expect(addDashboardQuickLinkCode(["A"], "B")).toEqual(["A", "B"]);
    expect(addDashboardQuickLinkCode(["A"], "A")).toEqual(["A"]);
  });
});

describe("removeDashboardQuickLinkCode", () => {
  it("removes a code", () => {
    expect(removeDashboardQuickLinkCode(["A", "B"], "A")).toEqual(["B"]);
  });
});
