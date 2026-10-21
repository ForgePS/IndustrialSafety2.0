import { describe, expect, it } from "vitest";
import {
  DEFAULT_INCIDENT_BODY_REGIONS,
  normalizeIncidentBodyRegions,
} from "./industrial-body-map-defaults.js";

describe("normalizeIncidentBodyRegions", () => {
  it("returns defaults when given an empty array", () => {
    const result = normalizeIncidentBodyRegions([]);
    expect(result).toHaveLength(DEFAULT_INCIDENT_BODY_REGIONS.length);
    expect(result[0]?.id).toBe("head-front");
  });

  it("merges saved geometry onto baseline metadata", () => {
    const result = normalizeIncidentBodyRegions([
      { id: "head-front", top: 5, left: 40, width: 20, height: 12 },
    ]);
    const head = result.find((region) => region.id === "head-front");
    expect(head).toMatchObject({ top: 5, left: 40, width: 20, height: 12, part: "Head" });
  });

  it("rejects invalid geometry", () => {
    expect(() =>
      normalizeIncidentBodyRegions([{ id: "head-front", top: "bad", left: 1, width: 1, height: 1 }]),
    ).toThrow(/Invalid geometry/);
  });
});
