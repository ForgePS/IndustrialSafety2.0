/**
 * Enable Industrial CALENDAR + REMINDERS for producers-rice-mill.
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/enable-calendar-reminders-modules.mjs
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
    code: "CALENDAR",
    name: "Calendar",
    description: "Schedule facility events and link them to tasks",
    flagKey: "industrial.module.calendar.enabled",
    displayOrder: 201,
  },
  {
    code: "REMINDERS",
    name: "Reminders",
    description: "Due reminders for calendar events and tasks",
    flagKey: "industrial.module.reminders.enabled",
    displayOrder: 202,
  },
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

async function enableOne(sql, tenant, product, grantActor, modSpec) {
  const report = { moduleCode: modSpec.code, actions: [] };

  let [mod] = await sql`
    select id::text as id, code from platform_modules
    where product_id = ${product.id}::uuid and code = ${modSpec.code}
    limit 1
  `;
  if (!mod) {
    report.actions.push({ step: "platform_module", action: `insert_${modSpec.code}` });
    if (APPLY) {
      const id = randomUUID();
      await sql`
        insert into platform_modules (
          id, product_id, code, name, description, status, is_core,
          category, classification, implementation_status, customer_assignable,
          display_order, created_at, updated_at
        ) values (
          ${id}::uuid, ${product.id}::uuid, ${modSpec.code}, ${modSpec.name},
          ${modSpec.description}, 'ACTIVE', false,
          'System Tools', 'CUSTOMER_MODULE', 'READY', true,
          ${modSpec.displayOrder}, now(), now()
        )
      `;
      mod = { id, code: modSpec.code };
    } else {
      mod = { id: "00000000-0000-0000-0000-000000000000", code: modSpec.code };
    }
  } else {
    report.actions.push({ step: "platform_module", action: "unchanged" });
    if (APPLY) {
      await sql`
        update platform_modules
        set name = ${modSpec.name},
            description = ${modSpec.description},
            status = 'ACTIVE',
            implementation_status = 'READY',
            customer_assignable = true,
            updated_at = now()
        where id = ${mod.id}::uuid
      `;
    }
  }

  if (!APPLY && mod.id === "00000000-0000-0000-0000-000000000000") {
    report.note = `Dry-run: ${modSpec.code} missing from catalog; APPLY will create it.`;
    return report;
  }

  report.moduleId = mod.id;

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
        if (!grantActor) {
          throw new Error("No actor user for membership_module_access.granted_by_user_id");
        }
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
    select id::text as id from feature_definitions where key = ${modSpec.flagKey} limit 1
  `;
  if (!flagDef) {
    report.actions.push({ step: "feature_definition", action: "insert" });
    if (APPLY) {
      const id = randomUUID();
      await sql`
        insert into feature_definitions (
          id, key, name, description, value_type, default_value_json, status, created_at, updated_at
        ) values (
          ${id}::uuid, ${modSpec.flagKey}, ${`Industrial ${modSpec.name} module`},
          ${`Enables ${modSpec.name} module in Industrial`}, 'BOOLEAN', 'true'::jsonb, 'ACTIVE', now(), now()
        )
      `;
      flagDef = { id };
    }
  } else {
    report.actions.push({ step: "feature_definition", action: "unchanged" });
  }

  if (flagDef && grantActor) {
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
            'true'::jsonb, ${grantActor.id}::uuid, now(), now()
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
  } else if (!grantActor) {
    report.actions.push({ step: "feature_override", action: "skipped_no_actor_user" });
  }

  return report;
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
      select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
    `;
    if (!product) throw new Error("FORGE_INDUSTRIAL product missing");

    const [grantActor] = await sql`
      select u.id::text as id
      from users u
      join user_tenant_memberships m on m.user_id = u.id
      where m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
      order by m.is_default_tenant desc, u.activated_at nulls last
      limit 1
    `;

    const modules = [];
    for (const modSpec of MODULES) {
      modules.push(await enableOne(sql, tenant, product, grantActor, modSpec));
    }

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          apply: APPLY,
          modules,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
