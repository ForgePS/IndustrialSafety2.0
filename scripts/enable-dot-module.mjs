/**
 * Enable Industrial DOT_COMPLIANCE for producers-rice-mill.
 *
 * - tenant_module_entitlements ACTIVE for DOT_COMPLIANCE
 * - membership_module_access for every ACTIVE membership on the tenant
 * - industrial.module.dot.enabled tenant feature override
 * - industrial.dot.view / manage / view_sensitive on industrial admin-ish roles
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/enable-dot-module.mjs
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
const MODULE_CODE = "DOT_COMPLIANCE";
const FLAG_KEY = "industrial.module.dot.enabled";
const PERM_CODES = [
  "industrial.dot.view",
  "industrial.dot.manage",
  "industrial.dot.view_sensitive",
  "industrial.access",
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

    const reportBase = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      apply: APPLY,
      actions: [],
    };

    const [product] = await sql`
      select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
    `;
    if (!product) throw new Error("FORGE_INDUSTRIAL product missing");

    let [mod] = await sql`
      select id::text as id, code from platform_modules
      where product_id = ${product.id}::uuid and code = ${MODULE_CODE}
      limit 1
    `;
    if (!mod) {
      reportBase.actions.push({ step: "platform_module", action: "insert_DOT_COMPLIANCE" });
      if (APPLY) {
        const id = randomUUID();
        await sql`
          insert into platform_modules (
            id, product_id, code, name, description, status, is_core,
            category, classification, implementation_status, customer_assignable,
            display_order, created_at, updated_at
          ) values (
            ${id}::uuid, ${product.id}::uuid, ${MODULE_CODE}, 'DOT Compliance',
            'DOT driver, vehicle, and company compliance records', 'ACTIVE', false,
            'Compliance Programs', 'CUSTOMER_MODULE', 'READY', true,
            130, now(), now()
          )
        `;
        mod = { id, code: MODULE_CODE };
      } else {
        mod = { id: "00000000-0000-0000-0000-000000000000", code: MODULE_CODE };
      }
    } else {
      reportBase.actions.push({ step: "platform_module", action: "unchanged" });
      if (APPLY) {
        await sql`
          update platform_modules
          set name = 'DOT Compliance',
              description = 'DOT driver, vehicle, and company compliance records',
              status = 'ACTIVE',
              implementation_status = 'READY',
              customer_assignable = true,
              updated_at = now()
          where id = ${mod.id}::uuid
        `;
      }
    }

    for (const code of ["industrial.dot.view", "industrial.dot.manage", "industrial.dot.view_sensitive"]) {
      const [perm] = await sql`select id::text as id from permissions where code = ${code} limit 1`;
      if (!perm) {
        reportBase.actions.push({ step: "permission", code, action: "insert" });
        if (APPLY) {
          const suffix = code.endsWith("view_sensitive")
            ? "view sensitive"
            : code.endsWith("manage")
              ? "manage"
              : "view";
          await sql`
            insert into permissions (
              id, code, name, description, scope_type, risk_level, is_sensitive, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${code}, ${code},
              ${`Industrial DOT ${suffix}`},
              'TENANT', ${code.endsWith("sensitive") ? "HIGH" : "NORMAL"},
              ${code.endsWith("sensitive")}, now(), now()
            )
          `;
        }
      } else {
        reportBase.actions.push({ step: "permission", code, action: "unchanged" });
      }
    }

    if (!APPLY && mod.id === "00000000-0000-0000-0000-000000000000") {
      console.log(
        JSON.stringify(
          {
            ...reportBase,
            note: "Dry-run: DOT_COMPLIANCE module missing from catalog; APPLY will create it.",
          },
          null,
          2,
        ),
      );
      return;
    }

    const report = {
      ...reportBase,
      moduleId: mod.id,
    };

    const [tme] = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${tenant.id}::uuid and module_id = ${mod.id}::uuid
      limit 1
    `;
    if (!tme) {
      report.actions.push({ step: "tenant_module_entitlement", action: "insert" });
      if (APPLY) {
        await sql`
          insert into tenant_module_entitlements (
            id, tenant_id, module_id, status, starts_at, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenant.id}::uuid, ${mod.id}::uuid,
            'ACTIVE', now(), now(), now()
          )
        `;
      }
    } else if (tme.status !== "ACTIVE") {
      report.actions.push({
        step: "tenant_module_entitlement",
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
      report.actions.push({ step: "tenant_module_entitlement", action: "unchanged" });
    }

    const memberships = await sql`
      select id::text as id from user_tenant_memberships
      where tenant_id = ${tenant.id}::uuid and status = 'ACTIVE'
    `;
    const [grantActor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;
    let membershipGranted = 0;
    let membershipExisting = 0;
    for (const m of memberships) {
      const [mma] = await sql`
        select id::text as id, status from membership_module_access
        where membership_id = ${m.id}::uuid and module_id = ${mod.id}::uuid
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
              ${randomUUID()}::uuid, ${tenant.id}::uuid, ${m.id}::uuid, ${mod.id}::uuid,
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
    report.actions.push({
      step: "membership_module_access",
      activeMemberships: memberships.length,
      grantedOrActivated: membershipGranted,
      alreadyActive: membershipExisting,
    });

    let [flagDef] = await sql`
      select id::text as id from feature_definitions where key = ${FLAG_KEY} limit 1
    `;
    if (!flagDef) {
      report.actions.push({ step: "feature_definition", action: "insert" });
      if (APPLY) {
        const id = randomUUID();
        await sql`
          insert into feature_definitions (
            id, key, name, description, value_type, default_value_json, status, created_at, updated_at
          ) values (
            ${id}::uuid, ${FLAG_KEY}, 'Industrial DOT Compliance module',
            'Enables DOT Compliance in Industrial', 'BOOLEAN', 'true'::jsonb, 'ACTIVE', now(), now()
          )
        `;
        flagDef = { id };
      }
    } else {
      report.actions.push({ step: "feature_definition", action: "unchanged" });
    }

    const [actor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;

    if (flagDef && actor) {
      const [override] = await sql`
        select id::text as id, value_json
        from feature_overrides
        where tenant_id = ${tenant.id}::uuid and feature_definition_id = ${flagDef.id}::uuid
        limit 1
      `;
      const enabledNow =
        override &&
        (override.value_json === true ||
          override.value_json === "true" ||
          JSON.stringify(override.value_json) === "true");
      if (!override) {
        report.actions.push({ step: "feature_override", action: "insert_enabled" });
        if (APPLY) {
          await sql`
            insert into feature_overrides (
              id, tenant_id, feature_definition_id, value_json, created_by_user_id, created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${tenant.id}::uuid, ${flagDef.id}::uuid,
              'true'::jsonb, ${actor.id}::uuid, now(), now()
            )
          `;
        }
      } else if (!enabledNow) {
        report.actions.push({ step: "feature_override", action: "enable" });
        if (APPLY) {
          await sql`
            update feature_overrides
            set value_json = 'true'::jsonb, updated_at = now()
            where id = ${override.id}::uuid
          `;
        }
      } else {
        report.actions.push({ step: "feature_override", action: "unchanged" });
      }
    } else if (!actor) {
      report.actions.push({ step: "feature_override", action: "skipped_no_actor_user" });
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
      else report.actions.push({ step: "permission_catalog", code, action: "missing" });
    }
    let rolePermGrants = 0;
    for (const role of roles) {
      for (const code of ["industrial.dot.view", "industrial.dot.manage", "industrial.dot.view_sensitive"]) {
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
    report.actions.push({
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
