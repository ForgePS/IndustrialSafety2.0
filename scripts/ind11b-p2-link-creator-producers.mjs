/**
 * Producers P2: grant existing Cognito-linked creator (ba491113…) membership
 * + Industrial admin access on Producers staging and prod twin tenants.
 * Does not move home tenant or rewrite authentication_identities.
 *
 * Env:
 *   DATABASE_SECRET_ARN
 *   FORGE_P2_LINK_EMAIL (default admin@forgepublicsafety.com)
 *   FORGE_P2_LINK_COGNITO_SUB (required)
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

const EMAIL = (process.env.FORGE_P2_LINK_EMAIL ?? "admin@forgepublicsafety.com")
  .trim()
  .toLowerCase();
const COGNITO_SUB = (process.env.FORGE_P2_LINK_COGNITO_SUB ?? "").trim();
const ROLE_CODE = "IND3V_INDUSTRIAL_ADMIN";

const TENANTS = [
  {
    key: "producers-rice-mill-staging",
    id: "0882c865-59c2-49a6-ab88-ce6ca89be30c",
  },
  {
    key: "producers-rice-mill",
    id: "5da680d3-50f5-46ac-8b85-6cf454b6a0da",
  },
];

/** Day-1 allowlist from plan 56 / prep 57 (+ EQUIPMENT peers already seeded). */
const INDUSTRIAL_MODULE_CODES = [
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

async function linkTenant(sql, tenantId, tenantKey, userId) {
  const role = await sql`
    select id::text as id from roles
    where tenant_id = ${tenantId}::uuid and code = ${ROLE_CODE}
    limit 1
  `;
  if (!role[0]) {
    throw new Error(`Role ${ROLE_CODE} missing on ${tenantKey} — re-run Phase 1 seed`);
  }

  let membership = await sql`
    select id::text as id, status
    from user_tenant_memberships
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
        ${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'ACTIVE', false, now(), now(), now()
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
    where membership_id = ${membershipId}::uuid and role_id = ${role[0].id}::uuid
    limit 1
  `;
  if (!existingRole[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_role_assignments (
        id, tenant_id, membership_id, role_id, status, granted_by_user_id, granted_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${role[0].id}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now(), now()
      )
    `;
  }

  const product = await sql`
    select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
  `;
  if (!product[0]) throw new Error("FORGE_INDUSTRIAL product missing");

  const tp = await sql`
    select id::text as id from tenant_products
    where tenant_id = ${tenantId}::uuid and product_id = ${product[0].id}::uuid
    limit 1
  `;
  if (!tp[0]) {
    throw new Error(`FORGE_INDUSTRIAL not activated on ${tenantKey}`);
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
  let modulesMissing = [];
  for (const code of INDUSTRIAL_MODULE_CODES) {
    const mod = await sql`
      select id::text as id from platform_modules
      where product_id = ${product[0].id}::uuid and code = ${code}
      limit 1
    `;
    if (!mod[0]) {
      modulesMissing.push(code);
      continue;
    }
    const tme = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${tenantId}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!tme[0] || tme[0].status !== "ACTIVE") {
      // Do not expand tenant catalog beyond Phase 1 seed; membership alone insufficient.
      modulesMissing.push(code);
      continue;
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

  return {
    tenantId,
    tenantKey,
    membershipId,
    membershipCreated,
    modulesEntitled,
    modulesMissing,
  };
}

async function main() {
  if (!COGNITO_SUB) throw new Error("FORGE_P2_LINK_COGNITO_SUB required");
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const existingBySub = await sql`
      select id::text as id, user_id::text as user_id, tenant_id::text as tenant_id
      from authentication_identities
      where provider = 'COGNITO' and provider_subject = ${COGNITO_SUB}
      limit 1
    `;
    if (!existingBySub[0]) {
      throw new Error(`No Cognito identity for sub ${COGNITO_SUB} — link Tenant A first`);
    }

    const user = await sql`
      select id::text as id, primary_email, tenant_id::text as home_tenant_id, status
      from users where id = ${existingBySub[0].user_id}::uuid
    `;
    if (!user[0]) throw new Error(`User missing for Cognito sub ${COGNITO_SUB}`);
    if (user[0].status !== "ACTIVE") throw new Error(`User ${user[0].id} not ACTIVE`);

    const results = [];
    for (const t of TENANTS) {
      const row = await sql`
        select id::text as id, tenant_key from tenants where id = ${t.id}::uuid
      `;
      if (!row[0]) throw new Error(`Tenant missing: ${t.key} (${t.id})`);
      results.push(await linkTenant(sql, t.id, row[0].tenant_key, user[0].id));
    }

    await sql`
      update authentication_identities
      set last_authenticated_at = now(), email_at_link_time = ${EMAIL}
      where id = ${existingBySub[0].id}::uuid
    `;

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "PRODUCERS-P2-link-creator",
          email: EMAIL,
          cognitoSub: COGNITO_SUB,
          userId: user[0].id,
          homeTenantId: user[0].home_tenant_id,
          identityId: existingBySub[0].id,
          tenants: results,
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
