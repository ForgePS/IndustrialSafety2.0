import { describe, expect, it } from "vitest";
import { incidentOccurredDate, monthlyIncidentTrend } from "./incident-trend.js";

describe("incident trend", () => {
  it("uses the date occurred, falling back to the created date", () => {
    const created = new Date("2026-09-15T12:00:00Z");
    expect(incidentOccurredDate({ dateOccurred: "2026-04-03T08:15" }, created)).toBe("2026-04-03");
    expect(incidentOccurredDate({ occurredAt: "05/20/2026" }, created)).toBe("2026-05-20");
    expect(incidentOccurredDate({}, created)).toBe("2026-09-15");
    expect(incidentOccurredDate({}, null)).toBeNull();
  });

  it("counts by month occurred and fills empty months with zero", () => {
    const trend = monthlyIncidentTrend(
      ["2026-04-03", "2026-04-20", "2026-06-01", "2026-03-30", "2026-09-30", null],
      new Date("2026-04-02T00:00:00Z"),
      new Date("2026-07-10T00:00:00Z"),
    );
    expect(trend).toEqual([
      { month: "2026-04", count: 2 },
      { month: "2026-05", count: 0 },
      { month: "2026-06", count: 1 },
      { month: "2026-07", count: 0 },
    ]);
  });

  it("skips dates before the range start inside the first month", () => {
    const trend = monthlyIncidentTrend(
      ["2026-04-01"],
      new Date("2026-04-02T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z"),
    );
    expect(trend).toEqual([{ month: "2026-04", count: 0 }]);
  });
});
