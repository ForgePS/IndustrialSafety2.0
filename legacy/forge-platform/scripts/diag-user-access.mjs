/**
 * READ-ONLY: roles, effective permissions, product/module access, and recent
 * authorization denials for one user in a tenant.
 *
 *   TENANT_KEY=producers-rice-mill TARGET_EMAIL=user@example.com node scripts/diag-user-access.mjs
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
const TARGET_EMAIL = (process.env.TARGET_EMAIL || "").trim().toLowerCase();
if (!TARGET_EMAIL) throw new Error("TARGET_EMAIL required");

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
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);

  const [member] = await sql`
    select u.id::text as user_id, u.status as user_status, u.person_id::text as person_id,
           u.last_login_at, m.id::text as membership_id, m.status as membership_status
    from users u
    join user_tenant_memberships m on m.user_id = u.id and m.tenant_id = ${tenant.id}::uuid
    where lower(u.primary_email) = ${TARGET_EMAIL}
    limit 1
  `;
  if (!member) throw new Error("user/membership not found");

  const roles = await sql`
    select r.code, r.name, a.status
    from membership_role_assignments a
    join roles r on r.id = a.role_id
    where a.membership_id = ${member.membership_id}::uuid
    order by r.code
  `;

  const permissions = await sql`
    select distinct p.code, rp.effect
    from membership_role_assignments a
    join role_permissions rp on rp.role_id = a.role_id
    join permissions p on p.id = rp.permission_id
    where a.membership_id = ${member.membership_id}::uuid
      and a.status = 'ACTIVE' and a.revoked_at is null
    order by p.code
  `;

  const products = await sql`
    select pp.code, mpa.status
    from membership_product_access mpa
    join platform_products pp on pp.id = mpa.product_id
    where mpa.membership_id = ${member.membership_id}::uuid
    order by pp.code
  `;

  const modules = await sql`
    select pm.code, mma.status
    from membership_module_access mma
    join platform_modules pm on pm.id = mma.module_id
    where mma.membership_id = ${member.membership_id}::uuid
    order by pm.code
  `;

  const denials = await sql`
    select created_at, permission_code, resource_type, decision, reason_code
    from authorization_decision_log
    where user_id = ${member.user_id}::uuid
      and created_at > now() - interval '3 days'
    order by created_at desc
    limit 40
  `;

  const personnel = await sql`
    select id::text as id, first_name, last_name, status, job_title
    from industrial_personnel
    where tenant_id = ${tenant.id}::uuid
      and (lower(email) = ${TARGET_EMAIL}
           or (lower(first_name) = 'clay' and lower(last_name) like 'kannad%'))
    limit 5
  `.catch((e) => [{ error: String(e.message || e) }]);

  const sanitationInspections = await sql`
    select id::text as id, inspection_number, title, status, compliance_status,
           started_at, completed_at, updated_at,
           jsonb_array_length(coalesce(signatures_json, '[]'::jsonb)) as signature_count,
           (select count(*) from jsonb_object_keys(coalesce(responses_json, '{}'::jsonb))) as response_count
    from industrial_sanitation_inspections
    where tenant_id = ${tenant.id}::uuid
      and (inspector_user_id = ${member.user_id}::uuid or created_by_user_id = ${member.user_id}::uuid
           or updated_by_user_id = ${member.user_id}::uuid)
    order by coalesce(updated_at, created_at) desc
    limit 15
  `.catch((e) => [{ error: String(e.message || e) }]);

  console.log(
    JSON.stringify(
      {
        member,
        sanitationInspections,
        roles,
        permissions: permissions.map((p) => `${p.code}${p.effect === "DENY" ? " (DENY)" : ""}`),
        products,
        modules,
        denials,
        personnel,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
