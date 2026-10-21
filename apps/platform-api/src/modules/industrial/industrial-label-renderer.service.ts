/**
 * Forge Label Renderer — exact-size artifacts for preview + print (WYSIWYG).
 * Spooler path prefers PNG at printer-native DPI (Brady i4311 = 300).
 */
import { Injectable } from "@nestjs/common";
import { BRADY_I4311_DPI, inchesToPixels } from "@forge/contracts";
import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import { qrCodePngBuffer } from "./qr-svg.js";
import { code128PngBuffer, code128Svg } from "./barcode-code128.js";
import {
  resolveElementContent,
  type LabelElement,
} from "./industrial-label-elements.js";

export type LabelRenderResult = {
  buffer: Buffer;
  contentType: "image/png" | "application/pdf";
  sha256: string;
  widthInches: number;
  heightInches: number;
  dpi: number;
  previewSvg: string;
  previewDataUrl: string;
};

export type TestLabelRenderOpts = {
  printerName: string;
  connection?: string | null;
  bridgeName?: string | null;
  locationName?: string | null;
  divisionName?: string | null;
  printerId: string;
  dpi?: number;
  widthInches?: number;
  heightInches?: number;
};

export type FieldLabelRenderOpts = {
  widthInches: number;
  heightInches: number;
  dpi?: number;
  /** Small brand line above the title (e.g. FORGE INDUSTRIAL SAFETY). */
  brand?: string;
  title?: string;
  /** Optional line under the title (e.g. "Scan the QR code to submit a request"). */
  subtitle?: string;
  lines?: string[];
  /** Caption directly under the QR (e.g. station name). */
  caption?: string;
  /** Instruction / footer lines drawn below the QR (and caption). */
  footerLines?: string[];
  qrPayload?: string;
  /** Relative QR size (1 = default). Clamped 0.5–1.5. */
  qrScale?: number;
  /** Relative title/line font size (1 = default). Clamped 0.5–1.5. */
  textScale?: number;
};

const DEFAULT_WIDTH_IN = 4;
const DEFAULT_HEIGHT_IN = 4;
const PT_PER_INCH = 72;

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampScale(value: number | undefined, fallback = 1): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(1.5, Math.max(0.5, value));
}

/** Approximate average glyph width for DejaVu/Arial-like sans (px). */
function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  const avg = bold ? 0.62 : 0.55;
  return Math.ceil(String(text).length * fontSize * avg);
}

function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  if (estimateTextWidth(raw, fontSize, bold) <= maxWidth) return [raw];

  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushSoft = (chunk: string) => {
    if (!chunk) return;
    if (estimateTextWidth(chunk, fontSize, bold) <= maxWidth) {
      lines.push(chunk);
      return;
    }
    // Hard-break long tokens (codes / URLs) so they never spill past the edge.
    let rest = chunk;
    while (rest.length > 0) {
      let take = rest.length;
      while (take > 1 && estimateTextWidth(rest.slice(0, take), fontSize, bold) > maxWidth) {
        take -= 1;
      }
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
  };

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (estimateTextWidth(next, fontSize, bold) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) pushSoft(current);
    current = "";
    pushSoft(word);
    // If pushSoft split the word into multiple lines, current stays empty.
    if (lines.length > 0 && !current) {
      // last hard-broken fragment already pushed
    }
  }
  if (current) pushSoft(current);
  return lines.length > 0 ? lines : [raw];
}

