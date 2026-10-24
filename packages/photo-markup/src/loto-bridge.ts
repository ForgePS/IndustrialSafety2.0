/**
 * Bridge between legacy LOTO arrow overlays and Photo Markup annotations.
 */

import { createAnnotationId, clampUnit } from "./ids.js";
import type { PhotoAnnotation } from "./types.js";

export type LotoImageArrow = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function lotoArrowsToAnnotations(arrows: readonly LotoImageArrow[]): PhotoAnnotation[] {
  return arrows.map((arrow, index) => ({
    id: arrow.id || createAnnotationId("arrow"),
    type: "arrow" as const,
    x: clampUnit(arrow.x1),
    y: clampUnit(arrow.y1),
    x2: clampUnit(arrow.x2),
    y2: clampUnit(arrow.y2),
    stroke: "#DC2626",
    strokeWidth: 0.01,
    opacity: 1,
    zIndex: index,
  }));
}

export function annotationsToLotoArrows(annotations: readonly PhotoAnnotation[]): LotoImageArrow[] {
  return annotations
    .filter((a) => a.type === "arrow")
    .map((a) => ({
      id: a.id,
      x1: clampUnit(a.x),
      y1: clampUnit(a.y),
      x2: clampUnit(a.x2 ?? a.x),
      y2: clampUnit(a.y2 ?? a.y),
    }))
    .filter((a) => {
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      return dx * dx + dy * dy >= 0.00005;
    });
}
