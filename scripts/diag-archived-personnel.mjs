/**
 * READ-ONLY: find how archived / terminated personnel can be identified.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-archived-personnel.mjs
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

  const [counts] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where archived_at is not null)::int as already_archived,
      count(*) filter (where archived_at is null)::int as not_archived,
      count(*) filter (where status ilike '%terminat%' or status ilike '%inactive%' or status ilike '%archiv%')::int as status_looks_gone,
      count(*) filter (where display_name ~* 'terminat|\\binactive\\b|\\barchived\\b')::int as name_looks_gone
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const byStatus = await sql`
    select coalesce(nullif(btrim(status), ''), '(blank)') as status, count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
    group by 1
    order by count desc
    limit 40
  `;

  const nameHits = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      status,
      archived_at is not null as archived,
      job_title
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and display_name ~* 'terminat|\\binactive\\b|\\barchived\\b|\\brestricted\\b'
    order by display_name
    limit 60
  `;

  const statusHits = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      status,
      archived_at is not null as archived
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and (
        status ilike '%terminat%'
        or status ilike '%inactive%'
        or status ilike '%archiv%'
        or lower(status) in ('terminated', 'inactive', 'archived', 'leave')
      )
    order by display_name
    limit 60
  `;

  const rows = await sql`
    select status, display_name, archived_at, source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const payloadKeys = new Map();
  const payloadStatus = new Map();
  let payloadArchivedTrue = 0;
  let payloadStatusGone = 0;

  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    for (const key of Object.keys(payload)) {
      const lk = key.toLowerCase();
      if (
        lk.includes("archiv") ||
        lk.includes("terminat") ||
        lk.includes("inactive") ||
        lk === "status" ||
        lk === "employmentstatus" ||
        lk === "employeeStatus".toLowerCase()
      ) {
        payloadKeys.set(key, (payloadKeys.get(key) || 0) + 1);
      }
    }
    if (payload.archived === true || payload.isArchived === true || payload.archivedAt) {
      payloadArchivedTrue += 1;
    }
    const pStatus = String(payload.status ?? payload.employmentStatus ?? payload.employeeStatus ?? "")
      .trim()
      .toLowerCase();
    if (pStatus) {
      payloadStatus.set(pStatus, (payloadStatus.get(pStatus) || 0) + 1);
      if (
        pStatus.includes("terminat") ||
        pStatus.includes("inactive") ||
        pStatus.includes("archiv")
      ) {
        payloadStatusGone += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        tenantId,
        counts,
        byStatus,
        nameHits: { count: nameHits.length, sample: nameHits.slice(0, 25) },
        statusHits: { count: statusHits.length, sample: statusHits.slice(0, 25) },
        payloadKeys: [...payloadKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
        payloadStatus: [...payloadStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
        payloadArchivedTrue,
        payloadStatusGone,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
