/**
 * Diagnose why forge-platform industrial load may fail (read-only).
 * ECS platform-api image + DATABASE_SECRET_ARN.
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

const TENANT_KEY = (process.env.TENANT_KEY || "forge-platform").trim();
const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

async function resolveDatabaseUrl(secretArn) {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });
try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, display_name, status,
           coalesce(is_demo_tenant, false) as is_demo_tenant
    from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) {
    console.log(JSON.stringify({ ok: false, error: "tenant_not_found", TENANT_KEY }, null, 2));
    process.exit(1);
  }

  const products = await sql`
    select pp.code, tp.status
    from tenant_products tp
    join platform_products pp on pp.id = tp.product_id
    where tp.tenant_id = ${tenant.id}::uuid
  `;

  const modules = await sql`
    select pm.code, tme.status
    from tenant_module_entitlements tme
    join platform_modules pm on pm.id = tme.module_id
    where tme.tenant_id = ${tenant.id}::uuid
    order by pm.code
  `;

  const memberships = await sql`
    select
      u.id::text as user_id,
      u.primary_email,
      u.status as user_status,
      m.id::text as membership_id,
      m.status as membership_status,
      m.is_default_tenant,
      (select count(*)::int from membership_role_assignments mra
        where mra.membership_id = m.id and mra.status = 'ACTIVE') as role_count,
      (select count(*)::int from membership_product_access mpa
        where mpa.membership_id = m.id and mpa.status = 'ACTIVE') as product_access_count,
      (select string_agg(r.code, ', ') from membership_role_assignments mra
        join roles r on r.id = mra.role_id
        where mra.membership_id = m.id and mra.status = 'ACTIVE') as roles,
      (select count(*)::int from role_permissions rp
        join membership_role_assignments mra on mra.role_id = rp.role_id
        join permissions p on p.id = rp.permission_id
        where mra.membership_id = m.id and mra.status = 'ACTIVE'
          and p.code = 'industrial.access') as has_industrial_access
    from user_tenant_memberships m
    join users u on u.id = m.user_id
    where m.tenant_id = ${tenant.id}::uuid
    order by u.primary_email
  `;

  const identities = await sql`
    select u.primary_email, ui.provider, ui.provider_subject
    from user_identities ui
    join users u on u.id = ui.user_id
    join user_tenant_memberships m on m.user_id = u.id
    where m.tenant_id = ${tenant.id}::uuid
  `.catch(() => []);

  const counts = await sql`
    select
      (select count(*)::int from industrial_personnel where tenant_id = ${tenant.id}::uuid) as personnel,
      (select count(*)::int from industrial_sites where tenant_id = ${tenant.id}::uuid) as sites,
      (select count(*)::int from industrial_equipment where tenant_id = ${tenant.id}::uuid) as equipment
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        at: new Date().toISOString(),
        tenant,
        products,
        moduleCount: modules.length,
        moduleCodes: modules.map((m) => `${m.code}:${m.status}`),
        memberships,
        identities,
        dataCounts: counts[0],
        diagnosisHints: [
          memberships.length === 0
            ? "No memberships on this tenant — signed-in users cannot select it."
            : null,
          memberships.every((m) => !m.has_industrial_access)
            ? "No member has industrial.access — industrial shell will FORBIDDEN on bootstrap."
            : null,
          !products.some((p) => p.code === "FORGE_INDUSTRIAL" && p.status === "ACTIVE")
            ? "FORGE_INDUSTRIAL product not ACTIVE on tenant."
            : null,
          identities.length === 0
            ? "No Cognito/user_identities linked — demo-admin cannot sign in via Cognito."
            : null,
        ].filter(Boolean),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
