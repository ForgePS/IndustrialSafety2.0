import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED = [
  "industrial_sites",
  "industrial_loto_libraries",
  "industrial_loto_procedures",
  "industrial_loto_records",
  "industrial_loto_steps",
  "industrial_corrective_actions",
  "industrial_fleet_vehicles",
  "industrial_fleet_drivers",
  "industrial_workers_comp_cases",
  "industrial_workers_comp_medical_encounters",
  "industrial_scan_qr_codes",
  "industrial_qr_link_scan_events",
  "industrial_attachments",
  "qr_links",
  "platform_documents",
  "industrial_migration_id_map",
  "industrial_observations",
  "industrial_jsas",
];

describe("0040_industrial_domain_s1", () => {
  it("defines required industrial tables with FORCE RLS and WC medical gate", () => {
    const sqlPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../drizzle/0040_industrial_domain_s1.sql",
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)?.length).toBeGreaterThanOrEqual(50);
    for (const table of REQUIRED) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("app.industrial_wc_medical_access");
    expect(sql).toContain('"vin"');
    expect(sql).toContain("ownership_scope");
  });
});
