#!/usr/bin/env node
/**
 * Remove Forge Demo training courses (and their assignments) from a customer tenant.
 *
 *   APPLY=1 TENANT_KEY=producers-rice-mill node scripts/purge-forge-demo-training-from-tenant.mjs
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
const FORBIDDEN = new Set(["forge-platform", "forge-industrial-demo"]);

if (FORBIDDEN.has(TENANT_KEY.toLowerCase())) {
  console.error(JSON.stringify({ ok: false, error: "refusing_demo_tenant", TENANT_KEY }));
  process.exit(1);
}

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
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error("tenant_not_found");
  await sql`select set_config('app.current_tenant_id', ${tenant.id}, true)`;

  const sources = await sql`
    select id::text as id, title, edition
    from industrial_training_sources
    where tenant_id = ${tenant.id}::uuid
      and (
        coalesce(edition, '') ilike '%Forge Demo%'
        or title like 'DEMO:%'
      )
  `;
  const sourceIds = sources.map((s) => s.id);
  let assignments = [];
  if (sourceIds.length) {
    assignments = await sql`
      select id::text as id, title, source_id::text as source_id
      from industrial_training_assignments
      where tenant_id = ${tenant.id}::uuid
        and (source_id = any(${sourceIds}::uuid[]) or title like 'DEMO:%')
    `;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        sources,
        assignmentCount: assignments.length,
        assignments: assignments.slice(0, 30),
      },
      null,
      2,
    ),
  );
  if (!APPLY) process.exit(0);

  let deletedAssignments = 0;
  let deletedSources = 0;
  if (sourceIds.length) {
    const a = await sql`
      with d as (
        delete from industrial_training_assignments
        where tenant_id = ${tenant.id}::uuid
          and (source_id = any(${sourceIds}::uuid[]) or title like 'DEMO:%')
        returning 1
      ) select count(*)::int as c from d
    `;
    deletedAssignments = Number(a[0]?.c ?? 0);
    const s = await sql`
      with d as (
        delete from industrial_training_sources
        where tenant_id = ${tenant.id}::uuid
          and id = any(${sourceIds}::uuid[])
        returning 1
      ) select count(*)::int as c from d
    `;
    deletedSources = Number(s[0]?.c ?? 0);
  }

  await sql`
    update tenants
    set is_demo_tenant = false, updated_at = now()
    where id = ${tenant.id}::uuid
  `;

  console.log(
    JSON.stringify({
      ok: true,
      deletedAssignments,
      deletedSources,
      isDemoTenant: false,
    }),
  );
} finally {
  await sql.end({ timeout: 5 });
}
