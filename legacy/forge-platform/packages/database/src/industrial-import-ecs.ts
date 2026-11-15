/**
 * ECS-runnable industrial Aurora importer (CONTROLLED-AURORA-IMPORT-S1).
 *
 * Env:
 *   DATABASE_SECRET_ARN          admin forge-production-secrets-database (refuse database-app)
 *   FORGE_IMPORT_PACKAGE_S3_URI  s3://bucket/prefix to aws-import/ contents or parent
 *   FORGE_IMPORT_AUTHORIZED=true required
 *   FORGE_IMPORT_TENANT_ID       must be producers UUID
 *   FORGE_IMPORT_RUN_ID          optional; generated if missing
 *   FORGE_IMPORT_MODE            dry-run|apply (default dry-run)
 *   FORGE_IMPORT_GIT_SHA         optional provenance
 *
 * Command: node /app/packages/database/dist/industrial-import-ecs.js
 */
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { buildDatabaseUrl, resolveDatabaseSecret } from "@forge/environment";
import postgres from "postgres";
import { createId } from "./ids.js";
import {
  AUTHORIZED_TENANT_IDS,
  PACKAGE_TENANT_ID,
  PRODUCTION_TENANT_ID,
  classifySkipReason,
  deterministicTargetId,
  indexLogicalId,
  isUuid,
  normalizePackageTenantId,
  resolveLiveTenantId,
  resolveMappedId,
  storageKeyFromAttachmentData,
  promoteStorageKeyForLiveTenant,
  unwrapValue,
  type IdMapIndex,
} from "./industrial-import-helpers.js";

type SqlClient = ReturnType<typeof postgres>;

/**
 * Package UUID from DM-S2 twin mapping (development IND-11B prod-twin).
 * Production Aurora already has slug producers-rice-mill under a different UUID.
 */
const PACKAGE_DIR = "/tmp/import-package";
const BATCH_SIZE = 100;

type ImportMode = "dry-run" | "apply";

type SourceMeta = {
  system?: string;
  collection?: string;
  documentPath?: string;
  documentId?: string;
  tenantKey?: string;
  createTime?: string;
  updateTime?: string;
};

type ImportRecord = {
  targetEntity?: string;
  targetId?: string;
  awsTenantId?: string | null;
  awsTenantKey?: string | null;
  source?: SourceMeta;
  disposition?: string;
  implementationStatus?: string;
  migrationRunId?: string;
  data?: Record<string, unknown>;
};

type IdMapRecord = {
  sourceSystem?: string;
  sourceCollection?: string;
  sourceDocumentPath?: string;
  sourceDocumentId?: string;
  sourceTenantKey?: string | null;
  targetEntity?: string;
  targetId?: string;
  awsTenantId?: string | null;
  migrationRunId?: string;
};

type EntityCounts = {
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

type ColumnInfo = {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  columnDefault: string | null;
};

type S3ClientLike = {
  send: (command: unknown) => Promise<{
    Contents?: Array<{ Key?: string }>;
    IsTruncated?: boolean;
    NextContinuationToken?: string;
    Body?: {
      transformToByteArray?: () => Promise<Uint8Array>;
      transformToString?: (encoding: string) => Promise<string>;
    };
  }>;
};

type S3Sdk = {
  S3Client: new (config?: { region?: string }) => S3ClientLike;
  ListObjectsV2Command: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
};

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(2);
}

function loadS3Sdk(): S3Sdk {
  const candidates = [
    "/app/apps/platform-api/package.json",
    path.resolve(process.cwd(), "apps/platform-api/package.json"),
    path.resolve(process.cwd(), "../../apps/platform-api/package.json"),
  ];
  for (const pkg of candidates) {
    try {
      const req = createRequire(pkg);
      return {
        S3Client: req("@aws-sdk/client-s3").S3Client,
        ListObjectsV2Command: req("@aws-sdk/client-s3").ListObjectsV2Command,
        GetObjectCommand: req("@aws-sdk/client-s3").GetObjectCommand,
      };
    } catch {
      // try next
    }
  }
  fail("Unable to load @aws-sdk/client-s3 (expected via platform-api node_modules)");
}

async function resolveAdminDatabaseUrl(): Promise<string> {
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) fail("DATABASE_SECRET_ARN required");
  if (arn.includes("database-app")) {
    fail("Refusing app secret (database-app) for industrial import");
  }
  if (!arn.includes("forge-production-secrets-database")) {
    fail("DATABASE_SECRET_ARN must be admin forge-production-secrets-database");
  }
  const region = process.env.AWS_REGION || "us-east-1";
  const fields = await resolveDatabaseSecret(arn, region);
  if (!fields) fail("Failed to resolve database secret");
  return buildDatabaseUrl(fields);
}

function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(uri.trim());
  if (!m) fail(`Invalid FORGE_IMPORT_PACKAGE_S3_URI: ${uri}`);
  return { bucket: m[1]!, prefix: (m[2] ?? "").replace(/^\/+|\/+$/g, "") };
}

