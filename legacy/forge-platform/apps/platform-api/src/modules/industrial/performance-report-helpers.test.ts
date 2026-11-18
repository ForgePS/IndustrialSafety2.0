import { describe, expect, it } from "vitest";
import {
  buildOrgDirectory,
  buildPerformanceOverview,
  buildPerformanceSections,
  computeEmployeeSafetyScore,
  computeSafetyIndex,
  isClosedStatus,
  normalizePerformanceRequest,
  PerformanceAccumulator,
  PerformanceRequestError,
  rankEmployeesByGroup,
  resolveOrgUnit,
  siteHoursForPeriod,
  toIsoDay,
} from "./performance-report-helpers.js";

const SITE_A = "11111111-1111-4111-8111-111111111111";
const SITE_B = "22222222-2222-4222-8222-222222222222";
const DEPT_PACK = "33333333-3333-4333-8333-333333333333";
const DEPT_SHIP = "44444444-4444-4444-8444-444444444444";

const dir = buildOrgDirectory({
  sites: [
    { id: SITE_A, name: "Plant A" },
    { id: SITE_B, name: "Plant B" },
  ],
  departments: [
    { id: DEPT_PACK, name: "Packaging", siteId: SITE_A, divisionName: "Operations" },
    { id: DEPT_SHIP, name: "Shipping", siteId: SITE_B, divisionName: "Logistics" },
  ],
  personnel: [
    { id: "p1", siteId: null, departmentId: DEPT_SHIP, departmentName: null, divisionName: null },
    {
      id: "p2",
      siteId: SITE_A,
      departmentId: null,
      departmentName: "packaging",
      divisionName: null,
    },
  ],
});

describe("normalizePerformanceRequest", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("defaults to year to date, all sections, by location", () => {
    const req = normalizePerformanceRequest({}, now);
    expect(req.from).toBe("2026-01-01");
    expect(req.to).toBe("2026-10-14");
    expect(req.groupBy).toBe("site");
    expect(req.sections).toContain("osha");
    expect(req.sections).toContain("employees");
    expect(req.employeeLimit).toBe(5);
    expect(req.hoursWorked).toBeNull();
  });

  it("keeps only known sections and valid ids", () => {
    const req = normalizePerformanceRequest(
      {
        from: "2026-01-01",
        to: "2026-03-31",
        groupBy: "department",
        sections: ["incidents", "bogus", "osha"],
        siteIds: [SITE_A, "not-a-uuid"],
        hoursWorked: "125000",
        employeeLimit: 99,
      },
      now,
    );
    expect(req.sections).toEqual(["incidents", "osha"]);
    expect(req.siteIds).toEqual([SITE_A]);
    expect(req.hoursWorked).toBe(125000);
    expect(req.employeeLimit).toBe(25);
  });

  it("rejects reversed or oversized ranges", () => {
    expect(() =>
      normalizePerformanceRequest({ from: "2026-05-01", to: "2026-04-01" }, now),
    ).toThrow(PerformanceRequestError);
    expect(() =>
      normalizePerformanceRequest({ from: "2020-01-01", to: "2026-01-01" }, now),
    ).toThrow(PerformanceRequestError);
  });
});

describe("dates and statuses", () => {
  it("parses ISO, US, and Date values to calendar days", () => {
    expect(toIsoDay("2026-10-08T09:15")).toBe("2026-10-08");
    expect(toIsoDay("3/7/2026")).toBe("2026-03-07");
    expect(toIsoDay(new Date("2026-02-01T00:00:00Z"))).toBe("2026-02-01");
    expect(toIsoDay("")).toBeNull();
  });

  it("treats incomplete statuses as open", () => {
    expect(isClosedStatus("CLOSED")).toBe(true);
    expect(isClosedStatus("completed")).toBe(true);
    expect(isClosedStatus("INCOMPLETE")).toBe(false);
    expect(isClosedStatus("in-review")).toBe(false);
  });
});

describe("resolveOrgUnit", () => {
  it("derives location and division from the department", () => {
    const unit = resolveOrgUnit(dir, { departmentId: DEPT_PACK });
    expect(unit).toMatchObject({
      siteId: SITE_A,
      siteName: "Plant A",
      division: "Operations",
      departmentName: "Packaging",
    });
  });

  it("falls back to the employee's department (by id or name)", () => {
    expect(resolveOrgUnit(dir, { personnelId: "p1" })).toMatchObject({
      siteId: SITE_B,
      division: "Logistics",
    });
    expect(resolveOrgUnit(dir, { personnelId: "p2" })).toMatchObject({
      departmentId: DEPT_PACK,
      siteId: SITE_A,
    });
  });

  it("buckets unknown records as unassigned", () => {
    expect(resolveOrgUnit(dir, {})).toMatchObject({
      siteId: null,
      siteName: "No location",
      departmentName: "No department",
      division: "",
    });
  });
});

