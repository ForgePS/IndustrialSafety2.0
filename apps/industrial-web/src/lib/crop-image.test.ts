import { describe, expect, it } from "vitest";
import {
  applyAspectToCrop,
  clampCropRect,
  defaultCropRect,
  LICENSE_CARD_ASPECT,
} from "./crop-image";

describe("crop-image helpers", () => {
  it("clamps crop inside image bounds", () => {
    expect(clampCropRect({ x: -20, y: -10, width: 500, height: 400 }, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });

  it("defaults to an inset crop", () => {
    const crop = defaultCropRect(1000, 800);
    expect(crop.x).toBeGreaterThan(0);
    expect(crop.y).toBeGreaterThan(0);
    expect(crop.width).toBeLessThan(1000);
    expect(crop.height).toBeLessThan(800);
  });

  it("applies license card aspect", () => {
    const crop = applyAspectToCrop(
      { x: 0, y: 0, width: 800, height: 800 },
      1000,
      1000,
      LICENSE_CARD_ASPECT,
    );
    expect(crop.width / crop.height).toBeCloseTo(LICENSE_CARD_ASPECT, 2);
  });
});
