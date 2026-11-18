/**
 * READ-ONLY: find how company drivers can be identified for a tenant.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-company-drivers.mjs
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

function unwrap(raw) {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    if (current && typeof current === "object" && !Array.isArray(current)) return current;
    return {};
  }
  return {};
}

function truthy(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "y";
  }
  return false;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const [flagged] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where is_company_driver)::int as drivers,
      count(*) filter (where archived_at is null)::int as active
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const fleet = await sql`
    select
      id::text as id,
      personnel_id::text as personnel_id,
      personnel_name,
      status,
      license_number,
      archived_at is not null as archived
    from industrial_fleet_drivers
    where tenant_id = ${tenantId}::uuid
    order by updated_at desc nulls last
    limit 200
  `;

  const dot = await sql`
    select
      id::text as id,
      personnel_id::text as personnel_id,
      title,
      status,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
    order by updated_at desc nulls last
    limit 200
  `;

  const titleHits = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      job_title,
      department_name,
      is_company_driver
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and (
        coalesce(job_title, '') ~* '(driver|cdl|truck|fleet|operator.?driver)'
        or coalesce(department_name, '') ~* '(driver|fleet|transport|truck)'
        or coalesce(display_name, '') ~* '\\bdriver\\b'
      )
    order by display_name
    limit 200
  `;

  const rows = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      job_title,
      is_company_driver,
      source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  const payloadDriverKeys = new Map();
  const payloadDriverHits = [];
  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    for (const [key, value] of Object.entries(payload)) {
      const lk = key.toLowerCase();
      if (
        lk.includes("driver") ||
        lk.includes("cdl") ||
        lk === "iscompanydriver" ||
        lk === "companydriver" ||
        lk.includes("fleet")
      ) {
        payloadDriverKeys.set(key, (payloadDriverKeys.get(key) || 0) + 1);
        if (truthy(value) || (typeof value === "string" && value.trim() !== "")) {
          if (payloadDriverHits.length < 40) {
            payloadDriverHits.push({
              id: row.id,
              employeeNumber: row.employee_number,
              displayName: row.display_name,
              key,
              value,
              alreadyFlagged: row.is_company_driver,
            });
          }
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        tenantId,
        personnel: flagged,
        fleetDrivers: {
          count: fleet.length,
          withPersonnelId: fleet.filter((r) => r.personnel_id).length,
          sample: fleet.slice(0, 25),
        },
        dotRecords: {
          count: dot.length,
          withPersonnelId: dot.filter((r) => r.personnel_id).length,
          sample: dot.slice(0, 15).map((r) => ({
            id: r.id,
            personnelId: r.personnel_id,
            title: r.title,
            status: r.status,
          })),
        },
        titleMatches: {
          count: titleHits.length,
          sample: titleHits.slice(0, 40),
        },
        payloadDriverKeys: [...payloadDriverKeys.entries()].sort((a, b) => b[1] - a[1]),
        payloadDriverHits,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