function ellipsizeToWidth(text: string, maxWidth: number, fontSize: number, bold = false): string {
  const raw = String(text ?? "").trim();
  if (!raw || estimateTextWidth(raw, fontSize, bold) <= maxWidth) return raw;
  const ellipsis = "…";
  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${raw.slice(0, mid).trimEnd()}${ellipsis}`;
    if (estimateTextWidth(candidate, fontSize, bold) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  if (lo <= 0) return ellipsis;
  return `${raw.slice(0, lo).trimEnd()}${ellipsis}`;
}

function buildPreviewSvg(opts: {
  widthInches: number;
  heightInches: number;
  dpi: number;
  brand?: string;
  title: string;
  subtitle?: string;
  lines: string[];
  caption?: string;
  footerLines?: string[];
  qrDataUri?: string;
  qrScale?: number;
  textScale?: number;
}): string {
  const w = inchesToPixels(opts.widthInches, opts.dpi);
  const h = inchesToPixels(opts.heightInches, opts.dpi);
  const pad = Math.max(
    Math.round(opts.dpi * 0.12),
    Math.round(Math.min(w, h) * 0.07),
  );
  const textMaxW = Math.max(24, w - pad * 2);
  const textScale = clampScale(opts.textScale);
  const qrScale = clampScale(opts.qrScale);
  const hasQr = Boolean(opts.qrDataUri);
  const font = "DejaVu Sans, Arial, Helvetica, sans-serif";
  const brand = String(opts.brand ?? "").trim().toUpperCase();
  const subtitle = String(opts.subtitle ?? "").trim();
  const caption = String(opts.caption ?? "").trim();
  const sourceLines = opts.lines.slice(0, 4);
  const sourceFooter = (opts.footerLines ?? [])
    .flatMap((l) => String(l).split(/\n+/))
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);

  let brandSize = Math.max(8, Math.round(h * 0.028 * textScale));
  let titleSize = Math.max(14, Math.round(h * 0.075 * textScale));
  let lineSize = Math.max(10, Math.round(h * 0.042 * textScale));
  let footerSize = Math.max(9, Math.round(h * 0.036 * textScale));
  let captionSize = Math.max(10, Math.round(h * 0.04 * textScale));

  // Poster-style: QR is the visual anchor under the headline.
  const maxQr = Math.min(
    Math.round(Math.min(w, h) * 0.48 * qrScale),
    textMaxW,
    Math.round(h * 0.5),
  );
  let qrFinal = hasQr ? Math.max(64, maxQr) : 0;

  const wrapBlock = (text: string, size: number, bold: boolean) =>
    wrapText(text, textMaxW, size, bold).map((row) => ellipsizeToWidth(row, textMaxW, size, bold));

  const rowStackH = (rows: string[], size: number, gap: number) =>
    rows.length === 0 ? 0 : rows.length * size + Math.max(0, rows.length - 1) * gap;

  const fitPass = (
    bSize: number,
    tSize: number,
    lSize: number,
    cSize: number,
    fSize: number,
    qr: number,
  ) => {
    const gapSm = Math.round(Math.min(w, h) * 0.02);
    const gapMd = Math.round(Math.min(w, h) * 0.035);
    const brandRows = brand ? wrapBlock(brand, bSize, true).slice(0, 1) : [];
    const titleRows = wrapBlock(opts.title, tSize, true);
    const subtitleRows = subtitle ? wrapBlock(subtitle, lSize, false).slice(0, 2) : [];
    const detailRows: string[] = [];
    for (const line of sourceLines) detailRows.push(...wrapBlock(line, lSize, false));
    const cappedDetails = detailRows.slice(0, 4);
    const captionRows = caption ? wrapBlock(caption, cSize, false).slice(0, 2) : [];
    const footerRows: string[] = [];
    for (const line of sourceFooter) footerRows.push(...wrapBlock(line, fSize, false));
    const cappedFooter = footerRows.slice(0, 6);

    const brandH = brandRows.length > 0 ? rowStackH(brandRows, bSize, 2) + gapSm : 0;
    const titleH = rowStackH(titleRows, tSize, Math.round(tSize * 0.12));
    const subtitleH =
      subtitleRows.length > 0 ? gapSm + rowStackH(subtitleRows, lSize, Math.round(lSize * 0.25)) : 0;
    const detailsH =
      cappedDetails.length > 0 ? gapSm + rowStackH(cappedDetails, lSize, Math.round(lSize * 0.25)) : 0;
    const qrH = hasQr ? gapMd + qr : 0;
    const captionH =
      captionRows.length > 0 ? gapSm + rowStackH(captionRows, cSize, Math.round(cSize * 0.2)) : 0;
    const footerH =
      cappedFooter.length > 0 ? gapMd + rowStackH(cappedFooter, fSize, Math.round(fSize * 0.45)) : 0;
    const contentH = brandH + titleH + subtitleH + detailsH + qrH + captionH + footerH;
    return {
      brandRows,
      titleRows,
      subtitleRows,
      cappedDetails,
      captionRows,
      cappedFooter,
      contentH,
      gapSm,
      gapMd,
    };
  };

  let layout = fitPass(brandSize, titleSize, lineSize, captionSize, footerSize, qrFinal);
  for (let attempt = 0; attempt < 16; attempt++) {
    if (layout.contentH <= h - pad * 2) break;
    if (qrFinal > 72) {
      qrFinal = Math.max(72, Math.round(qrFinal * 0.9));
    } else if (titleSize > 12 || lineSize > 9 || footerSize > 8) {
      brandSize = Math.max(7, Math.round(brandSize * 0.92));
      titleSize = Math.max(12, Math.round(titleSize * 0.9));
      lineSize = Math.max(9, Math.round(lineSize * 0.9));
      captionSize = Math.max(9, Math.round(captionSize * 0.9));
      footerSize = Math.max(8, Math.round(footerSize * 0.9));
    } else if (sourceLines.length > 0) {
      sourceLines.pop();
    } else if (sourceFooter.length > 3) {
      sourceFooter.pop();
    } else {
      break;
    }
    layout = fitPass(brandSize, titleSize, lineSize, captionSize, footerSize, qrFinal);
  }

  while (layout.contentH > h - pad * 2 && layout.cappedDetails.length > 0) {
    layout.cappedDetails.pop();
    layout = fitPass(brandSize, titleSize, lineSize, captionSize, footerSize, qrFinal);
  }

  const contentH = Math.min(layout.contentH, h - pad * 2);
  const cx = Math.round(w / 2);
  let cursor = Math.max(pad, Math.round((h - contentH) / 2));
  const { gapSm, gapMd } = layout;
  const els: string[] = [];
  const pushText = (
    rows: string[],
    size: number,
    weight: "700" | "400",
    fill: string,
    lead: number,
  ) => {
    rows.forEach((row, i) => {
      cursor += i === 0 ? size : size + lead;
      els.push(
        `<text x="${cx}" y="${cursor}" text-anchor="middle" font-size="${size}" font-weight="${weight}" font-family="${font}" fill="${fill}">${escapeXml(row)}</text>`,
      );
    });
  };

  if (layout.brandRows.length > 0) {
    pushText(layout.brandRows, brandSize, "700", "#6b6358", 2);
    cursor += gapSm;
  }
  pushText(layout.titleRows, titleSize, "700", "#111111", Math.round(titleSize * 0.12));
  if (layout.subtitleRows.length > 0) {
    cursor += gapSm;
    pushText(layout.subtitleRows, lineSize, "400", "#333333", Math.round(lineSize * 0.25));
  }
  if (layout.cappedDetails.length > 0) {
    cursor += gapSm;
    pushText(layout.cappedDetails, lineSize, "400", "#111111", Math.round(lineSize * 0.25));
  }
  if (hasQr) {
    cursor += gapMd;
    els.push(
      `<image href="${opts.qrDataUri}" x="${Math.round(cx - qrFinal / 2)}" y="${cursor}" width="${qrFinal}" height="${qrFinal}" />`,
    );
    cursor += qrFinal;
  }
  if (layout.captionRows.length > 0) {
    cursor += gapSm;
    pushText(layout.captionRows, captionSize, "400", "#111111", Math.round(captionSize * 0.2));
  }
  if (layout.cappedFooter.length > 0) {
    cursor += gapMd;
    pushText(layout.cappedFooter, footerSize, "400", "#333333", Math.round(footerSize * 0.45));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${els.join("\n  ")}
</svg>`;
}

