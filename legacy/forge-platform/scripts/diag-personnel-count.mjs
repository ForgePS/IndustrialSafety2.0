/**
 * READ-ONLY: why the personnel directory shows fewer people than the legacy roster.
 * Counts personnel by archived/status, looks for duplicate suppression, and
 * compares against names referenced by other industrial tables.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-personnel-count.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();

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

async function tableExists(name) {
  const [row] = await sql`select to_regclass(${`public.${name}`}) is not null as ok`;
  return row?.ok === true;
}

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const [counts] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where archived_at is null)::int as active_visible,
      count(*) filter (where archived_at is not null)::int as archived,
      count(*) filter (where is_company_driver)::int as company_drivers,
      count(distinct lower(btrim(display_name)))::int as distinct_names,
      count(distinct nullif(btrim(employee_number), ''))::int as distinct_employee_numbers,
      count(*) filter (where nullif(btrim(employee_number), '') is null)::int as blank_employee_number
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const byStatus = await sql`
    select
      coalesce(nullif(btrim(status), ''), '(blank)') as status,
      count(*)::int as count,
      count(*) filter (where archived_at is not null)::int as archived
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
    group by 1
    order by count desc
  `;

  const dupNames = await sql`
    select lower(btrim(display_name)) as name, count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
    group by 1
    having count(*) > 1
    order by count desc
    limit 20
  `;

  // Other industrial tables reference people by name in their payload; anyone in
  // there but not in industrial_personnel never made it through the import.
  const [driverNames] = await sql`
    select
      count(*)::int as fleet_driver_rows,
      count(distinct lower(btrim(personnel_name)))::int as distinct_driver_names,
      count(*) filter (where personnel_id is null)::int as unlinked
    from industrial_fleet_drivers
    where tenant_id = ${tenantId}::uuid
  `;

  const driverNotInRoster = await sql`
    select d.personnel_name, count(*)::int as count
    from industrial_fleet_drivers d
    where d.tenant_id = ${tenantId}::uuid
      and nullif(btrim(d.personnel_name), '') is not null
      and not exists (
        select 1 from industrial_personnel p
        where p.tenant_id = d.tenant_id
          and lower(btrim(p.display_name)) = lower(btrim(d.personnel_name))
      )
    group by 1
    order by 1
    limit 40
  `;

  const importSummary = {};
  if (await tableExists("import_batches")) {
    importSummary.batches = await sql`
      select
        coalesce(nullif(btrim(entity_type), ''), '(none)') as entity_type,
        status,
        count(*)::int as batches,
        sum(coalesce(total_rows, 0))::int as total_rows,
        sum(coalesce(succeeded_rows, 0))::int as succeeded_rows,
        sum(coalesce(failed_rows, 0))::int as failed_rows
      from import_batches
      where tenant_id = ${tenantId}::uuid
      group by 1, 2
      order by total_rows desc nulls last
      limit 40
    `.catch((e) => ({ error: String(e.message || e) }));
  }
  if (await tableExists("import_rows")) {
    importSummary.rows = await sql`
      select status, count(*)::int as count
      from import_rows
      where tenant_id = ${tenantId}::uuid
      group by 1
      order by count desc
      limit 20
    `.catch((e) => ({ error: String(e.message || e) }));
  }

  // Provenance recorded by the Firebase loader, if present.
  const provenance = await sql`
    select
      coalesce(source_payload->'_import'->>'source', source_payload->>'_source', '(none)') as source,
      count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
    group by 1
    order by count desc
    limit 20
  `.catch((e) => ({ error: String(e.message || e) }));

  const createdByDay = await sql`
    select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
    group by 1
    order by 1
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        tenantId,
        counts,
        byStatus,
        duplicateDisplayNames: dupNames,
        fleetDrivers: driverNames,
        driverNamesMissingFromRoster: {
          count: driverNotInRoster.length,
          sample: driverNotInRoster.slice(0, 25),
        },
        importSummary,
        provenance,
        createdByDay,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
