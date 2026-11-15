import { describe, expect, it } from "vitest";
import {
  accommodationsPayloadHasContent,
  parseWorkersCompAccommodationsPayload,
  readAccommodationsFromSourcePayload,
  summarizeWorkersCompAccommodationsPayload,
} from "./wc-restrictions-accommodations.js";

describe("wc-restrictions-accommodations (api)", () => {
  it("reads nested accommodations from source_payload", () => {
    const payload = readAccommodationsFromSourcePayload({
      accommodations: {
        standWalk: "6-8",
        liftingLevel: "medium",
        upperExtremities: ["no-vibratory"],
      },
    });
    expect(payload.standWalk).toBe("6-8");
    expect(payload.liftingLevel).toBe("medium");
    expect(payload.upperExtremities).toEqual(["no-vibratory"]);
    expect(accommodationsPayloadHasContent(payload)).toBe(true);
  });

  it("summarizes payload for description fallback", () => {
    const parsed = parseWorkersCompAccommodationsPayload({
      sit: "unlimited",
      transitionalNotApplicable: true,
    });
    expect(summarizeWorkersCompAccommodationsPayload(parsed)).toContain("Sit");
    expect(summarizeWorkersCompAccommodationsPayload(parsed)).toContain("N/A");
  });
});
