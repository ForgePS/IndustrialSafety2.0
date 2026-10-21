/**
 * Find fleet drivers whose personnel link would 404 or fail assertRecordId.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-bad-driver-personnel-links.mjs
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenant[0]?.id;
  if (!tenantId) throw new Error(`tenant ${TENANT_KEY} not found`);

  const drivers = await sql`
    select id::text as id, personnel_id::text as personnel_id, personnel_name, employee_number, source_payload
    from industrial_fleet_drivers
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;

  const personnelIds = await sql`
    select id::text as id from industrial_personnel where tenant_id = ${tenantId}::uuid
  `;
  const personnelSet = new Set(personnelIds.map((r) => r.id));

  const dgfPeople = await sql`
    select id::text as id, display_name, employee_number, file_base, division_name, department_name
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and (
        coalesce(file_base, '') ilike '%DGF%'
        or coalesce(division_name, '') ilike '%DGF%'
        or coalesce(department_name, '') ilike '%DGF%'
        or coalesce(display_name, '') ilike '%DGF%'
      )
    limit 50
  `;

  const bad = [];
  for (const row of drivers) {
    const payload = unwrap(row.source_payload);
    const columnPid = row.personnel_id?.trim() || null;
    const payloadPid =
      typeof payload.personnelId === "string" && payload.personnelId.trim()
        ? payload.personnelId.trim()
        : null;
    const effectivePid = columnPid ?? payloadPid;
    if (!effectivePid) continue;

    const issues = [];
    if (!UUID_PATTERN.test(effectivePid)) issues.push("non_uuid");
    if (UUID_PATTERN.test(effectivePid) && !personnelSet.has(effectivePid)) issues.push("missing_personnel");
    if (columnPid && payloadPid && columnPid !== payloadPid) issues.push("column_payload_mismatch");

    if (issues.length > 0) {
      bad.push({
        driverId: row.id,
        personnelName: row.personnel_name,
        employeeNumber: row.employee_number,
        columnPersonnelId: columnPid,
        payloadPersonnelId: payloadPid,
        issues,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        badDriverLinks: bad.length,
        bad,
        dgfPeople,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
