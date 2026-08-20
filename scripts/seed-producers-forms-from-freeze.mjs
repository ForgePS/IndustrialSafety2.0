/**
 * producers-rice-mill only: seed industrial_form_definitions +
 * industrial_form_submissions from the IND-11B wave2-remaining freeze payload.
 *
 * Source (default):
 *   s3://forge-development-imports-511343547817-us-east-1/ind11b/wave2-remaining/
 *     2026-08-05T10-53-29-690Z/payload.json
 *
 * Maps Firebase formTemplates → industrial_form_definitions
 * Maps Firebase formSubmissions → industrial_form_submissions
 *   - templateId → form_definition_id (via source_document_id)
 *   - responses → answers (signature objects flattened to image data URLs)
 *
 * Idempotent on (tenant_id, source_collection, source_document_id).
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-producers-forms-from-freeze.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-producers-forms-from-freeze.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const { S3Client, GetObjectCommand } = apiRequire("@aws-sdk/client-s3");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

const PAYLOAD_BUCKET =
  process.env.FORMS_FREEZE_BUCKET || "forge-production-imports-511343547817-us-east-1";
const PAYLOAD_KEY =
  process.env.FORMS_FREEZE_KEY ||
  "seed/forms-from-freeze/source/wave2-remaining-payload.json";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

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

async function loadPayload() {
  const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(
    new GetObjectCommand({ Bucket: PAYLOAD_BUCKET, Key: PAYLOAD_KEY }),
  );
  const text = await res.Body.transformToString("utf8");
  return JSON.parse(text);
}

function unwrap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...raw };
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

function flattenResponseValue(value) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => flattenResponseValue(item)).filter((item) => item != null);
  }
  if (typeof value === "object") {
    const rec = value;
    if (typeof rec.image === "string" && rec.image.trim()) return rec.image.trim();
    if (typeof rec.dataUrl === "string" && rec.dataUrl.trim()) return rec.dataUrl.trim();
    if (typeof rec.url === "string" && rec.url.trim()) return rec.url.trim();
    if (typeof rec.value === "string" || typeof rec.value === "number") return rec.value;
    // Keep compact metadata for non-image signature envelopes.
    const signedBy = rec.signedByName ?? rec.signedBy ?? null;
    const signedAt = rec.signedAt ?? null;
    if (signedBy || signedAt) {
      return JSON.stringify({
        signedByName: signedBy,
        signedAt,
        method: rec.method ?? null,
      });
    }
    return JSON.stringify(rec);
  }
  return String(value);
}

function flattenResponses(responses) {
  const source = unwrap(responses);
  const answers = {};
  for (const [key, value] of Object.entries(source)) {
    const flat = flattenResponseValue(value);
    if (flat == null || flat === "") continue;
    answers[key] = flat;
  }
  return answers;
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.map((field, index) => {
    if (typeof field === "string") {
      return { id: `field-${index + 1}`, label: field, type: "text" };
    }
    const rec = unwrap(field);
    const id = String(rec.id ?? rec.key ?? rec.name ?? `field-${index + 1}`).trim();
    const label = String(rec.label ?? rec.title ?? rec.name ?? id).trim();
    const type = String(rec.type ?? rec.inputType ?? "text").trim() || "text";
    const out = { id, label, type };
    if (Array.isArray(rec.options)) out.options = rec.options;
    if (rec.required === true) out.required = true;
    return out;
  });
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

const payload = await loadPayload();
const templates = Array.isArray(payload.formTemplates) ? payload.formTemplates : [];
const submissions = Array.isArray(payload.formSubmissions) ? payload.formSubmissions : [];

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const tenantRows = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const summary = {
    tenantKey: TENANT_KEY,
    tenantId,
    apply: APPLY,
    source: `s3://${PAYLOAD_BUCKET}/${PAYLOAD_KEY}`,
    templatesInSource: templates.length,
    submissionsInSource: submissions.length,
    definitionsUpserted: 0,
    submissionsUpserted: 0,
    submissionsUnlinked: 0,
    repairedFromPayload: 0,
    skipped: 0,
  };

  /** @type {Map<string, string>} firebase templateId → definition uuid */
  const templateIdMap = new Map();

  for (const row of templates) {
    const sourceDocumentId = String(row.sourceDocumentId ?? "").trim();
    const sourceCollection = String(row.sourceCollection ?? "formTemplates").trim();
    const data = unwrap(row.data);
    if (!sourceDocumentId) {
      summary.skipped += 1;
      continue;
    }
    const title = String(data.name ?? data.title ?? "Form").trim() || "Form";
    const formKey = String(data.seedKey ?? data.category ?? title)
      .trim()
      .slice(0, 120);
    const fields = normalizeFields(data.fields);
    const schemaJson = { fields, category: data.category ?? null, description: data.description ?? null };
    const id = deterministicUuid(["form-def", tenantId, sourceCollection, sourceDocumentId]);
    templateIdMap.set(sourceDocumentId, id);

    if (APPLY) {
      const existing = await sql`
        select id::text as id from industrial_form_definitions
        where tenant_id = ${tenantId}::uuid
          and source_collection = ${sourceCollection}
          and source_document_id = ${sourceDocumentId}
        limit 1
      `;
      if (existing[0]?.id) {
        templateIdMap.set(sourceDocumentId, existing[0].id);
        await sql`
          update industrial_form_definitions set
            title = ${title},
            status = 'ACTIVE',
            form_key = ${formKey},
            schema_json = ${sql.json(schemaJson)},
            source_path = ${row.sourcePath ?? null},
            source_payload = ${sql.json(data)},
            archived_at = null,
            updated_at = now()
          where id = ${existing[0].id}::uuid and tenant_id = ${tenantId}::uuid
        `;
      } else {
        await sql`
          insert into industrial_form_definitions (
            id, tenant_id, title, status, form_key, version, schema_json,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, 'ACTIVE', ${formKey}, '1',
            ${sql.json(schemaJson)},
            'FIREBASE', ${sourceCollection}, ${sourceDocumentId}, ${row.sourcePath ?? null},
            ${sql.json(data)},
            now(), now()
          )
        `;
      }
    }
    summary.definitionsUpserted += 1;
  }

  // Also map any existing definitions that already match source ids.
  const existingDefs = await sql`
    select id::text as id, source_document_id
    from industrial_form_definitions
    where tenant_id = ${tenantId}::uuid
      and source_document_id is not null
  `;
  for (const row of existingDefs) {
    if (row.source_document_id && !templateIdMap.has(row.source_document_id)) {
      templateIdMap.set(row.source_document_id, row.id);
    }
  }

  for (const row of submissions) {
    const sourceDocumentId = String(row.sourceDocumentId ?? "").trim();
    const sourceCollection = String(row.sourceCollection ?? "formSubmissions").trim();
    const data = unwrap(row.data);
    if (!sourceDocumentId) {
      summary.skipped += 1;
      continue;
    }
    const templateId = String(data.templateId ?? data.formTemplateId ?? "").trim();
    const formDefinitionId = templateId ? templateIdMap.get(templateId) ?? null : null;
    if (!formDefinitionId) summary.submissionsUnlinked += 1;

    const answers = flattenResponses(data.responses ?? data.answers ?? data.values);
    const title =
      String(data.templateName ?? data.title ?? data.name ?? "Form submission").trim() ||
      "Form submission";
    const status = String(data.status ?? "SUBMITTED").trim().toUpperCase() || "SUBMITTED";
    const submittedAt = parseDate(data.submittedAt ?? data.createdAt) ?? new Date().toISOString();
    const id = deterministicUuid(["form-sub", tenantId, sourceCollection, sourceDocumentId]);

    if (APPLY) {
      const existing = await sql`
        select id::text as id from industrial_form_submissions
        where tenant_id = ${tenantId}::uuid
          and source_collection = ${sourceCollection}
          and source_document_id = ${sourceDocumentId}
        limit 1
      `;
      if (existing[0]?.id) {
        await sql`
          update industrial_form_submissions set
            title = ${title},
            status = ${status},
            form_definition_id = coalesce(${formDefinitionId}, form_definition_id),
            submitted_at = coalesce(${submittedAt}::timestamptz, submitted_at),
            answers = ${sql.json(answers)},
            source_path = ${row.sourcePath ?? null},
            source_payload = ${sql.json(data)},
            archived_at = null,
            updated_at = now()
          where id = ${existing[0].id}::uuid and tenant_id = ${tenantId}::uuid
        `;
      } else {
        await sql`
          insert into industrial_form_submissions (
            id, tenant_id, title, status, form_definition_id, submitted_at, answers,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, ${status},
            ${formDefinitionId}, ${submittedAt}::timestamptz, ${sql.json(answers)},
            'FIREBASE', ${sourceCollection}, ${sourceDocumentId}, ${row.sourcePath ?? null},
            ${sql.json(data)},
            now(), now()
          )
        `;
      }
    }
    summary.submissionsUpserted += 1;
  }

  // Repair any existing submissions whose answers were never materialized
  // (controlled import left answers={} and sometimes stringified source_payload).
  const broken = await sql`
    select id::text as id, source_payload, source_document_id
    from industrial_form_submissions
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and (answers is null or answers::text in ('{}', 'null'))
  `;
  let repaired = 0;
  for (const row of broken) {
    let payload = row.source_payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }
    // Some imports nested the Firebase doc once more as a JSON string.
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }
    const data = unwrap(payload);
    const answers = flattenResponses(data.responses ?? data.answers ?? data.values);
    if (Object.keys(answers).length === 0) continue;
    const templateId = String(data.templateId ?? data.formTemplateId ?? "").trim();
    const formDefinitionId = templateId ? templateIdMap.get(templateId) ?? null : null;
    const title =
      String(data.templateName ?? data.title ?? data.name ?? "Form submission").trim() ||
      "Form submission";
    const status = String(data.status ?? "SUBMITTED").trim().toUpperCase() || "SUBMITTED";
    const submittedAt = parseDate(data.submittedAt ?? data.createdAt);
    if (APPLY) {
      await sql`
        update industrial_form_submissions set
          title = ${title},
          status = ${status},
          form_definition_id = coalesce(${formDefinitionId}, form_definition_id),
          submitted_at = coalesce(${submittedAt}::timestamptz, submitted_at),
          answers = ${sql.json(answers)},
          source_payload = ${sql.json(data)},
          updated_at = now()
        where id = ${row.id}::uuid and tenant_id = ${tenantId}::uuid
      `;
    }
    repaired += 1;
  }
  summary.repairedFromPayload = repaired;

  const afterDefs = await sql`
    select count(*)::int as n from industrial_form_definitions
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  const afterSubs = await sql`
    select count(*)::int as n from industrial_form_submissions
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  const emptyAnswers = await sql`
    select count(*)::int as n from industrial_form_submissions
    where tenant_id = ${tenantId}::uuid and archived_at is null
      and (answers is null or answers::text in ('{}', 'null'))
  `;

  console.log(
    JSON.stringify(
      {
        ...summary,
        after: {
          definitions: afterDefs[0]?.n,
          submissions: afterSubs[0]?.n,
          emptyAnswers: emptyAnswers[0]?.n,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
