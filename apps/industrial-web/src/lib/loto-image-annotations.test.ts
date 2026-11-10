import { describe, expect, it } from "vitest";
import {
  clampUnit,
  cropLotoImageArrows,
  normalizeLotoImageArrows,
  lotoAnnotatedImageHtml,
} from "./loto-image-annotations";

describe("loto-image-annotations", () => {
  it("clamps to the unit square", () => {
    expect(clampUnit(-0.2)).toBe(0);
    expect(clampUnit(1.4)).toBe(1);
    expect(clampUnit(0.5)).toBe(0.5);
  });

  it("normalizes arrow payloads and drops zero-length strokes", () => {
    const arrows = normalizeLotoImageArrows([
      { id: "a1", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7 },
      { id: "noop", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 },
      { x1: "0", y1: "0", x2: "1", y2: "1" },
    ]);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toMatchObject({ id: "a1", x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.7 });
    expect(arrows[1]?.x2).toBe(1);
  });

  it("builds annotated print markup with overlay svg", () => {
    const html = lotoAnnotatedImageHtml(
      "data:image/jpeg;base64,abc",
      "Equipment",
      [{ id: "a1", x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 }],
      "equip-photo",
    );
    expect(html).toContain("loto-annotated-photo");
    expect(html).toContain("loto-photo-arrows");
    expect(html).toContain("data:image/jpeg;base64,abc");
  });
});

describe("cropLotoImageArrows", () => {
  const arrow = { id: "a", x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.6 };

  it("moves arrows into the cropped frame", () => {
    const [moved] = cropLotoImageArrows([arrow], { x: 0.2, y: 0.2, width: 0.5, height: 0.5 });
    expect(moved?.x1).toBeCloseTo(0);
    expect(moved?.y1).toBeCloseTo(0);
    expect(moved?.x2).toBeCloseTo(0.8);
    expect(moved?.y2).toBeCloseTo(0.8);
  });

  it("drops arrows whose tip is cropped out and pulls in cut-off tails", () => {
    expect(cropLotoImageArrows([arrow], { x: 0, y: 0, width: 0.5, height: 0.5 })).toEqual([]);
    const [moved] = cropLotoImageArrows([arrow], { x: 0.4, y: 0.4, width: 0.5, height: 0.5 });
    expect(moved?.x1).toBe(0);
    expect(moved?.x2).toBeCloseTo(0.4);
  });

  it("keeps arrows unchanged for a full-image crop", () => {
    expect(cropLotoImageArrows([arrow], { x: 0, y: 0, width: 1, height: 1 })).toEqual([arrow]);
  });
});