async function pdfBufferFromDoc(
  widthInches: number,
  heightInches: number,
  draw: (doc: PDFKit.PDFDocument) => void | Promise<void>,
): Promise<Buffer> {
  const widthPt = widthInches * PT_PER_INCH;
  const heightPt = heightInches * PT_PER_INCH;
  const doc = new PDFDocument({
    size: [widthPt, heightPt],
    margin: 0,
    autoFirstPage: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  await draw(doc);
  doc.end();
  return done;
}

/** Rasterize SVG at exact pixel size for Windows spooler / Brady driver. */
async function svgToPng(svg: string, widthPx: number, heightPx: number): Promise<Buffer | null> {
  // Prefer @resvg/resvg-js — works in Alpine ECS without Playwright browsers.
  // Alpine images must ship fonts (font-dejavu); without them Resvg draws QR
  // images but silently omits all <text> glyphs.
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, {
      background: "white",
      fitTo: { mode: "width", value: Math.max(1, widthPx) },
      font: {
        loadSystemFonts: true,
        defaultFontFamily: "DejaVu Sans",
        defaultFontSize: 16,
      },
    });
    const rendered = resvg.render();
    const png = rendered.asPng();
    if (png?.length) return Buffer.from(png);
  } catch {
    // fall through to Playwright
  }

  const playwright = await import("playwright").catch(() => null);
  if (!playwright?.chromium) return null;

  try {
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: Math.max(1, widthPx), height: Math.max(1, heightPx) },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<!doctype html><html><head><style>
          html,body{margin:0;padding:0;width:${widthPx}px;height:${heightPx}px;overflow:hidden;background:#fff}
        </style></head><body>${svg.replace(/^<\?xml[^>]*>\s*/i, "")}</body></html>`,
        { waitUntil: "load" },
      );
      const png = await page.screenshot({
        type: "png",
        omitBackground: false,
        clip: { x: 0, y: 0, width: widthPx, height: heightPx },
      });
      return Buffer.from(png);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

async function htmlToPng(
  htmlBody: string,
  widthPx: number,
  heightPx: number,
): Promise<Buffer | null> {
  const playwright = await import("playwright").catch(() => null);
  if (!playwright?.chromium) return null;
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: Math.max(1, widthPx), height: Math.max(1, heightPx) },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"/><style>
          html,body{margin:0;padding:0;width:${widthPx}px;height:${heightPx}px;overflow:hidden;background:#fff;
            font-family: DejaVu Sans, Arial, Helvetica, sans-serif; color:#111;}
          *{box-sizing:border-box;}
          img{max-width:100%;}
        </style></head><body>${htmlBody}</body></html>`,
        { waitUntil: "load" },
      );
      const png = await page.screenshot({
        type: "png",
        omitBackground: false,
        clip: { x: 0, y: 0, width: widthPx, height: heightPx },
      });
      return Buffer.from(png);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

async function htmlToPdf(
  htmlBody: string,
  widthInches: number,
  heightInches: number,
): Promise<Buffer | null> {
  const playwright = await import("playwright").catch(() => null);
  if (!playwright?.chromium) return null;
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"/><style>
          html,body{margin:0;padding:0;background:#fff;
            font-family: DejaVu Sans, Arial, Helvetica, sans-serif; color:#111;}
          *{box-sizing:border-box;}
        </style></head><body>${htmlBody}</body></html>`,
        { waitUntil: "load" },
      );
      const pdf = await page.pdf({
        width: `${widthInches}in`,
        height: `${heightInches}in`,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

@Injectable()
export class IndustrialLabelRendererService {
  async renderTestLabel(opts: TestLabelRenderOpts): Promise<LabelRenderResult> {
    const dpi = opts.dpi ?? BRADY_I4311_DPI;
    const widthInches = opts.widthInches ?? DEFAULT_WIDTH_IN;
    const heightInches = opts.heightInches ?? DEFAULT_HEIGHT_IN;
    const lines = [
      `Printer: ${opts.printerName}`,
      opts.connection ? `Connection: ${opts.connection}` : null,
      opts.bridgeName ? `Bridge: ${opts.bridgeName}` : null,
      opts.locationName ? `Location: ${opts.locationName}` : null,
      opts.divisionName ? `Division: ${opts.divisionName}` : null,
      `ID: ${opts.printerId}`,
      `DPI: ${dpi}`,
      new Date().toISOString(),
    ].filter((v): v is string => Boolean(v));

    return this.renderLabel({
      widthInches,
      heightInches,
      dpi,
      title: "FORGE PRINTER TEST",
      lines,
      qrPayload: `forge-print-test:${opts.printerId}`,
    });
  }

  async renderLabel(opts: FieldLabelRenderOpts): Promise<LabelRenderResult> {
    const dpi = opts.dpi ?? BRADY_I4311_DPI;
    const widthInches = opts.widthInches > 0 ? opts.widthInches : DEFAULT_WIDTH_IN;
    const heightInches = opts.heightInches > 0 ? opts.heightInches : DEFAULT_HEIGHT_IN;
    const title = (opts.title ?? "Forge Label").trim() || "Forge Label";
    const lines = (opts.lines ?? []).map((l) => String(l).trim()).filter(Boolean);
    const brand = opts.brand?.trim() || undefined;
    const subtitle = opts.subtitle?.trim() || undefined;
    const caption = opts.caption?.trim() || undefined;
    const footerLines = (opts.footerLines ?? []).map((l) => String(l).trim()).filter(Boolean);
    const qrPayload = opts.qrPayload?.trim() || undefined;
    const qrScale = clampScale(opts.qrScale);
    const textScale = clampScale(opts.textScale);

    let qrPng: Buffer | undefined;
    let qrDataUri: string | undefined;
    if (qrPayload) {
      const qrPx = Math.min(
        inchesToPixels(Math.min(widthInches, heightInches) * 0.48 * qrScale, dpi),
        560,
      );
      qrPng = await qrCodePngBuffer(qrPayload, Math.max(96, qrPx));
      qrDataUri = `data:image/png;base64,${qrPng.toString("base64")}`;
    }

    const previewSvg = buildPreviewSvg({
      widthInches,
      heightInches,
      dpi,
      title,
      lines,
      qrScale,
      textScale,
      ...(brand ? { brand } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(caption ? { caption } : {}),
      ...(footerLines.length > 0 ? { footerLines } : {}),
      ...(qrDataUri ? { qrDataUri } : {}),
    });

    const widthPx = inchesToPixels(widthInches, dpi);
    const heightPx = inchesToPixels(heightInches, dpi);
    const png = await svgToPng(previewSvg, widthPx, heightPx);

    if (png) {
      return {
        buffer: png,
        contentType: "image/png",
        sha256: sha256Hex(png),
        widthInches,
        heightInches,
        dpi,
        previewSvg,
        previewDataUrl: `data:image/svg+xml;base64,${Buffer.from(previewSvg, "utf8").toString("base64")}`,
      };
    }

    // Fallback when Playwright is unavailable (local/dev without browser bits).
    const buffer = await pdfBufferFromDoc(widthInches, heightInches, (doc) => {
      const pad = 10;
      const widthPt = widthInches * PT_PER_INCH;
      const heightPt = heightInches * PT_PER_INCH;
      const titleSize = 14;
      const lineSize = 9;
      const lineGap = 4;
      const blockGap = 8;
      const qrPt = qrPng ? Math.min(96, heightPt * 0.42, widthPt - pad * 2) : 0;
      const linesUse = lines.slice(0, 10);
      const textH =
        titleSize +
        (linesUse.length > 0 ? 6 + linesUse.length * (lineSize + lineGap) - lineGap : 0);
      const contentH = textH + (qrPng ? blockGap + qrPt : 0);
      let y = Math.max(pad, (heightPt - contentH) / 2);

      doc.rect(0.5, 0.5, widthPt - 1, heightPt - 1).stroke("#222222");
      doc.fillColor("#111111").font("Helvetica-Bold").fontSize(titleSize);
      doc.text(title, pad, y, {
        width: widthPt - pad * 2,
        align: "center",
        ellipsis: true,
      });
      y += titleSize + 6;
      doc.font("Helvetica").fontSize(lineSize);
      for (const line of linesUse) {
        doc.text(line, pad, y, {
          width: widthPt - pad * 2,
          align: "center",
          ellipsis: true,
        });
        y += lineSize + lineGap;
        if (y > heightPt - pad) break;
      }
      if (qrPng) {
        const qrX = (widthPt - qrPt) / 2;
        doc.image(qrPng, qrX, y + blockGap - lineGap, { width: qrPt, height: qrPt });
      }
    });

    return {
      buffer,
      contentType: "application/pdf",
      sha256: sha256Hex(buffer),
      widthInches,
      heightInches,
      dpi,
      previewSvg,
      previewDataUrl: `data:image/svg+xml;base64,${Buffer.from(previewSvg, "utf8").toString("base64")}`,
    };
  }

  /**
   * Phase 5 ELEMENTS layout — positioned text / QR / barcode at true label size.
   */
  async renderElementsLabel(opts: {
    widthInches: number;
    heightInches: number;
    dpi?: number;
    elements: LabelElement[];
    fieldValues: Record<string, string>;
  }): Promise<LabelRenderResult> {
    const dpi = opts.dpi ?? BRADY_I4311_DPI;
    const widthInches = opts.widthInches > 0 ? opts.widthInches : DEFAULT_WIDTH_IN;
    const heightInches = opts.heightInches > 0 ? opts.heightInches : DEFAULT_HEIGHT_IN;
    const widthPx = inchesToPixels(widthInches, dpi);
    const heightPx = inchesToPixels(heightInches, dpi);
    const values = opts.fieldValues ?? {};

    const els: string[] = [];
    for (const el of opts.elements) {
      const x = inchesToPixels(el.x, dpi);
      const y = inchesToPixels(el.y, dpi);
      const w = inchesToPixels(el.width, dpi);
      const h = inchesToPixels(el.height, dpi);
      const content = resolveElementContent(el, values);
      const type = el.type.toLowerCase();

      if (type === "rectangle") {
        const stroke = Math.max(1, Math.round(((el.strokeWidthPt ?? 1) * dpi) / 72));
        if (el.fill) {
          els.push(
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#111111"/>`,
          );
        } else {
          els.push(
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111111" stroke-width="${stroke}"/>`,
          );
        }
        continue;
      }

      if (type === "line") {
        const stroke = Math.max(1, Math.round(((el.strokeWidthPt ?? 1) * dpi) / 72));
        els.push(
          `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="#111111" stroke-width="${stroke}"/>`,
        );
        continue;
      }

      if (type === "qr") {
        if (!content.trim()) continue;
        try {
          const png = await qrCodePngBuffer(content, Math.max(32, Math.min(w, h)));
          const dataUri = `data:image/png;base64,${png.toString("base64")}`;
          const size = Math.min(w, h);
          els.push(
            `<image href="${dataUri}" x="${x}" y="${y}" width="${size}" height="${size}" />`,
          );
        } catch {
          els.push(
            `<rect x="${x}" y="${y}" width="${Math.min(w, h)}" height="${Math.min(w, h)}" fill="none" stroke="#999" stroke-dasharray="4 2"/>`,
          );
        }
        continue;
      }

      if (type === "barcode") {
        if (!content.trim()) continue;
        try {
          const png = await code128PngBuffer(content, {
            widthPx: Math.max(40, w),
            heightPx: Math.max(20, h),
            showText: el.showHumanReadable !== false,
          });
          const dataUri = `data:image/png;base64,${png.toString("base64")}`;
          els.push(`<image href="${dataUri}" x="${x}" y="${y}" width="${w}" height="${h}" />`);
        } catch {
          const svgInner = code128Svg(content, {
            widthPx: Math.max(40, w),
            heightPx: Math.max(20, h),
            showText: el.showHumanReadable !== false,
          }).replace(/^<\?xml[^>]*>\s*/i, "");
          els.push(`<svg x="${x}" y="${y}" width="${w}" height="${h}">${svgInner}</svg>`);
        }
        continue;
      }

      // text / dynamicText
      const fontPx = Math.max(8, Math.round(((el.fontSizePt ?? 12) * dpi) / 72));
      const weight = el.fontWeight === "bold" ? "700" : "400";
      const anchor =
        el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
      const tx =
        el.align === "center" ? x + w / 2 : el.align === "right" ? x + w : x;
      const lines = wrapText(content, w, fontPx, el.fontWeight === "bold");
      let ty = y + fontPx;
      for (const line of lines) {
        if (ty > y + h + fontPx) break;
        els.push(
          `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontPx}" font-weight="${weight}" fill="#111111">${escapeXml(line)}</text>`,
        );
        ty += Math.round(fontPx * 1.25);
      }
    }

    const previewSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="0.5" y="0.5" width="${widthPx - 1}" height="${heightPx - 1}" fill="none" stroke="#dddddd" stroke-width="1"/>
  ${els.join("\n  ")}
