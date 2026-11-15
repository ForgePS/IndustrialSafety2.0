#!/usr/bin/env node
/**
 * Broader "looks like demo" scan for a customer tenant (read-only).
 *   TENANT_KEY=producers-rice-mill node scripts/diag-demo-like-content-on-tenant.mjs
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
try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, display_name, legal_name,
           coalesce(is_demo_tenant, false) as is_demo_tenant
    from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error("tenant_not_found");
  const tid = tenant.id;
  await sql`select set_config('app.current_tenant_id', ${tid}, true)`;

  const siteDemoLike = await sql`
    select name, source_system
    from industrial_sites
    where tenant_id = ${tid}::uuid
      and (
        name ilike '%manufacturing plant%'
        or name ilike '%forge demo%'
        or name ilike '%demo %'
        or source_system = 'FORGE_DEMO'
      )
    order by name
    limit 30
  `;

  const trainingDemoLike = await sql`
    select title, edition, status
    from industrial_training_sources
    where tenant_id = ${tid}::uuid
      and (
        title like 'DEMO:%'
        or coalesce(edition,'') ilike '%Forge Demo%'
        or title ilike '%forge demo%'
      )
    order by title
    limit 30
  `;

  const companyPeople = await sql`
    select count(*)::int as c
    from industrial_personnel
    where tenant_id = ${tid}::uuid
      and coalesce(company_name,'') ilike '%forge demo%'
  `;

  const brandingRows = await sql`
    select key, left(coalesce(value::text, ''), 200) as value_preview
    from tenant_config_entries
    where tenant_id = ${tid}::uuid
      and (
        key ilike '%brand%'
        or key ilike '%company%'
        or key ilike '%profile%'
        or key ilike '%presentation%'
      )
    order by key
    limit 40
  `.catch(async () => {
    // schema variants
    try {
      return await sql`
        select namespace as key, left(coalesce(payload::text, ''), 200) as value_preview
        from tenant_configs
        where tenant_id = ${tid}::uuid
        order by namespace
        limit 40
      `;
    } catch {
      return [];
    }
  });

  const forgeDemoAnywhere = await sql`
    select 'personnel' as kind, count(*)::int as c from industrial_personnel
      where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO'
    union all
    select 'equipment', count(*)::int from industrial_equipment
      where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO'
    union all
    select 'incidents', count(*)::int from industrial_incidents
      where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO'
    union all
    select 'tasks', count(*)::int from industrial_tasks
      where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO'
    union all
    select 'sites', count(*)::int from industrial_sites
      where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO'
  `.catch(() => []);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant,
        forgeDemoAnywhere,
        siteDemoLike,
        trainingDemoLike,
        companyPeopleForgeDemo: companyPeople[0]?.c ?? 0,
        brandingRows,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
