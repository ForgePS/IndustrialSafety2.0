/**
 * PDF rendering of a single sanitation inspection (pdfkit; the API image has no
 * headless browser, so the printable HTML cannot be converted directly).
 */
import PDFDocument from "pdfkit";

export type SanitationPdfQuestion = { id: string; label: string; section?: string };

export type SanitationPdfInput = {
  inspection: Record<string, unknown>;
  findings: Array<Record<string, unknown>>;
  questions?: SanitationPdfQuestion[];
  companyName?: string | null;
  siteName?: string | null;
  locationName?: string | null;
  logo?: Buffer | null;
  timeZone?: string;
  generatedAt?: Date;
};

const MARGIN = 40;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN - 20;
const MAX_PHOTOS = 30;

const RESULT_LABELS: Record<string, string> = {
  PASS: "Pass",
  YES: "Yes",
  NO: "No",
  FAIL: "Fail",
  NA: "N/A",
  "N/A": "N/A",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
};

function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/** Standard PDF fonts only cover WinAnsi; drop astral-plane characters (emoji). */
export function pdfSafeText(value: string): string {
  return value.replace(/[\u{10000}-\u{10FFFF}]/gu, "").replace(/\uFFFD/g, "-");
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function formatPdfDateTime(value: unknown, timeZone = "America/Chicago"): string {
  const raw = plain(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatResult(value: unknown): string {
  const raw = plain(value).toUpperCase();
  return RESULT_LABELS[raw] ?? (raw ? plain(value) : "Not answered");
}

/** PNG/JPEG data URLs only; pdfkit cannot embed other image formats. */
export function decodeImageDataUrl(value: unknown): Buffer | null {
  const raw = plain(value);
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!match?.[2]) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return buffer.length > 0 ? buffer : null;
}

type ResponseEntry = Record<string, unknown>;

export type SanitationPdfRow = {
  section: string;
  label: string;
  result: string;
  notes: string;
  photos: Buffer[];
  unsupportedPhotos: number;
};

/** Checklist rows in template order, followed by any answers not in the template. */
export function sanitationPdfRows(
  responsesRaw: unknown,
  questions: SanitationPdfQuestion[] = [],
): SanitationPdfRow[] {
  const responses =
    responsesRaw && typeof responsesRaw === "object" && !Array.isArray(responsesRaw)
      ? (responsesRaw as Record<string, unknown>)
      : {};
  const entryFor = (id: string): ResponseEntry => {
    const raw = responses[id];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as ResponseEntry;
    return raw == null ? {} : { result: raw };
  };
  const toRow = (id: string, label: string, section: string): SanitationPdfRow => {
    const entry = entryFor(id);
    const photos: Buffer[] = [];
    let unsupportedPhotos = 0;
    const photoSources = Array.isArray(entry.photos) ? entry.photos : [];
    for (const photo of photoSources) {
      const rec = (photo ?? {}) as Record<string, unknown>;
      const image = decodeImageDataUrl(rec.dataUrl);
      if (image) photos.push(image);
      else if (plain(rec.dataUrl)) unsupportedPhotos += 1;
    }
    const legacy = decodeImageDataUrl(entry.photoDataUrl);
    if (legacy) photos.push(legacy);
    const notes = [plain(entry.notes) || plain(entry.comments), plain(entry.photoNote)]
      .filter(Boolean)
      .join("\n");
    return {
      section,
      label: plain(entry.label) || label || id,
      result: formatResult(entry.result ?? entry.answer ?? entry.status),
      notes,
      photos,
      unsupportedPhotos,
    };
  };

  const seen = new Set<string>();
  const rows: SanitationPdfRow[] = [];
  for (const q of questions) {
    seen.add(q.id);
    rows.push(toRow(q.id, q.label, q.section ?? ""));
  }
  for (const id of Object.keys(responses)) {
    if (seen.has(id)) continue;
    rows.push(toRow(id, "", ""));
  }
  return rows;
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > BOTTOM) doc.addPage();
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(pdfSafeText(text), MARGIN);
  const y = doc.y + 2;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor("#9ca3af").stroke();
  doc.y = y + 6;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  widths: number[],
  rows: string[][],
  options: { highlight?: (row: string[]) => string | null } = {},
) {
  const pad = 4;
  const drawHeader = () => {
    doc.font("Helvetica-Bold").fontSize(8.5);
    const height =
      Math.max(...headers.map((h, i) => doc.heightOfString(h, { width: widths[i]! - pad * 2 }))) +
      pad * 2;
    let x = MARGIN;
    const y = doc.y;
    headers.forEach((h, i) => {
      doc.rect(x, y, widths[i]!, height).fillAndStroke("#f3f4f6", "#d1d5db");
      doc.fillColor("#111827").text(h, x + pad, y + pad, { width: widths[i]! - pad * 2 });
      x += widths[i]!;
    });
    doc.y = y + height;
  };

  if (!rows.length) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6b7280").text("No records.", MARGIN);
    doc.moveDown(0.4);
    return;
  }

  ensureSpace(doc, 40);
  drawHeader();
  for (const row of rows) {
    doc.font("Helvetica").fontSize(8.5);
    const cells = row.map((c) => pdfSafeText(c || "-"));
    const height =
      Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i]! - pad * 2 }))) +
      pad * 2;
    if (doc.y + height > BOTTOM) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(8.5);
    }
    const fill = options.highlight?.(row) ?? null;
    let x = MARGIN;
    const y = doc.y;
    cells.forEach((c, i) => {
      if (fill) doc.rect(x, y, widths[i]!, height).fillAndStroke(fill, "#d1d5db");
      else doc.rect(x, y, widths[i]!, height).lineWidth(0.5).stroke("#d1d5db");
      doc.fillColor("#111827").text(c, x + pad, y + pad, { width: widths[i]! - pad * 2 });
      x += widths[i]!;
    });
    doc.y = y + height;
  }
  doc.x = MARGIN;
  doc.moveDown(0.4);
}

