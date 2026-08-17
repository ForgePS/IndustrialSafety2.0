/**
 * READ-ONLY: company vehicle driver roster parity vs Firebase stats
 * (on_insurance ~194, pending_mvr ~7, missing license expiry ~199).
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-company-driver-compliance.mjs
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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const fleet = await sql`
    select
      id::text as id,
      personnel_id::text as personnel_id,
      personnel_name,
      employee_number,
      license_number,
      license_state,
      status,
      initial_mvr_date::text as initial_mvr_date,
      last_mvr_date::text as last_mvr_date,
      next_mvr_due_date::text as next_mvr_due_date,
      insurance_effective_date::text as insurance_effective_date,
      insurance_removed_date::text as insurance_removed_date,
      archived_at is not null as archived,
      source_collection,
      source_document_id,
      source_payload
    from industrial_fleet_drivers
    where tenant_id = ${tenantId}::uuid
  `;

  let migration = [];
  try {
    migration = await sql`
      select
        source_collection,
        count(*)::int as count
      from migration_records
      where tenant_id = ${tenantId}::uuid
        and (
          source_collection ilike '%company%vehicle%driver%'
          or source_collection ilike '%fleet%driver%'
          or source_collection = 'companyVehicleDrivers'
        )
      group by 1
      order by count desc
    `;
  } catch (e) {
    migration = [{ error: String(e.message || e) }];
  }

  const statusCounts = new Map();
  const payloadStatusCounts = new Map();
  let missingLicenseExpiry = 0;
  let hasLicenseExpiry = 0;
  let linkedPersonnel = 0;
  let payloadKeyHits = new Map();
  const samples = { on_insurance: [], pending_mvr: [], missing_expiry: [] };

  for (const row of fleet) {
    if (row.archived) continue;
    const payload = unwrap(row.source_payload);
    for (const key of Object.keys(payload)) {
      payloadKeyHits.set(key, (payloadKeyHits.get(key) || 0) + 1);
    }

    const colStatus = String(row.status || "").trim().toLowerCase();
    statusCounts.set(colStatus || "(blank)", (statusCounts.get(colStatus || "(blank)") || 0) + 1);

    const pStatus = String(payload.status || "").trim().toLowerCase();
    if (pStatus) {
      payloadStatusCounts.set(pStatus, (payloadStatusCounts.get(pStatus) || 0) + 1);
    }

    if (row.personnel_id) linkedPersonnel += 1;

    const expiry = String(
      payload.licenseExpiryDate ?? payload.license_expiry_date ?? payload.licenseExpiration ?? "",
    ).trim();
    const notRemoved = pStatus !== "removed" && colStatus !== "removed";
    if (notRemoved && !expiry) {
      missingLicenseExpiry += 1;
      if (samples.missing_expiry.length < 8) {
        samples.missing_expiry.push({
          id: row.id,
          name: row.personnel_name || payload.personnelName,
          status: pStatus || colStatus,
        });
      }
    } else if (expiry) {
      hasLicenseExpiry += 1;
    }

    const effective = pStatus || colStatus;
    if (effective === "on_insurance" && samples.on_insurance.length < 5) {
      samples.on_insurance.push({
        id: row.id,
        name: row.personnel_name || payload.personnelName,
        expiry: expiry || null,
      });
    }
    if (effective === "pending_mvr" && samples.pending_mvr.length < 5) {
      samples.pending_mvr.push({
        id: row.id,
        name: row.personnel_name || payload.personnelName,
      });
    }
  }

  const flaggedPersonnel = await sql`
    select count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and is_company_driver = true
      and archived_at is null
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        expected: { on_insurance: 194, pending_mvr: 7, missing_license_expiry: 199 },
        fleetDrivers: {
          total: fleet.length,
          active: fleet.filter((r) => !r.archived).length,
          linkedPersonnel,
          columnStatus: Object.fromEntries([...statusCounts.entries()].sort()),
          payloadStatus: Object.fromEntries([...payloadStatusCounts.entries()].sort()),
          hasLicenseExpiry,
          missingLicenseExpiry,
          topPayloadKeys: [...payloadKeyHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
          samples,
        },
        personnelCompanyDriverFlag: flaggedPersonnel[0]?.count ?? 0,
        migration,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
