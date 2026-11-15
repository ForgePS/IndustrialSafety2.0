/**
 * READ-ONLY: PERSONNEL entitlement window + product access for producers.
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

const TENANT_KEY = "producers-rice-mill";

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
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;

    const entitlements = await sql`
      select pm.code, tme.status, tme.starts_at, tme.ends_at
      from tenant_module_entitlements tme
      join platform_modules pm on pm.id = tme.module_id
      where tme.tenant_id = ${tenant.id}::uuid
        and pm.code in ('PERSONNEL', 'FIRST_AID', 'CORE')
      order by pm.code
    `;

    const products = await sql`
      select pp.code, tp.status
      from tenant_products tp
      join platform_products pp on pp.id = tp.product_id
      where tp.tenant_id = ${tenant.id}::uuid
      order by pp.code
    `;

    const mpa = await sql`
      select u.primary_email as email, pp.code as product, mpa.status
      from membership_product_access mpa
      join platform_products pp on pp.id = mpa.product_id
      join user_tenant_memberships utm on utm.id = mpa.membership_id
      join users u on u.id = utm.user_id
      where mpa.tenant_id = ${tenant.id}::uuid
        and utm.status = 'ACTIVE'
        and pp.code = 'FORGE_INDUSTRIAL'
      order by u.primary_email
    `;

    // Any explicit OFF override for personnel module flag?
    const allIndustrialFlags = await sql`
      select fd.key, fd.default_value_json, fo.value_json as override_value,
             (fo.id is not null) as has_override
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenant.id}::uuid
      where fd.key like 'industrial%personnel%'
         or fd.key = 'industrial.enabled'
         or fd.key = 'industrial.module.personnel.enabled'
      order by fd.key
    `;

    console.log(
      JSON.stringify(
        { entitlements, products, mpa, allIndustrialFlags, now: new Date().toISOString() },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
