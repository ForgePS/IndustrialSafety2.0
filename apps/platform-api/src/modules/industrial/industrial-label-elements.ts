/**
 * Phase 5 label element helpers: normalize elements + ZPL export (pure).
 */
import { substituteTemplateVariables } from "./industrial-print-templates.js";

export type LabelElement = {
  id?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fieldKey?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "bold";
  align?: "left" | "center" | "right";
  barcodeFormat?: "CODE128" | "CODE39";
  showHumanReadable?: boolean;
  strokeWidthPt?: number;
  fill?: boolean;
};

export function parseLayoutElements(
  layout: Record<string, unknown> | null | undefined,
): LabelElement[] {
  const raw = layout?.elements;
  if (!Array.isArray(raw)) return [];
  const out: LabelElement[] = [];
  for (const [index, e] of raw.entries()) {
    if (!e || typeof e !== "object") continue;
    const row = e as Record<string, unknown>;
    const el: LabelElement = {
      id: typeof row.id === "string" ? row.id : `el-${index + 1}`,
      type: String(row.type ?? "text"),
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      width: Number(row.width) > 0 ? Number(row.width) : 1,
      height: Number(row.height) > 0 ? Number(row.height) : 0.25,
      fontWeight: row.fontWeight === "bold" ? "bold" : "normal",
      align: row.align === "center" || row.align === "right" ? row.align : "left",
      barcodeFormat: row.barcodeFormat === "CODE39" ? "CODE39" : "CODE128",
      showHumanReadable: row.showHumanReadable !== false,
      strokeWidthPt: typeof row.strokeWidthPt === "number" ? row.strokeWidthPt : 1,
      fill: row.fill === true,
    };
    if (typeof row.content === "string") el.content = row.content;
    if (typeof row.fieldKey === "string") el.fieldKey = row.fieldKey;
    if (typeof row.fontSizePt === "number") el.fontSizePt = row.fontSizePt;
    out.push(el);
  }
  return out;
}

export function resolveElementContent(el: LabelElement, values: Record<string, string>): string {
  if (el.type === "dynamicText" && el.fieldKey) {
    const key = el.fieldKey.trim();
    const fromField = values[key] ?? "";
    if (el.content?.includes("{{")) {
      return substituteTemplateVariables(el.content, values);
    }
    return fromField || substituteTemplateVariables(el.content ?? `{{${key}}}`, values);
  }
  return substituteTemplateVariables(el.content ?? "", values);
}

/** Inches → Zebra dots at label DPI (Brady i4311 = 300). */
function dots(inches: number, dpi: number): number {
  return Math.max(0, Math.round(inches * dpi));
}

/**
 * Generate ZPL II for ELEMENTS layouts. Brady print path still uses PNG;
 * ZPL is for Zebra / raw 9100 adapters and export/download.
 */
export function elementsToZpl(input: {
  widthInches: number;
  heightInches: number;
  dpi: number;
  elements: LabelElement[];
  values: Record<string, string>;
}): string {
  const dpi = input.dpi > 0 ? input.dpi : 300;
  const lines: string[] = [
    "^XA",
    `^PW${dots(input.widthInches, dpi)}`,
    `^LL${dots(input.heightInches, dpi)}`,
  ];

  for (const el of input.elements) {
    const x = dots(el.x, dpi);
    const y = dots(el.y, dpi);
    const w = dots(el.width, dpi);
    const h = dots(el.height, dpi);
    const content = resolveElementContent(el, input.values);
    const type = el.type.toLowerCase();

    if (type === "rectangle") {
      const thickness = Math.max(1, Math.round((el.strokeWidthPt ?? 1) * (dpi / 72)));
      if (el.fill) {
        lines.push(`^FO${x},${y}^GB${w},${h},${Math.max(w, h)}^FS`);
      } else {
        lines.push(`^FO${x},${y}^GB${w},${h},${thickness}^FS`);
      }
      continue;
    }

    if (type === "line") {
      const thickness = Math.max(1, Math.round((el.strokeWidthPt ?? 1) * (dpi / 72)));
      lines.push(`^FO${x},${y}^GB${Math.max(w, 1)},${thickness},${thickness}^FS`);
      continue;
    }

    if (type === "qr") {
      const mag = Math.max(1, Math.min(10, Math.round(Math.min(w, h) / 40)));
      lines.push(`^FO${x},${y}^BQN,2,${mag}^FDQA,${escapeZpl(content)}^FS`);
      continue;
    }

    if (type === "barcode") {
      const barH = Math.max(10, h - (el.showHumanReadable === false ? 0 : Math.round(h * 0.25)));
      // ^BY module width, ratio, height
      const module = Math.max(1, Math.min(5, Math.round(w / Math.max(20, content.length * 11))));
      lines.push(
        `^FO${x},${y}^BY${module},2,${barH}^BCN,${barH},${el.showHumanReadable === false ? "N" : "Y"},N,N^FD${escapeZpl(content)}^FS`,
      );
      continue;
    }

    // text / dynamicText
    const fontH = Math.max(10, Math.round((el.fontSizePt ?? 12) * (dpi / 72)));
    const fontW = Math.max(8, Math.round(fontH * 0.6));
    lines.push(`^FO${x},${y}^A0N,${fontH},${fontW}^FD${escapeZpl(content)}^FS`);
  }

  lines.push("^XZ");
  return lines.join("\n");
}

function escapeZpl(value: string): string {
  // ZPL field data: strip control chars; caret/tilde are command markers.
  return String(value ?? "")
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\^/g, " ")
    .replace(/~/g, " ");
}

export function defaultElementsLayout(): {
  kind: "ELEMENTS";
  elements: LabelElement[];
} {
  return {
    kind: "ELEMENTS",
    elements: [
      {
        id: "title",
        type: "dynamicText",
        x: 0.1,
        y: 0.1,
        width: 3.8,
        height: 0.35,
        fieldKey: "title",
        content: "{{title}}",
        fontSizePt: 16,
        fontWeight: "bold",
        align: "left",
      },
      {
        id: "body",
        type: "dynamicText",
        x: 0.1,
        y: 0.5,
        width: 2.4,
        height: 0.8,
        fieldKey: "body",
        content: "{{body}}",
        fontSizePt: 11,
        align: "left",
      },
      {
        id: "qr",
        type: "qr",
        x: 2.7,
        y: 0.45,
        width: 1.1,
        height: 1.1,
        content: "{{qr}}",
      },
      {
        id: "barcode",
        type: "barcode",
        x: 0.1,
        y: 1.45,
        width: 3.8,
        height: 0.45,
        content: "{{asset}}",
        barcodeFormat: "CODE128",
        showHumanReadable: true,
      },
    ],
  };
}
