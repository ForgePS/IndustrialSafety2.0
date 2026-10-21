/**
 * Grant a Producers Rice user full personnel authority:
 * - industrial.personnel.view + industrial.personnel.manage on an assigned role
 *   (adds IND3V_INDUSTRIAL_ADMIN if needed; also ensures SAFETY_DIRECTOR has manage)
 * - PERSONNEL membership_module_access ACTIVE
 * - tenant PERSONNEL entitlement ACTIVE
 *
 * Idempotent. DRY unless APPLY=1.
 *
 *   TARGET_EMAIL=tbogy@producersrice.com APPLY=1 node scripts/grant-personnel-authority.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const TARGET_EMAIL = (process.env.TARGET_EMAIL || "tbogy@producersrice.com").trim().toLowerCase();
const ADMIN_ROLE_CODE = (process.env.ADMIN_ROLE_CODE || "IND3V_INDUSTRIAL_ADMIN").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const PERSONNEL_PERMS = ["industrial.personnel.view", "industrial.personnel.manage"];

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
  const report = {
    apply: APPLY,
    tenantKey: TENANT_KEY,
    targetEmail: TARGET_EMAIL,
    actions: [],
  };

  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`tenant not found: ${TENANT_KEY}`);

    const [membership] = await sql`
      select m.id::text as membership_id, u.id::text as user_id, u.primary_email, u.status as user_status, m.status as membership_status
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      where m.tenant_id = ${tenant.id}::uuid
        and lower(u.primary_email) = ${TARGET_EMAIL}
      order by (m.status = 'ACTIVE') desc
      limit 1
    `;
    if (!membership) throw new Error(`user/membership not found for ${TARGET_EMAIL}`);
    report.userId = membership.user_id;
    report.membershipId = membership.membership_id;
    report.userStatus = membership.user_status;
    report.membershipStatus = membership.membership_status;

    if (membership.user_status !== "ACTIVE" && APPLY) {
      await sql`
        update users
        set status = 'ACTIVE', activated_at = coalesce(activated_at, now()), updated_at = now()
        where id = ${membership.user_id}::uuid
      `;
      report.actions.push("user_activated");
    }
    if (membership.membership_status !== "ACTIVE" && APPLY) {
      await sql`
        update user_tenant_memberships
        set status = 'ACTIVE', updated_at = now()
        where id = ${membership.membership_id}::uuid
      `;
      report.actions.push("membership_activated");
    }

    // Ensure permission catalog rows exist.
    for (const code of PERSONNEL_PERMS) {
      const [perm] = await sql`select id::text as id from permissions where code = ${code} limit 1`;
      if (!perm) {
        if (APPLY) {
          const id = randomUUID();
          await sql`
            insert into permissions (
              id, code, name, description, scope_type, risk_level, is_sensitive, created_at, updated_at
            ) values (
              ${id}::uuid, ${code}, ${code},
              'Personnel authority grant', 'TENANT',
              ${code.endsWith(".manage") ? "ELEVATED" : "NORMAL"}, false, now(), now()
            )
            on conflict (code) do nothing
          `;
          report.actions.push(`permission_created:${code}`);
        } else {
          report.actions.push(`would_create_permission:${code}`);
        }
      }
    }

    const permRows = await sql`
      select id::text as id, code from permissions where code = any(${PERSONNEL_PERMS})
    `;
    const permByCode = new Map(permRows.map((r) => [r.code, r.id]));

    // Ensure industrial admin role exists and has personnel perms.
    const [adminRole] = await sql`
      select id::text as id, code from roles
      where code = ${ADMIN_ROLE_CODE}
        and (tenant_id = ${tenant.id}::uuid or tenant_id is null)
      order by (tenant_id is null) asc
      limit 1
    `;
    if (!adminRole) throw new Error(`role not found: ${ADMIN_ROLE_CODE}`);
    report.adminRoleId = adminRole.id;

    for (const code of PERSONNEL_PERMS) {
      const permId = permByCode.get(code);
      if (!permId) continue;
      const [held] = await sql`
        select effect from role_permissions
        where role_id = ${adminRole.id}::uuid and permission_id = ${permId}::uuid
        limit 1
      `;
      if (!held) {
        if (APPLY) {
          await sql`
            insert into role_permissions (role_id, permission_id, effect, created_at)
            values (${adminRole.id}::uuid, ${permId}::uuid, 'ALLOW', now())
            on conflict do nothing
          `;
          report.actions.push(`admin_role_grant:${code}`);
        } else {
          report.actions.push(`would_admin_role_grant:${code}`);
        }
      } else if (held.effect === "DENY") {
        report.actions.push(`admin_role_deny_present:${code}`);
      } else {
        report.actions.push(`admin_role_already:${code}`);
      }
    }

    // Existing roles for this membership only (do not mutate shared role definitions
    // like SAFETY_DIRECTOR — elevate this user via IND3V_INDUSTRIAL_ADMIN instead).
    const assignedRoles = await sql`
      select r.id::text as id, r.code
      from membership_role_assignments mra
      join roles r on r.id = mra.role_id
      where mra.membership_id = ${membership.membership_id}::uuid
        and mra.status = 'ACTIVE' and mra.revoked_at is null
    `;
    report.currentRoles = assignedRoles.map((r) => r.code);

    // Assign industrial admin role if missing (keeps existing roles).
    const alreadyAdmin = assignedRoles.some((r) => r.code === ADMIN_ROLE_CODE);
    if (!alreadyAdmin) {
      if (APPLY) {
        await sql`
          insert into membership_role_assignments (
            id, tenant_id, membership_id, role_id, status,
            granted_by_user_id, granted_at, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${membership.membership_id}::uuid,
            ${adminRole.id}::uuid, 'ACTIVE', ${membership.user_id}::uuid, now(), now(), now()
          )
          on conflict do nothing
        `;
        report.actions.push(`assigned_role:${ADMIN_ROLE_CODE}`);
      } else {
        report.actions.push(`would_assign_role:${ADMIN_ROLE_CODE}`);
      }
    } else {
      report.actions.push(`already_has_role:${ADMIN_ROLE_CODE}`);
    }

    // Ensure PERSONNEL module exists + tenant entitlement + membership access.
    let [mod] = await sql`
      select pm.id::text as id, pm.code
      from platform_modules pm
      join platform_products pp on pp.id = pm.product_id
      where pp.code = 'FORGE_INDUSTRIAL' and pm.code = 'PERSONNEL'
      limit 1
    `;
    if (!mod) throw new Error("PERSONNEL module missing for FORGE_INDUSTRIAL");

    const [ent] = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${tenant.id}::uuid and module_id = ${mod.id}::uuid
      limit 1
    `;
    if (!ent) {
      if (APPLY) {
        await sql`
          insert into tenant_module_entitlements (
            id, tenant_id, module_id, status, source_type, starts_at, configuration_json, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${mod.id}::uuid,
            'ACTIVE', 'TENANT_ADMIN', now(), '{}'::jsonb, now(), now()
          )
        `;
        report.actions.push("tenant_personnel_entitlement_created");
      } else {
        report.actions.push("would_create_tenant_personnel_entitlement");
      }
    } else if (ent.status !== "ACTIVE") {
      if (APPLY) {
        await sql`
          update tenant_module_entitlements
          set status = 'ACTIVE', updated_at = now()
          where id = ${ent.id}::uuid
        `;
        report.actions.push(`tenant_personnel_entitlement_${ent.status}_to_ACTIVE`);
      } else {
        report.actions.push(`would_activate_tenant_personnel_entitlement_from_${ent.status}`);
      }
    } else {
      report.actions.push("tenant_personnel_entitlement_active");
    }

    const [mma] = await sql`
      select id::text as id, status from membership_module_access
      where membership_id = ${membership.membership_id}::uuid and module_id = ${mod.id}::uuid
      limit 1
    `;
    if (!mma) {
      if (APPLY) {
        await sql`
          insert into membership_module_access (
            id, tenant_id, membership_id, module_id, status,
            granted_by_user_id, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${membership.membership_id}::uuid,
            ${mod.id}::uuid, 'ACTIVE', ${membership.user_id}::uuid, now(), now()
          )
        `;
        report.actions.push("membership_personnel_access_created");
      } else {
        report.actions.push("would_create_membership_personnel_access");
      }
    } else if (mma.status !== "ACTIVE") {
      if (APPLY) {
        await sql`
          update membership_module_access
          set status = 'ACTIVE', updated_at = now()
          where id = ${mma.id}::uuid
        `;
        report.actions.push(`membership_personnel_access_${mma.status}_to_ACTIVE`);
      } else {
        report.actions.push(`would_activate_membership_personnel_access_from_${mma.status}`);
      }
    } else {
      report.actions.push("membership_personnel_access_active");
    }

    // Post-check effective permissions for personnel.
    const roleIds = await sql`
      select r.id::text as id
      from membership_role_assignments mra
      join roles r on r.id = mra.role_id
      where mra.membership_id = ${membership.membership_id}::uuid
        and mra.status = 'ACTIVE' and mra.revoked_at is null
    `;
    let effective = [];
    if (roleIds.length) {
      const rows = await sql`
        select p.code, rp.effect
        from role_permissions rp
        join permissions p on p.id = rp.permission_id
        where rp.role_id = any(${roleIds.map((r) => r.id)}::uuid[])
      `;
      const allow = new Set();
      const deny = new Set();
      for (const row of rows) {
        if (row.effect === "DENY") deny.add(row.code);
        else allow.add(row.code);
      }
      effective = [...allow].filter((c) => !deny.has(c)).sort();
    }
    report.effectiveRoles = (
      await sql`
        select r.code
        from membership_role_assignments mra
        join roles r on r.id = mra.role_id
        where mra.membership_id = ${membership.membership_id}::uuid
          and mra.status = 'ACTIVE' and mra.revoked_at is null
      `
    ).map((r) => r.code);
    report.canViewPersonnel = effective.includes("industrial.personnel.view") || effective.includes("industrial.admin");
    report.canManagePersonnel =
      effective.includes("industrial.personnel.manage") || effective.includes("industrial.admin");
    report.personnelPermsPresent = PERSONNEL_PERMS.filter((c) => effective.includes(c));

    console.log(JSON.stringify({ ok: true, phase: "GRANT-PERSONNEL-AUTHORITY", report }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
