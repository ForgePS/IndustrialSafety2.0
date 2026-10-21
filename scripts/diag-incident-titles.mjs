/**
 * Spot-check incident titles for producers-rice-mill.
 * TENANT_KEY=producers-rice-mill node scripts/diag-incident-titles.mjs
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
const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

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

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });
try {
  const [tenant] = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  const rows = await sql`
    select title,
      title ~ '^\d{2}/\d{2}/\d{2}' as slash_date,
      title ~ '^\d{2}-\d{2}-\d{2} {3}' as formatted
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
  `;
  const slash = rows.filter((r) => r.slash_date).map((r) => r.title);
  const sample = await sql`
    select title from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
      and (
        title ilike '%Don Baity%'
        or title ilike '%Oscar Curlett%'
        or title ilike '%Jimmy Sanner%'
        or title ilike '%Stephen Parr%'
        or title ilike '%Garry Guydon%'
        or title ilike '%Christopher Jordan%'
      )
    order by title
  `;
  const counts = {
    total: rows.length,
    slashDate: rows.filter((r) => r.slash_date).length,
    formattedTripleSpace: rows.filter((r) => r.formatted).length,
  };
  console.log(JSON.stringify({ counts, slashSample: slash.slice(0, 20), namedSample: sample.map((r) => r.title) }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
