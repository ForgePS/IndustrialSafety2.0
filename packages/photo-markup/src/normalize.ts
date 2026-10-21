import type { MarkupDocument, PhotoAnnotation } from "./types.js";
import { clampUnit } from "./ids.js";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const ANNOTATION_TYPES = new Set([
  "pen",
  "highlighter",
  "line",
  "arrow",
  "rectangle",
  "ellipse",
  "triangle",
  "polygon",
  "text",
  "icon",
  "callout",
  "blur",
  "redaction",
]);

export function normalizeAnnotations(raw: unknown): PhotoAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const out: PhotoAnnotation[] = [];
  for (const [index, item] of raw.entries()) {
    const row = asRecord(item);
    const type = typeof row.type === "string" ? row.type : "";
    if (!ANNOTATION_TYPES.has(type)) continue;
    const x = Number(row.x);
    const y = Number(row.y);
    if (![x, y].every(Number.isFinite)) continue;
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : `ann-${index}`;
    const annotation: PhotoAnnotation = {
      id,
      type: type as PhotoAnnotation["type"],
      x: clampUnit(x),
      y: clampUnit(y),
      zIndex: Number.isFinite(Number(row.zIndex)) ? Number(row.zIndex) : index,
    };
    if (Number.isFinite(Number(row.width))) annotation.width = Number(row.width);
    if (Number.isFinite(Number(row.height))) annotation.height = Number(row.height);
    if (Number.isFinite(Number(row.x2))) annotation.x2 = clampUnit(Number(row.x2));
    if (Number.isFinite(Number(row.y2))) annotation.y2 = clampUnit(Number(row.y2));
    if (Number.isFinite(Number(row.rotation))) annotation.rotation = Number(row.rotation);
    if (typeof row.stroke === "string") annotation.stroke = row.stroke;
    if (Number.isFinite(Number(row.strokeWidth))) annotation.strokeWidth = Number(row.strokeWidth);
    if (typeof row.fill === "string") annotation.fill = row.fill;
    if (Number.isFinite(Number(row.opacity))) annotation.opacity = Number(row.opacity);
    if (
      row.lineStyle === "solid" ||
      row.lineStyle === "dashed" ||
      row.lineStyle === "dotted"
    ) {
      annotation.lineStyle = row.lineStyle;
    }
    if (typeof row.text === "string") annotation.text = row.text;
    if (Number.isFinite(Number(row.fontSize))) annotation.fontSize = Number(row.fontSize);
    if (typeof row.fontWeight === "string") annotation.fontWeight = row.fontWeight;
    if (typeof row.fontStyle === "string") annotation.fontStyle = row.fontStyle;
    if (typeof row.textAlign === "string") annotation.textAlign = row.textAlign;
    if (typeof row.backgroundColor === "string") annotation.backgroundColor = row.backgroundColor;
    if (typeof row.iconKey === "string") annotation.iconKey = row.iconKey;
    if (Number.isFinite(Number(row.calloutNumber))) {
      annotation.calloutNumber = Number(row.calloutNumber);
    }
    if (typeof row.calloutNote === "string") annotation.calloutNote = row.calloutNote;
    if (typeof row.linkedEntityType === "string") {
      annotation.linkedEntityType = row.linkedEntityType;
    }
    if (typeof row.linkedEntityId === "string") annotation.linkedEntityId = row.linkedEntityId;
    if (Array.isArray(row.points)) {
      const pts = row.points.map(Number).filter(Number.isFinite);
      if (pts.length >= 4) annotation.points = pts.map(clampUnit);
    }
    if (typeof row.createdByUserId === "string") annotation.createdByUserId = row.createdByUserId;
    if (typeof row.createdAt === "string") annotation.createdAt = row.createdAt;
    out.push(annotation);
  }
  return out.sort((a, b) => a.zIndex - b.zIndex);
}

export function normalizeMarkupDocument(raw: unknown): MarkupDocument | null {
  const row = asRecord(raw);
  if (Number(row.version) !== 1 && !Array.isArray(row.annotations)) return null;
  return {
    version: 1,
    canvasWidth: Number.isFinite(Number(row.canvasWidth)) ? Number(row.canvasWidth) : 0,
    canvasHeight: Number.isFinite(Number(row.canvasHeight)) ? Number(row.canvasHeight) : 0,
    annotations: normalizeAnnotations(row.annotations),
  };
}

export function createEmptyDocument(
  canvasWidth = 0,
  canvasHeight = 0,
): MarkupDocument {
  return {
    version: 1,
    canvasWidth,
    canvasHeight,
    annotations: [],
  };
}
