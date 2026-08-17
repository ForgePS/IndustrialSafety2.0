/**
 * Repair the industrial RBAC catalog and the tenant admin role.
 *
 * Root cause: seed-producers-rice-mill-phase1.mjs grants ADMIN_PERMS with a
 * `select id from permissions where code = ...` lookup and `if (!perm[0]) continue;`.
 * Any code with no row in the permissions catalog is skipped in silence, so the
 * industrial admin role ended up with manage on only the three modules whose
 * catalog rows happened to exist (corrective_actions, fleet, loto) and view-only
 * on personnel, training, forms, inspections and incidents.
 *
 * Effect in the product: industrial-web gates its Create/edit form on
 * `<module>.manage || industrial.admin`, so the personnel Add Person form never
 * rendered for anybody in the tenant.
 *
 * This script is idempotent and runs DRY by default. Set APPLY=1 to write.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-industrial-manage-permissions.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-industrial-manage-permissions.mjs
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
const ADMIN_ROLE_CODE = (process.env.ADMIN_ROLE_CODE || "IND3V_INDUSTRIAL_ADMIN").trim();
const OPERATOR_ROLE_CODE = (process.env.OPERATOR_ROLE_CODE || "IND3V_INDUSTRIAL_OPERATOR").trim();
const APPLY = process.env.APPLY === "1";
/** Operators stay view-only unless explicitly elevated. */
const ELEVATE_OPERATOR = process.env.ELEVATE_OPERATOR === "1";

/**
 * Mirrors INDUSTRIAL_PERMISSIONS in packages/contracts/src/industrial.ts. Kept
 * as a literal list because this runs standalone inside the container.
 */
const INDUSTRIAL_PERMISSIONS = [
  "industrial.access",
  "industrial.admin",
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
  "industrial.jsa.view",
  "industrial.jsa.manage",
  "industrial.observations.view",
  "industrial.observations.manage",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.fleet.view",
  "industrial.fleet.manage",
  "industrial.workers_comp.view",
  "industrial.workers_comp.manage",
  "industrial.workers_comp.medical.view",
  "industrial.workers_comp.medical.manage",
  "industrial.corrective_actions.view",
  "industrial.corrective_actions.manage",
  "industrial.scan.view",
  "industrial.scan.manage",
  "industrial.qr_links.view",
  "industrial.qr_links.manage",
];

/** Occupational medical records stay behind a separate, explicit grant. */
const SENSITIVE = new Set([
  "industrial.workers_comp.medical.view",
  "industrial.workers_comp.medical.manage",
]);

/**
 * What the tenant admin role should hold. `industrial.admin` is deliberately
 * excluded: it is a blanket bypass for every module gate in industrial-web, so
 * explicit per-module grants keep the role auditable.
 */
const ADMIN_GRANTS = INDUSTRIAL_PERMISSIONS.filter(
  (c) => c !== "industrial.admin" && !SENSITIVE.has(c),
);

/** Minimum elevation to let an operator use the personnel Add Person form. */
const OPERATOR_ELEVATION = ["industrial.personnel.manage"];

function titleFor(code) {
  const body = code.replace(/^industrial\./, "").replace(/\./g, " ").replace(/_/g, " ");
  return `Industrial ${body}`;
}

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

/** Insert any contract permission code missing from the catalog. */
async function ensureCatalog(sql, report) {
  const existing = await sql`
    select code, id::text as id from permissions where code = any(${INDUSTRIAL_PERMISSIONS})
  `;
  const byCode = new Map(existing.map((r) => [r.code, r.id]));
  const missing = INDUSTRIAL_PERMISSIONS.filter((c) => !byCode.has(c));

  report.catalog = {
    contractCodes: INDUSTRIAL_PERMISSIONS.length,
    alreadyPresent: existing.length,
    missingFromCatalog: missing,
  };

  for (const code of missing) {
    if (!APPLY) continue;
    const id = randomUUID();
    const sensitive = SENSITIVE.has(code);
    await sql`
      insert into permissions (
        id, code, name, description, scope_type, risk_level, is_sensitive,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${code}, ${titleFor(code)},
        ${"Industrial permission restored from contract catalog"},
        'TENANT', ${code.endsWith(".manage") ? "ELEVATED" : "NORMAL"}, ${sensitive},
        now(), now()
      )
      on conflict (code) do nothing
    `;
    byCode.set(code, id);
  }

  if (APPLY) {
    const refreshed = await sql`
      select code, id::text as id from permissions where code = any(${INDUSTRIAL_PERMISSIONS})
    `;
    return new Map(refreshed.map((r) => [r.code, r.id]));
  }
  return byCode;
}

