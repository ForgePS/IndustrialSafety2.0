/**
 * Schema dry-validation of aws-import package against tip industrial DDL expectations.
 * Does not write Aurora.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Tables created in 0040_industrial_domain_s1.sql (authoritative tip targets). */
export const INDUSTRIAL_DDL_TABLES = [
  "industrial_sites",
  "industrial_departments",
  "industrial_personnel",
  "industrial_equipment",
  "industrial_loto_libraries",
  "industrial_loto_procedures",
  "industrial_loto_energy_sources",
  "industrial_loto_isolation_points",
  "industrial_loto_steps",
  "industrial_loto_procedure_revisions",
  "industrial_loto_records",
  "industrial_corrective_actions",
  "industrial_incidents",
  "industrial_inspections",
  "industrial_observations",
  "industrial_jsas",
  "industrial_form_definitions",
  "industrial_form_submissions",
  "industrial_training_records",
  "industrial_certificate_templates",
  "industrial_tasks",
  "industrial_emergency_response_records",
  "industrial_chemical_safety_records",
  "industrial_confined_space_records",
  "industrial_hot_work_records",
  "industrial_contractor_safety_records",
  "industrial_cranes_rigging_records",
  "industrial_electrical_safety_records",
  "industrial_environmental_safety_records",
  "industrial_forklift_records",
  "industrial_machine_safety_records",
  "industrial_manufacturing_safety_records",
  "industrial_process_safety_records",
  "industrial_warehouse_safety_records",
  "industrial_working_at_heights_records",
  "industrial_dot_compliance_records",
  "industrial_osha_cases",
  "industrial_fleet_vehicles",
  "industrial_fleet_drivers",
  "industrial_fleet_driver_settings",
  "industrial_workers_comp_cases",
  "industrial_workers_comp_carriers",
  "industrial_workers_comp_work_status_periods",
  "industrial_workers_comp_restrictions",
  "industrial_workers_comp_medical_encounters",
  "qr_links",
  "qr_link_versions",
  "industrial_scan_qr_codes",
  "industrial_scan_assignments",
  "industrial_scan_check_schedules",
  "industrial_qr_link_scan_events",
  "industrial_scan_audit_logs",
  "platform_documents",
  "platform_document_versions",
  "industrial_equipment_document_links",
  "industrial_attachments",
  "platform_ehs_audit_templates",
  "platform_ehs_audit_template_versions",
  "industrial_migration_id_map",
  "industrial_history_records",
] as const;

const PLATFORM_OR_IDENTITY = new Set([
  "tenants",
  "users",
  "users+memberships",
  "platform_settings",
]);

export type DryValidationResult = {
  ok: boolean;
  packageDir: string;
  sourceDocuments: number;
  transformedRecords: number;
  unknownTargets: string[];
  missingTables: string[];
  targetMissing: string[];
  dispositionCounts: Record<string, number>;
};

export function dryValidateImportPackage(packageDir: string): DryValidationResult {
  const awsImport = path.join(packageDir, "aws-import");
  const manifestPath = path.join(awsImport, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    sourceDocumentCount: number;
    transformedRecordCount: number;
    recordCounts: Record<string, number>;
    targetSchemaGaps?: string[];
  };

  const unknownTargets: string[] = [];
  const dispositionCounts: Record<string, number> = {
    AURORA_OPERATIONAL: 0,
    AURORA_HISTORY: 0,
    S3_ARCHIVE: 0,
    PLATFORM_GLOBAL: 0,
    EXCLUDE_APPROVED: 0,
  };

  for (const [entity, count] of Object.entries(manifest.recordCounts ?? {})) {
    if (entity.startsWith("excluded/")) {
      dispositionCounts.EXCLUDE_APPROVED += count;
      continue;
    }
    if (entity.startsWith("archive/") || entity === "industrial_history_records") {
      dispositionCounts.AURORA_HISTORY += count;
      continue;
    }
    if (
      entity.startsWith("platform_ehs_") ||
      entity === "platform_settings" ||
      entity.startsWith("PLATFORM")
    ) {
      dispositionCounts.PLATFORM_GLOBAL += count;
      continue;
    }
    if (PLATFORM_OR_IDENTITY.has(entity) || entity === "industrial_attachments") {
      dispositionCounts.AURORA_OPERATIONAL += count;
      continue;
    }
    if ((INDUSTRIAL_DDL_TABLES as readonly string[]).includes(entity)) {
      dispositionCounts.AURORA_OPERATIONAL += count;
      continue;
    }
    // history-ish operational tables still in aurora
    if (entity.startsWith("industrial_") || entity.startsWith("qr_")) {
      dispositionCounts.AURORA_OPERATIONAL += count;
      continue;
    }
    unknownTargets.push(entity);
  }

  const ddlText = (() => {
    const candidates = [
      path.resolve(
        packageDir,
        "../../../../packages/database/drizzle/0040_industrial_domain_s1.sql",
      ),
      path.resolve(packageDir, "../../../packages/database/drizzle/0040_industrial_domain_s1.sql"),
      path.resolve(process.cwd(), "packages/database/drizzle/0040_industrial_domain_s1.sql"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return readFileSync(c, "utf8");
    }
    return "";
  })();

  const missingTables = INDUSTRIAL_DDL_TABLES.filter((t) => !ddlText.includes(`"${t}"`));

  const result: DryValidationResult = {
    ok:
      unknownTargets.length === 0 &&
      missingTables.length === 0 &&
      (manifest.targetSchemaGaps?.length ?? 0) === 0 &&
      manifest.sourceDocumentCount === manifest.transformedRecordCount,
    packageDir,
    sourceDocuments: manifest.sourceDocumentCount,
    transformedRecords: manifest.transformedRecordCount,
    unknownTargets,
    missingTables,
    targetMissing: manifest.targetSchemaGaps ?? [],
    dispositionCounts,
  };

  writeFileSync(
    path.join(packageDir, "dry-validation.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

export function listPackageEntities(packageDir: string): string[] {
  const awsImport = path.join(packageDir, "aws-import");
  return readdirSync(awsImport).filter((f) => f.endsWith(".ndjson"));
}
