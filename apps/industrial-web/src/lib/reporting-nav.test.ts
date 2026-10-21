import { describe, expect, it } from "vitest";
import { buildReportingNavGroups, reportingNavActive } from "./reporting-nav";

describe("buildReportingNavGroups", () => {
  it("includes overview and library as live destinations", () => {
    const groups = buildReportingNavGroups();
    const hrefs = groups.flatMap((g) => g.items.filter((i) => !i.soon).map((i) => i.href));
    expect(hrefs).toContain("/reporting/");
    expect(hrefs).toContain("/reporting/library/");
    expect(hrefs).toContain("/reporting/saved/");
  });

  it("exposes builder, analytics, templates, and settings as live destinations", () => {
    const items = buildReportingNavGroups().flatMap((g) => g.items);
    expect(items.find((i) => i.href === "/reporting/builder/")?.soon).toBe(false);
    expect(items.find((i) => i.href === "/reporting/analytics/")?.soon).toBe(false);
    expect(items.find((i) => i.href === "/reporting/templates/")?.soon).toBe(false);
    expect(items.find((i) => i.href === "/reporting/settings/")?.soon).toBe(false);
    const live = items.filter((i) => !i.soon).map((i) => i.href);
    expect(live).toContain("/reporting/builder/");
    expect(live).toContain("/reporting/analytics/");
    expect(live).toContain("/reporting/templates/");
    expect(live).toContain("/reporting/settings/");
  });
});

describe("reportingNavActive", () => {
  it("matches overview exactly", () => {
    expect(reportingNavActive("/reporting/", "/reporting/")).toBe(true);
    expect(reportingNavActive("/reporting/library/", "/reporting/")).toBe(false);
  });

  it("matches nested library paths", () => {
    expect(reportingNavActive("/reporting/library/", "/reporting/library/")).toBe(true);
    expect(reportingNavActive("/reporting/library", "/reporting/library/")).toBe(true);
  });
});
