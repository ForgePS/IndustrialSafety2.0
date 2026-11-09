import { describe, expect, it } from "vitest";
import { injuryHistoryChange, toInjuryHistory } from "./injury-history";

const years = toInjuryHistory({
  years: [
    { year: 2025, injuries: 6, lostTimeCases: 2, daysAway: 14 },
    { year: 2024, injuries: 10, lostTimeCases: 2, daysAway: 30 },
    { year: 2026, injuries: 1, lostTimeCases: 0, daysAway: 0 },
    { year: "bad", injuries: 3 },
  ],
});

describe("injury history", () => {
  it("parses and sorts the API rows", () => {
    expect(years.map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(toInjuryHistory(null)).toEqual([]);
    expect(toInjuryHistory({ years: [{ year: 2020, injuries: -2 }] })[0]?.injuries).toBe(0);
  });

  it("compares the last two full years, skipping the current year", () => {
    expect(injuryHistoryChange(years, "injuries", 2026)).toEqual({
      fromYear: 2024,
      toYear: 2025,
      from: 10,
      to: 6,
      percent: -40,
      direction: "down",
    });
    expect(injuryHistoryChange(years, "lostTimeCases", 2026)?.direction).toBe("flat");
    expect(injuryHistoryChange(years, "injuries", 2025)).toBeNull();
  });

  it("has no percent when the earlier year was zero", () => {
    const change = injuryHistoryChange(
      [
        { year: 2023, injuries: 0, lostTimeCases: 0, daysAway: 0 },
        { year: 2024, injuries: 2, lostTimeCases: 1, daysAway: 3 },
      ],
      "injuries",
      2026,
    );
    expect(change?.percent).toBeNull();
    expect(change?.direction).toBe("up");
  });
});
