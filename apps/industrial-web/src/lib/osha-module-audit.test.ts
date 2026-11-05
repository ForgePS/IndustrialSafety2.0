import { describe, expect, it } from "vitest";
import {
  buildForm300Csv,
  cappedOshaDays,
  filterOshaCases,
  form300ATotals,
  form300LogIssues,
  form300PrintIssues,
  form301EmployeeName,
  logCasesForForm300,
  oshaCaseIssues,
  toOshaCase,
} from "./osha-module";

function logCase(overrides: Record<string, unknown>) {
  return toOshaCase({
    id: "c1",
    title: "Case",
    employeeName: "Pat Lee",
    injuryDate: "2026-04-02",
    recordabilityStatus: "RECORDABLE",
    establishment: "Crowley",
    caseNumber: "1",
    jobTitle: "Operator",
    eventLocation: "Line 2",
    description: "Laceration, left hand, box cutter",
    caseOutcome: "OTHER_RECORDABLE",
    daysAway: 0,
    restrictedDays: 0,
    illnessCategory: "1",
    ...overrides,
  });
}

describe("OSHA log year", () => {
  it("files a case under its injury year even when calendarYear is stale", () => {
    const moved = logCase({ injuryDate: "2026-01-02", calendarYear: 2025 });
    expect(moved.calendarYear).toBe(2026);
    expect(logCasesForForm300([moved], 2025)).toHaveLength(0);
    expect(logCasesForForm300([moved], 2026)).toHaveLength(1);
    expect(filterOshaCases([moved], { year: 2025 })).toHaveLength(0);
  });
});

describe("OSHA day counts", () => {
  it("caps days away plus restricted days at 180", () => {
    expect(cappedOshaDays(200, 10)).toEqual({ daysAway: 180, restrictedDays: 0 });
    expect(cappedOshaDays(150, 50)).toEqual({ daysAway: 150, restrictedDays: 30 });
    expect(cappedOshaDays(null, 5)).toEqual({ daysAway: 0, restrictedDays: 5 });
  });

  it("applies the cap to 300A totals and the CSV", () => {
    const long = logCase({
      caseOutcome: "DAYS_AWAY",
      daysAway: 250,
      restrictedDays: 20,
      description: "Back strain",
    });
    const totals = form300ATotals([long], 2026);
    expect(totals.daysAway).toBe(180);
    expect(totals.restrictedDays).toBe(0);
    const row = buildForm300Csv([long], 2026).split("\n")[1]!.split(",");
    expect(row[10]).toBe("180");
    expect(row[11]).toBe("0");
  });
});

describe("Form 300 log order", () => {
  it("sorts by case number numerically", () => {
    const rows = ["10", "2", "1"].map((n, i) => logCase({ id: String(i), caseNumber: n }));
    expect(logCasesForForm300(rows, 2026).map((r) => r.caseNumber)).toEqual(["1", "2", "10"]);
  });
});

describe("Form 300 readiness checks", () => {
  it("passes a complete case", () => {
    expect(oshaCaseIssues(logCase({}))).toEqual([]);
  });

  it("flags cases that would be missing from the 300A totals", () => {
    const issues = oshaCaseIssues(logCase({ caseOutcome: null, illnessCategory: null }));
    expect(issues.join(" ")).toMatch(/columns G–J/);
    expect(issues.join(" ")).toMatch(/column M/);
  });

  it("flags outcomes that do not match the day counts", () => {
    expect(oshaCaseIssues(logCase({ caseOutcome: "DAYS_AWAY", daysAway: 0 }))).toContain(
      "Outcome is days away from work but column K has no days.",
    );
    expect(
      oshaCaseIssues(logCase({ caseOutcome: "OTHER_RECORDABLE", restrictedDays: 3 })).join(" "),
    ).toMatch(/should be H or I/);
    expect(
      oshaCaseIssues(
        logCase({ caseOutcome: "JOB_TRANSFER_RESTRICTION", daysAway: 2, restrictedDays: 4 }),
      ).join(" "),
    ).toMatch(/most serious outcome is days away/);
    expect(oshaCaseIssues(logCase({ caseOutcome: "DEATH" })).join(" ")).toMatch(/date of death/);
  });

  it("flags missing and duplicate case numbers", () => {
    const issues = form300LogIssues([
      logCase({ id: "a", caseNumber: "3" }),
      logCase({ id: "b", caseNumber: "3" }),
      logCase({ id: "c", caseNumber: "" }),
    ]);
    expect(issues.map((i) => i.caseId)).toEqual(["a", "b", "c"]);
    expect(issues[0]!.issues[0]).toMatch(/used more than once/);
    expect(issues[2]!.issues).toContain("No case number (column A).");
  });

  it("does not ask for a name on privacy cases", () => {
    const privacy = logCase({ recordabilityStatus: "PRIVACY_CASE", employeeName: "" });
    expect(oshaCaseIssues(privacy)).not.toContain("No employee name (column B).");
  });
});

describe("Form 301 privacy", () => {
  it("keeps the real employee name on Form 301 for privacy cases", () => {
    const privacy = logCase({ recordabilityStatus: "PRIVACY_CASE", employeeName: "Pat Lee" });
    expect(privacy.privacyCase).toBe(true);
    expect(form301EmployeeName(privacy)).toBe("Pat Lee");
  });
});

describe("Cases that cannot land on any log", () => {
  it("lists undated and unsited recordable cases next to the selected log", () => {
    const placed = logCase({ id: "ok" });
    const undated = logCase({ id: "nodate", injuryDate: null, calendarYear: null });
    const unsited = logCase({ id: "nosite", establishment: "" });
    const pendingUndated = logCase({
      id: "pending",
      injuryDate: null,
      recordabilityStatus: "PENDING",
    });
    const all = [placed, undated, unsited, pendingUndated];
    const siteLog = logCasesForForm300(
      filterOshaCases(all, { year: 2026, establishment: "Crowley" }),
      2026,
    );
    expect(siteLog.map((c) => c.id)).toEqual(["ok"]);
    const issues = form300PrintIssues(siteLog, all, 2026);
    expect(issues.map((i) => i.caseId)).toEqual(["nodate", "nosite"]);
    expect(issues[0]!.issues[0]).toBe("Not on any Form 300 log until fixed.");
  });

  it("matches establishments regardless of case and spacing", () => {
    const row = logCase({ establishment: "Crowley  Plant" });
    expect(filterOshaCases([row], { year: 2026, establishment: "crowley plant" })).toHaveLength(1);
  });
});
