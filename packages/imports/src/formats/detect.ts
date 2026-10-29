import { createHash } from "node:crypto";
import type { DetectedFileMeta } from "../interfaces.js";
import type { ImportFormat } from "../types.js";

export type FormatDetectionResult =
  { ok: true; meta: DetectedFileMeta } | { ok: false; code: string; message: string };

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extensionOf(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function guessFormat(fileName: string, contentType?: string): ImportFormat | null {
  const ext = extensionOf(fileName);
  if (ext === "csv" || contentType?.includes("csv")) return "csv";
  if (ext === "xlsx" || contentType?.includes("spreadsheetml")) return "xlsx";
  if (ext === "json" || contentType?.includes("json")) return "json";
  if (ext === "xls") return null;
  return null;
}

function detectCsv(bytes: Uint8Array, _fileName: string): FormatDetectionResult {
  const sample = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256 * 1024))).toString(
    "utf8",
  );
  if (sample.includes("\u0000")) {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "CSV contains binary null bytes" };
  }
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "CSV has no header row" };
  }
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ",";
  const headers = firstLine.split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));
  if (headers.length < 1 || headers.every((h) => !h)) {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "CSV headers are empty" };
  }
  return {
    ok: true,
    meta: {
      format: "csv",
      encoding: "utf-8",
      delimiter,
      headers,
      byteSize: bytes.length,
      contentHash: sha256Hex(bytes),
    },
  };
}

function detectJson(bytes: Uint8Array): FormatDetectionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "JSON is not valid UTF-8 JSON" };
  }
  if (parsed === null || typeof parsed !== "object") {
    return {
      ok: false,
      code: "IMPORT_FORMAT_INVALID",
      message: "JSON root must be an object or array",
    };
  }
  let headers: string[] | undefined;
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "JSON array is empty" };
    }
    const first = parsed[0];
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      return {
        ok: false,
        code: "IMPORT_FORMAT_INVALID",
        message: "JSON array items must be objects",
      };
    }
    headers = Object.keys(first as Record<string, unknown>);
  } else if (
    "records" in (parsed as object) &&
    Array.isArray((parsed as { records: unknown }).records)
  ) {
    const records = (parsed as { records: unknown[] }).records;
    const first = records[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      headers = Object.keys(first as Record<string, unknown>);
    }
  }
  return {
    ok: true,
    meta: {
      format: "json",
      encoding: "utf-8",
      ...(headers ? { headers } : {}),
      byteSize: bytes.length,
      contentHash: sha256Hex(bytes),
    },
  };
}

function listZipEntries(bytes: Uint8Array): string[] {
  const names: string[] = [];
  const buf = Buffer.from(bytes);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf8");
    names.push(name);
    offset = nameStart + nameLen + extraLen + compSize;
  }
  if (names.length === 0) {
    // Fall back to central directory scan for stored+deflated listings.
    let i = 0;
    while (i + 46 < buf.length) {
      const sig = buf.readUInt32LE(i);
      if (sig === 0x02014b50) {
        const nameLen = buf.readUInt16LE(i + 28);
        const extraLen = buf.readUInt16LE(i + 30);
        const commentLen = buf.readUInt16LE(i + 32);
        const name = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
        names.push(name);
        i += 46 + nameLen + extraLen + commentLen;
        continue;
      }
      i += 1;
    }
  }
  return names;
}

function detectXlsx(bytes: Uint8Array): FormatDetectionResult {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "XLSX must be a ZIP package" };
  }
  const entries = listZipEntries(bytes);
  const lower = entries.map((e) => e.toLowerCase());
  const hasContentTypes = lower.some((e) => e === "[content_types].xml");
  const hasWorkbook = lower.some((e) => e === "xl/workbook.xml" || e.endsWith("/xl/workbook.xml"));
  if (!hasContentTypes || !hasWorkbook) {
    return {
      ok: false,
      code: "IMPORT_FORMAT_INVALID",
      message: "XLSX package is missing workbook structure",
    };
  }
  const sheets = entries
    .filter((e) => /xl\/worksheets\/sheet\d+\.xml$/i.test(e))
    .map((e) => e.replace(/^.*\//, ""))
    .sort();
  return {
    ok: true,
    meta: {
      format: "xlsx",
      sheets: sheets.length > 0 ? sheets : ["sheet1.xml"],
      byteSize: bytes.length,
      contentHash: sha256Hex(bytes),
    },
  };
}

/** Structure-only detectors — no business-row import. */
export function detectImportFormat(input: {
  bytes: Uint8Array;
  fileName: string;
  contentType?: string;
  expectedFormat?: ImportFormat | null;
}): FormatDetectionResult {
  if (input.bytes.length === 0) {
    return { ok: false, code: "IMPORT_FORMAT_INVALID", message: "Uploaded object is empty" };
  }
  const guessed = guessFormat(input.fileName, input.contentType);
  const format = input.expectedFormat ?? guessed;
  if (!format || format === "zip" || format === "api") {
    return {
      ok: false,
      code: "IMPORT_FORMAT_UNSUPPORTED",
      message: "Only csv, xlsx, and json uploads are supported in Sprint S3",
    };
  }
  if (guessed && input.expectedFormat && guessed !== input.expectedFormat) {
    return {
      ok: false,
      code: "IMPORT_FORMAT_MISMATCH",
      message: `Declared format '${input.expectedFormat}' does not match detected '${guessed}'`,
    };
  }
  switch (format) {
    case "csv":
      return detectCsv(input.bytes, input.fileName);
    case "json":
      return detectJson(input.bytes);
    case "xlsx":
      return detectXlsx(input.bytes);
    default:
      return {
        ok: false,
        code: "IMPORT_FORMAT_UNSUPPORTED",
        message: `Format '${format}' is not supported in Sprint S3`,
      };
  }
}
