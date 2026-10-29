import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, "../drizzle/0022_import_platform.sql");

describe("0022 import platform migration artifact", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("is additive and enables FORCE RLS on all import tables", () => {
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    const tables = [
      "import_jobs",
      "import_files",
      "import_profiles",
      "import_column_mappings",
      "import_rows",
      "import_row_errors",
      "import_duplicate_candidates",
      "import_batches",
      "import_rollback_events",
    ];
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(
        `WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)`,
      );
    }
  });

  it("includes required audit and retention columns", () => {
    for (const col of [
      "created_by",
      "updated_by",
      "version",
      "retention_delete_at",
      "correlation_id",
      "idempotency_key",
      "source_hash",
    ]) {
      expect(sql).toContain(`"${col}"`);
    }
    expect(sql).toContain("contains_sensitive");
    expect(sql).toContain("raw_s3_key");
    expect(sql).toContain("operation_key");
    expect(sql).toContain("import_rows_mapped_size_check");
  });

  it("encodes canonical job status enum", () => {
    for (const status of [
      "UPLOADED",
      "SCAN_FAILED",
      "READY_FOR_MAPPING",
      "COMPLETED_WITH_ERRORS",
      "ROLLBACK_REFUSED",
      "CANCELLED",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("has stable checksum helper", () => {
    const checksum = createHash("sha256").update(sql).digest("hex");
    expect(checksum).toHaveLength(64);
  });
});