async function downloadImportPackage(s3Uri: string): Promise<string> {
  const { bucket, prefix } = parseS3Uri(s3Uri);
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = loadS3Sdk();
  const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

  await rm(PACKAGE_DIR, { recursive: true, force: true });
  await mkdir(PACKAGE_DIR, { recursive: true });

  // Accept either .../aws-import or parent containing aws-import/
  const prefixes = prefix.endsWith("aws-import")
    ? [prefix]
    : [`${prefix}/aws-import`.replace(/\/+/g, "/"), prefix];

  let keys: string[] = [];
  let usedPrefix = prefixes[0]!;
  for (const p of prefixes) {
    keys = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: p ? `${p.replace(/\/?$/, "/")}` : "",
          ContinuationToken: token,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith("/")) continue;
        const base = obj.Key.split("/").pop() ?? "";
        if (base === "manifest.json" || base.endsWith(".ndjson")) {
          keys.push(obj.Key);
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (keys.some((k) => k.endsWith("manifest.json"))) {
      usedPrefix = p;
      break;
    }
  }

  if (!keys.some((k) => k.endsWith("manifest.json"))) {
    fail(`No manifest.json under s3://${bucket}/${usedPrefix}`);
  }

  for (const key of keys) {
    const base = key.split("/").pop()!;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const dest = path.join(PACKAGE_DIR, base);
    if (res.Body && typeof (res.Body as { pipe?: unknown }).pipe === "function") {
      await pipeline(res.Body as Readable, createWriteStream(dest));
    } else if (res.Body?.transformToByteArray) {
      const bytes = await res.Body.transformToByteArray();
      await writeFile(dest, Buffer.from(bytes));
    } else {
      fail(`Empty S3 body for ${key}`);
    }
  }

  return PACKAGE_DIR;
}

function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function normalizeStatus(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "active") return "ACTIVE";
  if (lower === "archived" || lower === "inactive") return "ARCHIVED";
  if (lower === "published") return "PUBLISHED";
  if (lower === "draft") return "DRAFT";
  return s.length <= 64 ? s.toUpperCase() : s.slice(0, 64).toUpperCase();
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}

async function loadColumns(sql: SqlClient, table: string): Promise<ColumnInfo[] | null> {
  const rows = await sql`
    select
      column_name as name,
      data_type as "dataType",
      udt_name as "udtName",
      is_nullable as "isNullable",
      column_default as "columnDefault"
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position
  `;
  if (!rows.length) return null;
  return rows.map((r) => ({
    name: String(r.name),
    dataType: String(r.dataType),
    udtName: String(r.udtName),
    isNullable: String(r.isNullable) === "YES",
    columnDefault: r.columnDefault == null ? null : String(r.columnDefault),
  }));
}

function coerceForColumn(col: ColumnInfo, value: unknown): unknown {
  if (value == null) return null;
  const unwrapped = unwrapValue(value);
  if (unwrapped == null) return null;

  if (col.udtName === "uuid") {
    return isUuid(unwrapped) ? String(unwrapped) : undefined;
  }
  if (col.udtName === "bool" || col.dataType === "boolean") {
    if (typeof unwrapped === "boolean") return unwrapped;
    if (unwrapped === "true" || unwrapped === "false") return unwrapped === "true";
    return undefined;
  }
  if (col.udtName === "int4" || col.udtName === "int8" || col.udtName === "int2") {
    const n = Number(unwrapped);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }
  if (col.udtName === "numeric" || col.udtName === "float8" || col.udtName === "float4") {
    const n = Number(unwrapped);
    return Number.isFinite(n) ? n : undefined;
  }
  if (col.udtName === "jsonb" || col.udtName === "json") {
    return typeof unwrapped === "string" ? unwrapped : JSON.stringify(unwrapped);
  }
  if (col.dataType.includes("timestamp") || col.udtName === "date") {
    const s = String(unwrapped);
    return s || undefined;
  }
  if (typeof unwrapped === "object") {
    return JSON.stringify(unwrapped);
  }
  return unwrapped;
}

