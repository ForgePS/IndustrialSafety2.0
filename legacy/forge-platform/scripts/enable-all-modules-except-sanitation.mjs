/**
 * Turn on every toggleable Industrial module for a tenant except SANITATION.
 * Mirrors Settings > Company modules (IndustrialSettingsModulesService.setModuleEnabled):
 *
 * - tenant_module_entitlements ACTIVE (source_type TENANT_ADMIN)
 * - membership_module_access ACTIVE for every ACTIVE membership, only on modules being
 *   switched on (per-user access on already-active modules is left untouched)
 * - tenant-level feature_overrides that explicitly turn the module flag off are set to true
 *
 * SANITATION is left exactly as it is (reported, never changed).
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/enable-all-modules-except-sanitation.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const EXCLUDED = new Set(["CORE", "SANITATION"]);
const PRODUCT_CODE = "FORGE_INDUSTRIAL";

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

/** Same mapping as IndustrialBootstrapService.featureFlagKeyForModule. */
function featureFlagKeyForModule(code) {
  if (code === "CORE" || code === "IMPORT") return "industrial.enabled";
  if (code === "JSAS") return "industrial.module.jsa.enabled";
  if (code === "QR_LINKS") return "industrial.module.qr_links.enabled";
  if (code === "LOCKOUT_TAGOUT") return "industrial.module.loto.enabled";
  if (code === "DOT_COMPLIANCE") return "industrial.module.dot.enabled";
  if (code === "WORKERS_COMP") return "industrial.module.workers_comp.enabled";
  if (code === "EMERGENCY_RESPONSE") return "industrial.module.emergency_response.enabled";
  if (code === "EMERGENCY_ALERTS") return "industrial.module.emergency_alerts.enabled";
  return `industrial.module.${code.toLowerCase()}.enabled`;
}

function jsonIsTrue(value) {
  return value === true || value === "true" || JSON.stringify(value) === "true";
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id, tenant_key, display_name
      from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const [product] = await sql`
      select id::text as id from platform_products where code = ${PRODUCT_CODE} limit 1
    `;
    if (!product) throw new Error(`${PRODUCT_CODE} product missing`);

    const [tenantProduct] = await sql`
      select status from tenant_products
      where tenant_id = ${tenant.id}::uuid and product_id = ${product.id}::uuid
      limit 1
    `;

    const registry = contracts.INDUSTRIAL_MODULE_REGISTRY;
    const targets = registry.filter(
      (m) => !EXCLUDED.has(m.code) && contracts.industrialModuleIsToggleable(m),
    );

    const catalogRows = await sql`
      select id::text as id, code, status from platform_modules
      where product_id = ${product.id}::uuid
    `;
    const catalogByCode = new Map(catalogRows.map((r) => [r.code, r]));

    const entRows = await sql`
      select e.id::text as id, e.status, m.code
      from tenant_module_entitlements e
      join platform_modules m on m.id = e.module_id
      where e.tenant_id = ${tenant.id}::uuid and m.product_id = ${product.id}::uuid
    `;
    const entByCode = new Map(entRows.map((r) => [r.code, r]));

    const memberships = await sql`
      select id::text as id from user_tenant_memberships
      where tenant_id = ${tenant.id}::uuid and status = 'ACTIVE'
    `;
    const [actor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;
    if (!actor) throw new Error("No active user on tenant to record as grantor");

    const report = {
      tenantKey: TENANT_KEY,
      displayName: tenant.display_name,
      apply: APPLY,
      industrialProductStatus: tenantProduct?.status ?? "MISSING",
      activeMemberships: memberships.length,
      targetCount: targets.length,
      entitlementsActivated: [],
      entitlementsAlreadyActive: [],
      missingFromCatalog: [],
      membershipAccessGranted: 0,
      userGapsLeftOnActiveModules: 0,
      flagOverridesEnabled: [],
      sanitation: {
        entitlementStatus: entByCode.get("SANITATION")?.status ?? "OFF",
        action: "unchanged",
      },
    };

    for (const mod of targets) {
      const catalog = catalogByCode.get(mod.code);
      if (!catalog) {
        report.missingFromCatalog.push(mod.code);
        continue;
      }

      const ent = entByCode.get(mod.code);
      const alreadyActive = Boolean(ent && ent.status === "ACTIVE");
      if (alreadyActive) {
        report.entitlementsAlreadyActive.push(mod.code);
      } else {
        report.entitlementsActivated.push(`${mod.code}${ent ? ` (was ${ent.status})` : " (new)"}`);
        if (APPLY) {
          if (ent) {
            await sql`
              update tenant_module_entitlements
              set status = 'ACTIVE',
                  source_type = 'TENANT_ADMIN',
                  record_version = record_version + 1,
                  updated_at = now()
              where id = ${ent.id}::uuid
            `;
          } else {
            await sql`
              insert into tenant_module_entitlements (
                id, tenant_id, module_id, status, source_type, starts_at,
                configuration_json, created_at, updated_at
              ) values (
                ${randomUUID()}::uuid, ${tenant.id}::uuid, ${catalog.id}::uuid,
                'ACTIVE', 'TENANT_ADMIN', now(), '{}'::jsonb, now(), now()
              )
            `;
          }
        }
      }

      const accessRows = await sql`
        select membership_id::text as membership_id, id::text as id, status
        from membership_module_access
        where tenant_id = ${tenant.id}::uuid and module_id = ${catalog.id}::uuid
      `;
      const accessByMembership = new Map(accessRows.map((r) => [r.membership_id, r]));
      for (const m of memberships) {
        const existing = accessByMembership.get(m.id);
        if (existing && existing.status === "ACTIVE") continue;
        // Per-user gaps on modules that were already on may be deliberate restrictions.
        if (alreadyActive) {
          report.userGapsLeftOnActiveModules += 1;
          continue;
        }
        report.membershipAccessGranted += 1;
        if (!APPLY) continue;
        if (existing) {
          await sql`
            update membership_module_access
            set status = 'ACTIVE', updated_at = now()
            where id = ${existing.id}::uuid
          `;
        } else {
          await sql`
            insert into membership_module_access (
              id, tenant_id, membership_id, module_id, status, granted_by_user_id, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${tenant.id}::uuid, ${m.id}::uuid, ${catalog.id}::uuid,
              'ACTIVE', ${actor.id}::uuid, now(), now()
            )
          `;
        }
      }

      const flagKey = featureFlagKeyForModule(mod.code);
      const overrides = await sql`
        select o.id::text as id, o.value_json
        from feature_overrides o
        join feature_definitions d on d.id = o.feature_definition_id
        where d.key = ${flagKey}
          and o.tenant_id = ${tenant.id}::uuid
          and o.user_id is null
          and o.organization_id is null
      `;
      for (const o of overrides) {
        if (jsonIsTrue(o.value_json)) continue;
        report.flagOverridesEnabled.push(`${mod.code} (${flagKey})`);
        if (APPLY) {
          await sql`
            update feature_overrides
            set value_json = 'true'::jsonb, updated_at = now()
            where id = ${o.id}::uuid
          `;
        }
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
