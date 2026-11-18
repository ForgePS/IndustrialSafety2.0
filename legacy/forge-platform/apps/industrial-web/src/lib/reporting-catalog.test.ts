import { describe, expect, it } from "vitest";
import {
  BUILT_IN_REPORTS,
  filterBuiltInReports,
  listReportCategories,
  sortBuiltInReports,
} from "./reporting-catalog";

describe("reporting-catalog", () => {
  it("seeds a non-empty built-in library", () => {
    expect(BUILT_IN_REPORTS.length).toBeGreaterThan(10);
    expect(listReportCategories().length).toBeGreaterThan(5);
  });

  it("filters by search and category", () => {
    const rows = filterBuiltInReports(BUILT_IN_REPORTS, {
      search: "osha",
      category: "Compliance",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.category === "Compliance")).toBe(true);
  });

  it("includes LOTO reports", () => {
    const rows = filterBuiltInReports(BUILT_IN_REPORTS, { search: "loto", category: "LOTO" });
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(listReportCategories()).toContain("LOTO");
  });

  it("sorts by module then name", () => {
    const sorted = sortBuiltInReports([...BUILT_IN_REPORTS], "module");
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const next = sorted[i]!;
      const cmp = prev.module.localeCompare(next.module);
      expect(cmp <= 0).toBe(true);
    }
  });
});
