import { describe, expect, it } from "vitest";
import {
  clampUnit,
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
