/**
 * producers-rice-mill: register existing remounted DOT DQF document objects
 * (PDFs and images under tenants/.../dot-compliance/.../drivers/DRV-*) onto
 * matching industrial_dot_compliance_records Copy fields.
 *
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-dqf-remounted-document-copies.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-dqf-remounted-document-copies.mjs
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = apiRequire("@aws-sdk/client-s3");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const DOCUMENTS_BUCKET =
  process.env.S3_DOCUMENT_BUCKET || "forge-production-documents-511343547817-us-east-1";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;
const PDF_EXT = /\.pdf$/i;

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function unwrap(raw) {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function deterministicUuid(parts) {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function parseRemountedKey(key, tenantId) {
  // tenants/{tenantId}/dot-compliance/{tenantId}/drivers/DRV-2026-0001/{fieldId}/{filename}
  const prefix = `tenants/${tenantId}/dot-compliance/`;
  if (!key.startsWith(prefix)) return null;
  const parts = key.slice(prefix.length).split("/");
  // [{tenantId}, drivers, DRV-..., fieldId, filename]
  if (parts.length < 4) return null;
  const drvIdx = parts.findIndex((part) => /^DRV-\d{4}-\d+$/i.test(part));
  if (drvIdx < 0 || drvIdx + 2 >= parts.length) return null;
  const recordNumber = parts[drvIdx];
  const fieldId = parts[drvIdx + 1];
  const filename = parts.slice(drvIdx + 2).join("/");
  if (!fieldId || !filename) return null;
  if (!IMAGE_EXT.test(filename) && !PDF_EXT.test(filename)) return null;
  const copyFieldId = fieldId.endsWith("Copy") ? fieldId : `${fieldId}Copy`;
  return { key, recordNumber, fieldId, copyFieldId, filename };
}

function parseFileValues(raw) {
  const text = asText(raw);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((row) => row && typeof row === "object");
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // ignore
  }
  return [];
}

function serializeFileValues(files) {
  return files.length ? JSON.stringify(files) : "";
}

function isDriverPayload(payload, title) {
  const cat = asText(payload.category).toLowerCase();
  if (payload.dqf === true || cat.includes("driver") || cat.includes("dqf")) return true;
  return /driver|dqf/i.test(asText(title));
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

const region = process.env.AWS_REGION || "us-east-1";
const s3 = new S3Client({ region });
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant.id;
  const listPrefix = `tenants/${tenantId}/dot-compliance/`;

  const objects = [];
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: DOCUMENTS_BUCKET,
        Prefix: listPrefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key) continue;
      const parsed = parseRemountedKey(obj.Key, tenantId);
      if (!parsed) continue;
      objects.push({ ...parsed, size: Number(obj.Size ?? 0) });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const dotRows = await sql`
    select
      id::text as id,
      title,
      source_document_id,
      source_path,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;

  const byRecordNumber = new Map();
  for (const row of dotRows) {
    const payload = unwrap(row.source_payload);
    if (!isDriverPayload(payload, row.title)) continue;
    const hay = [
      row.source_document_id,
      row.source_path,
      row.title,
      payload.recordNumber,
      payload.sourceDocumentId,
      JSON.stringify(payload),
    ]
      .map((value) => asText(value))
      .join(" ");
    const matches = hay.match(/DRV-\d{4}-\d+/gi) || [];
    for (const match of matches) {
      byRecordNumber.set(match.toUpperCase(), row);
    }
  }

  const report = {
    tenantKey: TENANT_KEY,
    tenantId,
    apply: APPLY,
    objectCount: objects.length,
    imageCount: objects.filter((row) => IMAGE_EXT.test(row.filename)).length,
    pdfCount: objects.filter((row) => PDF_EXT.test(row.filename)).length,
    documentsCreated: 0,
    documentsReused: 0,
    driversUpdated: 0,
    unmatchedObjects: 0,
    samples: [],
  };

  const driverUpdates = new Map();

  function queueFile(driver, copyFieldId, fileMeta) {
    const current = driverUpdates.get(driver.id) ?? {
      payload: unwrap(driver.source_payload),
      filesByField: new Map(),
    };
    if (!current.filesByField.has(copyFieldId)) {
      const existing = parseFileValues(
        current.payload[copyFieldId] ?? current.payload.details?.[copyFieldId],
      ).filter((row) => {
        // Drop dead stubs that cannot be opened.
        const documentId = asText(row.documentId);
        const url = asText(row.url);
        const dataUrl = asText(row.dataUrl);
        if (documentId) return true;
        if (url && !url.startsWith("data:")) return true;
        if (dataUrl && dataUrl !== "data:omitted" && dataUrl.startsWith("data:")) return true;
        return false;
      });
      current.filesByField.set(copyFieldId, existing);
    }
    const list = current.filesByField.get(copyFieldId);
    if (!list.some((row) => asText(row.documentId) === fileMeta.documentId)) {
      list.push(fileMeta);
    }
    driverUpdates.set(driver.id, current);
  }

  for (const obj of objects) {
    const driver = byRecordNumber.get(obj.recordNumber.toUpperCase());
    if (!driver) {
      report.unmatchedObjects += 1;
      if (report.samples.length < 10) {
        report.samples.push({
          kind: "unmatched",
          recordNumber: obj.recordNumber,
          fieldId: obj.fieldId,
          filename: obj.filename,
        });
      }
      continue;
    }

    const mimeType = guessMime(obj.filename);
    const documentId = deterministicUuid([
      "dqf-remount-copy",
      tenantId,
      obj.recordNumber,
      obj.copyFieldId,
      obj.key,
    ]);

    let resolvedDocumentId = documentId;
    if (APPLY) {
      const existing = await sql`
        select id::text as id from forge_documents
        where tenant_id = ${tenantId}::uuid and object_key = ${obj.key}
        limit 1
      `;
      if (existing[0]?.id) {
        resolvedDocumentId = existing[0].id;
        report.documentsReused += 1;
      } else {
        // Confirm object still exists.
        await s3.send(
          new HeadObjectCommand({
            Bucket: DOCUMENTS_BUCKET,
            Key: obj.key,
          }),
        );
        await sql`
          insert into forge_documents (
            id, tenant_id, original_filename, stored_filename, object_key, bucket_name,
            mime_type, file_size_bytes, security_classification, malware_scan_status,
            retention_rule, upload_status, source, uploaded_by_user_id, uploaded_at,
            created_at, updated_at
          ) values (
            ${documentId}::uuid, ${tenantId}::uuid, ${obj.filename}, ${obj.filename},
            ${obj.key}, ${DOCUMENTS_BUCKET}, ${mimeType}, ${obj.size || 0},
            'INTERNAL', 'PENDING', 'DOT_DQF_DEFAULT', 'COMPLETE', 'INDUSTRIAL_DOT_DQF',
            null, now(), now(), now()
          )
          on conflict (tenant_id, object_key) do nothing
        `;
        const [created] = await sql`
          select id::text as id from forge_documents
          where tenant_id = ${tenantId}::uuid and object_key = ${obj.key}
          limit 1
        `;
        resolvedDocumentId = created?.id || documentId;
        report.documentsCreated += 1;
      }
    } else {
      report.documentsCreated += 1;
    }

    queueFile(driver, obj.copyFieldId, {
      name: obj.filename,
      documentId: resolvedDocumentId,
      contentType: mimeType,
      fileSizeBytes: obj.size || undefined,
      uploadedAt: new Date().toISOString(),
    });

    if (report.samples.length < 12) {
      report.samples.push({
        kind: IMAGE_EXT.test(obj.filename) ? "imageAttach" : "pdfAttach",
        driverId: driver.id,
        driverTitle: driver.title,
        recordNumber: obj.recordNumber,
        fieldId: obj.copyFieldId,
        filename: obj.filename,
      });
    }
  }

  for (const [driverId, update] of driverUpdates.entries()) {
    const payload = { ...update.payload };
    const details =
      payload.details && typeof payload.details === "object" && !Array.isArray(payload.details)
        ? { ...payload.details }
        : {};
    for (const [copyFieldId, files] of update.filesByField.entries()) {
      const serialized = serializeFileValues(files);
      payload[copyFieldId] = serialized;
      details[copyFieldId] = serialized;
    }
    payload.details = details;
    if (APPLY) {
      await sql`
        update industrial_dot_compliance_records set
          source_payload = ${sql.json(payload)},
          updated_at = now()
        where id = ${driverId}::uuid and tenant_id = ${tenantId}::uuid
      `;
    }
    report.driversUpdated += 1;
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
