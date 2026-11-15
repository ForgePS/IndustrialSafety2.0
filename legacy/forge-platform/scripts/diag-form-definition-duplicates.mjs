#!/usr/bin/env node
/**
 * READ-ONLY: find duplicate industrial_form_definitions by title for a tenant.
 *   TENANT_KEY=producers-rice-mill node scripts/diag-form-definition-duplicates.mjs
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
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

const tenantRows = await sql`
  select id::text as id from tenants where tenant_key = ${tenantKey} limit 1
`;
const tenant = tenantRows[0]?.id;
if (!tenant) throw new Error(`tenant not found: ${tenantKey}`);

const totals = await sql`
  select count(*)::int as n
  from industrial_form_definitions
  where tenant_id = ${tenant}::uuid and archived_at is null
`;

const rows = await sql`
  select
    d.id::text as id,
    d.title,
    d.form_key,
    d.status,
    d.source_collection,
    d.source_document_id,
    d.source_system,
    d.updated_at::text as updated_at,
    d.created_at::text as created_at,
    (
      select count(*)::int
      from industrial_form_submissions s
      where s.tenant_id = d.tenant_id
        and s.form_definition_id = d.id
        and s.archived_at is null
    ) as submissions
  from industrial_form_definitions d
  where d.tenant_id = ${tenant}::uuid and d.archived_at is null
  order by lower(coalesce(d.title, '')), d.updated_at desc
`;

const byTitle = new Map();
for (const row of rows) {
  const key = String(row.title ?? "")
    .trim()
    .toLowerCase();
  if (!key) continue;
  if (!byTitle.has(key)) byTitle.set(key, []);
  byTitle.get(key).push(row);
}
const duplicates = [...byTitle.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([titleKey, items]) => ({
    titleKey,
    count: items.length,
    items,
  }))
  .sort((a, b) => b.count - a.count || a.titleKey.localeCompare(b.titleKey));

console.log(
  JSON.stringify(
    {
      ok: true,
      tenantKey,
      tenantId: tenant,
      activeDefinitions: totals[0]?.n ?? 0,
      duplicateTitleGroups: duplicates.length,
      duplicates,
      allTitles: rows,
    },
    null,
    2,
  ),
);

await sql.end({ timeout: 5 });
