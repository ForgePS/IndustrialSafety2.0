/**
 * READ-ONLY: site assignment for mixed-case Active personnel.
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
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenant[0].id;

  const byStatusSite = await sql`
    select
      status,
      count(*)::int as count,
      count(*) filter (where site_id is null)::int as missing_site_id,
      count(*) filter (where coalesce(btrim(source_payload->>'site'), btrim(source_payload->>'siteName'), btrim(source_payload->>'location'), '') = '')::int as missing_site_label
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
    group by status
    order by count desc
  `;

  const activeNoSite = await sql`
    select id::text, status, display_name, site_id::text,
      coalesce(source_payload->>'site', source_payload->>'siteName', source_payload->>'location') as site_label
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and status in ('Active', 'ACTIVE')
      and site_id is null
    order by status, display_name
    limit 30
  `;

  console.log(JSON.stringify({ byStatusSite, activeNoSiteSample: activeNoSite }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
