/**
 * Phase 1: provision Producers Rice Mill staging + production twin tenants
 * in development Aurora (forge_admin via DATABASE_SECRET_ARN).
 *
 * Creates: tenants, industrial admin role/user, FORGE_INDUSTRIAL product,
 * day-1 module entitlements, membership access, tenant feature overrides.
 *
 * Does NOT: Cognito identity link, Storage copy, data ETL, DNS.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANTS = [
  {
    key: "producers-rice-mill-staging",
    slug: "producers-rice-mill-staging",
    name: "Producers Rice Mill (Staging)",
  },
  {
    key: "producers-rice-mill",
    slug: "producers-rice-mill",
    name: "Producers Rice Mill",
  },
];

const ROLE_CODE = "IND3V_INDUSTRIAL_ADMIN";

const MODULE_CODES = [
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
  "IMPORT",
  "FLEET",
];

const FLAG_KEYS = [
  "industrial.enabled",
  "industrial.module.personnel.enabled",
  "industrial.module.equipment.enabled",
  "industrial.module.loto.enabled",
  "industrial.module.training.enabled",
  "industrial.module.forms.enabled",
  "industrial.module.inspections.enabled",
  "industrial.module.incidents.enabled",
  "industrial.module.qr_links.enabled",
  "industrial.module.confined_space.enabled",
  "industrial.module.hot_work.enabled",
  "industrial.module.tasks.enabled",
  "industrial.module.messaging.enabled",
  "industrial.module.emergency_response.enabled",
  "industrial.module.documents.enabled",
  "industrial.module.reporting.enabled",
  "industrial.module.fleet.enabled",
];

const ADMIN_PERMS = [
  "industrial.access",
  "industrial.personnel.view",
  "industrial.personnel.manage",
  "industrial.training.view",
  "industrial.training.manage",
  "industrial.forms.view",
  "industrial.forms.manage",
  "industrial.inspections.view",
  "industrial.inspections.manage",
  "industrial.incidents.view",
  "industrial.incidents.manage",
  "industrial.equipment.view",
  "industrial.equipment.manage",
  "industrial.fleet.view",
  "industrial.fleet.manage",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.loto.approve",
  "industrial.confined_space.view",
  "industrial.confined_space.manage",
  "industrial.confined_space.approve",
  "industrial.hot_work.view",
  "industrial.hot_work.manage",
  "industrial.hot_work.approve",
  "import.view",
  "import.upload",
  "import.template.manage",
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

async function ensureTenant(sql, t) {
  const existing = await sql`
    select id::text as id, tenant_key from tenants where tenant_key = ${t.key} limit 1
  `;
  if (existing[0]) return { id: existing[0].id, created: false };
  const id = randomUUID();
  await sql`
    insert into tenants (
      id, tenant_key, slug, legal_name, display_name, tenant_type, status,
      timezone, default_locale, data_region, created_at, updated_at
    ) values (
      ${id}::uuid, ${t.key}, ${t.slug}, ${t.name}, ${t.name}, 'CUSTOMER', 'ACTIVE',
      'America/Chicago', 'en-US', 'us-east-1', now(), now()
    )
  `;
  return { id, created: true };
}

async function ensureRole(sql, tenantId) {
  let role = await sql`
    select id::text as id from roles
    where tenant_id = ${tenantId}::uuid and code = ${ROLE_CODE}
    limit 1
  `;
  if (!role[0]) {
    const id = randomUUID();
    await sql`
      insert into roles (
        id, tenant_id, code, name, description, status, is_system_managed, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${ROLE_CODE}, ${ROLE_CODE},
        'Producers P2 industrial admin', 'ACTIVE', false, now(), now()
      )
    `;
    role = await sql`select id::text as id from roles where id = ${id}::uuid`;
  }
  const roleId = role[0].id;
  const missingFromCatalog = [];
  for (const code of ADMIN_PERMS) {
    const perm = await sql`
      select id::text as id from permissions where code = ${code} limit 1
    `;
    if (!perm[0]) {
      missingFromCatalog.push(code);
      continue;
    }
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

  // Skipping an absent catalog row in silence produced a role named ADMIN that
  // held manage on only three modules, which hid every Create/edit form in
  // industrial-web with no error anywhere. Fail loudly: the platform permission
  // seed (packages/database/src/seed.ts, ALL_PERMISSIONS) needs to run first.
  if (missingFromCatalog.length > 0) {
    throw new Error(
      `Permission catalog is missing ${missingFromCatalog.length} code(s) required by ${ROLE_CODE}: ` +
        `${missingFromCatalog.join(", ")}. Run the platform permission seed before this script.`,
    );
  }
  return roleId;
}

async function ensureAdminUser(sql, tenantId, tenantKey, roleId) {
  const email = `p2-admin@${tenantKey}.forge.test`;
  let user = await sql`
    select id::text as id from users
    where tenant_id = ${tenantId}::uuid and lower(primary_email) = ${email}
    limit 1
  `;
  let userCreated = false;
  if (!user[0]) {
    const id = randomUUID();
    await sql`
      insert into users (
        id, tenant_id, primary_email, status, activated_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${email}, 'ACTIVE', now(), now(), now()
      )
    `;
    user = await sql`select id::text as id from users where id = ${id}::uuid`;
    userCreated = true;
  }
  const userId = user[0].id;

  let membership = await sql`
    select id::text as id, status from user_tenant_memberships
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid
    limit 1
  `;
  let membershipCreated = false;
  if (!membership[0]) {
    const id = randomUUID();
    await sql`
      insert into user_tenant_memberships (
        id, tenant_id, user_id, status, is_default_tenant, activated_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'ACTIVE', true, now(), now(), now()
      )
    `;
    membership = await sql`select id::text as id, status from user_tenant_memberships where id = ${id}::uuid`;
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
        ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${roleId}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now(), now()
      )
    `;
  }

  return { userId, email, userCreated, membershipId, membershipCreated };
}

async function entitle(sql, tenantId, membershipId, userId) {
  const product = await sql`
    select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
  `;
  if (!product[0]) throw new Error("FORGE_INDUSTRIAL product missing — run platform catalog seed first");

  const tp = await sql`
    select id::text as id from tenant_products
    where tenant_id = ${tenantId}::uuid and product_id = ${product[0].id}::uuid
    limit 1
  `;
  if (!tp[0]) {
    const id = randomUUID();
    await sql`
      insert into tenant_products (id, tenant_id, product_id, status, enabled_at, created_at, updated_at)
      values (${id}::uuid, ${tenantId}::uuid, ${product[0].id}::uuid, 'ACTIVE', now(), now(), now())
    `;
  }

  const mpa = await sql`
    select id::text as id from membership_product_access
    where membership_id = ${membershipId}::uuid and product_id = ${product[0].id}::uuid
    limit 1
  `;
  if (!mpa[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_product_access (
        id, tenant_id, membership_id, product_id, status, granted_by_user_id, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${product[0].id}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now()
      )
    `;
  }

  let modulesEntitled = 0;
  const missingModules = [];
  for (const code of MODULE_CODES) {
    const mod = await sql`
      select id::text as id from platform_modules
      where product_id = ${product[0].id}::uuid and code = ${code}
      limit 1
    `;
    if (!mod[0]) {
      missingModules.push(code);
      continue;
    }
    const tme = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${tenantId}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!tme[0]) {
      const id = randomUUID();
      await sql`
        insert into tenant_module_entitlements (
          id, tenant_id, module_id, status, starts_at, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${mod[0].id}::uuid, 'ACTIVE', now(), now(), now()
        )
      `;
    } else if (tme[0].status !== "ACTIVE") {
      await sql`
        update tenant_module_entitlements set status = 'ACTIVE', updated_at = now()
        where id = ${tme[0].id}::uuid
      `;
    }
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
          ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${mod[0].id}::uuid,
          'ACTIVE', ${userId}::uuid, now(), now()
        )
      `;
    }
    modulesEntitled += 1;
  }
  return { modulesEntitled, missingModules };
}

async function enableFlags(sql, tenantId, actorUserId) {
  const results = [];
  for (const key of FLAG_KEYS) {
    let def = await sql`
      select id::text as id from feature_definitions where key = ${key} limit 1
    `;
    if (!def[0]) {
      results.push({ key, action: "skipped_missing_definition" });
      continue;
    }
    const ov = await sql`
      select id::text as id from feature_overrides
      where tenant_id = ${tenantId}::uuid and feature_definition_id = ${def[0].id}::uuid
      limit 1
    `;
    if (!ov[0]) {
      const id = randomUUID();
      await sql`
        insert into feature_overrides (
          id, tenant_id, feature_definition_id, value_json, created_by_user_id, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${def[0].id}::uuid, 'true'::jsonb,
          ${actorUserId}::uuid, now(), now()
        )
      `;
      results.push({ key, action: "created" });
    } else {
      await sql`
        update feature_overrides
        set value_json = 'true'::jsonb, updated_at = now()
        where id = ${ov[0].id}::uuid
      `;
      results.push({ key, action: "updated" });
    }
  }
  return results;
}

async function seedOne(sql, t) {
  const tenant = await ensureTenant(sql, t);
  const roleId = await ensureRole(sql, tenant.id);
  const admin = await ensureAdminUser(sql, tenant.id, t.key, roleId);
  const entitlements = await entitle(sql, tenant.id, admin.membershipId, admin.userId);
  const flags = await enableFlags(sql, tenant.id, admin.userId);
  return {
    tenantKey: t.key,
    tenantId: tenant.id,
    tenantCreated: tenant.created,
    roleId,
    admin,
    entitlements,
    flagsEnabled: flags.filter((f) => f.action !== "skipped_missing_definition").length,
    flagSkipped: flags.filter((f) => f.action === "skipped_missing_definition").map((f) => f.key),
  };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const results = [];
    for (const t of TENANTS) {
      results.push(await seedOne(sql, t));
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "PRODUCERS-P2-PHASE1-SEED",
          at: new Date().toISOString(),
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

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
