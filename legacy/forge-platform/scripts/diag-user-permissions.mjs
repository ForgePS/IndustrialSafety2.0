/**
 * READ-ONLY diagnostic: report effective RBAC permission codes for a user, and
 * for every active member of the same tenant.
 *
 * Reproduces AuthContextService.loadPermissions(): membership_role_assignments
 * when an ACTIVE membership exists, otherwise the user_role_assignments
 * projection; then role_permissions -> permissions with DENY beating ALLOW.
 *
 * Answers "why is the Create form hidden?" -- industrial-web renders
 * `Create/edit requires <perm>` whenever the principal holds neither the
 * module manage permission nor industrial.admin.
 *
 * SELECT-only. No writes. Resolves DB URL from DATABASE_SECRET_ARN inside the
 * container (secret never leaves the task).
 *
 *   TARGET_EMAIL=tbogy@producersricemill.com node scripts/diag-user-permissions.mjs
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

const TARGET_EMAIL = (process.env.TARGET_EMAIL || "tbogy@producersricemill.com")
  .trim()
  .toLowerCase();
/** Widens the hunt when the exact address does not match a users row. */
const SEARCH_TERM = (process.env.SEARCH_TERM || "producersricemill").trim().toLowerCase();
const TENANT_TERM = (process.env.TENANT_TERM || "producers").trim().toLowerCase();

