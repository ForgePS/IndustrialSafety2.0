/**
 * Enable Industrial QR Scan (+ QR Management) for producers-rice-mill.
 *
 * - tenant_module_entitlements ACTIVE for SCAN and QR_LINKS
 * - membership_module_access for every ACTIVE membership on the tenant
 * - industrial.module.scan.enabled + industrial.module.qr_links.enabled overrides
 * - industrial.qr.* / scan.* / qr_links.* on industrial admin-ish roles
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/enable-scan-module.mjs
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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

const MODULES = [
  {
    code: "SCAN",
    name: "QR Scan",
    description: "QR scan workflows for equipment inspections, issues, and safety content",
    flagKey: "industrial.module.scan.enabled",
    category: "Risk & Prevention",
    displayOrder: 55,
  },
  {
    code: "QR_LINKS",
    name: "QR Management",
    description: "QR label registry, generation, and assignment",
    flagKey: "industrial.module.qr_links.enabled",
    category: "System Tools",
    displayOrder: 210,
  },
];

const PERM_CODES = [
  "industrial.access",
  "industrial.scan.view",
  "industrial.scan.manage",
  "industrial.qr_links.view",
  "industrial.qr_links.manage",
  "industrial.qr.view",
  "industrial.qr.scan",
  "industrial.qr.manage",
  "industrial.qr.generate",
  "industrial.qr.print",
  "industrial.qr.replace",
  "industrial.qr.deactivate",
  "industrial.qr.inspection.perform",
  "industrial.qr.issue.create",
  "industrial.qr.history.view",
  "industrial.qr.asset.out_of_service",
  "industrial.qr.asset.return_to_service",
  "industrial.qr.audit.view",
  "industrial.qr.analytics.view",
];

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
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

async function ensureModule(sql, productId, modDef, actions) {
  let [mod] = await sql`
    select id::text as id, code from platform_modules
    where product_id = ${productId}::uuid and code = ${modDef.code}
    limit 1
  `;
  if (!mod) {
    actions.push({ step: "platform_module", code: modDef.code, action: "insert" });
    if (APPLY) {
      const id = randomUUID();
      await sql`
        insert into platform_modules (
          id, product_id, code, name, description, status, is_core,
          category, classification, implementation_status, customer_assignable,
          display_order, created_at, updated_at
        ) values (
          ${id}::uuid, ${productId}::uuid, ${modDef.code}, ${modDef.name},
          ${modDef.description}, 'ACTIVE', false,
          ${modDef.category}, 'CUSTOMER_MODULE', 'READY', true,
          ${modDef.displayOrder}, now(), now()
        )
      `;
      mod = { id, code: modDef.code };
    } else {
      mod = { id: "00000000-0000-0000-0000-000000000000", code: modDef.code };
    }
  } else {
    actions.push({ step: "platform_module", code: modDef.code, action: "unchanged" });
    if (APPLY) {
      await sql`
        update platform_modules
        set name = ${modDef.name},
            description = ${modDef.description},
            status = 'ACTIVE',
            implementation_status = 'READY',
            customer_assignable = true,
            updated_at = now()
        where id = ${mod.id}::uuid
      `;
    }
  }
  return mod;
}

async function ensureEntitlement(sql, tenantId, moduleId, moduleCode, actions) {
  if (moduleId === "00000000-0000-0000-0000-000000000000") {
    actions.push({
      step: "tenant_module_entitlement",
      code: moduleCode,
      action: "skipped_dry_run_no_module",
    });
    return;
  }
  const [tme] = await sql`
    select id::text as id, status from tenant_module_entitlements
    where tenant_id = ${tenantId}::uuid and module_id = ${moduleId}::uuid
    limit 1
  `;
  if (!tme) {
    actions.push({ step: "tenant_module_entitlement", code: moduleCode, action: "insert" });
    if (APPLY) {
      await sql`
        insert into tenant_module_entitlements (
          id, tenant_id, module_id, status, starts_at, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${moduleId}::uuid,
          'ACTIVE', now(), now(), now()
        )
      `;
    }
  } else if (tme.status !== "ACTIVE") {
    actions.push({
      step: "tenant_module_entitlement",
      code: moduleCode,
      action: `activate_from_${tme.status}`,
    });
    if (APPLY) {
      await sql`
        update tenant_module_entitlements
        set status = 'ACTIVE', updated_at = now()
        where id = ${tme.id}::uuid
      `;
    }
  } else {
    actions.push({ step: "tenant_module_entitlement", code: moduleCode, action: "unchanged" });
  }
}

async function ensureMembershipAccess(sql, tenantId, moduleId, moduleCode, grantActor, actions) {
  if (moduleId === "00000000-0000-0000-0000-000000000000") return;
  const memberships = await sql`
    select id::text as id from user_tenant_memberships
    where tenant_id = ${tenantId}::uuid and status = 'ACTIVE'
  `;
  let membershipGranted = 0;
  let membershipExisting = 0;
  for (const m of memberships) {
    const [mma] = await sql`
      select id::text as id, status from membership_module_access
      where membership_id = ${m.id}::uuid and module_id = ${moduleId}::uuid
      limit 1
    `;
    if (!mma) {
      membershipGranted += 1;
      if (APPLY) {
        if (!grantActor) throw new Error("No actor user for membership_module_access.granted_by_user_id");
        await sql`
          insert into membership_module_access (
            id, tenant_id, membership_id, module_id, status, granted_by_user_id, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, ${m.id}::uuid, ${moduleId}::uuid,
            'ACTIVE', ${grantActor.id}::uuid, now(), now()
          )
        `;
      }
    } else if (mma.status !== "ACTIVE") {
      membershipGranted += 1;
      if (APPLY) {
        await sql`
          update membership_module_access
          set status = 'ACTIVE', updated_at = now()
          where id = ${mma.id}::uuid
        `;
      }
    } else {
      membershipExisting += 1;
    }
  }
  actions.push({
    step: "membership_module_access",
    code: moduleCode,
    activeMemberships: memberships.length,
    grantedOrActivated: membershipGranted,
    alreadyActive: membershipExisting,
  });
}

async function ensureFeatureFlag(sql, tenantId, flagKey, flagName, actor, actions) {
  let [flagDef] = await sql`
    select id::text as id from feature_definitions where key = ${flagKey} limit 1
  `;
  if (!flagDef) {
    actions.push({ step: "feature_definition", key: flagKey, action: "insert" });
    if (APPLY) {
      const id = randomUUID();
      await sql`
        insert into feature_definitions (
          id, key, name, description, value_type, default_value_json, status, created_at, updated_at
        ) values (
          ${id}::uuid, ${flagKey}, ${flagName},
          ${`Enables ${flagName} in Industrial`}, 'BOOLEAN', 'true'::jsonb, 'ACTIVE', now(), now()
        )
      `;
      flagDef = { id };
    }
  } else {
    actions.push({ step: "feature_definition", key: flagKey, action: "unchanged" });
  }

  if (!flagDef || !actor) {
    if (!actor) actions.push({ step: "feature_override", key: flagKey, action: "skipped_no_actor_user" });
    return;
  }

  const [override] = await sql`
    select id::text as id, value_json
    from feature_overrides
    where tenant_id = ${tenantId}::uuid and feature_definition_id = ${flagDef.id}::uuid
    limit 1
  `;
  const enabledNow =
    override &&
    (override.value_json === true ||
      override.value_json === "true" ||
      JSON.stringify(override.value_json) === "true");
  if (!override) {
    actions.push({ step: "feature_override", key: flagKey, action: "insert_enabled" });
    if (APPLY) {
      await sql`
        insert into feature_overrides (
          id, tenant_id, feature_definition_id, value_json, created_by_user_id, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${flagDef.id}::uuid,
          'true'::jsonb, ${actor.id}::uuid, now(), now()
        )
      `;
    }
  } else if (!enabledNow) {
    actions.push({ step: "feature_override", key: flagKey, action: "enable" });
    if (APPLY) {
      await sql`
        update feature_overrides
        set value_json = 'true'::jsonb, updated_at = now()
        where id = ${override.id}::uuid
      `;
    }
  } else {
    actions.push({ step: "feature_override", key: flagKey, action: "unchanged" });
  }
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

    const actions = [];
    const report = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      apply: APPLY,
      modules: MODULES.map((m) => m.code),
      actions,
    };

    const [product] = await sql`
      select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
    `;
    if (!product) throw new Error("FORGE_INDUSTRIAL product missing");

    for (const code of PERM_CODES) {
      if (code === "industrial.access") {
        const [perm] = await sql`select id::text as id from permissions where code = ${code} limit 1`;
        actions.push({
          step: "permission",
          code,
          action: perm ? "unchanged" : "missing",
        });
        continue;
      }
      const [perm] = await sql`select id::text as id from permissions where code = ${code} limit 1`;
      if (!perm) {
        actions.push({ step: "permission", code, action: "insert" });
        if (APPLY) {
          await sql`
            insert into permissions (
              id, code, name, description, scope_type, risk_level, is_sensitive, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${code}, ${code},
              ${`Industrial QR ${code}`},
              'TENANT', 'NORMAL', false, now(), now()
            )
          `;
        }
      } else {
        actions.push({ step: "permission", code, action: "unchanged" });
      }
    }

    const [grantActor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;

    for (const modDef of MODULES) {
      const mod = await ensureModule(sql, product.id, modDef, actions);
      await ensureEntitlement(sql, tenant.id, mod.id, modDef.code, actions);
      await ensureMembershipAccess(sql, tenant.id, mod.id, modDef.code, grantActor, actions);
      await ensureFeatureFlag(sql, tenant.id, modDef.flagKey, modDef.name, grantActor, actions);
    }

    const roles = await sql`
      select id::text as id, code from roles
      where tenant_id = ${tenant.id}::uuid
        and status = 'ACTIVE'
        and (
          upper(code) like '%ADMIN%'
          or upper(code) like '%INDUSTRIAL%'
          or upper(code) = 'OWNER'
        )
    `;
    const permIds = {};
    for (const code of PERM_CODES) {
      const [p] = await sql`select id::text as id from permissions where code = ${code} limit 1`;
      if (p) permIds[code] = p.id;
    }
    let rolePermGrants = 0;
    const grantCodes = PERM_CODES.filter((c) => c !== "industrial.access");
    for (const role of roles) {
      for (const code of grantCodes) {
        const pid = permIds[code];
        if (!pid) continue;
        const [existing] = await sql`
          select 1 from role_permissions
          where role_id = ${role.id}::uuid and permission_id = ${pid}::uuid
          limit 1
        `;
        if (!existing) {
          rolePermGrants += 1;
          if (APPLY) {
            await sql`
              insert into role_permissions (role_id, permission_id, effect, created_at)
              values (${role.id}::uuid, ${pid}::uuid, 'ALLOW', now())
            `;
          }
        }
      }
    }
    actions.push({
      step: "role_permissions",
      rolesConsidered: roles.map((r) => r.code),
      grants: rolePermGrants,
    });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
