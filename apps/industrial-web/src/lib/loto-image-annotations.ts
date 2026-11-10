/**
 * Editable LOTO photo arrow overlays (normalized 0–1 coordinates).
 */

export type LotoImageArrow = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function createLotoImageArrowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeLotoImageArrows(raw: unknown): LotoImageArrow[] {
  if (!Array.isArray(raw)) return [];
  const arrows: LotoImageArrow[] = [];
  for (const [index, item] of raw.entries()) {
    const row = asRecord(item);
    const x1 = Number(row.x1);
    const y1 = Number(row.y1);
    const x2 = Number(row.x2);
    const y2 = Number(row.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx * dx + dy * dy < 0.00005) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `arrow-${index}`;
    arrows.push({
      id,
      x1: clampUnit(x1),
      y1: clampUnit(y1),
      x2: clampUnit(x2),
      y2: clampUnit(y2),
    });
  }
  return arrows;
}

/** SVG path for a filled arrowhead at the tip of the shaft. */
export function lotoArrowHeadPoints(arrow: LotoImageArrow, headLength = 0.045): string {
  const dx = arrow.x2 - arrow.x1;
  const dy = arrow.y2 - arrow.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const tipX = arrow.x2;
  const tipY = arrow.y2;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;
  const half = headLength * 0.55;
  const leftX = baseX + px * half;
  const leftY = baseY + py * half;
  const rightX = baseX - px * half;
  const rightY = baseY - py * half;
  return `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`;
}

export function lotoArrowSvgInnerMarkup(
  arrows: readonly LotoImageArrow[],
  selectedId?: string | null,
): string {
  return arrows
    .map((arrow) => {
      const selected = selectedId && arrow.id === selectedId;
      const stroke = selected ? "#2563eb" : "#dc2626";
      const outline = selected ? "#93c5fd" : "#ffffff";
      return [
        `<line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="${outline}" stroke-width="0.018" stroke-linecap="round" />`,
        `<line x1="${arrow.x1}" y1="${arrow.y1}" x2="${arrow.x2}" y2="${arrow.y2}" stroke="${stroke}" stroke-width="0.01" stroke-linecap="round" />`,
        `<polygon points="${lotoArrowHeadPoints(arrow)}" fill="${stroke}" stroke="${outline}" stroke-width="0.006" />`,
      ].join("");
    })
    .join("");
}

/** Print/HTML wrapper: image + overlay SVG in a positioned box. */
export function lotoAnnotatedImageHtml(
  url: string,
  alt: string,
  arrows: readonly LotoImageArrow[],
  className = "photo",
): string {
  const svg =
    arrows.length > 0
      ? `<svg class="loto-photo-arrows" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${lotoArrowSvgInnerMarkup(arrows)}</svg>`
      : "";
  return `<figure class="${className} loto-annotated-photo"><img src="${url}" alt="${alt}" />${svg}</figure>`;
}

/** Part of an image kept by a crop, as fractions (0–1) of the original width and height. */
export type LotoCropFraction = { x: number; y: number; width: number; height: number };

/**
 * Moves arrows onto a cropped photo. Arrows whose tip is cut off are dropped; a tail that
 * is cut off is pulled to the edge of the crop.
 */
export function cropLotoImageArrows(
  arrows: LotoImageArrow[],
  crop: LotoCropFraction,
): LotoImageArrow[] {
  if (!(crop.width > 0) || !(crop.height > 0)) return arrows;
  const mapX = (x: number) => (x - crop.x) / crop.width;
  const mapY = (y: number) => (y - crop.y) / crop.height;
  const inside = (v: number) => v >= 0 && v <= 1;
  const result: LotoImageArrow[] = [];
  for (const arrow of arrows) {
    const x2 = mapX(arrow.x2);
    const y2 = mapY(arrow.y2);
    if (!inside(x2) || !inside(y2)) continue;
    const next = {
      id: arrow.id,
      x1: clampUnit(mapX(arrow.x1)),
      y1: clampUnit(mapY(arrow.y1)),
      x2,
      y2,
    };
    const dx = next.x2 - next.x1;
    const dy = next.y2 - next.y1;
    if (dx * dx + dy * dy < 0.00005) continue;
    result.push(next);
  }
  return result;
}
