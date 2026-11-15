import { describe, expect, it } from "vitest";
import { annotationsToLotoArrows, lotoArrowsToAnnotations } from "./loto-bridge.js";
import { normalizeAnnotations } from "./normalize.js";
import { createAnnotationId, clampUnit } from "./ids.js";

describe("clampUnit", () => {
  it("clamps to 0–1", () => {
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(0.5)).toBe(0.5);
  });
});

describe("loto bridge", () => {
  it("round-trips arrows", () => {
    const arrows = [{ id: "a1", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 }];
    const annotations = lotoArrowsToAnnotations(arrows);
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.type).toBe("arrow");
    const back = annotationsToLotoArrows(annotations);
    expect(back).toEqual(arrows);
  });
});

describe("normalizeAnnotations", () => {
  it("keeps valid annotations", () => {
    const raw = [
      {
        id: createAnnotationId(),
        type: "rectangle",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.3,
        zIndex: 0,
        stroke: "#DC2626",
      },
      { type: "nope", x: 0, y: 0 },
    ];
    const result = normalizeAnnotations(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("rectangle");
  });
});