/** Gates the industrial-web Create/edit form for each ops module. */
const MANAGE_GATES = [
  "industrial.personnel.manage",
  "industrial.training.manage",
  "industrial.forms.manage",
  "industrial.inspections.manage",
  "industrial.incidents.manage",
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

/** DENY beats ALLOW, matching resolveEffectivePermissionCodes(). */
function resolveEffective(rows) {
  const allow = new Set();
  const deny = new Set();
  for (const r of rows) {
    if (r.effect === "DENY") deny.add(r.code);
    else allow.add(r.code);
  }
  return [...allow].filter((c) => !deny.has(c)).sort();
}

async function rolesForUser(sql, tenantId, userId) {
  const membership = await sql`
    select id::text as id from user_tenant_memberships
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid and status = 'ACTIVE'
    limit 1
  `;

  if (membership[0]) {
    const rows = await sql`
      select r.id::text as role_id, r.code as role_code
      from membership_role_assignments mra
      join roles r on r.id = mra.role_id
      where mra.membership_id = ${membership[0].id}::uuid
        and mra.status = 'ACTIVE' and mra.revoked_at is null
    `;
    return { path: "MEMBERSHIP", membershipId: membership[0].id, roles: rows };
  }

  const rows = await sql`
    select r.id::text as role_id, r.code as role_code
    from user_role_assignments ura
    join roles r on r.id = ura.role_id
    where ura.tenant_id = ${tenantId}::uuid and ura.user_id = ${userId}::uuid
      and ura.revoked_at is null
  `;
  return { path: "USER_ROLE_FALLBACK", membershipId: null, roles: rows };
}

async function permissionsForRoles(sql, roleIds) {
  if (roleIds.length === 0) return [];
  const rows = await sql`
    select p.code, rp.effect
    from role_permissions rp
    join permissions p on p.id = rp.permission_id
    where rp.role_id = any(${roleIds}::uuid[])
  `;
  return resolveEffective(rows);
}

async function describeUser(sql, tenantId, userId, email, status) {
  const { path, membershipId, roles } = await rolesForUser(sql, tenantId, userId);
  const effective = await permissionsForRoles(
    sql,
    roles.map((r) => r.role_id),
  );
  const held = new Set(effective);
  const isAdmin = held.has("industrial.admin");

  return {
    email,
    userId,
    userStatus: status,
    rolePath: path,
    membershipId,
    roles: roles.map((r) => r.role_code),
    industrialPermissions: effective.filter((c) => c.startsWith("industrial.")),
    totalPermissionCount: effective.length,
    hasIndustrialAdmin: isAdmin,
    manageGates: Object.fromEntries(
      MANAGE_GATES.map((g) => [g, held.has(g) || isAdmin ? "CAN_MANAGE" : "HIDDEN"]),
    ),
    CREATE_FORM_VERDICT:
      held.has("industrial.personnel.manage") || isAdmin
        ? "VISIBLE: personnel Create form renders"
        : "HIDDEN: industrial-web shows 'Create/edit requires industrial.personnel.manage'",
  };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const users = await sql`
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users where lower(primary_email) = ${TARGET_EMAIL}
    `;

    const report = {
      targetEmail: TARGET_EMAIL,
      userMatches: users.length,
      emailLike: [],
      identityLike: [],
      tenantsMatchingTerm: [],
      targets: [],
      tenants: [],
    };

    // An exact-address miss usually means the login address lives on the
    // identity row rather than users.primary_email, so surface both.
    report.emailLike = await sql`
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users where lower(primary_email) like ${"%" + SEARCH_TERM + "%"}
      order by primary_email limit 50
    `;
    try {
      report.identityLike = await sql`
        select ai.id::text as id, ai.user_id::text as user_id, ai.subject, ai.provider
        from authentication_identities ai
        where lower(ai.subject) like ${"%" + SEARCH_TERM + "%"}
        order by ai.subject limit 50
      `;
    } catch (e) {
      report.identityLike = [{ error: String(e.message || e) }];
    }
    report.tenantsMatchingTerm = await sql`
      select id::text as id, tenant_key, slug, status
      from tenants
      where lower(tenant_key) like ${"%" + TENANT_TERM + "%"}
         or lower(slug) like ${"%" + TENANT_TERM + "%"}
      order by tenant_key limit 20
    `;

    for (const u of users) {
      const memberships = await sql`
        select m.tenant_id::text as tenant_id, t.tenant_key
        from user_tenant_memberships m
        join tenants t on t.id = m.tenant_id
        where m.user_id = ${u.id}::uuid
      `;
      const scopes = memberships.length
        ? memberships
        : [{ tenant_id: u.tenant_id, tenant_key: "(home tenant, no membership)" }];

      for (const scope of scopes) {
        report.targets.push({
          tenantKey: scope.tenant_key,
          tenantId: scope.tenant_id,
          ...(await describeUser(sql, scope.tenant_id, u.id, u.primary_email, u.status)),
        });
      }
    }

    // Who in the same tenant can manage today? Identifies a role to copy or an
    // account to act through, instead of guessing at a grant.
    const tenantIds = [
      ...new Set([
        ...report.targets.map((t) => t.tenantId),
        ...report.tenantsMatchingTerm.map((t) => t.id),
      ]),
    ];
    for (const tenantId of tenantIds) {
      const members = await sql`
        select u.id::text as id, u.primary_email, u.status
        from user_tenant_memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = ${tenantId}::uuid and m.status = 'ACTIVE'
        order by u.primary_email
      `;
      const described = [];
      for (const m of members) {
        described.push(await describeUser(sql, tenantId, m.id, m.primary_email, m.status));
      }

      const rolesInTenant = await sql`
        select r.id::text as id, r.code, count(rp.permission_id) as perm_count
        from roles r
        left join role_permissions rp on rp.role_id = r.id
        where r.tenant_id = ${tenantId}::uuid or r.tenant_id is null
        group by r.id, r.code
        order by r.code
      `;

      const managers = described.filter((d) => d.CREATE_FORM_VERDICT.startsWith("VISIBLE"));
      report.tenants.push({
        tenantId,
        activeMemberCount: members.length,
        membersWhoCanManagePersonnel: managers.map((m) => m.email),
        members: described,
        rolesVisibleToTenant: rolesInTenant.map((r) => `${r.code}:${r.perm_count}perms`),
        DIAGNOSIS:
          managers.length === 0
            ? "NO ACTIVE MEMBER can create personnel: a role needs industrial.personnel.manage (or industrial.admin)"
            : `${managers.length} member(s) can create personnel`,
      });
    }

    console.log(JSON.stringify({ ok: true, phase: "DIAG-USER-PERMISSIONS", report }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
