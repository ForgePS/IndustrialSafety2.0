#!/usr/bin/env node
/**
 * Remove synthetic FORGE_DEMO / DEMO: rows from a customer tenant and clear
 * is_demo_tenant. Does NOT delete migrated/real source data.
 *
 * Runs inside the platform-api ECS image.
 *
 * Env:
 *   DATABASE_SECRET_ARN  required
 *   TENANT_KEY           required (customer tenant only; forge-platform refused)
 *   APPLY=1              required to write
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/purge-forge-demo-from-tenant.mjs
 *
 * Apply:
 *   APPLY=1 TENANT_KEY=producers-rice-mill node scripts/purge-forge-demo-from-tenant.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const FORBIDDEN = new Set(["forge-platform", "forge-industrial-demo"]);

if (!TENANT_KEY) {
  console.error(JSON.stringify({ ok: false, error: "TENANT_KEY_required" }));
  process.exit(1);
}
if (FORBIDDEN.has(TENANT_KEY.toLowerCase())) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "refusing_demo_tenant",
      tenantKey: TENANT_KEY,
      message: "Use this script only on customer tenants (e.g. producers-rice-mill).",
    }),
  );
  process.exit(1);
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

async function tableExists(sql, name) {
  const rows = await sql`
    select 1 as ok from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `;
  return rows.length > 0;
}

async function countDemo(sql, tenantId, table, predicateSql) {
  if (!(await tableExists(sql, table))) return { table, exists: false, count: 0 };
  const rows = await sql.unsafe(
    `select count(*)::int as c from ${table} where tenant_id = $1::uuid and (${predicateSql})`,
    [tenantId],
  );
  return { table, exists: true, count: Number(rows[0]?.c ?? 0) };
}

async function deleteDemo(sql, tenantId, table, predicateSql) {
  if (!(await tableExists(sql, table))) return { table, deleted: 0, skipped: true };
  const rows = await sql.unsafe(
    `with d as (
       delete from ${table}
       where tenant_id = $1::uuid and (${predicateSql})
       returning 1
     ) select count(*)::int as c from d`,
    [tenantId],
  );
  return { table, deleted: Number(rows[0]?.c ?? 0) };
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenants = await sql`
    select id::text as id, tenant_key, coalesce(is_demo_tenant, false) as is_demo_tenant
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenants.length) {
    console.error(JSON.stringify({ ok: false, error: "tenant_not_found", TENANT_KEY }));
    process.exit(1);
  }
  const tenant = tenants[0];
  const tenantId = tenant.id;

  await sql`select set_config('app.current_tenant_id', ${tenantId}, true)`;

  // Same FK-safe order as IndustrialDemoSeedService.applySeed cleanup.
  const specs = [
    ["industrial_reminders", "title like 'DEMO:%'"],
    ["industrial_calendar_events", "title like 'DEMO:%'"],
    ["qr_links", "source_system = 'FORGE_DEMO'"],
    ["industrial_loto_procedures", "source_system = 'FORGE_DEMO'"],
    ["industrial_training_assignments", "title like 'DEMO:%'"],
    ["industrial_training_sources", "title like 'DEMO:%'"],
    ["industrial_tasks", "source_system = 'FORGE_DEMO'"],
    ["industrial_workers_comp_cases", "source_system = 'FORGE_DEMO'"],
    ["industrial_osha_cases", "source_system = 'FORGE_DEMO'"],
    ["industrial_incidents", "source_system = 'FORGE_DEMO'"],
    ["industrial_inspections", "source_system = 'FORGE_DEMO'"],
    ["industrial_fleet_vehicles", "source_system = 'FORGE_DEMO'"],
    ["industrial_equipment", "source_system = 'FORGE_DEMO'"],
    ["industrial_supply_items", "item_number like 'DEMO-%'"],
    ["report_definitions", "report_key like 'demo.%'"],
    ["industrial_personnel", "source_system = 'FORGE_DEMO'"],
    ["industrial_departments", "source_system = 'FORGE_DEMO'"],
    ["industrial_sites", "source_system = 'FORGE_DEMO'"],
  ];

  const before = [];
  for (const [table, pred] of specs) {
    before.push(await countDemo(sql, tenantId, table, pred));
  }

  const report = {
    ok: true,
    apply: APPLY,
    tenant: {
      id: tenantId,
      key: tenant.tenant_key,
      isDemoTenant: Boolean(tenant.is_demo_tenant),
    },
    before,
    totalDemoRows: before.reduce((n, r) => n + (r.count || 0), 0),
  };

  if (!APPLY) {
    console.log(JSON.stringify({ ...report, note: "Set APPLY=1 to delete FORGE_DEMO rows and clear is_demo_tenant." }, null, 2));
    process.exit(0);
  }

  const deleted = [];
  await sql.begin(async (tx) => {
    await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
    for (const [table, pred] of specs) {
      deleted.push(await deleteDemo(tx, tenantId, table, pred));
    }
    await tx`
      update tenants
      set is_demo_tenant = false, updated_at = now()
      where id = ${tenantId}::uuid
    `;
  });

  const afterFlag = await sql`
    select coalesce(is_demo_tenant, false) as is_demo_tenant
    from tenants where id = ${tenantId}::uuid limit 1
  `;

  console.log(
    JSON.stringify(
      {
        ...report,
        deleted,
        totalDeleted: deleted.reduce((n, r) => n + (r.deleted || 0), 0),
        after: { isDemoTenant: Boolean(afterFlag[0]?.is_demo_tenant) },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