function metaBlock(doc: PDFKit.PDFDocument, items: Array<[string, string]>) {
  const filtered = items.filter(([, v]) => v.trim() !== "");
  const colWidth = CONTENT_WIDTH / 2;
  for (let i = 0; i < filtered.length; i += 2) {
    const pair = filtered.slice(i, i + 2);
    doc.font("Helvetica").fontSize(9);
    const height =
      Math.max(
        ...pair.map(([, v]) => doc.heightOfString(pdfSafeText(v), { width: colWidth - 10 })),
      ) + 12;
    ensureSpace(doc, height);
    const y = doc.y;
    pair.forEach(([label, value], j) => {
      const x = MARGIN + j * colWidth;
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b7280").text(label.toUpperCase(), x, y, {
        width: colWidth - 10,
      });
      doc.font("Helvetica").fontSize(9).fillColor("#111827").text(pdfSafeText(value), x, y + 10, {
        width: colWidth - 10,
      });
    });
    doc.y = y + height;
  }
  doc.x = MARGIN;
}

function resultFill(row: string[]): string | null {
  const result = (row[1] ?? "").toUpperCase();
  if (["NO", "FAIL", "MINOR", "MAJOR", "CRITICAL"].includes(result)) return "#fef2f2";
  return null;
}

export async function buildSanitationInspectionPdf(input: SanitationPdfInput): Promise<Buffer> {
  const { inspection, findings } = input;
  const timeZone = input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : "America/Chicago";
  const title =
    plain(inspection.title) || plain(inspection.inspectionNumber) || "Sanitation inspection";
  const doc = new PDFDocument({
    size: "LETTER",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: pdfSafeText(title), Author: pdfSafeText(plain(input.companyName) || "Forge") },
  });
  const done = collectPdf(doc);

  let headerTextX = MARGIN;
  if (input.logo) {
    try {
      doc.image(input.logo, MARGIN, MARGIN, { fit: [120, 44] });
      headerTextX = MARGIN + 132;
    } catch {
      headerTextX = MARGIN;
    }
  }
  const headerWidth = MARGIN + CONTENT_WIDTH - headerTextX;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6b7280");
  doc.text("SANITATION INSPECTION REPORT", headerTextX, MARGIN, { width: headerWidth });
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827");
  doc.text(pdfSafeText(title), headerTextX, doc.y + 2, { width: headerWidth });
  if (plain(input.companyName)) {
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    doc.text(pdfSafeText(plain(input.companyName)), headerTextX, doc.y + 2, { width: headerWidth });
  }
  doc.y = Math.max(doc.y, MARGIN + 48) + 10;
  doc.x = MARGIN;

  const compliance = plain(inspection.complianceStatus).replace(/_/g, " ");
  const score = plain(inspection.scorePercent);
  metaBlock(doc, [
    ["Inspection #", plain(inspection.inspectionNumber)],
    ["Status", plain(inspection.status).replace(/_/g, " ")],
    ["Location", plain(input.siteName)],
    ["Area / place", plain(input.locationName)],
    ["Type", plain(inspection.inspectionType)],
    ["Compliance", compliance],
    ["Score", score ? `${Math.round(Number(score))}%` : ""],
    ["Highest severity", plain(inspection.severityMax)],
    ["Started", formatPdfDateTime(inspection.startedAt, timeZone)],
    ["Completed", formatPdfDateTime(inspection.completedAt, timeZone)],
    ["Shift", plain(inspection.shift)],
    ["Product line", plain(inspection.productLine)],
  ]);
  if (plain(inspection.notes)) {
    ensureSpace(doc, 30);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#6b7280").text("NOTES", MARGIN);
    doc.font("Helvetica").fontSize(9).fillColor("#111827").text(pdfSafeText(plain(inspection.notes)), MARGIN, doc.y + 1, {
      width: CONTENT_WIDTH,
    });
  }

  const rows = sanitationPdfRows(inspection.responsesJson, input.questions);
  const counts = rows.reduce(
    (acc, r) => {
      const key = r.result.toUpperCase();
      if (key === "PASS" || key === "YES") acc.pass += 1;
      else if (key === "N/A") acc.na += 1;
      else if (key === "NOT ANSWERED") acc.blank += 1;
      else acc.fail += 1;
      return acc;
    },
    { pass: 0, fail: 0, na: 0, blank: 0 },
  );
  sectionHeading(
    doc,
    `Checklist (${rows.length} items: ${counts.pass} pass, ${counts.fail} fail, ${counts.na} N/A${
      counts.blank ? `, ${counts.blank} not answered` : ""
    })`,
  );
  const hasSections = rows.some((r) => r.section);
  const tableRows = rows.map((r) => {
    const photoCount = r.photos.length + r.unsupportedPhotos;
    const notes = [r.notes, photoCount ? `${photoCount} photo(s)` : ""].filter(Boolean).join("\n");
    return hasSections ? [r.label, r.result, notes, r.section] : [r.label, r.result, notes];
  });
  if (hasSections) {
    drawTable(doc, ["Item", "Result", "Notes", "Section"], [222, 56, 154, 100], tableRows, {
      highlight: resultFill,
    });
  } else {
    drawTable(doc, ["Item", "Result", "Notes"], [262, 60, 210], tableRows, { highlight: resultFill });
  }

  sectionHeading(doc, `Findings (${findings.length})`);
  drawTable(
    doc,
    ["Number", "Severity", "Title", "Status", "Recurring"],
    [80, 62, 250, 70, 70],
    findings.map((f) => [
      plain(f.findingNumber),
      plain(f.severity),
      plain(f.title),
      plain(f.status).replace(/_/g, " "),
      f.isRecurring ? `Yes (${plain(f.recurrenceCount) || "?"})` : "No",
    ]),
  );

  const photoRows = rows.filter((r) => r.photos.length > 0);
  if (photoRows.length) {
    sectionHeading(doc, "Photo evidence");
    let embedded = 0;
    for (const row of photoRows) {
      for (const photo of row.photos) {
        if (embedded >= MAX_PHOTOS) break;
        ensureSpace(doc, 210);
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(pdfSafeText(row.label), MARGIN);
        const y = doc.y + 3;
        try {
          doc.image(photo, MARGIN, y, { fit: [260, 190] });
          doc.y = y + 196;
        } catch {
          doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#6b7280").text("Photo could not be embedded.", MARGIN, y);
        }
        doc.x = MARGIN;
        embedded += 1;
      }
    }
    const total = photoRows.reduce((sum, r) => sum + r.photos.length, 0);
    if (total > embedded) {
      doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#6b7280");
      doc.text(`${total - embedded} more photo(s) are available in Forge.`, MARGIN);
    }
  }

  const signatures = Array.isArray(inspection.signaturesJson) ? inspection.signaturesJson : [];
  sectionHeading(doc, "Signatures");
  if (!signatures.length) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6b7280").text("No signatures recorded.", MARGIN);
  }
  for (const sig of signatures) {
    const rec = (sig ?? {}) as Record<string, unknown>;
    const value = plain(rec.value);
    const role = plain(rec.type).replace(/_/g, " ");
    const name = plain(rec.name);
    const label = [role ? role.charAt(0) + role.slice(1).toLowerCase() : "Signature", name]
      .filter(Boolean)
      .join(": ");
    const signedAt = formatPdfDateTime(rec.signedAt, timeZone);
    ensureSpace(doc, 90);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text(pdfSafeText(label), MARGIN);
    if (signedAt) {
      doc.font("Helvetica").fontSize(8.5).fillColor("#6b7280").text(`Signed ${signedAt}`, MARGIN);
    }
    const image = decodeImageDataUrl(value);
    if (image) {
      const y = doc.y + 3;
      try {
        doc.image(image, MARGIN, y, { fit: [220, 64] });
        doc.y = y + 70;
      } catch {
        doc.font("Helvetica-Oblique").fontSize(8.5).text("Signature image could not be embedded.", MARGIN, y);
      }
    } else if (value) {
      const typed = value.startsWith("typed:") ? value.slice(6) : value;
      doc.font("Helvetica-Oblique").fontSize(13).fillColor("#111827").text(pdfSafeText(typed), MARGIN, doc.y + 4);
    }
    doc.x = MARGIN;
    doc.moveDown(0.6);
  }

  const generated = formatPdfDateTime((input.generatedAt ?? new Date()).toISOString(), timeZone);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise make pdfkit add a page.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7.5).fillColor("#6b7280");
    doc.text(
      `${pdfSafeText(plain(inspection.inspectionNumber) || title)}  |  Generated ${generated}  |  Page ${
        i - range.start + 1
      } of ${range.count}`,
      MARGIN,
      PAGE_HEIGHT - MARGIN + 6,
      { width: CONTENT_WIDTH, align: "center", lineBreak: false },
    );
  }

  doc.end();
  return done;
}

export function sanitationPdfFilename(inspection: Record<string, unknown>): string {
  const base =
    plain(inspection.inspectionNumber) || plain(inspection.title) || "sanitation-inspection";
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe || "sanitation-inspection"}.pdf`;
}
