import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("0065_industrial_qr_scan_s1", () => {
  it("extends qr_links, scan events, audit events, and tenant token lookup", () => {
    const sqlPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../drizzle/0065_industrial_qr_scan_s1.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain('ALTER TABLE "qr_links"');
    expect(sql).toContain('"display_code"');
    expect(sql).toContain('"access_mode"');
    expect(sql).toContain('"action_config"');
    expect(sql).toContain('"scan_count"');
    expect(sql).toContain("qr_links_token_hash_uidx");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "industrial_qr_link_audit_events"');
    expect(sql).toContain("forge_industrial_qr_link_tenant_for_token");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  });
});
