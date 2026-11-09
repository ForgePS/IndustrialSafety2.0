#!/usr/bin/env node
/**
 * Read-only: row counts and newest records for every sanitation / inspection table.
 * Run via: FORGE_ENV=production node scripts/run-ecs-diag-sanitation-recent.mjs
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

async function resolveDatabaseUrl(secretArn) {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
const out = { tenantKey: TENANT_KEY, tables: [] };
try {
  await sql`set transaction read only`.catch(() => {});
  const [tenant] =
    await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);
  out.tenantId = tenant.id;

  const tables = await sql`
    select table_name,
      bool_or(column_name = 'tenant_id') as has_tenant,
      bool_or(column_name = 'created_at') as has_created,
      bool_or(column_name = 'archived_at') as has_archived,
      bool_or(column_name = 'completed_at') as has_completed,
      bool_or(column_name = 'status') as has_status
    from information_schema.columns
    where table_schema = 'public'
      and (table_name like '%sanitation%' or table_name like '%inspection%')
    group by table_name order by table_name`;

  for (const t of tables) {
    if (!t.has_tenant || !t.has_created) {
      out.tables.push({ table: t.table_name, skipped: "no tenant_id/created_at" });
      continue;
    }
    const tn = sql(t.table_name);
    const archived = t.has_archived
      ? sql`count(*) filter (where archived_at is not null)::int`
      : sql`0`;
    const [c] = await sql`
      select count(*)::int as total, ${archived} as archived,
        max(created_at) as newest_created,
        count(*) filter (where created_at >= now() - interval '30 days')::int as last30,
        count(*) filter (where created_at >= now() - interval '7 days')::int as last7
      from ${tn} where tenant_id = ${tenant.id}::uuid`;
    const byMonth = await sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*)::int as n
      from ${tn} where tenant_id = ${tenant.id}::uuid
      group by 1 order by 1 desc limit 6`;
    const entry = { table: t.table_name, ...c, byMonth };
    if (t.has_completed) {
      const [m] =
        await sql`select max(completed_at) as newest_completed from ${tn} where tenant_id = ${tenant.id}::uuid`;
      entry.newest_completed = m.newest_completed;
    }
    if (t.has_status) {
      entry.byStatus =
        await sql`select status, count(*)::int as n from ${tn} where tenant_id = ${tenant.id}::uuid group by 1 order by 2 desc limit 8`;
    }
    out.tables.push(entry);
  }

  // Newest sanitation inspections, with who/when, to compare with what the UI shows.
  out.newestInspections = await sql`
    select id::text, inspection_number, title, status, inspection_type, created_at, updated_at,
      started_at, completed_at, archived_at, site_id::text, template_id::text, template_version,
      score_percent, offline_client_id is not null as offline,
      (select count(*) from jsonb_object_keys(case when jsonb_typeof(responses_json) = 'object' then responses_json else '{}'::jsonb end))::int as response_keys,
      length(responses_json::text) as responses_len,
      length(summary_json::text) as summary_len,
      jsonb_array_length(case when jsonb_typeof(signatures_json) = 'array' then signatures_json else '[]'::jsonb end) as signatures,
      left(responses_json::text, 300) as responses_head,
      (select count(*) from industrial_sanitation_findings f where f.inspection_id = i.id)::int as findings,
      i.created_by_user_id::text as created_by
    from industrial_sanitation_inspections i
    where tenant_id = ${tenant.id}::uuid
    order by created_at desc limit 25`.catch((e) => ({ error: String(e.message) }));
} catch (e) {
  out.error = String(e?.message ?? e);
} finally {
  await sql.end({ timeout: 5 });
}
console.log("DIAG_JSON " + JSON.stringify(out));
