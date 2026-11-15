/**
 * DEC-IND-011 P1 smoke: ensure creator can access import-acceptance-tenant-a
 * with industrial admin membership + module entitlements (development only).
 *
 * If Cognito subject is already linked to a different home-tenant user, that
 * user is reused for Tenant A membership/entitlements (identity is not moved).
 *
 * Env:
 *   DATABASE_SECRET_ARN
 *   FORGE_P1_LINK_EMAIL (default admin@forgepublicsafety.com)
 *   FORGE_P1_LINK_COGNITO_SUB (required)
 *   IMPORT_ACCEPTANCE_TENANT_A_ID (optional override)
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

const TENANT_A =
  process.env.IMPORT_ACCEPTANCE_TENANT_A_ID?.trim() || "019faa15-e558-70b6-adcd-a510c3c995f4";
const EMAIL = (process.env.FORGE_P1_LINK_EMAIL ?? "admin@forgepublicsafety.com")
  .trim()
  .toLowerCase();
const COGNITO_SUB = (process.env.FORGE_P1_LINK_COGNITO_SUB ?? "").trim();
const ROLE_CODE = "IND3V_INDUSTRIAL_ADMIN";

const INDUSTRIAL_MODULE_CODES = [
  "PERSONNEL",
  "TRAINING",
  "FORMS",
  "INSPECTIONS",
  "INCIDENTS",
  "JSAS",
  "OBSERVATIONS",
  "EQUIPMENT",
  "LOCKOUT_TAGOUT",
  "CONFINED_SPACE",
  "HOT_WORK",
  "WORKING_AT_HEIGHTS",
  "ELECTRICAL_SAFETY",
  "CRANES_RIGGING",
  "MACHINE_SAFETY",
  "DOT_COMPLIANCE",
  "FORKLIFTS",
  "WORKERS_COMP",
  "OSHA",
  "RISK",
  "CHEMICAL_SAFETY",
  "WAREHOUSE_SAFETY",
  "MANUFACTURING_SAFETY",
  "CONTRACTOR_SAFETY",
  "PROCESS_SAFETY",
  "ENVIRONMENTAL_SAFETY",
  "QR_LINKS",
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

async function main() {
  if (!COGNITO_SUB) throw new Error("FORGE_P1_LINK_COGNITO_SUB required");
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const tenant = await sql`
      select id::text as id, tenant_key from tenants where id = ${TENANT_A}::uuid
    `;
    if (!tenant[0]) throw new Error(`Tenant A missing: ${TENANT_A}`);

    let role = await sql`
      select id::text as id from roles
      where tenant_id = ${TENANT_A}::uuid and code = ${ROLE_CODE}
      limit 1
    `;
    if (!role[0]) {
      throw new Error(`Role ${ROLE_CODE} missing on tenant A — re-run IND-3V persona seed first`);
    }

    // Prefer the existing Cognito-linked user so we can grant Tenant A
    // membership/entitlements without rewriting authentication_identities.
    const existingBySub = await sql`
      select id::text as id, user_id::text as user_id, tenant_id::text as tenant_id
      from authentication_identities
      where provider = 'COGNITO' and provider_subject = ${COGNITO_SUB}
      limit 1
    `;

    let userCreated = false;
    let userReuse = false;
    let user;
    if (existingBySub[0]) {
      user = await sql`
        select id::text as id, primary_email, tenant_id::text as home_tenant_id
        from users where id = ${existingBySub[0].user_id}::uuid
      `;
      if (!user[0]) {
        throw new Error(`Cognito sub linked to missing user ${existingBySub[0].user_id}`);
      }
      userReuse = true;
    } else {
      user = await sql`
        select id::text as id, primary_email, tenant_id::text as home_tenant_id
        from users
        where tenant_id = ${TENANT_A}::uuid and lower(primary_email) = ${EMAIL}
        limit 1
      `;
      if (!user[0]) {
        const id = randomUUID();
        await sql`
          insert into users (id, tenant_id, primary_email, status, activated_at, created_at, updated_at)
          values (${id}::uuid, ${TENANT_A}::uuid, ${EMAIL}, 'ACTIVE', now(), now(), now())
        `;
        user = await sql`
          select id::text as id, primary_email, tenant_id::text as home_tenant_id
          from users where id = ${id}::uuid
        `;
        userCreated = true;
      }
    }
    const userId = user[0].id;

    let membership = await sql`
      select id::text as id, status
      from user_tenant_memberships
      where tenant_id = ${TENANT_A}::uuid and user_id = ${userId}::uuid
      limit 1
    `;
    let membershipCreated = false;
    // Do not steal default tenant when reusing a Cognito user home elsewhere.
    const makeDefault = !userReuse;
    if (!membership[0]) {
      const id = randomUUID();
      await sql`
        insert into user_tenant_memberships (
          id, tenant_id, user_id, status, is_default_tenant, activated_at, created_at, updated_at
        ) values (
          ${id}::uuid, ${TENANT_A}::uuid, ${userId}::uuid, 'ACTIVE', ${makeDefault}, now(), now(), now()
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
          ${id}::uuid, ${TENANT_A}::uuid, ${membershipId}::uuid, ${role[0].id}::uuid,
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
      where tenant_id = ${TENANT_A}::uuid and product_id = ${product[0].id}::uuid
      limit 1
    `;
    if (!tp[0]) {
      const id = randomUUID();
      await sql`
        insert into tenant_products (id, tenant_id, product_id, status, enabled_at, created_at, updated_at)
        values (${id}::uuid, ${TENANT_A}::uuid, ${product[0].id}::uuid, 'ACTIVE', now(), now(), now())
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
          ${id}::uuid, ${TENANT_A}::uuid, ${membershipId}::uuid, ${product[0].id}::uuid,
          'ACTIVE', ${userId}::uuid, now(), now()
        )
      `;
    }

    let modulesEntitled = 0;
    for (const code of INDUSTRIAL_MODULE_CODES) {
      const mod = await sql`
        select id::text as id from platform_modules
        where product_id = ${product[0].id}::uuid and code = ${code}
        limit 1
      `;
      if (!mod[0]) continue;
      const tme = await sql`
        select id::text as id, status from tenant_module_entitlements
        where tenant_id = ${TENANT_A}::uuid and module_id = ${mod[0].id}::uuid
        limit 1
      `;
      if (!tme[0]) {
        const id = randomUUID();
        await sql`
          insert into tenant_module_entitlements (
            id, tenant_id, module_id, status, starts_at, created_at, updated_at
          ) values (
            ${id}::uuid, ${TENANT_A}::uuid, ${mod[0].id}::uuid, 'ACTIVE', now(), now(), now()
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
            ${id}::uuid, ${TENANT_A}::uuid, ${membershipId}::uuid, ${mod[0].id}::uuid,
            'ACTIVE', ${userId}::uuid, now(), now()
          )
        `;
      }
      modulesEntitled += 1;
    }

    let identityId;
    let identityAction;
    if (existingBySub[0]) {
      await sql`
        update authentication_identities
        set last_authenticated_at = now(), email_at_link_time = ${EMAIL}
        where id = ${existingBySub[0].id}::uuid
      `;
      identityId = existingBySub[0].id;
      identityAction = userReuse ? "reused" : "updated";
    } else {
      identityId = randomUUID();
      await sql`
        insert into authentication_identities (
          id, tenant_id, user_id, provider, provider_subject, email_at_link_time,
          created_at, last_authenticated_at
        ) values (
          ${identityId}::uuid, ${TENANT_A}::uuid, ${userId}::uuid, 'COGNITO', ${COGNITO_SUB},
          ${EMAIL}, now(), now()
        )
      `;
      identityAction = "created";
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "DEC-IND-011-P1-link-creator",
          tenantId: TENANT_A,
          tenantKey: tenant[0].tenant_key,
          email: EMAIL,
          cognitoSub: COGNITO_SUB,
          userId,
          homeTenantId: user[0].home_tenant_id,
          userCreated,
          userReuse,
          membershipId,
          membershipCreated,
          modulesEntitled,
          identityId,
          identityAction,
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
