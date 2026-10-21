#!/usr/bin/env node
/**
 * Diagnose demo-like data on a tenant (FORGE_DEMO markers + common synthetic names).
 * Runs in platform-api ECS.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-demo-data-on-tenant.mjs
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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, slug,
           coalesce(is_demo_tenant, false) as is_demo_tenant,
           display_name
    from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) {
    console.error(JSON.stringify({ ok: false, error: "tenant_not_found", TENANT_KEY }));
    process.exit(1);
  }
  const tid = tenant.id;
  await sql`select set_config('app.current_tenant_id', ${tid}, true)`;
  // Also try bypass role if available
  try {
    await sql`select set_config('app.rls_bypass', 'true', true)`;
  } catch {
    /* optional */
  }

  const counts = await sql`
    select
      (select count(*)::int from industrial_sites where tenant_id = ${tid}::uuid) as sites_total,
      (select count(*)::int from industrial_sites where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO') as sites_forge_demo,
      (select count(*)::int from industrial_sites where tenant_id = ${tid}::uuid and name ilike '%Manufacturing Plant%') as sites_mfg_name,
      (select count(*)::int from industrial_personnel where tenant_id = ${tid}::uuid) as personnel_total,
      (select count(*)::int from industrial_personnel where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO') as personnel_forge_demo,
      (select count(*)::int from industrial_personnel where tenant_id = ${tid}::uuid and employee_number like 'DEMO-%') as personnel_demo_emp,
      (select count(*)::int from industrial_personnel where tenant_id = ${tid}::uuid and coalesce(email,'') ilike '%forge-demo%') as personnel_demo_email,
      (select count(*)::int from industrial_incidents where tenant_id = ${tid}::uuid and source_system = 'FORGE_DEMO') as incidents_forge_demo,
      (select count(*)::int from industrial_training_sources where tenant_id = ${tid}::uuid and title like 'DEMO:%') as training_demo_title,
      (select count(*)::int from industrial_training_sources where tenant_id = ${tid}::uuid and coalesce(edition,'') ilike '%Forge Demo%') as training_forge_demo_edition
  `;

  const sourceSystems = await sql`
    select source_system, count(*)::int as c
    from industrial_personnel
    where tenant_id = ${tid}::uuid
    group by source_system
    order by c desc
    limit 20
  `;

  const siteNames = await sql`
    select name, source_system
    from industrial_sites
    where tenant_id = ${tid}::uuid
    order by created_at desc nulls last
    limit 15
  `;

  const samplePeople = await sql`
    select employee_number, display_name, email, company_name, source_system
    from industrial_personnel
    where tenant_id = ${tid}::uuid
    order by created_at desc nulls last
    limit 10
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant,
        counts: counts[0],
        personnelSourceSystems: sourceSystems,
        recentSites: siteNames,
        recentPersonnel: samplePeople,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
