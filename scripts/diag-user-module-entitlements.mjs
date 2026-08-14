/**
 * READ-ONLY diagnostic: explain why Industrial modules are missing/vanishing
 * for a specific user. Reproduces auth-context loadEntitlements() membership
 * intersection logic and reports each contributing layer.
 *
 * SELECT-only. No writes. Resolves DB URL from DATABASE_SECRET_ARN inside the
 * container (secret never leaves the task).
 *
 *   TARGET_EMAIL=tbogy@producersricemill.com node scripts/diag-user-module-entitlements.mjs
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

  try {
    const users = await sql`
      select id::text as id, tenant_id::text as tenant_id, primary_email, status
      from users where lower(primary_email) = ${TARGET_EMAIL}
    `;

    const report = { targetEmail: TARGET_EMAIL, userMatches: users.length, users: [] };

    for (const u of users) {
      const memberships = await sql`
        select m.id::text as membership_id, m.tenant_id::text as tenant_id, m.status,
               m.is_default_tenant, t.tenant_key, t.slug, t.status as tenant_status
        from user_tenant_memberships m
        join tenants t on t.id = m.tenant_id
        where m.user_id = ${u.id}::uuid
      `;

      const membershipReports = [];
      for (const m of memberships) {
        const tenantProducts = await sql`
          select pp.code from tenant_products tp
          join platform_products pp on pp.id = tp.product_id
          where tp.tenant_id = ${m.tenant_id}::uuid and tp.status = 'ACTIVE'
        `;
        const tenantModules = await sql`
          select pm.code, tme.status, tme.starts_at, tme.ends_at
          from tenant_module_entitlements tme
          join platform_modules pm on pm.id = tme.module_id
          where tme.tenant_id = ${m.tenant_id}::uuid
        `;
        const membershipProducts = await sql`
          select pp.code, mpa.status from membership_product_access mpa
          join platform_products pp on pp.id = mpa.product_id
          where mpa.membership_id = ${m.membership_id}::uuid
        `;
        const membershipModules = await sql`
          select pm.code, mma.status from membership_module_access mma
          join platform_modules pm on pm.id = mma.module_id
          where mma.membership_id = ${m.membership_id}::uuid
        `;
        const roles = await sql`
          select r.code, mra.status from membership_role_assignments mra
          join roles r on r.id = mra.role_id
          where mra.membership_id = ${m.membership_id}::uuid
        `;
        const industrialOverrides = await sql`
          select fd.key, fo.value_json, fo.user_id::text as user_id, fo.organization_id::text as organization_id
          from feature_overrides fo
          join feature_definitions fd on fd.id = fo.feature_definition_id
          where fo.tenant_id = ${m.tenant_id}::uuid and fd.key like 'industrial.%'
          order by fd.key
        `;

        // Reproduce loadEntitlements() membership-path intersection (status ACTIVE/GRACE + window)
        const now = Date.now();
        const withinWindow = (r) => {
          if (r.starts_at && new Date(r.starts_at).getTime() > now) return false;
          if (r.ends_at && new Date(r.ends_at).getTime() <= now) return false;
          return true;
        };
        const tenantActiveModuleCodes = new Set(
          tenantModules
            .filter((r) => ["ACTIVE", "GRACE"].includes(r.status) && withinWindow(r))
            .map((r) => r.code),
        );
        const membershipActiveModuleCodes = new Set(
          membershipModules.filter((r) => r.status === "ACTIVE").map((r) => r.code),
        );
        const effectiveModules = [...membershipActiveModuleCodes].filter((c) =>
          tenantActiveModuleCodes.has(c),
        );

        membershipReports.push({
          membershipId: m.membership_id,
          tenantKey: m.tenant_key,
          tenantId: m.tenant_id,
          membershipStatus: m.status,
          tenantStatus: m.tenant_status,
          roles: roles.map((r) => `${r.code}:${r.status}`),
          tenantProducts: tenantProducts.map((r) => r.code),
          membershipProducts: membershipProducts.map((r) => `${r.code}:${r.status}`),
          tenantModuleCount: tenantModules.length,
          tenantModules: tenantModules.map((r) => `${r.code}:${r.status}`),
          membershipModuleCount: membershipModules.length,
          membershipModules: membershipModules.map((r) => `${r.code}:${r.status}`),
          industrialOverrides: industrialOverrides.map((r) => ({
            key: r.key,
            value: r.value_json,
            scope: r.user_id ? "USER" : r.organization_id ? "ORG" : "TENANT",
          })),
          EFFECTIVE_ACTIVE_MODULES: effectiveModules,
          DIAGNOSIS:
            effectiveModules.length === 0
              ? membershipModules.length === 0
                ? "EMPTY: membership has no membership_module_access rows -> activeModules empty -> only CORE shows"
                : "EMPTY: membership grants do not intersect active tenant entitlements"
              : "OK: membership resolves to a non-empty module set",
        });
      }

      report.users.push({
        userId: u.id,
        homeTenantId: u.tenant_id,
        userStatus: u.status,
        memberships: membershipReports,
      });
    }

    console.log(JSON.stringify({ ok: true, phase: "DIAG-USER-MODULE-ENTITLEMENTS", report }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
