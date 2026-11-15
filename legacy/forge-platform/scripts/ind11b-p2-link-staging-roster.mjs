/**
 * Link Cognito-created Producers roster into a Producers Aurora tenant.
 * Runs inside platform-api ECS (DATABASE_SECRET_ARN).
 *
 * Env:
 *   DATABASE_SECRET_ARN
 *   FORGE_P2_TARGET_TENANT_ID — staging or prod twin UUID
 *   FORGE_P2_LINK_PAYLOAD_S3_BUCKET + FORGE_P2_LINK_PAYLOAD_S3_KEY
 *   (or FORGE_P2_LINK_PAYLOAD_JSON for tiny payloads)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const { S3Client, GetObjectCommand } = apiRequire("@aws-sdk/client-s3");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_ID =
  process.env.FORGE_P2_TARGET_TENANT_ID?.trim() || "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const ADMIN_ROLE = "IND3V_INDUSTRIAL_ADMIN";
const OPERATOR_ROLE = "IND3V_INDUSTRIAL_OPERATOR";

const OPERATOR_PERMS = [
  "industrial.access",
  "industrial.personnel.view",
  "industrial.training.view",
  "industrial.forms.view",
  "industrial.inspections.view",
  "industrial.incidents.view",
  "industrial.equipment.view",
  "industrial.loto.view",
  "industrial.confined_space.view",
  "industrial.hot_work.view",
  "import.view",
];

const DAY1_MODULES = [
  "PERSONNEL",
  "EQUIPMENT",
  "LOCKOUT_TAGOUT",
  "TRAINING",
  "FORMS",
  "INSPECTIONS",
  "INCIDENTS",
  "QR_LINKS",
  "CONFINED_SPACE",
  "HOT_WORK",
  "TASKS",
  "MESSAGING",
  "EMERGENCY_RESPONSE",
  "DOCUMENTS",
  "REPORTING",
];

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

async function ensureRole(sql, tenantId, code, permCodes) {
  let role = await sql`
    select id::text as id from roles
    where tenant_id = ${tenantId}::uuid and code = ${code}
    limit 1
  `;
  if (!role[0]) {
    const id = randomUUID();
    await sql`
      insert into roles (
        id, tenant_id, code, name, description, status, is_system_managed, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${code}, ${code},
        ${`Producers P2 ${code}`}, 'ACTIVE', false, now(), now()
      )
    `;
    role = await sql`select id::text as id from roles where id = ${id}::uuid`;
  }
  const roleId = role[0].id;
  for (const pcode of permCodes) {
    const perm = await sql`select id::text as id from permissions where code = ${pcode} limit 1`;
    if (!perm[0]) continue;
    const existing = await sql`
      select 1 from role_permissions
      where role_id = ${roleId}::uuid and permission_id = ${perm[0].id}::uuid
      limit 1
    `;
    if (!existing[0]) {
      await sql`
        insert into role_permissions (role_id, permission_id, effect, created_at)
        values (${roleId}::uuid, ${perm[0].id}::uuid, 'ALLOW', now())
      `;
    }
  }
  return roleId;
}

async function linkOne(sql, row, roleIds, productId) {
  const email = String(row.email).trim().toLowerCase();
  const subject = row.subject;
  const roleCode = row.roleCode;
  const roleId = roleIds[roleCode];
  if (!roleId) throw new Error(`Unknown role ${roleCode}`);

  // Prefer existing Cognito-linked user (do not move identity).
  const bySub = await sql`
    select user_id::text as user_id from authentication_identities
    where provider = 'COGNITO' and provider_subject = ${subject}
    limit 1
  `;
  let userId;
  let userReuse = false;
  if (bySub[0]) {
    userId = bySub[0].user_id;
    userReuse = true;
  } else {
    const byEmail = await sql`
      select id::text as id from users where lower(primary_email) = ${email} limit 1
    `;
    if (byEmail[0]) {
      userId = byEmail[0].id;
      userReuse = true;
    } else {
      userId = randomUUID();
      await sql`
        insert into users (id, tenant_id, primary_email, status, activated_at, created_at, updated_at)
        values (${userId}::uuid, ${TENANT_ID}::uuid, ${email}, 'ACTIVE', now(), now(), now())
      `;
    }
  }

  let membership = await sql`
    select id::text as id, status from user_tenant_memberships
    where tenant_id = ${TENANT_ID}::uuid and user_id = ${userId}::uuid
    limit 1
  `;
  let membershipCreated = false;
  if (!membership[0]) {
    const id = randomUUID();
    await sql`
      insert into user_tenant_memberships (
        id, tenant_id, user_id, status, is_default_tenant, activated_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${TENANT_ID}::uuid, ${userId}::uuid, 'ACTIVE', false, now(), now(), now()
      )
    `;
    membership =
      await sql`select id::text as id, status from user_tenant_memberships where id = ${id}::uuid`;
    membershipCreated = true;
  } else if (membership[0].status !== "ACTIVE") {
    await sql`
      update user_tenant_memberships
      set status = 'ACTIVE', updated_at = now(), activated_at = coalesce(activated_at, now())
      where id = ${membership[0].id}::uuid
    `;
  }
  const membershipId = membership[0].id;

  const existingRole = await sql`
    select id::text as id from membership_role_assignments
    where membership_id = ${membershipId}::uuid and role_id = ${roleId}::uuid
    limit 1
  `;
  if (!existingRole[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_role_assignments (
        id, tenant_id, membership_id, role_id, status, granted_by_user_id, granted_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${TENANT_ID}::uuid, ${membershipId}::uuid, ${roleId}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now(), now()
      )
    `;
  }

  const mpa = await sql`
    select id::text as id from membership_product_access
    where membership_id = ${membershipId}::uuid and product_id = ${productId}::uuid
    limit 1
  `;
  if (!mpa[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_product_access (
        id, tenant_id, membership_id, product_id, status, granted_by_user_id, created_at, updated_at
      ) values (
        ${id}::uuid, ${TENANT_ID}::uuid, ${membershipId}::uuid, ${productId}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now()
      )
    `;
  }

  let modules = 0;
  for (const code of DAY1_MODULES) {
    const mod = await sql`
      select id::text as id from platform_modules
      where product_id = ${productId}::uuid and code = ${code}
      limit 1
    `;
    if (!mod[0]) continue;
    const tme = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${TENANT_ID}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!tme[0] || tme[0].status !== "ACTIVE") continue;
    const mma = await sql`
      select id::text as id from membership_module_access
      where membership_id = ${membershipId}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!mma[0]) {
      const id = randomUUID();
      await sql`
        insert into membership_module_access (
          id, tenant_id, membership_id, module_id, status, granted_by_user_id, created_at, updated_at
        ) values (
          ${id}::uuid, ${TENANT_ID}::uuid, ${membershipId}::uuid, ${mod[0].id}::uuid,
          'ACTIVE', ${userId}::uuid, now(), now()
        )
      `;
    }
    modules += 1;
  }

  let identityAction = "reused";
  const ident = await sql`
    select id::text as id from authentication_identities
    where provider = 'COGNITO' and provider_subject = ${subject}
    limit 1
  `;
  if (!ident[0]) {
    const id = randomUUID();
    await sql`
      insert into authentication_identities (
        id, tenant_id, user_id, provider, provider_subject, email_at_link_time,
        created_at, last_authenticated_at
      ) values (
        ${id}::uuid, ${TENANT_ID}::uuid, ${userId}::uuid, 'COGNITO', ${subject},
        ${email}, now(), now()
      )
    `;
    identityAction = "created";
  } else {
    await sql`
      update authentication_identities
      set last_authenticated_at = now(), email_at_link_time = ${email}
      where id = ${ident[0].id}::uuid
    `;
  }

  return {
    email,
    subject,
    userId,
    userReuse,
    membershipId,
    membershipCreated,
    roleCode,
    modules,
    identityAction,
  };
}

async function loadRows() {
  const bucket = process.env.FORGE_P2_LINK_PAYLOAD_S3_BUCKET?.trim();
  const key = process.env.FORGE_P2_LINK_PAYLOAD_S3_KEY?.trim();
  if (bucket && key) {
    const s3 = new S3Client({});
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await r.Body.transformToString("utf8");
    return JSON.parse(text).filter((row) => row.ok && row.subject);
  }
  const raw = process.env.FORGE_P2_LINK_PAYLOAD_JSON?.trim();
  if (!raw) throw new Error("FORGE_P2_LINK_PAYLOAD_S3_* or FORGE_P2_LINK_PAYLOAD_JSON required");
  return JSON.parse(raw).filter((row) => row.ok && row.subject);
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const rows = await loadRows();
  if (!rows.length) throw new Error("Link payload contained zero linkable users");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const tenant = await sql`select tenant_key from tenants where id = ${TENANT_ID}::uuid`;
    if (!tenant[0]) throw new Error("Staging tenant missing");

    const product = await sql`
      select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
    `;
    if (!product[0]) throw new Error("FORGE_INDUSTRIAL missing");

    // Admin role already seeded; ensure perms remain. Operator role created if missing.
    const adminPerms = await sql`
      select p.code from role_permissions rp
      join roles r on r.id = rp.role_id
      join permissions p on p.id = rp.permission_id
      where r.tenant_id = ${TENANT_ID}::uuid and r.code = ${ADMIN_ROLE}
    `;
    const adminPermCodes = adminPerms.map((r) => r.code);
    const adminRoleId = await ensureRole(
      sql,
      TENANT_ID,
      ADMIN_ROLE,
      adminPermCodes.length ? adminPermCodes : OPERATOR_PERMS,
    );
    const operatorRoleId = await ensureRole(sql, TENANT_ID, OPERATOR_ROLE, OPERATOR_PERMS);

    const results = [];
    for (const row of rows) {
      results.push(
        await linkOne(
          sql,
          row,
          { [ADMIN_ROLE]: adminRoleId, [OPERATOR_ROLE]: operatorRoleId },
          product[0].id,
        ),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "PRODUCERS-P2-link-staging-roster",
          tenantId: TENANT_ID,
          tenantKey: tenant[0].tenant_key,
          linked: results.length,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
  process.exit(1);
});
