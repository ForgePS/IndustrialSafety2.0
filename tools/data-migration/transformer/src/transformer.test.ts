import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeFirestoreValue } from "./firestore-types.js";
import {
  SOURCE_TARGET_MATRIX,
  assertMatrixComplete,
  MATRIX_BY_COLLECTION,
} from "./source-target-matrix.js";
import { resolveAwsTenant, AUTHORITATIVE_CUSTOMER_AWS_TENANT } from "./tenant-map.js";
import { runTransform } from "./transform.js";

const ROOT_80 = [
  "activityLogs",
  "assetRecords",
  "auth_audit_logs",
  "certificate_image_library",
  "certificate_templates",
  "chemicalSafetyRecords",
  "companyVehicleDriverSettings",
  "companyVehicleDrivers",
  "confinedSpaceRecords",
  "content_overrides",
  "contractorSafetyRecords",
  "controlledDocuments",
  "conversations",
  "correctiveActionRecords",
  "cranesRiggingRecords",
  "departments",
  "documentAccessEvents",
  "dotComplianceRecords",
  "ehsAuditTemplateVersions",
  "ehsAuditTemplates",
  "electricalSafetyRecords",
  "emergencyResponseRecords",
  "environmentalSafetyRecords",
  "equipmentDocuments",
  "equipmentMigrationBatches",
  "forkliftRecords",
  "formSubmissions",
  "formTemplates",
  "hotWorkRecords",
  "incidents",
  "inspectionRecords",
  "inspectionTemplates",
  "lotoLibraries",
  "lotoProcedures",
  "lotoRecords",
  "machineSafetyRecords",
  "manufacturingSafetyRecords",
  "messages",
  "organization_users",
  "organizations",
  "oshaCases",
  "personnelRecords",
  "personnelRosterImportSettings",
  "platformAiAssistantLogs",
  "platformBillingEmailTemplates",
  "platformBillingNotifications",
  "platformBillingOutbox",
  "platformBusinesses",
  "platformFeedback",
  "platformInvoiceTemplates",
  "platformInvoices",
  "platformNotificationOutbox",
  "platformSettings",
  "platformUsers",
  "processSafetyRecords",
  "qr_link_audit_events",
  "qr_link_scan_events",
  "qr_link_versions",
  "qr_links",
  "scan_assignments",
  "scan_audit_logs",
  "scan_check_schedules",
  "scan_qr_codes",
  "sites",
  "super_admins",
  "taskRecords",
  "training_audit_logs",
  "training_courses",
  "training_enrollments",
  "training_import_jobs",
  "warehouseSafetyRecords",
  "workersCompAuditEvents",
  "workersCompCarriers",
  "workersCompCases",
  "workersCompDocuments",
  "workersCompImportJobs",
  "workersCompMedicalEncounters",
  "workersCompRestrictions",
  "workersCompWorkStatusPeriods",
  "workingAtHeightsRecords",
];

describe("SOURCE_TARGET_MATRIX", () => {
  it("covers all 80 root collections with zero UNKNOWN", () => {
    expect(SOURCE_TARGET_MATRIX).toHaveLength(80);
    expect(assertMatrixComplete(ROOT_80)).toEqual([]);
    for (const c of ROOT_80) {
      expect(MATRIX_BY_COLLECTION.has(c)).toBe(true);
    }
  });
});

describe("FIRESTORE_TYPE_NORMALIZE", () => {
  it("unwraps Timestamp GeoPoint DocumentReference Bytes Integer Double", () => {
    expect(
      normalizeFirestoreValue({ __firestoreType: "Timestamp", value: "2024-01-01T00:00:00.000Z" }),
    ).toEqual({
      type: "timestamp",
      value: "2024-01-01T00:00:00.000Z",
    });
    expect(
      normalizeFirestoreValue({ __firestoreType: "GeoPoint", latitude: 1, longitude: 2 }),
    ).toEqual({ type: "geopoint", latitude: 1, longitude: 2 });
    expect(
      normalizeFirestoreValue({ __firestoreType: "DocumentReference", path: "sites/a" }),
    ).toEqual({
      type: "document_reference",
      path: "sites/a",
    });
    expect(
      normalizeFirestoreValue({ __firestoreType: "Bytes", encoding: "base64", value: "aGVsbG8=" }),
    ).toEqual({ type: "bytes", encoding: "base64", value: "aGVsbG8=" });
    expect(normalizeFirestoreValue({ __firestoreType: "Integer", value: 7 })).toBe(7);
    expect(normalizeFirestoreValue({ __firestoreType: "Double", value: 1.5 })).toBe(1.5);
    expect(normalizeFirestoreValue(null)).toBeNull();
    expect(normalizeFirestoreValue([true, { __firestoreType: "Integer", value: 1 }])).toEqual([
      true,
      1,
    ]);
  });
});

