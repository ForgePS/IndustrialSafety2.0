/**
 * Read-only: explain why Industrial modules are hidden per user on a tenant.
 *
 * For every ACTIVE membership, reports modules where the user lacks
 * membership_module_access, or lacks the module's view permission via roles
 * (membership_role_assignments + user_role_assignments -> role_permissions ALLOW,
 * minus DENY). Also prints the tenant entitlement row for FOCUS_MODULE.
 *
 *   TENANT_KEY=producers-rice-mill FOCUS_MODULE=CORRECTIVE_ACTIONS node scripts/diag-tenant-module-visibility.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const contracts = await import(
  pathToFileURL("/app/apps/platform-api/node_modules/@forge/contracts/dist/index.js").href
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const FOCUS = (process.env.FOCUS_MODULE || "CORRECTIVE_ACTIONS").trim().toUpperCase();

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
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const focusEnt = await sql`
    select e.status, e.starts_at, e.ends_at, e.source_type, m.code, m.status as catalog_status
    from tenant_module_entitlements e
    join platform_modules m on m.id = e.module_id
    where e.tenant_id = ${tenant.id}::uuid and m.code = ${FOCUS}
  `;

  const memberships = await sql`
    select m.id::text as membership_id, u.id::text as user_id, u.primary_email as email,
      u.last_activity_at
    from user_tenant_memberships m
    join users u on u.id = m.user_id
    where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
    order by u.primary_email
  `;

  const activeTenantModules = new Set(
    (
      await sql`
        select m.code
        from tenant_module_entitlements e
        join platform_modules m on m.id = e.module_id
        where e.tenant_id = ${tenant.id}::uuid
          and e.status in ('ACTIVE','GRACE')
          and (e.starts_at is null or e.starts_at <= now())
          and (e.ends_at is null or e.ends_at > now())
      `
    ).map((r) => r.code),
  );

  const toggleable = contracts.INDUSTRIAL_MODULE_REGISTRY.filter(
    (m) => m.code !== "CORE" && contracts.industrialModuleIsToggleable(m),
  );

  const users = [];
  for (const mem of memberships) {
    const access = new Set(
      (
        await sql`
          select pm.code
          from membership_module_access a
          join platform_modules pm on pm.id = a.module_id
          where a.membership_id = ${mem.membership_id}::uuid and a.status = 'ACTIVE'
        `
      ).map((r) => r.code),
    );

    const permRows = await sql`
      select p.code, rp.effect, r.code as role_code
      from (
        select role_id from membership_role_assignments
        where membership_id = ${mem.membership_id}::uuid
          and status = 'ACTIVE' and revoked_at is null
        union
        select role_id from user_role_assignments
        where user_id = ${mem.user_id}::uuid and tenant_id = ${tenant.id}::uuid
          and revoked_at is null
          and (starts_at is null or starts_at <= now())
          and (expires_at is null or expires_at > now())
      ) ra
      join roles r on r.id = ra.role_id
      join role_permissions rp on rp.role_id = ra.role_id
      join permissions p on p.id = rp.permission_id
    `;
    const allow = new Set(permRows.filter((r) => r.effect !== "DENY").map((r) => r.code));
    for (const r of permRows) if (r.effect === "DENY") allow.delete(r.code);
    const roleCodes = [...new Set(permRows.map((r) => r.role_code))];

    const missingAccess = [];
    const missingPermission = [];
    for (const mod of toggleable) {
      if (!activeTenantModules.has(mod.code)) continue;
      if (!access.has(mod.code)) missingAccess.push(mod.code);
      if (!contracts.industrialModuleNavPermissionOk(mod.code, allow)) {
        missingPermission.push(mod.code);
      }
    }

    const focusRow = contracts.industrialModuleRoleAccess(FOCUS);
    users.push({
      email: mem.email,
      lastActivityAt: mem.last_activity_at,
      roles: roleCodes,
      isIndustrialAdmin: allow.has("industrial.admin"),
      hasIndustrialAccess: allow.has("industrial.access"),
      focus: {
        module: FOCUS,
        membershipAccess: access.has(FOCUS),
        viewPermissions: focusRow?.accessPermissions ?? [],
        hasViewPermission: contracts.industrialModuleNavPermissionOk(FOCUS, allow),
      },
      missingAccess,
      missingPermission,
    });
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        focusModule: FOCUS,
        focusEntitlement: focusEnt,
        focusTenantActiveNow: activeTenantModules.has(FOCUS),
        users,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
