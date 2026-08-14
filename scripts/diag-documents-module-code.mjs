/**
 * READ-ONLY: resolve DOCUMENTS / document module catalog codes for Producers.
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const catalog = await sql`
      select pm.id::text as id, pm.code, pp.code as product_code, pm.name
      from platform_modules pm
      join platform_products pp on pp.id = pm.product_id
      where lower(pm.code) like '%doc%'
         or lower(pm.name) like '%doc%'
         or pm.code = 'DOCUMENTS'
      order by pp.code, pm.code
    `;
    const tenantDocs = await sql`
      select t.tenant_key, pm.code, pp.code as product_code, tme.status
      from tenant_module_entitlements tme
      join platform_modules pm on pm.id = tme.module_id
      join platform_products pp on pp.id = pm.product_id
      join tenants t on t.id = tme.tenant_id
      where t.tenant_key = 'producers-rice-mill'
        and (lower(pm.code) like '%doc%' or pm.code = 'DOCUMENTS')
    `;
    console.log(JSON.stringify({ ok: true, phase: "DIAG-DOCUMENTS-CODE", catalog, tenantDocs }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
