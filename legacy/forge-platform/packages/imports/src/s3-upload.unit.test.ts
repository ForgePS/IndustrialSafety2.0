import { describe, expect, it } from "vitest";
import {
  detectImportFormat,
  initImportUploadSchema,
  nextStatusForS3Action,
  S3_INITIAL_UPLOAD_JOB_STATUS,
} from "./index.js";

describe("import S3 format detection", () => {
  it("detects CSV headers and delimiter", () => {
    const bytes = new TextEncoder().encode("name,email\nAda,ada@example.com\n");
    const result = detectImportFormat({ bytes, fileName: "people.csv", contentType: "text/csv" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.format).toBe("csv");
      expect(result.meta.headers).toEqual(["name", "email"]);
      expect(result.meta.delimiter).toBe(",");
      expect(result.meta.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("detects JSON object arrays", () => {
    const bytes = new TextEncoder().encode(JSON.stringify([{ id: "1", label: "A" }]));
    const result = detectImportFormat({
      bytes,
      fileName: "rows.json",
      contentType: "application/json",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.format).toBe("json");
      expect(result.meta.headers).toEqual(["id", "label"]);
    }
  });

  it("rejects invalid JSON", () => {
    const bytes = new TextEncoder().encode("{not-json");
    const result = detectImportFormat({ bytes, fileName: "bad.json" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("IMPORT_FORMAT_INVALID");
  });

  it("detects XLSX ZIP structure", () => {
    // Minimal ZIP local headers for [Content_Types].xml and xl/workbook.xml (store method).
    function zipStore(name: string, content: string): Buffer {
      const nameBuf = Buffer.from(name, "utf8");
      const data = Buffer.from(content, "utf8");
      const local = Buffer.alloc(30 + nameBuf.length + data.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(0, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);
      nameBuf.copy(local, 30);
      data.copy(local, 30 + nameBuf.length);
      return local;
    }
    const bytes = Buffer.concat([
      zipStore("[Content_Types].xml", "<Types/>"),
      zipStore("xl/workbook.xml", "<workbook/>"),
      zipStore("xl/worksheets/sheet1.xml", "<worksheet/>"),
    ]);
    const result = detectImportFormat({
      bytes,
      fileName: "book.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.format).toBe("xlsx");
      expect(result.meta.sheets).toContain("sheet1.xml");
    }
  });
});

describe("import S3 upload dto and state", () => {
  it("starts upload jobs in UPLOADED and transitions after malware SCANNING", () => {
    expect(S3_INITIAL_UPLOAD_JOB_STATUS).toBe("UPLOADED");
    expect(nextStatusForS3Action("upload_complete", "UPLOADED")).toBe("UPLOADED");
    expect(nextStatusForS3Action("detection_pass", "SCANNING")).toBe("READY_FOR_MAPPING");
    expect(nextStatusForS3Action("detection_fail", "SCANNING")).toBe("VALIDATION_FAILED");
  });

  it("accepts a valid init upload payload", () => {
    const parsed = initImportUploadSchema.parse({
      productKey: "FORGE_RMS",
      moduleKey: "CORE",
      recordCategory: "generic_record",
      displayName: "Upload",
      fileName: "people.csv",
      contentType: "text/csv",
      byteSize: 128,
      format: "csv",
    });
    expect(parsed.uploadMode).toBeUndefined();
    expect(parsed.byteSize).toBe(128);
  });
});
