import type { PhotoAnnotation } from "./types.js";
import { safetyIconSvgMarkup } from "./safety-icons.js";

function dashArray(style: PhotoAnnotation["lineStyle"], strokeWidth: number): string | undefined {
  if (style === "dashed") return `${strokeWidth * 3} ${strokeWidth * 2}`;
  if (style === "dotted") return `${strokeWidth} ${strokeWidth * 1.5}`;
  return undefined;
}

function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headLength = 0.045,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const tipX = x2;
  const tipY = y2;
  const baseX = tipX - ux * headLength;
  const baseY = tipY - uy * headLength;
  const half = headLength * 0.55;
  return `${tipX},${tipY} ${baseX + px * half},${baseY + py * half} ${baseX - px * half},${baseY - py * half}`;
}

function pointsToPath(points: number[]): string {
  if (points.length < 4) return "";
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  return d;
}

/** Render a single annotation as SVG markup in viewBox 0 0 1 1. */
export function annotationToSvg(annotation: PhotoAnnotation, selected = false): string {
  const stroke = escapeXmlAttr(annotation.stroke ?? "#DC2626");
  const fill = escapeXmlAttr(annotation.fill ?? "none");
  const opacity = annotation.opacity ?? 1;
  const sw = annotation.strokeWidth ?? 0.01;
  const outline = selected ? "#93c5fd" : "#ffffff";
  const dash = dashArray(annotation.lineStyle, sw);

  switch (annotation.type) {
    case "pen":
    case "highlighter": {
      if (!annotation.points || annotation.points.length < 4) return "";
      const pathOpacity = annotation.type === "highlighter" ? (annotation.opacity ?? 0.4) : opacity;
      return `<path d="${pointsToPath(annotation.points)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${pathOpacity}" />`;
    }
    case "line": {
      const x2 = annotation.x2 ?? annotation.x;
      const y2 = annotation.y2 ?? annotation.y;
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
      return [
        `<line x1="${annotation.x}" y1="${annotation.y}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${sw * 1.8}" stroke-linecap="round"${dashAttr} />`,
        `<line x1="${annotation.x}" y1="${annotation.y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${opacity}"${dashAttr} />`,
      ].join("");
    }
    case "arrow": {
      const x2 = annotation.x2 ?? annotation.x;
      const y2 = annotation.y2 ?? annotation.y;
      return [
        `<line x1="${annotation.x}" y1="${annotation.y}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${sw * 1.8}" stroke-linecap="round" />`,
        `<line x1="${annotation.x}" y1="${annotation.y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${opacity}" />`,
        `<polygon points="${arrowHeadPoints(annotation.x, annotation.y, x2, y2)}" fill="${stroke}" stroke="${outline}" stroke-width="${sw * 0.6}" opacity="${opacity}" />`,
      ].join("");
    }
    case "rectangle": {
      const w = annotation.width ?? 0;
      const h = annotation.height ?? 0;
      return `<rect x="${annotation.x}" y="${annotation.y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"${selected ? ` stroke="${selected ? "#2563eb" : stroke}"` : ""} />`;
    }
    case "ellipse": {
      const w = annotation.width ?? 0;
      const h = annotation.height ?? 0;
      const cx = annotation.x + w / 2;
      const cy = annotation.y + h / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" />`;
    }
    case "triangle": {
      const w = annotation.width ?? 0;
      const h = annotation.height ?? 0;
      const pts = `${annotation.x + w / 2},${annotation.y} ${annotation.x + w},${annotation.y + h} ${annotation.x},${annotation.y + h}`;
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" />`;
    }
    case "text": {
      const size = (annotation.fontSize ?? 16) / 1000;
      const bg = annotation.backgroundColor;
      const text = escapeXml(annotation.text ?? "");
      const weight = annotation.fontWeight ?? "bold";
      const parts: string[] = [];
      if (bg && bg !== "transparent") {
        const tw = Math.max(0.08, (text.length * size * 0.55));
        const th = size * 1.4;
        parts.push(
          `<rect x="${annotation.x - 0.01}" y="${annotation.y - size}" width="${tw}" height="${th}" fill="${escapeXmlAttr(bg)}" opacity="${opacity}" rx="0.01" />`,
        );
      }
      parts.push(
        `<text x="${annotation.x}" y="${annotation.y}" fill="${stroke}" font-size="${size}" font-weight="${weight}" font-family="system-ui,sans-serif" opacity="${opacity}">${text}</text>`,
      );
      return parts.join("");
    }
    case "callout": {
      const n = annotation.calloutNumber ?? 1;
      const r = 0.028;
      return [
        `<circle cx="${annotation.x}" cy="${annotation.y}" r="${r}" fill="${stroke}" stroke="${outline}" stroke-width="0.006" opacity="${opacity}" />`,
        `<text x="${annotation.x}" y="${annotation.y}" fill="#FFFFFF" font-size="0.028" font-weight="700" font-family="system-ui,sans-serif" text-anchor="middle" dominant-baseline="central">${n}</text>`,
      ].join("");
    }
    case "icon": {
      const size = annotation.width ?? 0.08;
      return safetyIconSvgMarkup(
        annotation.iconKey ?? "warning",
        annotation.x,
        annotation.y,
        size,
        stroke,
        opacity,
      );
    }
    case "blur":
    case "redaction": {
      const w = annotation.width ?? 0;
      const h = annotation.height ?? 0;
      if (annotation.type === "redaction") {
        const fillColor = annotation.fill ?? "#000000";
        return `<rect x="${annotation.x}" y="${annotation.y}" width="${w}" height="${h}" fill="${fillColor}" opacity="${opacity}" />`;
      }
      // Approximate blur with frosted overlay (true pixel blur applied at render time)
      return `<rect x="${annotation.x}" y="${annotation.y}" width="${w}" height="${h}" fill="rgba(148,163,184,0.65)" opacity="${opacity}" />`;
    }
    default:
      return "";
  }
}

export function annotationsToSvgMarkup(
  annotations: readonly PhotoAnnotation[],
  selectedId?: string | null,
): string {
  return [...annotations]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((a) => annotationToSvg(a, selectedId === a.id))
    .join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Escape values used inside SVG attribute quotes. */
function escapeXmlAttr(value: string): string {
  return escapeXml(String(value ?? ""));
}
