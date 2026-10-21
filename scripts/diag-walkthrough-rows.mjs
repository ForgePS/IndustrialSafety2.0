/**
 * ECS one-off: dump walkthrough rows for Producers + overview code.
 * Env: DATABASE_SECRET_ARN, FORGE_ENVIRONMENT
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const PRODUCERS = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const CODE = "forge-industrial-safety-complete-platform-overview";

async function resolveDatabaseUrl(secretArn) {
  const sm = new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(out.SecretString ?? "{}");
  const host = raw.host || raw.hostname;
  const port = raw.port || 5432;
  const dbname = raw.dbname || raw.database || "forge";
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenants = await sql`
    SELECT id::text, code, name
    FROM tenants
    WHERE id = ${PRODUCERS}::uuid
       OR code ILIKE '%producer%'
       OR name ILIKE '%producer%'
    ORDER BY name
    LIMIT 20
  `;

  const rows = await sql`
    SELECT
      w.id::text AS id,
      w.tenant_id::text AS tenant_id,
      t.code AS tenant_code,
      t.name AS tenant_name,
      w.code,
      w.name,
      w.status,
      w.created_at,
      w.updated_at
    FROM walkthroughs w
    JOIN tenants t ON t.id = w.tenant_id
    WHERE w.tenant_id = ${PRODUCERS}::uuid
       OR w.code = ${CODE}
       OR t.code ILIKE '%producer%'
    ORDER BY w.tenant_id, w.created_at DESC
    LIMIT 50
  `;

  const counts = await sql`
    SELECT tenant_id::text, COUNT(*)::int AS n
    FROM walkthroughs
    GROUP BY tenant_id
    ORDER BY n DESC
    LIMIT 30
  `;

  const uidx = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'walkthroughs'
    ORDER BY indexname
  `;

  console.log(JSON.stringify({ tenants, walkthroughs: rows, countsByTenant: counts, indexes: uidx }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
