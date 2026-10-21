import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import type { ReportColumn, ReportRow } from "./reporting-adapters.js";

const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_CONTENT_TYPE = "application/pdf";

function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowsToCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCsvCell(row[c.key])).join(","),
  );
  return [header, ...body].join("\r\n");
}

export function rowsToXlsxBase64(columns: ReportColumn[], rows: ReportRow[]): string {
  const sheetRows = [
    columns.map((c) => c.label),
    ...rows.map((row) => columns.map((c) => (row[c.key] == null ? "" : row[c.key]))),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buffer.toString("base64");
}

export async function rowsToPdfBase64(
  title: string,
  columns: ReportColumn[],
  rows: ReportRow[],
): Promise<string> {
  const doc = new PDFDocument({ margin: 40, size: "LETTER" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(14).text(title, { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(9);

  const colWidth = Math.max(60, Math.floor(520 / Math.max(columns.length, 1)));
  const headerY = doc.y;
  columns.forEach((col, i) => {
    doc.text(col.label, 40 + i * colWidth, headerY, {
      width: colWidth - 4,
      continued: false,
    });
  });
  doc.moveDown(0.75);
  doc.moveTo(40, doc.y).lineTo(560, doc.y).stroke();
  doc.moveDown(0.35);

  for (const row of rows.slice(0, 200)) {
    const y = doc.y;
    if (y > 720) {
      doc.addPage();
    }
    const rowY = doc.y;
    columns.forEach((col, i) => {
      const value = row[col.key];
      doc.text(value == null ? "" : String(value), 40 + i * colWidth, rowY, {
        width: colWidth - 4,
        continued: false,
      });
    });
    doc.moveDown(0.55);
  }

  if (rows.length > 200) {
    doc.moveDown(0.5);
    doc.text(`… ${rows.length - 200} additional rows omitted from PDF preview.`);
  }

  doc.end();
  const buffer = await done;
  return buffer.toString("base64");
}

export function contentTypeForFormat(format: "csv" | "xlsx" | "pdf"): string {
  switch (format) {
    case "csv":
      return CSV_CONTENT_TYPE;
    case "xlsx":
      return XLSX_CONTENT_TYPE;
    case "pdf":
      return PDF_CONTENT_TYPE;
  }
}

export function filenameForExport(reportKey: string, format: "csv" | "xlsx" | "pdf"): string {
  const safe = reportKey.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "report";
  return `${safe}.${format}`;
}
