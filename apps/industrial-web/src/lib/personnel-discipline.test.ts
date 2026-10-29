import { describe, expect, it } from "vitest";
import { disciplineCountsUntil, pointsForAction } from "./personnel-discipline";

describe("personnel discipline helpers", () => {
  it("assigns points from the selected action", () => {
    expect(pointsForAction("COACHING")).toBe(2);
    expect(pointsForAction("WRITTEN_WARNING")).toBe(10);
    expect(pointsForAction("TERMINATION")).toBe(25);
  });

  it("counts for 12 months from the action date", () => {
    expect(disciplineCountsUntil("2026-10-08")).toBe("2027-10-08");
    expect(disciplineCountsUntil("2028-02-29")).toBe("2029-02-28");
    expect(disciplineCountsUntil("")).toBe("");
  });
});
