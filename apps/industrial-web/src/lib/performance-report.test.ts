import { describe, expect, it } from "vitest";
import {
  buildPerformanceReportHtml,
  buildPerformanceReportRequest,
  formatPerformanceValue,
  parsePerformanceOrgOptions,
  parsePerformanceReport,
  performanceFormError,
  performancePeriodRange,
  type PerformanceReportForm,
} from "./performance-report";

const baseForm: PerformanceReportForm = {
  from: "2026-01-01",
  to: "2026-09-30",
  groupBy: "department",
  sections: ["incidents", "osha"],
  siteIds: [],
  divisions: [],
  departmentIds: [],
  employeeLimit: 5,
  hoursWorked: "",
};

const rawReport = {
  title: "Safety Performance Report",
  generatedAt: "2026-10-14T15:00:00.000Z",
  period: { from: "2026-01-01", to: "2026-09-30", days: 273 },
  groupBy: "department",
  groupByLabel: "Department",
  filters: { sites: ["Plant <A>"], divisions: [], departments: [] },
  overview: {
    title: "Overview",
    metrics: [
      { key: "headcount", label: "Headcount", format: "count" },
      { key: "osha.trir", label: "OSHA: TRIR", format: "rate", better: "lower" },
    ],
    totals: { headcount: 40, "osha.trir": 2.5 },
    rows: [
      { key: "d1", label: "Packaging", values: { headcount: 25, "osha.trir": 4 } },
      { key: "d2", label: "Shipping", values: { headcount: 15, "osha.trir": 0 } },
    ],
  },
  sections: [
    {
      id: "osha",
      title: "OSHA recordables & rates",
      description: "desc",
      metrics: [
        { key: "recordable", label: "Recordable cases", format: "count", better: "lower" },
        { key: "trir", label: "TRIR", format: "rate", better: "lower" },
      ],
      totals: { recordable: 1, trir: 2.5 },
      rows: [
        { key: "d1", label: "Packaging", values: { recordable: 1, trir: 4 } },
        { key: "d2", label: "<script>alert(1)</script>", values: { recordable: 0, trir: null } },
      ],
      notes: ["Hours estimated"],
    },
  ],
  employees: {
    limit: 5,
    showDiscipline: false,
    totals: { headcount: 2, averageScore: 85, lowest: [] },
    groups: [
      {
        key: "d1",
        label: "Packaging",
        headcount: 2,
        averageScore: 85,
        lowest: [
          { personnelId: "p2", name: "Bo", score: 75, grade: "C" },
          { personnelId: "p1", name: "Ann Lee", score: 95, grade: "A" },
        ],
      },
    ],
    notes: [],
  },
  omitted: [
    {
      id: "discipline",
      title: "Disciplinary actions",
      reason: "Requires discipline view permission",
    },
  ],
};

describe("performance report request", () => {
  it("computes period presets", () => {
    const today = new Date(2026, 9, 14);
    expect(performancePeriodRange("last_month", today)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(performancePeriodRange("last_quarter", today)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(performancePeriodRange("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-10-14" });
    expect(performancePeriodRange("last_year", today)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(performancePeriodRange("custom", today)).toBeNull();
  });

  it("validates and builds the body", () => {
    expect(performanceFormError({ ...baseForm, sections: [] })).toMatch(/section/);
    expect(performanceFormError({ ...baseForm, to: "2025-12-31" })).toMatch(/end date/);
    expect(performanceFormError({ ...baseForm, hoursWorked: "abc" })).toMatch(/Hours/);
    expect(buildPerformanceReportRequest(baseForm)).not.toHaveProperty("hoursWorked");
    expect(
      buildPerformanceReportRequest({ ...baseForm, hoursWorked: "1,250,000" }).hoursWorked,
    ).toBe(1250000);
  });

  it("parses org filter options with divisions", () => {
    const org = parsePerformanceOrgOptions(
      {
        items: [
          { id: "s1", name: "Plant B" },
          { id: "s2", name: "Plant A", status: "INACTIVE" },
        ],
      },
      [
        { id: "d1", name: "Shipping", siteId: "s1", divisionName: "Logistics" },
        { id: "d2", name: "Packaging", siteId: "s1", divisionName: "Operations" },
      ],
    );
    expect(org.sites).toEqual([{ id: "s1", name: "Plant B" }]);
    expect(org.departments.map((d) => d.name)).toEqual(["Packaging", "Shipping"]);
    expect(org.divisions).toEqual(["Logistics", "Operations"]);
  });
});

describe("performance report output", () => {
  it("formats metric values", () => {
    expect(formatPerformanceValue(null, "count")).toBe("-");
    expect(formatPerformanceValue(1234, "count")).toBe("1,234");
    expect(formatPerformanceValue(83.3, "percent")).toBe("83.3%");
    expect(formatPerformanceValue(2.5, "rate")).toBe("2.50");
    expect(formatPerformanceValue(88, "score")).toBe("88 (B)");
  });

  it("parses the API response", () => {
    const report = parsePerformanceReport(rawReport)!;
    expect(report.groupBy).toBe("department");
    expect(report.sections[0]!.rows[1]!.values.trir).toBeNull();
    expect(report.employees!.groups[0]!.lowest.map((e) => e.name)).toEqual(["Bo", "Ann Lee"]);
    expect(parsePerformanceReport({})).toBeNull();
  });

  it("builds escaped printable HTML with highlights and rankings", () => {
    const html = buildPerformanceReportHtml(parsePerformanceReport(rawReport)!, {
      companyName: "Acme & Co",
    });
    expect(html).toContain("Acme &amp; Co");
    expect(html).toContain("Plant &lt;A&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Organization total");
    expect(html).toContain('class="num worst"');
    expect(html).toContain("Lowest scores");
    expect(html).not.toContain("Top performers");
    expect(html.indexOf("Bo</td>")).toBeLessThan(html.indexOf("Ann Lee"));
    expect(html).toContain("Not included: Disciplinary actions");
    expect(html).toContain("@page { size: letter landscape");
  });
});
