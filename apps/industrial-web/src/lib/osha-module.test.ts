import { describe, expect, it } from "vitest";
import {
  autofillForm301FromForm300,
  buildForm300Csv,
  chunkForm300Pages,
  displayEmployeeName,
  filterOshaCases,
  form300ATotals,
  form300PageTotals,
  formatOshaDateMdY,
  incidentHref,
  logCasesForForm300,
  summarizeOshaCases,
  toOshaCase,
  establishmentOptions,
} from "./osha-module";

const sample = toOshaCase({
  id: "1",
  title: "26/07/08 Jimmy Sanner - Parboil Maint.",
  employeeName: "JIMMY J SANNER",
  injuryDate: "2026-07-08",
  recordabilityStatus: "RECORDABLE",
  establishment: "Crowley",
  division: "Rice Milling",
  reviewer: "Pending",
  caseNumber: "1",
  jobTitle: "Welder",
  eventLocation: "Parboil bay",
  description: "Burn on forearm",
  caseOutcome: "DAYS_AWAY",
  daysAway: 3,
  restrictedDays: 0,
  illnessCategory: "1",
});

const pending = toOshaCase({
  id: "2",
  title: "Pending case",
  employeeName: "A Worker",
  injuryDate: "2026-03-01",
  recordabilityStatus: "PENDING",
  establishment: "Crowley",
});

describe("osha-module", () => {
  it("maps API rows and summarizes", () => {
    expect(sample.calendarYear).toBe(2026);
    expect(summarizeOshaCases([sample, pending]).recordable).toBe(1);
    expect(summarizeOshaCases([sample, pending]).pending).toBe(1);
    expect(sample.division).toBe("Rice Milling");
  });

  it("filters by year and establishment (division)", () => {
    expect(filterOshaCases([sample], { year: 2025 })).toHaveLength(0);
    expect(filterOshaCases([sample], { year: 2026, establishment: "rice milling" })).toHaveLength(
      1,
    );
    // The old site-based value no longer selects the case.
    expect(filterOshaCases([sample], { year: 2026, establishment: "Crowley" })).toHaveLength(0);
  });

  it("lists only catalog divisions as establishments", () => {
    // Divisions found only on cases (e.g. "Rice Milling" on sample) are not offered.
    expect(establishmentOptions(["Seed Plant", " Logistics ", "logistics", ""])).toEqual([
      "Logistics",
      "Seed Plant",
    ]);
    expect(establishmentOptions([])).toEqual([]);
  });

  it("builds Form 300 CSV with A-M columns and masks privacy names", () => {
    const csv = buildForm300Csv([sample], 2026);
    expect(csv).toContain("(A) Case no.");
    expect(csv).toContain("(M6) All other illnesses");
    expect(csv).toContain("JIMMY J SANNER");
    expect(csv).toContain("Parboil bay");
    expect(logCasesForForm300([sample, pending], 2026)).toHaveLength(1);

    const privacy = toOshaCase({
      ...sample,
      id: "3",
      recordabilityStatus: "PRIVACY_CASE",
      privacyCase: true,
    });
    expect(displayEmployeeName(privacy)).toBe("Privacy case");
    expect(buildForm300Csv([privacy], 2026)).toContain("Privacy case");
  });

  it("aggregates Form 300A totals from log cases only", () => {
    const totals = form300ATotals([sample, pending], 2026);
    expect(totals.daysAwayCases).toBe(1);
    expect(totals.injuries).toBe(1);
    expect(totals.daysAway).toBe(3);
    expect(totals.deaths).toBe(0);
  });

  it("chunks Form 300 pages at 10 rows with accurate page totals", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      toOshaCase({
        ...sample,
        id: String(i + 1),
        caseNumber: String(i + 1),
        caseOutcome: i % 2 === 0 ? "DAYS_AWAY" : "OTHER_RECORDABLE",
        daysAway: i % 2 === 0 ? 2 : 0,
        illnessCategory: "1",
      }),
    );
    const pages = chunkForm300Pages(many);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(10);
    expect(pages[1]).toHaveLength(2);
    expect(form300PageTotals(pages[0]!).daysAwayCases).toBe(5);
    expect(form300PageTotals(pages[1]!).daysAwayCases).toBe(1);
    expect(form300PageTotals(pages[0]!).otherRecordableCases).toBe(5);
    expect(form300PageTotals(pages[0]!).m1).toBe(10);

    // Form 300A totals equal the sum of each Form 300 page totals.
    const summed = form300ATotals(many, 2026);
    expect(summed.daysAwayCases).toBe(6);
    expect(summed.otherRecordableCases).toBe(6);
    expect(summed.injuries).toBe(12);
    expect(summed.daysAway).toBe(12);
  });

  it("autofills Form 301 from Form 300 log fields and links case number", () => {
    const filled = autofillForm301FromForm300(
      toOshaCase({
        ...sample,
        injuryOrIllness: "",
        whatHappened: "",
        activityBefore: "",
      }),
    );
    expect(filled.caseNumber).toBe("1");
    expect(filled.injuryOrIllness).toBe("Burn on forearm");
    expect(filled.whatHappened).toBe("Burn on forearm");
    expect(filled.activityBefore).toBe("Working at Parboil bay");
    expect(formatOshaDateMdY(filled.injuryDate)).toBe("07/08/2026");
  });

  it("links OSHA cases to the incidents deep-link query", () => {
    expect(incidentHref("abc-123")).toBe("/modules/incidents/?tab=injuries&incident=abc-123");
  });
});
