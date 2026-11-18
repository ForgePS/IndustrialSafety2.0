/**
 * List industrial / demo tenants (schema-tolerant, read-only).
 * Intended to run inside the platform-api ECS image.
 *
 *   DATABASE_SECRET_ARN=... node scripts/diag-list-industrial-tenants.mjs
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
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `;
  return rows.length > 0;
}

async function columnExists(sql, table, column) {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = ${column}
    limit 1
  `;
  return rows.length > 0;
}

async function safeCount(sql, table, tenantId) {
  if (!(await tableExists(sql, table))) return null;
  const [row] = await sql.unsafe(
    `select count(*)::int as n from ${table} where tenant_id = $1::uuid`,
    [tenantId],
  );
  return row?.n ?? 0;
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const url = await resolveDatabaseUrl(secretArn);
const sql = postgres(url, { max: 1 });

try {
  const hasDemoFlag = await columnExists(sql, "tenants", "is_demo_tenant");
  const migrations = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at desc
    limit 8
  `.catch(() => []);

  const tenants = hasDemoFlag
    ? await sql`
        select id::text as id, tenant_key, slug, display_name, status,
               coalesce(is_demo_tenant, false) as is_demo_tenant
        from tenants
        where tenant_key ilike '%demo%'
           or tenant_key ilike '%producers%'
           or tenant_key ilike '%forge%'
           or slug ilike '%demo%'
           or slug ilike '%producers%'
           or slug ilike '%forge%'
        order by tenant_key
      `
    : await sql`
        select id::text as id, tenant_key, slug, display_name, status,
               false as is_demo_tenant
        from tenants
        where tenant_key ilike '%demo%'
           or tenant_key ilike '%producers%'
           or tenant_key ilike '%forge%'
           or slug ilike '%demo%'
           or slug ilike '%producers%'
           or slug ilike '%forge%'
        order by tenant_key
      `;

  const countTables = [
    "industrial_sites",
    "industrial_personnel",
    "industrial_incidents",
    "industrial_equipment",
    "industrial_fleet_vehicles",
    "industrial_inspections",
    "industrial_loto_procedures",
    "industrial_training_assignments",
  ];

  const summaries = [];
  for (const t of tenants) {
    const counts = {};
    for (const table of countTables) {
      counts[table] = await safeCount(sql, table, t.id);
    }
    summaries.push({ ...t, counts });
  }

  const allTenantCount = await sql`select count(*)::int as n from tenants`;

  console.log(
    JSON.stringify(
      {
        ok: true,
        at: new Date().toISOString(),
        schema: {
          has_is_demo_tenant: hasDemoFlag,
          recent_migrations: migrations,
          total_tenants: allTenantCount[0]?.n ?? 0,
        },
        tenants: summaries,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
