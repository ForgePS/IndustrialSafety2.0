/**
 * READ-ONLY: why is Personnel unavailable for producers-rice-mill?
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
    const tenantId = tenant.id;

    const modules = await sql`
      select pm.code, pm.name, pm.status as module_status, pm.implementation_status,
             tme.status as entitlement_status
      from platform_modules pm
      join platform_products pp on pp.id = pm.product_id
      left join tenant_module_entitlements tme
        on tme.module_id = pm.id and tme.tenant_id = ${tenantId}::uuid
      where pp.code = 'FORGE_INDUSTRIAL'
        and pm.code in ('PERSONNEL', 'FIRST_AID', 'CORE', 'TRAINING')
      order by pm.code
    `;

    const flags = await sql`
      select fd.key, fd.default_value_json, fo.value_json as override_value,
             (fo.id is not null) as has_override
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenantId}::uuid
      where fd.key like 'industrial%'
      order by fd.key
    `;

    const membershipAccess = await sql`
      select pm.code, count(*)::int as active_memberships
      from membership_module_access mma
      join platform_modules pm on pm.id = mma.module_id
      join user_tenant_memberships utm on utm.id = mma.membership_id
      where mma.tenant_id = ${tenantId}::uuid
        and mma.status = 'ACTIVE'
        and utm.status = 'ACTIVE'
        and pm.code in ('PERSONNEL', 'FIRST_AID')
      group by pm.code
      order by pm.code
    `;

    const rolePerms = await sql`
      select r.code as role_code, p.code as permission_code
      from roles r
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${tenantId}::uuid
        and r.status = 'ACTIVE'
        and p.code in (
          'industrial.access',
          'industrial.personnel.view',
          'industrial.personnel.manage',
          'industrial.first_aid.view',
          'industrial.first_aid.manage'
        )
      order by r.code, p.code
    `;

    console.log(JSON.stringify({ modules, flags, membershipAccess, rolePerms }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
