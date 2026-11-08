import { describe, expect, it } from "vitest";
import {
  cappedOshaDays,
  nextOshaCaseNumber,
  oshaCaseLogYear,
  oshaCaseNumberSequence,
  oshaLogEstablishmentKey,
} from "./osha-rules.js";

describe("osha-rules", () => {
  it("caps combined days at 180", () => {
    expect(cappedOshaDays(170, 30)).toEqual({ daysAway: 170, restrictedDays: 10 });
    expect(cappedOshaDays(-2, null)).toEqual({ daysAway: 0, restrictedDays: 0 });
  });

  it("prefers the injury year", () => {
    expect(oshaCaseLogYear({ injuryDate: "2024-12-31", calendarYear: 2025 })).toBe(2024);
    expect(oshaCaseLogYear({ injuryDate: null, calendarYear: null })).toBeNull();
  });

  it("normalizes establishment names into one log key", () => {
    expect(oshaLogEstablishmentKey("  Crowley   Plant ")).toBe("crowley plant");
    expect(oshaLogEstablishmentKey(null)).toBe("");
  });

  it("reads trailing case-number sequences", () => {
    expect(oshaCaseNumberSequence("2026-007")).toBe(7);
    expect(oshaCaseNumberSequence("A")).toBeNull();
  });

  it("numbers per log and year", () => {
    const rows = [
      { logKey: "crowley plant", year: 2026, caseNumber: "3" },
      { logKey: "other", year: 2026, caseNumber: "8" },
    ];
    expect(nextOshaCaseNumber(rows, "crowley plant", 2026)).toBe("4");
    expect(nextOshaCaseNumber(rows, "crowley plant", 2025)).toBe("1");
  });
});