describe("accumulation", () => {
  it("groups, filters, and derives section metrics", () => {
    const acc = new PerformanceAccumulator(dir, "site", {
      siteIds: [],
      divisions: [],
      departmentIds: [],
    });
    const a = acc.unit({ departmentId: DEPT_PACK });
    const b = acc.unit({ siteId: SITE_B });
    acc.add("_org", a, "headcount", 10);
    acc.add("incidents", a, "total", 4);
    acc.add("incidents", a, "open", 1);
    acc.add("incidents", b, "total", 2);
    acc.add("osha", a, "recordable", 2);
    acc.add("osha", a, "hoursWorked", 100_000);

    const sections = buildPerformanceSections(acc, ["incidents", "osha"]);
    const incidents = sections.find((s) => s.id === "incidents")!;
    expect(incidents.totals.total).toBe(6);
    expect(incidents.totals.closedPct).toBe(83.3);
    expect(incidents.rows.map((r) => r.label)).toEqual(["Plant A", "Plant B"]);
    const osha = sections.find((s) => s.id === "osha")!;
    expect(osha.rows.find((r) => r.key === SITE_A)!.values.trir).toBe(4);
    expect(osha.rows.find((r) => r.key === SITE_A)!.values.hoursWorked).toBe(100000);

    const overview = buildPerformanceOverview(acc, sections);
    expect(overview.metrics[0]!.key).toBe("headcount");
    expect(overview.totals.headcount).toBe(10);
    expect(overview.totals["osha.trir"]).toBe(4);
  });

  it("drops records outside the division filter", () => {
    const acc = new PerformanceAccumulator(dir, "department", {
      siteIds: [],
      divisions: ["operations"],
      departmentIds: [],
    });
    expect(acc.unit({ departmentId: DEPT_PACK })).not.toBeNull();
    expect(acc.unit({ departmentId: DEPT_SHIP })).toBeNull();
  });
});

describe("hours", () => {
  it("prorates Form 300A hours across calendar years", () => {
    const result = siteHoursForPeriod({
      from: "2025-07-02",
      to: "2026-06-30",
      headcount: 50,
      annualHours: (year) => (year === 2025 ? 365_000 : 730_000),
    });
    expect(result.estimated).toBe(false);
    expect(Math.round(result.hours)).toBe(183_000 + 362_000);
  });

  it("estimates from headcount when 300A hours are missing", () => {
    const result = siteHoursForPeriod({
      from: "2026-01-01",
      to: "2026-12-31",
      headcount: 10,
      annualHours: () => null,
    });
    expect(result).toEqual({ hours: 20_000, estimated: true });
  });
});

describe("scores", () => {
  it("matches the dashboard Safety Index", () => {
    expect(
      computeSafetyIndex({
        openIncidents: 0,
        totalIncidents: 0,
        inspectionCount: 0,
        trainingCount: 0,
      }),
    ).toBe(100);
    expect(
      computeSafetyIndex({
        openIncidents: 2,
        totalIncidents: 4,
        inspectionCount: 3,
        trainingCount: 1,
      }),
    ).toBe(81);
  });

  it("matches the employee profile score weights", () => {
    expect(
      computeEmployeeSafetyScore({
        openIncidents: 1,
        recordableIncidents: 1,
        overdueTraining: 1,
        expiredQualifications: 0,
        expiringQualifications: 0,
        openWorkersComp: 1,
        completedTraining: 3,
        observationCredit: 2,
        observationDeduction: 3,
        disciplineDeduction: 5,
      }),
    ).toBe(100 - 12 - 8 - 6 - 4 + 6 + 2 - 3 - 5);
  });

  it("lists the lowest scores per group", () => {
    const row = (name: string, score: number, key: string) => ({
      personnelId: name,
      name,
      employeeNumber: "",
      jobTitle: "",
      score,
      grade: "",
      openIncidents: 0,
      recordableIncidents: 0,
      overdueTraining: 0,
      openWorkersComp: 0,
      positiveObservations: 0,
      unsafeObservations: 0,
      activeDisciplinePoints: null,
      group: { key, label: key === "none" ? "No location" : key },
    });
    const ranked = rankEmployeesByGroup(
      [row("Ann", 95, "A"), row("Bob", 60, "A"), row("Cy", 100, "A"), row("Dee", 70, "none")],
      2,
    );
    expect(ranked.totals.headcount).toBe(4);
    expect(ranked.groups.map((g) => g.key)).toEqual(["A", "none"]);
    expect(ranked.groups[0]!.lowest.map((e) => e.name)).toEqual(["Bob", "Ann"]);
    expect(ranked.totals.lowest.map((e) => e.name)).toEqual(["Bob", "Dee"]);
    expect(ranked.groups[0]!.averageScore).toBe(85);
  });
});