async function findRole(sql, tenantId, code) {
  const rows = await sql`
    select id::text as id, code from roles
    where code = ${code} and (tenant_id = ${tenantId}::uuid or tenant_id is null)
    order by (tenant_id is null) asc
    limit 1
  `;
  return rows[0] ?? null;
}

/** Attach the requested codes to a role, reporting what was already there. */
async function grantToRole(sql, role, codes, byCode, report, label) {
  if (!role) {
    report[label] = { error: `role ${label} not found in tenant` };
    return;
  }

  const held = await sql`
    select p.code, rp.effect
    from role_permissions rp
    join permissions p on p.id = rp.permission_id
    where rp.role_id = ${role.id}::uuid
  `;
  const allowed = new Set(held.filter((r) => r.effect !== "DENY").map((r) => r.code));
  const denied = held.filter((r) => r.effect === "DENY").map((r) => r.code);

  const resolvable = codes.filter((c) => byCode.has(c));
  const unresolvable = codes.filter((c) => !byCode.has(c));
  const toAdd = resolvable.filter((c) => !allowed.has(c));

  for (const code of toAdd) {
    if (!APPLY) continue;
    await sql`
      insert into role_permissions (role_id, permission_id, effect, created_at)
      values (${role.id}::uuid, ${byCode.get(code)}::uuid, 'ALLOW', now())
      on conflict (role_id, permission_id, effect) do nothing
    `;
  }

  report[label] = {
    roleId: role.id,
    roleCode: role.code,
    permissionsBefore: allowed.size,
    granted: toAdd,
    alreadyHeld: resolvable.filter((c) => allowed.has(c)).length,
    unresolvable,
    // A DENY row wins over ALLOW, so it would defeat the grant silently.
    denyRowsPresent: denied,
  };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const report = { tenantKey: TENANT_KEY, mode: APPLY ? "APPLY" : "DRY_RUN" };

  try {
    const tenant = await sql`
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    report.tenantId = tenant[0].id;

    const byCode = await ensureCatalog(sql, report);

    const adminRole = await findRole(sql, tenant[0].id, ADMIN_ROLE_CODE);
    await grantToRole(sql, adminRole, ADMIN_GRANTS, byCode, report, "adminRole");

    if (ELEVATE_OPERATOR) {
      const opRole = await findRole(sql, tenant[0].id, OPERATOR_ROLE_CODE);
      await grantToRole(sql, opRole, OPERATOR_ELEVATION, byCode, report, "operatorRole");
    } else {
      report.operatorRole = { skipped: "set ELEVATE_OPERATOR=1 to grant personnel.manage" };
    }

    // Post-state: who can now render the personnel Create form.
    const members = await sql`
      select u.primary_email, r.code as role_code
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      join membership_role_assignments mra
        on mra.membership_id = m.id and mra.status = 'ACTIVE' and mra.revoked_at is null
      join roles r on r.id = mra.role_id
      where m.tenant_id = ${tenant[0].id}::uuid and m.status = 'ACTIVE'
      order by u.primary_email
    `;
    const canManageRoles = new Set();
    for (const roleCode of new Set(members.map((m) => m.role_code))) {
      const role = await findRole(sql, tenant[0].id, roleCode);
      if (!role) continue;
      const hit = await sql`
        select 1 from role_permissions rp
        join permissions p on p.id = rp.permission_id
        where rp.role_id = ${role.id}::uuid and rp.effect <> 'DENY'
          and p.code in ('industrial.personnel.manage', 'industrial.admin')
        limit 1
      `;
      if (hit[0]) canManageRoles.add(roleCode);
    }
    report.postState = {
      activeMembers: members.map((m) => `${m.primary_email}:${m.role_code}`),
      rolesThatCanManagePersonnel: [...canManageRoles],
      membersWhoCanManagePersonnel: members
        .filter((m) => canManageRoles.has(m.role_code))
        .map((m) => m.primary_email),
    };

    console.log(
      JSON.stringify({ ok: true, phase: "FIX-INDUSTRIAL-MANAGE-PERMISSIONS", report }, null, 2),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
