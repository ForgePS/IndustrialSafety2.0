/**
 * Move a tenant member from the industrial operator role to the industrial
 * admin role, so they can use the personnel Add Person form.
 *
 * The operator role is revoked only after proving the admin role is a strict
 * superset of it, so the move can never silently drop a permission the member
 * relies on today.
 *
 * Idempotent; DRY by default. Set APPLY=1 to write.
 *
 *   TARGET_EMAIL=tbogy@producersrice.com node scripts/fix-assign-industrial-admin-role.mjs
 *   TARGET_EMAIL=tbogy@producersrice.com APPLY=1 node scripts/fix-assign-industrial-admin-role.mjs
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
const GRANT_ROLE_CODE = (process.env.GRANT_ROLE_CODE || "IND3V_INDUSTRIAL_ADMIN").trim();
const REVOKE_ROLE_CODE = (process.env.REVOKE_ROLE_CODE || "IND3V_INDUSTRIAL_OPERATOR").trim();
const APPLY = process.env.APPLY === "1";
/** Escape hatch: keep the operator assignment alongside the new admin one. */
const KEEP_OPERATOR = process.env.KEEP_OPERATOR === "1";

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

async function roleByCode(sql, tenantId, code) {
  const rows = await sql`
    select id::text as id, code from roles
    where code = ${code} and (tenant_id = ${tenantId}::uuid or tenant_id is null)
    order by (tenant_id is null) asc
    limit 1
  `;
  return rows[0] ?? null;
}

/** ALLOW codes minus DENY codes, matching resolveEffectivePermissionCodes(). */
async function permsForRole(sql, roleId) {
  const rows = await sql`
    select p.code, rp.effect
    from role_permissions rp
    join permissions p on p.id = rp.permission_id
    where rp.role_id = ${roleId}::uuid
  `;
  const allow = new Set();
  const deny = new Set();
  for (const r of rows) {
    if (r.effect === "DENY") deny.add(r.code);
    else allow.add(r.code);
  }
  return new Set([...allow].filter((c) => !deny.has(c)));
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const report = {
    tenantKey: TENANT_KEY,
    targetEmail: TARGET_EMAIL,
    grantRole: GRANT_ROLE_CODE,
    revokeRole: KEEP_OPERATOR ? null : REVOKE_ROLE_CODE,
    mode: APPLY ? "APPLY" : "DRY_RUN",
  };

  try {
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    const membership = await sql`
      select m.id::text as membership_id, u.id::text as user_id, u.primary_email
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      where m.tenant_id = ${tenantId}::uuid
        and lower(u.primary_email) = ${TARGET_EMAIL}
        and m.status = 'ACTIVE'
      limit 1
    `;
    if (!membership[0]) throw new Error(`no ACTIVE membership for ${TARGET_EMAIL} in ${TENANT_KEY}`);
    const { membership_id: membershipId, user_id: userId } = membership[0];
    report.membershipId = membershipId;
    report.userId = userId;

    const grantRole = await roleByCode(sql, tenantId, GRANT_ROLE_CODE);
    if (!grantRole) throw new Error(`role ${GRANT_ROLE_CODE} not found`);
    const revokeRole = await roleByCode(sql, tenantId, REVOKE_ROLE_CODE);

    const grantPerms = await permsForRole(sql, grantRole.id);
    const revokePerms = revokeRole ? await permsForRole(sql, revokeRole.id) : new Set();
    const wouldLose = [...revokePerms].filter((c) => !grantPerms.has(c));

    report.grantRolePermissionCount = grantPerms.size;
    report.revokeRolePermissionCount = revokePerms.size;
    report.permissionsLostByRevoke = wouldLose;
    report.isStrictSuperset = wouldLose.length === 0;
    report.canManagePersonnelAfter =
      grantPerms.has("industrial.personnel.manage") || grantPerms.has("industrial.admin");

    const current = await sql`
      select mra.id::text as id, r.code as role_code, mra.status,
             mra.granted_by_user_id::text as granted_by
      from membership_role_assignments mra
      join roles r on r.id = mra.role_id
      where mra.membership_id = ${membershipId}::uuid and mra.revoked_at is null
    `;
    report.currentAssignments = current.map((c) => `${c.role_code}:${c.status}`);

    const alreadyHasGrant = current.some(
      (c) => c.role_code === GRANT_ROLE_CODE && c.status === "ACTIVE",
    );

    // Attribute the new grant to whoever granted the existing role, keeping the
    // audit trail pointed at a real operator rather than a synthetic actor.
    const grantedBy = current[0]?.granted_by ?? userId;

    if (alreadyHasGrant) {
      report.grantAction = "ALREADY_ASSIGNED";
    } else if (APPLY) {
      await sql`
        insert into membership_role_assignments (
          id, tenant_id, membership_id, role_id, status,
          granted_by_user_id, granted_at, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${grantRole.id}::uuid,
          'ACTIVE', ${grantedBy}::uuid, now(), now(), now()
        )
        on conflict do nothing
      `;
      report.grantAction = "GRANTED";
    } else {
      report.grantAction = "WOULD_GRANT";
    }

    if (KEEP_OPERATOR) {
      report.revokeAction = "SKIPPED_KEEP_OPERATOR";
    } else if (!revokeRole) {
      report.revokeAction = "ROLE_NOT_FOUND";
    } else if (!report.isStrictSuperset) {
      // Refuse rather than quietly reduce the member's access.
      report.revokeAction = `REFUSED: ${GRANT_ROLE_CODE} is missing ${wouldLose.join(", ")}`;
    } else {
      const target = current.filter(
        (c) => c.role_code === REVOKE_ROLE_CODE && c.status === "ACTIVE",
      );
      if (target.length === 0) {
        report.revokeAction = "NOTHING_TO_REVOKE";
      } else if (APPLY) {
        await sql`
          update membership_role_assignments
          set status = 'REVOKED', revoked_at = now(), revoked_by_user_id = ${grantedBy}::uuid,
              updated_at = now()
          where id = any(${target.map((t) => t.id)}::uuid[])
        `;
        report.revokeAction = `REVOKED ${target.length} assignment(s)`;
      } else {
        report.revokeAction = `WOULD_REVOKE ${target.length} assignment(s)`;
      }
    }

    const after = await sql`
      select r.code as role_code, mra.status
      from membership_role_assignments mra
      join roles r on r.id = mra.role_id
      where mra.membership_id = ${membershipId}::uuid
        and mra.status = 'ACTIVE' and mra.revoked_at is null
    `;
    report.assignmentsAfter = after.map((a) => a.role_code);

    console.log(
      JSON.stringify({ ok: true, phase: "FIX-ASSIGN-INDUSTRIAL-ADMIN-ROLE", report }, null, 2),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
