import { describe, expect, it } from "vitest";
import { buildInjuryHistory, incidentYear, isInjuryCategory } from "./injury-history.js";

const daysAwayCase = (calendarYear: number, daysAway: number) => ({
  recordabilityStatus: "RECORDABLE" as const,
  calendarYear,
  caseOutcome: "DAYS_AWAY" as const,
  daysAway,
});

describe("injury history", () => {
  it("counts injuries and lost-time cases per year, filling empty years", () => {
    const years = buildInjuryHistory({
      injuryYears: [2022, 2022, 2024, null],
      oshaCases: [
        daysAwayCase(2022, 5),
        daysAwayCase(2024, 3),
        { ...daysAwayCase(2024, 9), caseOutcome: "OTHER_RECORDABLE" },
        { ...daysAwayCase(2024, 4), recordabilityStatus: "NOT_RECORDABLE" },
      ],
      currentYear: 2025,
    });
    expect(years).toEqual([
      { year: 2022, injuries: 2, lostTimeCases: 1, daysAway: 5 },
      { year: 2023, injuries: 0, lostTimeCases: 0, daysAway: 0 },
      { year: 2024, injuries: 1, lostTimeCases: 1, daysAway: 3 },
      { year: 2025, injuries: 0, lostTimeCases: 0, daysAway: 0 },
    ]);
  });

  it("follows OSHA log rules: injury year wins and days away cap at 180", () => {
    const years = buildInjuryHistory({
      injuryYears: [],
      oshaCases: [{ ...daysAwayCase(2023, 400), injuryDate: "2024-02-10" }],
      currentYear: 2024,
    });
    expect(years).toEqual([{ year: 2024, injuries: 0, lostTimeCases: 1, daysAway: 180 }]);
  });

  it("keeps only the last maxYears years and ignores future years", () => {
    const years = buildInjuryHistory({
      injuryYears: [2010, 2023, 2030],
      oshaCases: [],
      currentYear: 2025,
      maxYears: 3,
    });
    expect(years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(buildInjuryHistory({ injuryYears: [], oshaCases: [], currentYear: 2025 })).toEqual([]);
  });

  it("reads the incident year from date occurred, else created date", () => {
    expect(incidentYear({ dateOccurred: "2023-04-05T08:30" }, new Date("2025-01-01"))).toBe(2023);
    expect(incidentYear({ occurredAt: "07/08/2021" }, null)).toBe(2021);
    expect(incidentYear({}, new Date("2024-06-01T00:00:00Z"))).toBe(2024);
    expect(incidentYear({}, null)).toBeNull();
    expect(isInjuryCategory(" Injuries ")).toBe(true);
    expect(isInjuryCategory("near-misses")).toBe(false);
  });
});
