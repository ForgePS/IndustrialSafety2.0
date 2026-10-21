#!/usr/bin/env node
/**
 * Merge duplicate industrial_training_records that share the same personnel,
 * training name, and completed date (calendar day).
 *
 * Survivor keeps merged payload (attachments, result/score/attempts, notes).
 * Duplicates are soft-archived (archived_at set), not hard-deleted.
 *
 * Env:
 *   DATABASE_SECRET_ARN   required
 *   TENANT_KEY            default producers-rice-mill
 *   APPLY                 1 to write (default dry-run)
 *   LIMIT_GROUPS          optional max duplicate groups to process
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/merge-duplicate-training-records.mjs
 * Apply:
 *   APPLY=1 TENANT_KEY=producers-rice-mill node scripts/merge-duplicate-training-records.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const LIMIT_GROUPS = Number(process.env.LIMIT_GROUPS || 0) || 0;
const ALLOWED = new Set(["producers-rice-mill"]);
const MERGE_RUN_ID =
  process.env.MERGE_RUN_ID ||
  `merge-dup-training-${new Date().toISOString().replace(/[:.]/g, "-")}`;

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

function asObject(value) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function readAttachments(payload) {
  const root = asObject(payload);
  const raw = root.certificateUploads;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const documentId = String(entry.documentId ?? entry.document_id ?? "").trim();
    if (!documentId || seen.has(documentId)) continue;
    seen.add(documentId);
    out.push({
      documentId,
      fileName: String(entry.fileName ?? entry.file_name ?? "attachment").trim() || "attachment",
      contentType: String(entry.contentType ?? entry.content_type ?? "application/octet-stream").trim(),
      uploadedAt: String(entry.uploadedAt ?? entry.uploaded_at ?? new Date().toISOString()),
    });
  }
  return out;
}

function pickText(...values) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return null;
}

function pickNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function richnessScore(row) {
  const payload = asObject(row.source_payload);
  const attachments = readAttachments(payload);
  let score = 0;
  score += attachments.length * 100;
  if (pickText(payload.result, row.status)) score += 10;
  if (pickNumber(payload.scorePercent, payload.percent) != null) score += 10;
  if (pickNumber(payload.attemptNumber) != null) score += 5;
  if (pickText(payload.instructorName, payload.instructor_name)) score += 5;
  if (pickText(payload.notes)) score += 5;
  if (row.source_collection === "manual_entry") score += 3;
  if (row.expires_at) score += 2;
  return score;
}

function compareSurvivors(a, b) {
  const richDiff = richnessScore(b) - richnessScore(a);
  if (richDiff !== 0) return richDiff;
  const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : 0;
  const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : 0;
  if (bUpdated !== aUpdated) return bUpdated - aUpdated;
  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aCreated - bCreated;
}

function mergePayload(survivor, duplicates) {
  const all = [survivor, ...duplicates];
  const payloads = all.map((row) => asObject(row.source_payload));
  const attachments = [];
  const seenDocs = new Set();
  for (const payload of payloads) {
    for (const file of readAttachments(payload)) {
      if (seenDocs.has(file.documentId)) continue;
      seenDocs.add(file.documentId);
      attachments.push(file);
    }
  }

  const base = { ...payloads[0] };
  base.result = pickText(...payloads.map((p) => p.result), survivor.status);
  base.scorePercent = pickNumber(...payloads.map((p) => p.scorePercent ?? p.percent));
  base.percent = base.scorePercent;
  base.attemptNumber = pickNumber(...payloads.map((p) => p.attemptNumber));
  base.instructorName = pickText(...payloads.map((p) => p.instructorName ?? p.instructor_name));
  base.notes = pickText(...payloads.map((p) => p.notes));
  base.courseCode = pickText(...payloads.map((p) => p.courseCode ?? p.course_code));
  base.courseName = pickText(
    ...payloads.map((p) => p.courseName),
    survivor.course_name,
    survivor.title,
  );
  if (attachments.length) base.certificateUploads = attachments;
  else delete base.certificateUploads;

  base.mergedDuplicateIds = duplicates.map((row) => row.id);
  base.mergeRunId = MERGE_RUN_ID;
  base.mergedAt = new Date().toISOString();
  base.mergedFromCount = all.length;
  return base;
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id, tenant_key
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const groups = await sql`
    select
      personnel_id::text as personnel_id,
      lower(trim(coalesce(nullif(course_name, ''), nullif(title, '')))) as course_key,
      (completed_at at time zone 'UTC')::date::text as completed_day,
      count(*)::int as dup_count,
      array_agg(id::text order by created_at asc, id asc) as record_ids
    from industrial_training_records
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
      and personnel_id is not null
      and completed_at is not null
      and trim(coalesce(nullif(course_name, ''), nullif(title, ''))) <> ''
    group by 1, 2, 3
    having count(*) > 1
    order by count(*) desc, course_key asc
  `;

  const limited = LIMIT_GROUPS > 0 ? groups.slice(0, LIMIT_GROUPS) : groups;
  const report = {
    tenantKey: TENANT_KEY,
    tenantId: tenant.id,
    apply: APPLY,
    mergeRunId: MERGE_RUN_ID,
    duplicateGroups: groups.length,
    groupsProcessing: limited.length,
    recordsToArchive: 0,
    recordsKept: 0,
    attachmentsMerged: 0,
    samples: [],
  };

  for (const group of limited) {
    const rows = await sql`
      select
        id::text as id,
        title,
        course_name,
        status,
        completed_at,
        expires_at,
        source_collection,
        source_document_id,
        source_payload,
        created_at,
        updated_at
      from industrial_training_records
      where tenant_id = ${tenant.id}::uuid
        and archived_at is null
        and personnel_id = ${group.personnel_id}::uuid
        and lower(trim(coalesce(nullif(course_name, ''), nullif(title, '')))) = ${group.course_key}
        and (completed_at at time zone 'UTC')::date = ${group.completed_day}::date
      order by created_at asc, id asc
    `;
    if (rows.length < 2) continue;

    const sorted = [...rows].sort(compareSurvivors);
    const survivor = sorted[0];
    const duplicates = sorted.slice(1);
    const mergedPayload = mergePayload(survivor, duplicates);
    const attachmentCount = readAttachments(mergedPayload).length;

    report.recordsKept += 1;
    report.recordsToArchive += duplicates.length;
    report.attachmentsMerged += attachmentCount;
    if (report.samples.length < 25) {
      report.samples.push({
        personnelId: group.personnel_id,
        courseKey: group.course_key,
        completedDay: group.completed_day,
        keepId: survivor.id,
        archiveIds: duplicates.map((row) => row.id),
        keepSource: survivor.source_collection,
        archiveSources: duplicates.map((row) => row.source_collection),
        attachmentsAfter: attachmentCount,
      });
    }

    if (!APPLY) continue;

    const expiresAt =
      survivor.expires_at ||
      duplicates.map((row) => row.expires_at).find(Boolean) ||
      null;

    await sql.begin(async (tx) => {
      await tx`
        update industrial_training_records
        set
          source_payload = ${tx.json(mergedPayload)},
          expires_at = ${expiresAt},
          title = coalesce(nullif(trim(title), ''), ${survivor.title}, ${group.course_key}),
          course_name = coalesce(nullif(trim(course_name), ''), ${survivor.course_name}, ${group.course_key}),
          updated_at = now()
        where id = ${survivor.id}::uuid
          and tenant_id = ${tenant.id}::uuid
      `;

      await tx`
        update industrial_training_records
        set
          archived_at = now(),
          updated_at = now(),
          source_payload = coalesce(source_payload, '{}'::jsonb) || ${tx.json({
            mergedIntoRecordId: survivor.id,
            mergeRunId: MERGE_RUN_ID,
            mergedAt: new Date().toISOString(),
          })}
        where tenant_id = ${tenant.id}::uuid
          and id = any(${duplicates.map((row) => row.id)}::uuid[])
          and archived_at is null
      `;
    });
  }

  const [after] = APPLY
    ? await sql`
        select count(*)::int as remaining_duplicate_groups
        from (
          select 1
          from industrial_training_records
          where tenant_id = ${tenant.id}::uuid
            and archived_at is null
            and personnel_id is not null
            and completed_at is not null
            and trim(coalesce(nullif(course_name, ''), nullif(title, ''))) <> ''
          group by
            personnel_id,
            lower(trim(coalesce(nullif(course_name, ''), nullif(title, '')))),
            (completed_at at time zone 'UTC')::date
          having count(*) > 1
        ) d
      `
    : [{ remaining_duplicate_groups: groups.length }];

  report.remainingDuplicateGroups = after?.remaining_duplicate_groups ?? null;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
