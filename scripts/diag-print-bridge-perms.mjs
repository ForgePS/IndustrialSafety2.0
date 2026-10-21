/**
 * Diag: who can manage printer bridges for a tenant + recent bridge rows.
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

const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";

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
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;

    const perm = await sql`
      select code, name from permissions
      where code in (
        'industrial.printer.manage_bridge',
        'industrial.printer.view',
        'industrial.printer.manage',
        'industrial.admin'
      )
      order by code
    `;

    const roleGrants = await sql`
      select r.code as role_code, r.name as role_name, p.code as permission_code
      from roles r
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${tenant.id}::uuid
        and p.code in (
          'industrial.printer.manage_bridge',
          'industrial.printer.view',
          'industrial.printer.manage',
          'industrial.admin'
        )
      order by r.code, p.code
    `;

    const usersWithBridge = await sql`
      select u.id::text as user_id, u.primary_email,
             array_agg(distinct r.code order by r.code) as roles
      from users u
      join user_tenant_memberships m on m.user_id = u.id and m.tenant_id = ${tenant.id}::uuid
      join membership_role_assignments mr on mr.membership_id = m.id and mr.status = 'ACTIVE'
      join roles r on r.id = mr.role_id
      join role_permissions rp on rp.role_id = r.id
      join permissions p on p.id = rp.permission_id
      where p.code in ('industrial.printer.manage_bridge', 'industrial.admin')
        and m.status = 'ACTIVE'
      group by u.id, u.primary_email
      order by u.primary_email
      limit 30
    `;

    const moduleEnt = await sql`
      select pm.code as module_code, tme.status
      from tenant_module_entitlements tme
      join platform_modules pm on pm.id = tme.module_id
      where tme.tenant_id = ${tenant.id}::uuid
        and pm.code in ('PRINT_MANAGER', 'PRINT_QUEUE', 'PRINT_HISTORY')
    `;

    const productEnt = await sql`
      select pp.code as product_code, tp.status
      from tenant_products tp
      join platform_products pp on pp.id = tp.product_id
      where tp.tenant_id = ${tenant.id}::uuid
        and pp.code = 'FORGE_INDUSTRIAL'
    `;

    console.log(
      JSON.stringify(
        { tenant, perm, roleGrants, usersWithBridge, moduleEnt, productEnt },
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