function buildRow(
  table: string,
  columns: ColumnInfo[],
  record: ImportRecord,
  authorizedTenantId: string,
  idMap: IdMapIndex,
): { row: Record<string, unknown>; skipReason?: string; ensureDocument?: Record<string, unknown> } {
  const colSet = new Map(columns.map((c) => [c.name, c]));
  const data = record.data ?? {};
  const source = record.source ?? {};
  const isPlatformGlobal =
    table.startsWith("platform_ehs_") ||
    record.disposition === "GLOBAL" ||
    record.awsTenantKey === "GLOBAL";

  const normalizedTenant = normalizePackageTenantId(record.awsTenantId, authorizedTenantId);
  if (normalizedTenant && normalizedTenant !== authorizedTenantId && !isPlatformGlobal) {
    return { row: {}, skipReason: "tenant_mismatch" };
  }

  if (table === "industrial_fleet_vehicles") {
    const vin = unwrapValue(data.vin ?? data.VIN);
    const make = unwrapValue(data.make ?? data.Make);
    if (!vin && !make) {
      return { row: {}, skipReason: "fabricated_fleet_vehicle" };
    }
  }

  const row: Record<string, unknown> = {};
  if (!record.targetId || !isUuid(record.targetId)) {
    return { row: {}, skipReason: "invalid_target_id" };
  }
  row.id = record.targetId;

  if (colSet.has("tenant_id")) {
    if (isPlatformGlobal) {
      row.tenant_id = null;
    } else if (normalizedTenant) {
      row.tenant_id = authorizedTenantId;
    } else if (!colSet.get("tenant_id")!.isNullable) {
      return { row: {}, skipReason: "missing_tenant" };
    } else {
      row.tenant_id = null;
    }
  }

  if (colSet.has("ownership_scope") && isPlatformGlobal) {
    row.ownership_scope = "PLATFORM_GLOBAL";
  }

  if (colSet.has("source_system")) {
    row.source_system = source.system ?? "FIREBASE";
  }
  if (colSet.has("source_project")) {
    row.source_project = source.tenantKey ?? null;
  }
  if (colSet.has("source_collection")) {
    row.source_collection = source.collection ?? null;
  }
  if (colSet.has("source_document_id")) {
    row.source_document_id = source.documentId ?? null;
  }
  if (colSet.has("source_path")) {
    row.source_path = source.documentPath ?? null;
  }
  if (colSet.has("source_payload")) {
    row.source_payload = JSON.stringify({
      ...data,
      _import: {
        disposition: record.disposition,
        implementationStatus: record.implementationStatus,
        awsTenantKey: record.awsTenantKey,
        migrationRunId: record.migrationRunId,
      },
    });
  }

  const aliases: Record<string, string[]> = {
    name: ["name", "title", "label", "displayName", "templateName", "equipmentName"],
    title: ["title", "name", "label", "displayTitle"],
    label: ["label", "name", "title"],
    status: ["status"],
    display_name: ["displayName", "name", "fullName"],
    first_name: ["firstName", "first_name"],
    last_name: ["lastName", "last_name"],
    email: ["email"],
    employee_number: ["employeeNumber", "employee_number"],
    equipment_number: ["equipmentNumber", "equipment_number", "assetTag"],
    equipment_type: ["equipmentType", "equipment_type", "type", "category"],
    site_key: ["siteKey", "site_key", "siteCode"],
    history_domain: ["historyDomain", "module", "domain"],
    template_json: ["templateJson", "template", "sections"],
    restricted_payload: ["restrictedPayload"],
    metadata: ["metadata"],
    category: ["category"],
    provider: ["provider"],
    diagnosis: ["diagnosis"],
    treatment: ["treatment"],
    appointment_date: ["appointmentDate"],
    case_id: ["caseId", "case_id"],
    site_id: ["siteId", "site_id", "locationId", "location_id"],
    department_id: ["departmentId", "department_id"],
    template_id: ["templateId", "template_id"],
    version_number: ["versionNumber", "version"],
    document_id: ["documentId", "document_id", "publicDocumentId"],
    equipment_id: [
      "equipmentId",
      "equipment_id",
      "assetId",
      "systemEquipmentId",
      "externalEquipmentId",
    ],
    qr_link_id: ["qrLinkId", "qr_link_id", "linkId"],
    parent_entity_type: ["parentEntityType", "sourceType", "parentType", "entityType"],
    parent_entity_id: ["parentEntityId", "sourceId", "parentId", "entityId"],
    entity_type: ["entityType", "entity_type", "parentEntityType", "sourceType"],
    entity_id: ["entityId", "entity_id", "parentEntityId", "sourceId"],
    vin: ["vin", "VIN"],
    make: ["make", "Make"],
    model: ["model"],
    content_type: ["contentType", "fileType", "mimeType"],
    file_name: ["fileName", "name"],
    original_filename: ["originalFilename", "fileName", "name", "sanitizedFilename"],
  };

  const fkCollections: Record<string, string[]> = {
    case_id: ["industrial_workers_comp_cases", "workersCompCases", "workers_comp_cases"],
    qr_link_id: ["qr_links", "qrLinks"],
    template_id: [
      "platform_ehs_audit_templates",
      "ehsAuditTemplates",
      "industrial_form_definitions",
    ],
    site_id: ["industrial_sites", "sites"],
    department_id: ["industrial_departments", "departments"],
    equipment_id: ["industrial_equipment", "equipment", "assets"],
    parent_entity_id: [],
    entity_id: [],
    document_id: ["platform_documents", "documents", "controlledDocuments", "equipmentDocuments"],
  };

  for (const [colName, keys] of Object.entries(aliases)) {
    const col = colSet.get(colName);
    if (!col || row[colName] !== undefined) continue;
    for (const key of keys) {
      if (data[key] === undefined) continue;
      let coerced = coerceForColumn(col, data[key]);
      if (col.udtName === "uuid" && (coerced === undefined || !isUuid(String(coerced)))) {
        const mapped = resolveMappedId(idMap, data[key], fkCollections[colName] ?? []);
        if (mapped) coerced = mapped;
      }
      if (colName === "status") coerced = normalizeStatus(data[key]) ?? coerced;
      if (colName === "parent_entity_type" && coerced != null) {
        coerced = String(coerced).toLowerCase();
      }
      if (coerced !== undefined) {
        row[colName] = coerced;
        break;
      }
    }
  }

  // Direct snake_case / camelCase pass for remaining simple scalars
  for (const [key, raw] of Object.entries(data)) {
    const snake = camelToSnake(key);
    const col = colSet.get(snake);
    if (!col || row[snake] !== undefined) continue;
    if (
      [
        "id",
        "tenant_id",
        "source_system",
        "source_project",
        "source_collection",
        "source_document_id",
        "source_path",
        "source_payload",
        "ownership_scope",
        "created_at",
        "updated_at",
      ].includes(snake)
    ) {
      continue;
    }
    let coerced = coerceForColumn(col, raw);
    if (col.udtName === "uuid" && (coerced === undefined || !isUuid(String(coerced ?? "")))) {
      const mapped = resolveMappedId(idMap, raw, fkCollections[snake] ?? []);
      if (mapped) coerced = mapped;
    }
    if (coerced !== undefined) row[snake] = coerced;
  }

  if (colSet.has("storage_key") && row.storage_key == null) {
    row.storage_key = promoteStorageKeyForLiveTenant(
      storageKeyFromAttachmentData(data, record.targetId),
      authorizedTenantId,
    );
  }

  let ensureDocument: Record<string, unknown> | undefined;
  // Equipment document links embed publicDocumentId that is not a separate package
  // platform_documents row. Derive a stable document UUID and ensure a stub exists.
  if (table === "industrial_equipment_document_links" && !isUuid(row.document_id)) {
    const publicDocId = unwrapValue(data.publicDocumentId ?? data.documentId);
    if (typeof publicDocId === "string" && publicDocId) {
      const mapped =
        resolveMappedId(idMap, publicDocId, [
          "platform_documents",
          "documents",
          "controlledDocuments",
          "equipmentDocuments",
        ]) ?? deterministicTargetId("equipmentDocuments", publicDocId);
      row.document_id = mapped;
      indexLogicalId(idMap, "platform_documents", publicDocId, mapped);
      ensureDocument = {
        id: mapped,
        tenant_id: authorizedTenantId,
        name: String(
          unwrapValue(data.title) ?? unwrapValue(data.sanitizedFilename) ?? publicDocId,
        ).slice(0, 300),
        status: "ACTIVE",
        category: "equipment_document",
        source_system: "FIREBASE",
        source_collection: "equipmentDocuments",
        source_document_id: publicDocId,
        source_payload: JSON.stringify({
          publicDocumentId: publicDocId,
          storagePath: unwrapValue(data.storagePath ?? data.sourceStoragePath) ?? null,
          contentType: unwrapValue(data.contentType) ?? null,
          byteSize: unwrapValue(data.byteSize) ?? null,
        }),
      };
    }
  }

  // Required / defaulted columns — always materialize status when absent so
  // batched inserts cannot borrow a sibling row's column list and NULL it out.
  for (const col of columns) {
    if (row[col.name] !== undefined && row[col.name] !== null) continue;
    if (col.name === "status") {
      row.status = normalizeStatus(data.status) ?? "ACTIVE";
      continue;
    }
    if (col.isNullable || col.columnDefault != null) continue;
    if (col.name === "id") continue;
    if (col.name === "name" || col.name === "display_name" || col.name === "title") {
      row[col.name] =
        unwrapValue(data.name) ??
        unwrapValue(data.equipmentName) ??
        unwrapValue(data.title) ??
        unwrapValue(data.displayName) ??
        unwrapValue(data.displayTitle) ??
        unwrapValue(data.label) ??
        `imported-${String(record.targetId).slice(0, 8)}`;
      continue;
    }
    if (col.name === "parent_entity_type") {
      row.parent_entity_type = String(
        unwrapValue(data.sourceType) ?? unwrapValue(data.parentEntityType) ?? "imported",
      ).toLowerCase();
      continue;
    }
    if (col.name === "entity_type") {
      row.entity_type = String(
        unwrapValue(data.entityType) ??
          unwrapValue(data.parentEntityType) ??
          unwrapValue(data.sourceType) ??
          "attachment",
      ).toLowerCase();
      continue;
    }
    if (col.name === "original_filename") {
      row.original_filename = String(
        unwrapValue(data.originalFilename) ??
          unwrapValue(data.fileName) ??
          unwrapValue(data.name) ??
          unwrapValue(data.sanitizedFilename) ??
          "file",
      ).slice(0, 255);
      continue;
    }
    if (col.name === "history_domain") {
      row.history_domain = String(
        unwrapValue(data.module) ?? unwrapValue(data.historyDomain) ?? "imported",
      );
      continue;
    }
    if (
      col.name === "template_json" ||
      col.name === "metadata" ||
      col.name === "restricted_payload"
    ) {
      row[col.name] = JSON.stringify(data);
      continue;
    }
    if (col.name === "storage_key") {
      row.storage_key = promoteStorageKeyForLiveTenant(
        storageKeyFromAttachmentData(data, record.targetId),
        authorizedTenantId,
      );
      continue;
    }
    if (col.udtName === "jsonb") {
      row[col.name] = "{}";
      continue;
    }
    // Required UUID FK unresolved → skip (out-of-scope parent / mapping gap)
    if (col.udtName === "uuid") {
      return { row: {}, skipReason: `missing_required_fk:${col.name}` };
    }
  }

  // Never stamp producers tenant onto platform-global EHS rows
  if (isPlatformGlobal && colSet.has("tenant_id")) {
    row.tenant_id = null;
  }

  return { row, ...(ensureDocument ? { ensureDocument } : {}) };
}