describe("TENANT_MAPPING", () => {
  it("maps customer and approved legacy alias to one AWS tenant", () => {
    const c = resolveAwsTenant("business-1782553339499");
    expect(c.unknown).toBe(false);
    expect(c.binding?.awsTenantId).toBe(AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantId);
    const alias = resolveAwsTenant("Producers Rice Mill");
    expect(alias.unknown).toBe(false);
    expect(alias.binding?.awsTenantId).toBe(AUTHORITATIVE_CUSTOMER_AWS_TENANT.awsTenantId);
    expect(resolveAwsTenant("GLOBAL").binding?.classification).toBe("GLOBAL_TEMPLATE");
    expect(resolveAwsTenant("mystery-tenant").unknown).toBe(true);
  });
});

describe("TRANSFORM_PACKAGE", () => {
  it("builds deterministic aws-import package without mutating source", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dm-s2-xform-"));
    const input = path.join(root, "source");
    const output = path.join(root, "out");
    mkdirSync(path.join(input, "firestore"), { recursive: true });
    writeFileSync(
      path.join(input, "manifest.json"),
      JSON.stringify({ runId: "test-source", rootCollections: 2 }),
    );
    const site = {
      _migration: {
        sourceSystem: "FIRESTORE",
        collection: "sites",
        documentId: "site-1",
        documentPath: "sites/site-1",
        sourceTenantKey: "business-1782553339499",
        canonicalTenantKey: "business-1782553339499",
        tenantClassification: "CUSTOMER",
        documentCreateTime: "2024-01-01T00:00:00.000Z",
        documentUpdateTime: "2024-01-02T00:00:00.000Z",
      },
      data: {
        name: "Plant",
        organizationId: "business-1782553339499",
        createdAt: { __firestoreType: "Timestamp", value: "2024-01-01T00:00:00.000Z" },
      },
    };
    const incident = {
      _migration: {
        sourceSystem: "FIRESTORE",
        collection: "incidents",
        documentId: "inc-1",
        documentPath: "incidents/inc-1",
        sourceTenantKey: "business-1782553339499",
        canonicalTenantKey: "business-1782553339499",
        tenantClassification: "CUSTOMER",
      },
      data: { siteId: "site-1", title: "Spill" },
    };
    writeFileSync(path.join(input, "firestore", "sites.ndjson"), `${JSON.stringify(site)}\n`);
    writeFileSync(
      path.join(input, "firestore", "incidents.ndjson"),
      `${JSON.stringify(incident)}\n`,
    );

    const result = await runTransform({
      inputDir: input,
      outputDir: output,
      migrationRunId: "run-test-1",
      gitSha: "deadbeef",
      customerOnly: false,
    });

    // Subset of extract files is fine; matrix must cover every present collection.
    expect(result.unknownMappings).toEqual([]);
    expect(result.gates.UNKNOWN_TARGET).toBe(0);
    expect(result.gates.UNKNOWN_TENANT).toBe(0);
    expect(result.transformedRecordCount).toBe(2);
    const manifest = JSON.parse(
      readFileSync(path.join(output, "aws-import", "manifest.json"), "utf8"),
    );
    expect(manifest.awsImport).toBe("NOT_RUN");
    expect(manifest.toolVersion).toBeTruthy();
    expect(readFileSync(path.join(input, "firestore", "sites.ndjson"), "utf8")).toContain("site-1");
  });
});
