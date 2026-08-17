import { describe, expect, it } from "vitest";
import {
  aggregateBodyLocations,
  aggregateByOshaPart,
  bodyLocationSummaryLabel,
  BODY_REGIONS,
  extractBodyLocationsFromPayload,
  heatTone,
  maxRegionCount,
  parseBodyLocations,
  regionById,
  regionsForView,
  resolveBodyLocationToken,
  toggleBodyLocation,
} from "./incident-body-map";

describe("incident-body-map regions", () => {
  it("has unique region ids", () => {
    const ids = BODY_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every hotspot within the 0-100 container bounds", () => {
    for (const region of BODY_REGIONS) {
      expect(region.left).toBeGreaterThanOrEqual(0);
      expect(region.top).toBeGreaterThanOrEqual(0);
      expect(region.left + region.width).toBeLessThanOrEqual(100);
      expect(region.top + region.height).toBeLessThanOrEqual(100);
    }
  });

  it("splits regions across both views", () => {
    expect(regionsForView("front").length).toBeGreaterThan(0);
    expect(regionsForView("back").length).toBeGreaterThan(0);
    expect(regionsForView("front").every((r) => r.view === "front")).toBe(true);
  });

  it("looks up a region by id", () => {
    expect(regionById("head-front")?.part).toBe("Head");
    expect(regionById("nope")).toBeUndefined();
  });
});

describe("parseBodyLocations", () => {
  it("drops unknown ids, non-strings, and duplicates", () => {
    expect(parseBodyLocations(["head-front", "head-front", "bogus", 7, null])).toEqual([
      "head-front",
    ]);
  });

  it("accepts comma-separated labels and legacy payload keys", () => {
    expect(parseBodyLocations("Head, Right arm")).toEqual(["head-front", "right-arm-front"]);
    expect(
      extractBodyLocationsFromPayload({
        bodyPart: "Lower back",
        bodyLocations: ["chest-front"],
      }),
    ).toEqual(["chest-front", "lower-back"]);
  });

  it("returns [] for empty values", () => {
    expect(parseBodyLocations(undefined)).toEqual([]);
    expect(parseBodyLocations("")).toEqual([]);
  });
});

describe("resolveBodyLocationToken", () => {
  it("resolves ids and human labels", () => {
    expect(resolveBodyLocationToken("head-front")).toBe("head-front");
    expect(resolveBodyLocationToken("Head")).toBe("head-front");
    expect(resolveBodyLocationToken("nope")).toBeNull();
  });
});

describe("toggleBodyLocation", () => {
  it("adds then removes a valid id", () => {
    const added = toggleBodyLocation([], "chest-front");
    expect(added).toEqual(["chest-front"]);
    expect(toggleBodyLocation(added, "chest-front")).toEqual([]);
  });

  it("ignores unknown ids", () => {
    expect(toggleBodyLocation(["chest-front"], "bogus")).toEqual(["chest-front"]);
  });
});

describe("bodyLocationSummaryLabel", () => {
  it("joins de-duplicated part labels", () => {
    expect(bodyLocationSummaryLabel(["head-front", "right-arm-front"])).toBe("Head, Right arm");
  });

  it("de-duplicates by part label across views", () => {
    // Head appears front and back with different labels, so both show; shoulders share a label.
    expect(bodyLocationSummaryLabel(["left-shoulder-front", "left-shoulder-back"])).toBe(
      "Left shoulder",
    );
  });

  it("is empty for no locations", () => {
    expect(bodyLocationSummaryLabel([])).toBe("");
  });
});

describe("aggregation", () => {
  const incidents: Array<{ bodyLocations?: readonly string[] }> = [
    { bodyLocations: ["head-front", "right-arm-front"] },
    { bodyLocations: ["head-front"] },
    { bodyLocations: ["lower-back", "bogus"] },
    {},
  ];

  it("counts region references across incidents", () => {
    const counts = aggregateBodyLocations(incidents);
    expect(counts.get("head-front")).toBe(2);
    expect(counts.get("right-arm-front")).toBe(1);
    expect(counts.get("lower-back")).toBe(1);
    expect(counts.has("bogus")).toBe(false);
    expect(maxRegionCount(counts)).toBe(2);
  });

  it("rolls up to OSHA parts sorted by count", () => {
    const parts = aggregateByOshaPart(incidents);
    expect(parts[0]).toEqual({ oshaPart: "Head", count: 2 });
    expect(parts.find((p) => p.oshaPart === "Arm")?.count).toBe(1);
    expect(parts.find((p) => p.oshaPart === "Back")?.count).toBe(1);
  });

  it("counts an OSHA part once per incident even with multiple regions", () => {
    const parts = aggregateByOshaPart([
      { bodyLocations: ["left-shoulder-front", "right-shoulder-front"] },
    ]);
    expect(parts.find((p) => p.oshaPart === "Shoulder")?.count).toBe(1);
  });
});

describe("heatTone", () => {
  it("buckets by ratio of count to max", () => {
    expect(heatTone(0, 5)).toBeNull();
    expect(heatTone(1, 6)).toBe("info");
    expect(heatTone(3, 6)).toBe("warning");
    expect(heatTone(6, 6)).toBe("danger");
  });

  it("returns null when there is no data", () => {
    expect(heatTone(2, 0)).toBeNull();
  });
});
