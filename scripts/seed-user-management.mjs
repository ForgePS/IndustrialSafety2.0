/**
 * Seed Settings → User management for producers-rice-mill:
 *   1. Grant membership/invitation APIs to IND3V_INDUSTRIAL_ADMIN
 *   2. Fill missing user display names from the known Cognito roster
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/seed-user-management.mjs
 * Apply:
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-user-management.mjs
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
const ADMIN_ROLE_CODE = (process.env.ADMIN_ROLE_CODE || "IND3V_INDUSTRIAL_ADMIN").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; only producers-rice-mill is allowed`);
}

const USER_MGMT_PERMS = [
  "platform.membership.read",
  "platform.membership.manage",
  "platform.invitation.read",
  "platform.invitation.manage",
  "platform.user.invite",
  "platform.permission.read",
  "platform.role.assign",
];

const ROSTER_NAMES = new Map([
  ["jlackie@producersrice.com", "John Lackie"],
  ["kmcpherson@producersrice.com", "Kiley McPherson"],
  ["safetyadmin@producersrice.com", "Jamie Vanhouten"],
  ["sdavis2@producersrice.com", "Shannon Davis"],
]);

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
    select id::text as id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const role = (
    await sql`
      select id::text as id, code
      from roles
      where tenant_id = ${tenantId}::uuid and code = ${ADMIN_ROLE_CODE}
      limit 1
    `
  )[0];
  if (!role) throw new Error(`role ${ADMIN_ROLE_CODE} not found`);

  const catalog = await sql`
    select code, id::text as id from permissions where code = any(${USER_MGMT_PERMS})
  `;
  const byCode = new Map(catalog.map((row) => [row.code, row.id]));
  const missingCatalog = USER_MGMT_PERMS.filter((code) => !byCode.has(code));

  const held = await sql`
    select p.code
    from role_permissions rp
    join permissions p on p.id = rp.permission_id
    where rp.role_id = ${role.id}::uuid and rp.effect = 'ALLOW'
  `;
  const allowed = new Set(held.map((row) => row.code));
  const toGrant = USER_MGMT_PERMS.filter((code) => byCode.has(code) && !allowed.has(code));

  if (APPLY) {
    for (const code of toGrant) {
      await sql`
        insert into role_permissions (role_id, permission_id, effect, created_at)
        values (${role.id}::uuid, ${byCode.get(code)}::uuid, 'ALLOW', now())
        on conflict (role_id, permission_id, effect) do nothing
      `;
    }
  }

  const users = await sql`
    select
      u.id::text as user_id,
      u.primary_email,
      u.username,
      p.display_name as person_name,
      ip.display_name as personnel_name
    from user_tenant_memberships m
    join users u on u.id = m.user_id
    left join persons p on p.id = u.person_id
    left join industrial_personnel ip
      on ip.tenant_id = ${tenantId}::uuid
     and lower(ip.email) = lower(u.primary_email)
     and ip.archived_at is null
    where m.tenant_id = ${tenantId}::uuid
    order by u.primary_email
  `;

  const nameUpdates = [];
  for (const user of users) {
    const current = (user.username || user.person_name || "").trim();
    const next =
      ROSTER_NAMES.get(String(user.primary_email).toLowerCase()) ||
      (user.personnel_name ? String(user.personnel_name).trim() : "") ||
      "";
    if (next && current !== next) {
      nameUpdates.push({
        userId: user.user_id,
        email: user.primary_email,
        from: current || null,
        to: next,
      });
      if (APPLY) {
        await sql`
          update users
          set username = ${next}, updated_at = now(), record_version = record_version + 1
          where id = ${user.user_id}::uuid
        `;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        tenant: tenant[0],
        adminRole: role,
        missingCatalog,
        permissionsGranted: toGrant,
        alreadyHeld: USER_MGMT_PERMS.filter((code) => allowed.has(code)),
        nameUpdates,
        users: users.map((row) => ({
          email: row.primary_email,
          username: row.username,
          personName: row.person_name,
          personnelName: row.personnel_name,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
