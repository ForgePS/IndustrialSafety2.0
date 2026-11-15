#!/usr/bin/env node
/**
 * Archive duplicate industrial_form_definitions that share the same title.
 * Keeps one row per title: prefer most submissions, then newest updated_at.
 *
 * DRY by default. APPLY=1 to write.
 *   TENANT_KEY=producers-rice-mill node scripts/fix-form-definition-duplicates.mjs
 *   APPLY=1 TENANT_KEY=producers-rice-mill node scripts/fix-form-definition-duplicates.mjs
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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
const tenantKey = process.env.TENANT_KEY || "producers-rice-mill";
const apply = process.env.APPLY === "1";
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

const tenantRows = await sql`
  select id::text as id from tenants where tenant_key = ${tenantKey} limit 1
`;
const tenant = tenantRows[0]?.id;
if (!tenant) throw new Error(`tenant not found: ${tenantKey}`);

const rows = await sql`
  select
    d.id::text as id,
    d.title,
    d.form_key,
    d.source_document_id,
    d.updated_at::text as updated_at,
    (
      select count(*)::int
      from industrial_form_submissions s
      where s.tenant_id = d.tenant_id
        and s.form_definition_id = d.id
        and s.archived_at is null
    ) as submissions
  from industrial_form_definitions d
  where d.tenant_id = ${tenant}::uuid
    and d.archived_at is null
    and coalesce(btrim(d.title), '') <> ''
  order by lower(btrim(d.title)), d.updated_at desc
`;

const byTitle = new Map();
for (const row of rows) {
  const key = String(row.title ?? "")
    .trim()
    .toLowerCase();
  if (!byTitle.has(key)) byTitle.set(key, []);
  byTitle.get(key).push(row);
}

const groups = [];
const archiveIds = [];

for (const [titleKey, items] of byTitle.entries()) {
  if (items.length < 2) continue;
  const ranked = [...items].sort((a, b) => {
    const subDiff = Number(b.submissions ?? 0) - Number(a.submissions ?? 0);
    if (subDiff !== 0) return subDiff;
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });
  const keep = ranked[0];
  const archive = ranked.slice(1);
  groups.push({
    title: keep.title,
    titleKey,
    keep: {
      id: keep.id,
      sourceDocumentId: keep.source_document_id,
      submissions: keep.submissions,
      updatedAt: keep.updated_at,
    },
    archive: archive.map((row) => ({
      id: row.id,
      sourceDocumentId: row.source_document_id,
      submissions: row.submissions,
      updatedAt: row.updated_at,
    })),
  });
  for (const row of archive) archiveIds.push(row.id);
}

let archived = 0;
if (apply && archiveIds.length > 0) {
  const result = await sql`
    update industrial_form_definitions
    set
      archived_at = now(),
      updated_at = now(),
      status = 'ARCHIVED'
    where tenant_id = ${tenant}::uuid
      and archived_at is null
      and id = any(${archiveIds}::uuid[])
    returning id::text as id
  `;
  archived = result.length;
}

const remaining = await sql`
  select count(*)::int as n
  from industrial_form_definitions
  where tenant_id = ${tenant}::uuid and archived_at is null
`;

console.log(
  JSON.stringify(
    {
      ok: true,
      phase: "FIX-FORM-DEFINITION-DUPLICATES",
      tenantKey,
      tenantId: tenant,
      mode: apply ? "APPLY" : "DRY_RUN",
      duplicateGroups: groups.length,
      wouldArchive: archiveIds.length,
      archived,
      activeDefinitionsAfter: remaining[0]?.n ?? null,
      groups,
    },
    null,
    2,
  ),
);

await sql.end({ timeout: 5 });
