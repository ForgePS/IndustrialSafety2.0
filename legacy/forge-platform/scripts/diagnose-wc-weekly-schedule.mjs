#!/usr/bin/env node
/**
 * Read-only: Workers' Comp weekly status legacy setting and its Reporting schedule(s).
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
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const [setting] = await sql`
    select value_json as "valueJson", updated_at as "updatedAt"
    from tenant_settings
    where tenant_id = ${tenant.id}::uuid
      and namespace = 'industrial'
      and setting_key = 'workers_comp.weekly_status'
    limit 1
  `;
  const schedules = await sql`
    select s.id::text as id, s.name, s.cron_expression as "cronExpression", s.enabled,
           s.format, s.next_run_at as "nextRunAt", s.last_run_at as "lastRunAt",
           s.created_at as "createdAt",
           coalesce(
             (select json_agg(r.email order by r.email) from report_recipients r where r.schedule_id = s.id),
             '[]'::json
           ) as recipients
    from report_schedules s
    join report_definitions d on d.id = s.report_definition_id
    where s.tenant_id = ${tenant.id}::uuid
      and s.deleted_at is null
      and d.source_key = 'workers_comp.weekly_status'
  `;
  console.log(JSON.stringify({ tenantKey: TENANT_KEY, setting: setting ?? null, schedules }));
} finally {
  await sql.end({ timeout: 5 });
}
