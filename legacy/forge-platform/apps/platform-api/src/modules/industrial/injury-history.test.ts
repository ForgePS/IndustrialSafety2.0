import { describe, expect, it } from "vitest";
import {
  buildInjuryHistory,
  incidentYear,
  incidentYearMonth,
  isInjuryCategory,
} from "./injury-history.js";

const daysAwayCase = (calendarYear: number, daysAway: number) => ({
  recordabilityStatus: "RECORDABLE" as const,
  calendarYear,
  caseOutcome: "DAYS_AWAY" as const,
  daysAway,
});

const totals = ({
  year,
  injuries,
  lostTimeCases,
  daysAway,
}: ReturnType<typeof buildInjuryHistory>[number]) => ({
  year,
  injuries,
  lostTimeCases,
  daysAway,
});

const yearOnly = (year: number | null) => ({ year, month: null });

describe("injury history", () => {
  it("counts injuries and lost-time cases per year, filling empty years", () => {
    const years = buildInjuryHistory({
      injuries: [yearOnly(2022), yearOnly(2022), yearOnly(2024), yearOnly(null)],
      oshaCases: [
        daysAwayCase(2022, 5),
        daysAwayCase(2024, 3),
        { ...daysAwayCase(2024, 9), caseOutcome: "OTHER_RECORDABLE" },
        { ...daysAwayCase(2024, 4), recordabilityStatus: "NOT_RECORDABLE" },
      ],
      currentYear: 2025,
    });
    expect(years.map(totals)).toEqual([
      { year: 2022, injuries: 2, lostTimeCases: 1, daysAway: 5 },
      { year: 2023, injuries: 0, lostTimeCases: 0, daysAway: 0 },
      { year: 2024, injuries: 1, lostTimeCases: 1, daysAway: 3 },
      { year: 2025, injuries: 0, lostTimeCases: 0, daysAway: 0 },
    ]);
    expect(years.every((y) => y.months.length === 12)).toBe(true);
  });

  it("splits each year into Jan–Dec, leaving unknown months out of the monthly counts", () => {
    const [year] = buildInjuryHistory({
      injuries: [
        { year: 2025, month: 1 },
        { year: 2025, month: 1 },
        { year: 2025, month: 12 },
        yearOnly(2025),
      ],
      oshaCases: [{ ...daysAwayCase(2025, 7), injuryDate: "2025-03-14" }, daysAwayCase(2025, 2)],
      currentYear: 2025,
    });
    expect(year!.injuries).toBe(4);
    expect(year!.months[0]).toEqual({ injuries: 2, lostTimeCases: 0, daysAway: 0 });
    expect(year!.months[2]).toEqual({ injuries: 0, lostTimeCases: 1, daysAway: 7 });
    expect(year!.months[11]!.injuries).toBe(1);
    expect(year!.lostTimeCases).toBe(2);
    expect(year!.months.reduce((n, m) => n + m.lostTimeCases, 0)).toBe(1);
  });

  it("follows OSHA log rules: injury year wins and days away cap at 180", () => {
    const years = buildInjuryHistory({
      injuries: [],
      oshaCases: [{ ...daysAwayCase(2023, 400), injuryDate: "2024-02-10" }],
      currentYear: 2024,
    });
    expect(years.map(totals)).toEqual([
      { year: 2024, injuries: 0, lostTimeCases: 1, daysAway: 180 },
    ]);
    expect(years[0]!.months[1]).toEqual({ injuries: 0, lostTimeCases: 1, daysAway: 180 });
  });

  it("keeps only the last maxYears years and ignores future years", () => {
    const years = buildInjuryHistory({
      injuries: [yearOnly(2010), yearOnly(2023), yearOnly(2030)],
      oshaCases: [],
      currentYear: 2025,
      maxYears: 3,
    });
    expect(years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(buildInjuryHistory({ injuries: [], oshaCases: [], currentYear: 2025 })).toEqual([]);
  });

  it("reads the incident date from date occurred, else created date", () => {
    expect(incidentYear({ dateOccurred: "2023-04-05T08:30" }, new Date("2025-01-01"))).toBe(2023);
    expect(incidentYearMonth({ dateOccurred: "2023-04-05T08:30" }, null)).toEqual({
      year: 2023,
      month: 4,
    });
    expect(incidentYear({ occurredAt: "07/08/2021" }, null)).toBe(2021);
    expect(incidentYearMonth({}, new Date("2024-06-01T00:00:00Z"))).toEqual({
      year: 2024,
      month: 6,
    });
    expect(incidentYearMonth({}, null)).toEqual({ year: null, month: null });
    expect(isInjuryCategory(" Injuries ")).toBe(true);
    expect(isInjuryCategory("near-misses")).toBe(false);
  });
});
