#!/usr/bin/env node
/**
 * Count active LOTO procedures for a tenant (read-only).
 * Run via: FORGE_ENV=production node scripts/run-ecs-diag-loto-count.mjs
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

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant) {
    console.log(JSON.stringify({ error: "tenant_not_found", TENANT_KEY }));
    process.exit(1);
  }
  const [counts] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where archived_at is null)::int as active,
      count(*) filter (where archived_at is not null)::int as archived
    from industrial_loto_procedures
    where tenant_id = ${tenant.id}::uuid
  `;
  const samples = await sql`
    select id::text as id, title, status, procedure_number, updated_at
    from industrial_loto_procedures
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    order by updated_at desc
    limit 10
  `;
  console.log(
    JSON.stringify(
      {
        tenant,
        counts,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
