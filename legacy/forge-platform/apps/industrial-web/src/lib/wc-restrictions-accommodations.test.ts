import { describe, expect, it } from "vitest";
import {
  accommodationsHasContent,
  EMPTY_WC_ACCOMMODATIONS,
  parseWorkersCompAccommodations,
  summarizeWorkersCompAccommodations,
} from "./wc-restrictions-accommodations";

describe("wc-restrictions-accommodations", () => {
  it("parses known option ids and ignores junk", () => {
    const parsed = parseWorkersCompAccommodations({
      standWalk: "4-6",
      sit: "nope",
      liftingLevel: "light",
      injurySides: ["right", "right", "middle"],
      injuryParts: ["hand", "other"],
      injuryOther: "neck",
      upperExtremities: ["limit-push-pull", "no-stairs"],
      pushPullLimitLbs: "20",
      lowerExtremities: ["no-stairs"],
      transitionalHours: "4",
      transitionalAbleRemaining: "YES",
      notes: " Desk duty ",
    });
    expect(parsed.standWalk).toBe("4-6");
    expect(parsed.sit).toBe("");
    expect(parsed.liftingLevel).toBe("light");
    expect(parsed.injurySides).toEqual(["right"]);
    expect(parsed.injuryParts).toEqual(["hand", "other"]);
    expect(parsed.injuryOther).toBe("neck");
    expect(parsed.upperExtremities).toEqual(["limit-push-pull"]);
    expect(parsed.lowerExtremities).toEqual(["no-stairs"]);
    expect(parsed.transitionalHours).toBe("4");
    expect(parsed.transitionalAbleRemaining).toBe("yes");
    expect(parsed.notes).toBe(" Desk duty ");
  });

  it("summarizes filled accommodations", () => {
    expect(accommodationsHasContent(EMPTY_WC_ACCOMMODATIONS)).toBe(false);
    const summary = summarizeWorkersCompAccommodations({
      ...EMPTY_WC_ACCOMMODATIONS,
      standWalk: "1-4",
      liftingLevel: "sedentary",
      transitionalHours: "2",
      transitionalWeeks: "3",
    });
    expect(summary).toContain("Stand/Walk");
    expect(summary).toContain("Sedentary");
    expect(summary).toContain("2 hours");
  });
});