async function upsertBatch(
  sql: SqlClient,
  table: string,
  columns: ColumnInfo[],
  rows: Array<Record<string, unknown>>,
  mode: ImportMode,
): Promise<{ inserted: number; updated: number; errors: Array<{ id: string; error: string }> }> {
  const inserted = { n: 0 };
  const updated = { n: 0 };
  const errors: Array<{ id: string; error: string }> = [];
  if (!rows.length) return { inserted: 0, updated: 0, errors };

  for (const row of rows) {
    const id = String(row.id);
    try {
      if (mode === "dry-run") {
        const exists = await sql.unsafe(
          `select 1 from ${quoteIdent(table)} where id = $1::uuid limit 1`,
          [id],
        );
        if (exists.length) updated.n += 1;
        else inserted.n += 1;
        continue;
      }

      // Per-row columns — do not borrow keys from rows[0] (would NULL out missing defaults).
      const colNames = Object.keys(row).filter((c) => columns.some((col) => col.name === c));
      const hasUpdatedAt = colNames.includes("updated_at");
      const values = colNames.map((c) => row[c] ?? null) as Array<string | number | boolean | null>;
      const placeholders = colNames.map((c, i) => {
        const col = columns.find((x) => x.name === c)!;
        if (col.udtName === "uuid") return `$${i + 1}::uuid`;
        if (col.udtName === "jsonb") return `$${i + 1}::jsonb`;
        if (col.udtName === "date") return `$${i + 1}::date`;
        if (col.dataType.includes("timestamp")) return `$${i + 1}::timestamptz`;
        return `$${i + 1}`;
      });
      const updateSet = hasUpdatedAt
        ? `updated_at = now()${colNames.includes("source_payload") ? ", source_payload = excluded.source_payload" : ""}`
        : colNames.includes("source_payload")
          ? "source_payload = excluded.source_payload"
          : "id = excluded.id";

      const result = await sql.unsafe(
        `insert into ${quoteIdent(table)} (${colNames.map(quoteIdent).join(", ")})
         values (${placeholders.join(", ")})
         on conflict (id) do update set ${updateSet}
         returning (xmax = 0) as inserted`,
        values,
      );
      if (result[0] && (result[0] as { inserted?: boolean }).inserted) inserted.n += 1;
      else updated.n += 1;
    } catch (err) {
      errors.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { inserted: inserted.n, updated: updated.n, errors };
}

async function upsertIdMapRows(
  sql: SqlClient,
  mode: ImportMode,
  runId: string,
  records: Array<{
    sourceSystem: string;
    sourceCollection: string;
    sourceDocumentPath: string;
    sourceDocumentId: string;
    sourceTenantKey: string | null;
    targetEntity: string;
    targetId: string;
    awsTenantId: string | null;
  }>,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  for (const rec of records) {
    try {
      if (mode === "dry-run") {
        const exists = await sql`
          select 1 from industrial_migration_id_map
          where source_system = ${rec.sourceSystem}
            and source_collection = ${rec.sourceCollection}
            and source_document_id = ${rec.sourceDocumentId}
            and target_entity = ${rec.targetEntity}
          limit 1
        `;
        if (exists.length) skipped += 1;
        else inserted += 1;
        continue;
      }
      const result = await sql`
        insert into industrial_migration_id_map (
          id, migration_run_id, source_system, source_collection, source_document_path,
          source_document_id, source_tenant_key, target_entity, target_id, aws_tenant_id
        ) values (
          ${createId()}::uuid,
          ${runId},
          ${rec.sourceSystem},
          ${rec.sourceCollection},
          ${rec.sourceDocumentPath},
          ${rec.sourceDocumentId},
          ${rec.sourceTenantKey},
          ${rec.targetEntity},
          ${rec.targetId}::uuid,
          ${rec.awsTenantId}::uuid
        )
        on conflict (source_system, source_collection, source_document_id, target_entity)
        do nothing
        returning id
      `;
      if (result.length) inserted += 1;
      else skipped += 1;
    } catch {
      errors += 1;
    }
  }
  return { inserted, skipped, errors };
}

function entityFileSortKey(fileName: string): [number, string] {
  const entity = fileName.replace(/\.ndjson$/, "");
  if (entity.startsWith("platform_ehs_")) return [10, entity];
  if (entity === "industrial_sites") return [20, entity];
  if (entity === "industrial_departments") return [30, entity];
  if (entity === "industrial_personnel") return [40, entity];
  if (entity === "industrial_equipment") return [50, entity];
  if (entity === "industrial_history_records") return [80, entity];
  if (entity === "industrial_attachments") return [81, entity];
  if (entity.startsWith("platform_documents")) return [82, entity];
  if (entity.includes("document_link")) return [83, entity];
  if (entity === "id-map") return [90, entity];
  if (entity.startsWith("industrial_") || entity.startsWith("qr_")) return [60, entity];
  return [70, entity];
}

function shouldSkipFile(fileName: string): "excluded" | "non_import" | null {
  if (fileName.startsWith("excluded-") || fileName.startsWith("excluded/")) return "excluded";
  if (fileName === "errors.ndjson" || fileName === "manifest.json") return "non_import";
  if (
    fileName === "tenants.ndjson" ||
    fileName === "users.ndjson" ||
    fileName === "users+memberships.ndjson" ||
    fileName === "platform_settings.ndjson"
  ) {
    return "non_import";
  }
  return null;
}

async function* readNdjson(filePath: string): AsyncGenerator<unknown> {
  const { createReadStream } = await import("node:fs");
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as unknown;
  }
}

type SkipClassCounts = Record<string, number>;

function bumpSkip(counts: SkipClassCounts, reason: string | undefined): void {
  const klass = classifySkipReason(reason);
  counts[klass] = (counts[klass] ?? 0) + 1;
}

async function loadIdMapIndex(packageDir: string): Promise<IdMapIndex> {
  const bySourceId = new Map<string, string>();
  const byCollectionAndSourceId = new Map<string, string>();
  const filePath = path.join(packageDir, "id-map.ndjson");
  for await (const raw of readNdjson(filePath)) {
    const rec = raw as IdMapRecord;
    if (!rec.sourceDocumentId || !rec.targetId || !isUuid(rec.targetId)) continue;
    bySourceId.set(rec.sourceDocumentId, rec.targetId);
    if (rec.sourceCollection) {
      byCollectionAndSourceId.set(`${rec.sourceCollection}::${rec.sourceDocumentId}`, rec.targetId);
    }
    if (rec.targetEntity) {
      byCollectionAndSourceId.set(`${rec.targetEntity}::${rec.sourceDocumentId}`, rec.targetId);
    }
  }

  // Also index logical business IDs present on transformed records (e.g. forge_tmpl_*).
  const files = await readdir(packageDir);
  for (const file of files) {
    if (!file.endsWith(".ndjson") || file.startsWith("excluded") || file === "id-map.ndjson")
      continue;
    const entity = file.replace(/\.ndjson$/, "");
    for await (const raw of readNdjson(path.join(packageDir, file))) {
      const rec = raw as ImportRecord;
      if (!rec.targetId || !isUuid(rec.targetId)) continue;
      const logicalId = unwrapValue(rec.data?.id);
      if (typeof logicalId === "string" && logicalId) {
        indexLogicalId({ bySourceId, byCollectionAndSourceId }, entity, logicalId, rec.targetId);
      }
    }
  }

  return { bySourceId, byCollectionAndSourceId };
}

async function importEntityFile(
  sql: SqlClient,
  filePath: string,
  entity: string,
  mode: ImportMode,
  runId: string,
  authorizedTenantId: string,
  counts: EntityCounts,
  errors: Array<{ entity: string; id?: string; error: string }>,
  extras: {
    fabricatedVehicles: number;
    tenantMismatchFatal: number;
    wcMedicalAdmin: number;
    skipClasses: SkipClassCounts;
  },
  idMap: IdMapIndex,
): Promise<void> {
  const columns = await loadColumns(sql, entity);
  if (!columns) {
    errors.push({ entity, error: `table missing: ${entity}` });
    counts.errors += 1;
    return;
  }

  let batch: Array<Record<string, unknown>> = [];
  let docBatch: Array<Record<string, unknown>> = [];
  let mapBatch: Array<{
    sourceSystem: string;
    sourceCollection: string;
    sourceDocumentPath: string;
    sourceDocumentId: string;
    sourceTenantKey: string | null;
    targetEntity: string;
    targetId: string;
    awsTenantId: string | null;
  }> = [];

  const flush = async (): Promise<void> => {
    if (docBatch.length) {
      const docColumns = await loadColumns(sql, "platform_documents");
      if (docColumns) {
        const docResult = await upsertBatch(sql, "platform_documents", docColumns, docBatch, mode);
        for (const err of docResult.errors) {
          counts.errors += 1;
          errors.push({ entity: "platform_documents", id: err.id, error: err.error });
        }
      }
      docBatch = [];
    }
    if (!batch.length) return;
    const result = await upsertBatch(sql, entity, columns, batch, mode);
    counts.inserted += result.inserted;
    counts.updated += result.updated;
    for (const err of result.errors) {
      counts.errors += 1;
      errors.push({ entity, id: err.id, error: err.error });
    }
    if (mapBatch.length) {
      const mapResult = await upsertIdMapRows(sql, mode, runId, mapBatch);
      void mapResult;
    }
    batch = [];
    mapBatch = [];
  };

  for await (const raw of readNdjson(filePath)) {
    const record = raw as ImportRecord;
    counts.read += 1;

    const normalizedTenant = normalizePackageTenantId(record.awsTenantId, authorizedTenantId);
    if (normalizedTenant && normalizedTenant !== authorizedTenantId) {
      const isGlobal =
        entity.startsWith("platform_ehs_") ||
        record.disposition === "GLOBAL" ||
        record.awsTenantKey === "GLOBAL";
      if (!isGlobal) {
        extras.tenantMismatchFatal += 1;
        counts.errors += 1;
        errors.push({
          entity,
          ...(record.targetId ? { id: record.targetId } : {}),
          error: `tenant mismatch: ${record.awsTenantId}`,
        });
        continue;
      }
    }

    const built = buildRow(entity, columns, record, authorizedTenantId, idMap);
    if (built.skipReason === "fabricated_fleet_vehicle") {
      // Never invent fleet vehicles; fabricatedVehicles stays 0 by design.
      void extras.fabricatedVehicles;
      counts.skipped += 1;
      bumpSkip(extras.skipClasses, built.skipReason);
      continue;
    }
    if (built.skipReason === "tenant_mismatch") {
      extras.tenantMismatchFatal += 1;
      counts.errors += 1;
      bumpSkip(extras.skipClasses, built.skipReason);
      errors.push({
        entity,
        ...(record.targetId ? { id: record.targetId } : {}),
        error: `tenant mismatch: ${record.awsTenantId}`,
      });
      continue;
    }
    if (built.skipReason) {
      counts.skipped += 1;
      bumpSkip(extras.skipClasses, built.skipReason);
      continue;
    }

    if (entity === "industrial_workers_comp_medical_encounters") {
      extras.wcMedicalAdmin += 1;
    }

    if (built.ensureDocument) {
      docBatch.push(built.ensureDocument);
    }
    batch.push(built.row);
    if (record.source?.documentId && record.targetId) {
      mapBatch.push({
        sourceSystem: record.source.system ?? "FIREBASE",
        sourceCollection: record.source.collection ?? entity,
        sourceDocumentPath: record.source.documentPath ?? "",
        sourceDocumentId: record.source.documentId,
        sourceTenantKey: record.source.tenantKey ?? null,
        targetEntity: entity,
        targetId: record.targetId,
        awsTenantId: entity.startsWith("platform_ehs_")
          ? null
          : normalizePackageTenantId(record.awsTenantId, authorizedTenantId),
      });
    }

    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
}

async function importIdMapFile(
  sql: SqlClient,
  filePath: string,
  mode: ImportMode,
  runId: string,
  authorizedTenantId: string,
  counts: EntityCounts,
  errors: Array<{ entity: string; id?: string; error: string }>,
): Promise<void> {
  let batch: Array<{
    sourceSystem: string;
    sourceCollection: string;
    sourceDocumentPath: string;
    sourceDocumentId: string;
    sourceTenantKey: string | null;
    targetEntity: string;
    targetId: string;
    awsTenantId: string | null;
  }> = [];

  const flush = async (): Promise<void> => {
    if (!batch.length) return;
    const result = await upsertIdMapRows(sql, mode, runId, batch);
    counts.inserted += result.inserted;
    counts.skipped += result.skipped;
    counts.errors += result.errors;
    batch = [];
  };

  for await (const raw of readNdjson(filePath)) {
    const rec = raw as IdMapRecord;
    counts.read += 1;
    if (!rec.sourceDocumentId || !rec.targetEntity || !rec.targetId || !isUuid(rec.targetId)) {
      counts.skipped += 1;
      continue;
    }
    const remappedTenant = normalizePackageTenantId(rec.awsTenantId, authorizedTenantId);
    batch.push({
      sourceSystem: rec.sourceSystem ?? "FIREBASE",
      sourceCollection: rec.sourceCollection ?? "unknown",
      sourceDocumentPath: rec.sourceDocumentPath ?? "",
      sourceDocumentId: rec.sourceDocumentId,
      sourceTenantKey: rec.sourceTenantKey ?? null,
      targetEntity: rec.targetEntity,
      targetId: rec.targetId,
      awsTenantId:
        remappedTenant && isUuid(remappedTenant)
          ? remappedTenant
          : remappedTenant === null
            ? null
            : null,
    });
    if (batch.length >= BATCH_SIZE) {
      try {
        await flush();
      } catch (err) {
        errors.push({ entity: "id-map", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  await flush();
}

async function main(): Promise<void> {
  if (process.env.FORGE_IMPORT_AUTHORIZED?.trim() !== "true") {
    fail("Refused: set FORGE_IMPORT_AUTHORIZED=true after signing approval");
  }

  const modeRaw = (process.env.FORGE_IMPORT_MODE || "dry-run").trim() as ImportMode;
  if (modeRaw !== "dry-run" && modeRaw !== "apply") fail(`Bad FORGE_IMPORT_MODE: ${modeRaw}`);
  const mode = modeRaw;

  const tenantIdRequested = (process.env.FORGE_IMPORT_TENANT_ID || "").trim();
  if (!AUTHORIZED_TENANT_IDS.has(tenantIdRequested)) {
    fail(
      `Refused: FORGE_IMPORT_TENANT_ID must be production Producers tenant or DM-S2 package twin id, got ${tenantIdRequested || "(empty)"}`,
    );
  }
  const tenantId = resolveLiveTenantId(tenantIdRequested);

  const packageUri = process.env.FORGE_IMPORT_PACKAGE_S3_URI?.trim();
  if (!packageUri) fail("FORGE_IMPORT_PACKAGE_S3_URI required");

  const runId =
    process.env.FORGE_IMPORT_RUN_ID?.trim() ||
    `industrial-import-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const gitSha = process.env.FORGE_IMPORT_GIT_SHA?.trim() || null;
  const startedAt = new Date().toISOString();

  // eslint-disable-next-line no-console -- IMPORT_RUN stdout contract
  console.info(
    JSON.stringify({
      type: "IMPORT_RUN",
      runId,
      mode,
      tenantId,
      packageTenantId: PACKAGE_TENANT_ID,
      tenantRemapApplied:
        tenantIdRequested === PACKAGE_TENANT_ID || tenantId === PRODUCTION_TENANT_ID,
      gitSha,
      packageUri,
      startedAt,
      status: "started",
    }),
  );

  const packageDir = await downloadImportPackage(packageUri);
  const files = (await readdir(packageDir)).filter(
    (f) => f.endsWith(".ndjson") || f === "manifest.json",
  );

  let excludedFileCount = 0;
  let excludedLineCount = 0;
  let skippedNonImportFiles = 0;
  const importFiles: string[] = [];

  for (const file of files) {
    const skip = shouldSkipFile(file);
    if (skip === "excluded") {
      excludedFileCount += 1;
      const content = await readFile(path.join(packageDir, file), "utf8");
      excludedLineCount += content.split(/\r?\n/).filter((l) => l.trim()).length;
      continue;
    }
    if (skip === "non_import") {
      skippedNonImportFiles += 1;
      continue;
    }
    if (file.endsWith(".ndjson")) importFiles.push(file);
  }

  importFiles.sort((a, b) => {
    const [ka, sa] = entityFileSortKey(a);
    const [kb, sb] = entityFileSortKey(b);
    return ka === kb ? sa.localeCompare(sb) : ka - kb;
  });

  const sql = postgres(await resolveAdminDatabaseUrl(), { max: 1 });
  const perEntity: Record<string, EntityCounts> = {};
  const errors: Array<{ entity: string; id?: string; error: string }> = [];
  const extras = {
    fabricatedVehicles: 0,
    tenantMismatchFatal: 0,
    wcMedicalAdmin: 0,
    skipClasses: {} as SkipClassCounts,
  };

  try {
    const who = await sql`select current_user as u, current_database() as db`;
    const tenant = await sql`
      select id::text as id, tenant_key, slug, status
      from tenants where id = ${tenantId}::uuid limit 1
    `;
    if (!tenant[0]) fail(`Tenant not found: ${tenantId}`);
    if (tenant[0].tenant_key !== "producers-rice-mill") {
      fail(`Tenant key mismatch: ${tenant[0].tenant_key}`);
    }

    const idMap = await loadIdMapIndex(packageDir);
    console.error(
      JSON.stringify({
        dbUser: who[0]?.u,
        database: who[0]?.db,
        tenant: tenant[0],
        mode,
        runId,
        importFileCount: importFiles.length,
        excludedFileCount,
        idMapEntries: idMap.bySourceId.size,
      }),
    );

    for (const file of importFiles) {
      const entity = file.replace(/\.ndjson$/, "");
      const counts: EntityCounts = {
        read: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      };
      perEntity[entity] = counts;
      const filePath = path.join(packageDir, file);

      if (entity === "id-map") {
        await importIdMapFile(sql, filePath, mode, runId, tenantId, counts, errors);
      } else {
        await importEntityFile(
          sql,
          filePath,
          entity,
          mode,
          runId,
          tenantId,
          counts,
          errors,
          extras,
          idMap,
        );
      }
    }

    const fatalCount = extras.tenantMismatchFatal;
    const unexplained = errors.filter((e) => {
      const msg = e.error.toLowerCase();
      return !(
        msg.includes("duplicate key") ||
        msg.includes("already exists") ||
        msg.startsWith("missing_required_fk:")
      );
    });
    const totals = Object.values(perEntity).reduce(
      (acc, c) => {
        acc.inserted += c.inserted;
        acc.updated += c.updated;
        acc.skipped += c.skipped;
        acc.errors += c.errors;
        return acc;
      },
      { inserted: 0, updated: 0, skipped: 0, errors: 0 },
    );
    const taxonomy = {
      INSERTED: totals.inserted,
      UPDATED: totals.updated,
      SKIPPED_EXISTING: totals.updated, // dry-run marks existing as updated; apply upserts similarly
      EXCLUDE_APPROVED: excludedLineCount,
      WARNING_EXPLAINED: Object.entries(extras.skipClasses)
        .filter(([k]) => k.startsWith("SKIP_"))
        .reduce((n, [, v]) => n + v, 0),
      ERROR_UNEXPLAINED: unexplained.length,
      FATAL: fatalCount,
      skipClasses: extras.skipClasses,
    };
    const summary = {
      ok: fatalCount === 0 && unexplained.length === 0,
      type: "IMPORT_SUMMARY",
      runId,
      mode,
      tenantId,
      gitSha,
      startedAt,
      finishedAt: new Date().toISOString(),
      packageDir,
      excludedFileCount,
      excludedLineCount,
      skippedNonImportFiles,
      fabricatedVehicles: extras.fabricatedVehicles,
      workersCompMedical: {
        rowsTouched: extras.wcMedicalAdmin,
        insertedAsAdmin: true,
        note: "industrial_workers_comp_medical_encounters written as forge_admin (bypasses RLS)",
      },
      taxonomy,
      perEntity,
      errorCount: errors.length,
      unexplainedErrorCount: unexplained.length,
      fatalCount,
      errors: unexplained.slice(0, 100),
      allErrorsSample: errors.slice(0, 50),
    };

    // eslint-disable-next-line no-console -- summary stdout contract
    console.info(JSON.stringify(summary));

    // eslint-disable-next-line no-console -- IMPORT_RUN completion
    console.info(
      JSON.stringify({
        type: "IMPORT_RUN",
        runId,
        mode,
        tenantId,
        gitSha,
        startedAt,
        finishedAt: summary.finishedAt,
        status: summary.ok ? "completed" : "completed_with_errors",
      }),
    );

    if (fatalCount > 0) process.exit(2);
    if (unexplained.length > 0) process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isDirect =
  Boolean(process.argv[1]) &&
  (pathToFileURL(path.resolve(process.argv[1]!)).href === import.meta.url ||
    process.argv[1]!.endsWith("industrial-import-ecs.ts") ||
    process.argv[1]!.endsWith("industrial-import-ecs.js"));

if (isDirect) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ ok: false, error: String(error) }));
    process.exit(1);
  });
}