</svg>`;

    const png = await svgToPng(previewSvg, widthPx, heightPx);
    if (png) {
      return {
        buffer: png,
        contentType: "image/png",
        sha256: sha256Hex(png),
        widthInches,
        heightInches,
        dpi,
        previewSvg,
        previewDataUrl: `data:image/svg+xml;base64,${Buffer.from(previewSvg, "utf8").toString("base64")}`,
      };
    }

    const qrEl = opts.elements.find((e) => e.type === "qr");
    const qrPayload = qrEl ? resolveElementContent(qrEl, values) : "";
    return this.renderLabel({
      widthInches,
      heightInches,
      dpi,
      title: values.title || "Forge Label",
      lines: opts.elements
        .filter((e) => e.type === "text" || e.type === "dynamicText")
        .map((e) => resolveElementContent(e, values))
        .filter(Boolean)
        .slice(0, 10),
      ...(qrPayload.trim() ? { qrPayload: qrPayload.trim() } : {}),
    });
  }

  /**
   * HTML template → PNG (preferred for Brady) or PDF.
   * Falls back to text extraction + field label renderer when Playwright is unavailable.
   */
  async renderHtmlTemplate(opts: {
    html: string;
    widthInches: number;
    heightInches: number;
    dpi?: number;
    output?: "png" | "pdf";
  }): Promise<LabelRenderResult> {
    const dpi = opts.dpi ?? BRADY_I4311_DPI;
    const widthInches = opts.widthInches > 0 ? opts.widthInches : DEFAULT_WIDTH_IN;
    const heightInches = opts.heightInches > 0 ? opts.heightInches : DEFAULT_HEIGHT_IN;
    const output = opts.output ?? "png";
    const html = String(opts.html ?? "");
    const widthPx = inchesToPixels(widthInches, dpi);
    const heightPx = inchesToPixels(heightInches, dpi);

    if (output === "pdf") {
      const pdf = await htmlToPdf(html, widthInches, heightInches);
      if (pdf) {
        return {
          buffer: pdf,
          contentType: "application/pdf",
          sha256: sha256Hex(pdf),
          widthInches,
          heightInches,
          dpi,
          previewSvg: "",
          previewDataUrl: `data:application/pdf;base64,${pdf.toString("base64")}`,
        };
      }
    } else {
      const png = await htmlToPng(html, widthPx, heightPx);
      if (png) {
        return {
          buffer: png,
          contentType: "image/png",
          sha256: sha256Hex(png),
          widthInches,
          heightInches,
          dpi,
          previewSvg: "",
          previewDataUrl: `data:image/png;base64,${png.toString("base64")}`,
        };
      }
    }

    const text = stripHtmlFallback(html);
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] || "Forge Label";
    const rest = lines.slice(1, 13);
    return this.renderLabel({
      widthInches,
      heightInches,
      dpi,
      title,
      lines: rest,
    });
  }

  async renderPreviewBase64(opts: FieldLabelRenderOpts): Promise<{
    contentType: "image/png" | "application/pdf";
    base64: string;
    previewDataUrl: string;
    sha256: string;
    widthInches: number;
    heightInches: number;
    dpi: number;
  }> {
    const rendered = await this.renderLabel(opts);
    return {
      contentType: rendered.contentType,
      base64: rendered.buffer.toString("base64"),
      previewDataUrl: rendered.previewDataUrl,
      sha256: rendered.sha256,
      widthInches: rendered.widthInches,
      heightInches: rendered.heightInches,
      dpi: rendered.dpi,
    };
  }
}

function stripHtmlFallback(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export { inchesToPixels, BRADY_I4311_DPI, DEFAULT_WIDTH_IN, DEFAULT_HEIGHT_IN };
