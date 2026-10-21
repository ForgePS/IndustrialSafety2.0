/**
 * Quick count: active DQF drivers vs is_dot_driver after archive.
 * TENANT_KEY=producers-rice-mill node scripts/diag-dot-dashboard-vs-dot-driver-flag.mjs
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
      try {
        current = JSON.parse(current.trim());
        continue;
      } catch {
        return {};
      }
    }
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function isCompanyDriverSource(row, payload) {
  const seeded = String(payload.seededFrom ?? "").toLowerCase();
  const collection = String(row.source_collection ?? "").toLowerCase();
  const path = String(row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) return true;
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") return true;
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

function isDotDqf(row, payload) {
  if (isCompanyDriverSource(row, payload)) return false;
  const hay = [row.source_document_id, row.source_path, row.source_collection, row.title, payload.category, payload.seededFrom]
    .map((v) => String(v ?? ""))
    .join(" ")
    .toLowerCase();
  if (/\bdrv-\d{4}-\d+\b/.test(hay)) return true;
  if (/dqf\s*import/.test(hay) || hay.includes("dqf")) return true;
  if (payload.dqf === true) return true;
  return false;
}

async function main() {
  const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
  try {
    const [tenant] = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
    const flags = await sql`
      select count(*) filter (where is_dot_driver)::int as dot_flags,
             count(*) filter (where is_company_driver)::int as company
      from industrial_personnel
      where tenant_id = ${tenant.id}::uuid and archived_at is null`;
    const rows = await sql`
      select id::text as id, title, personnel_id::text as personnel_id, source_collection, source_path, source_document_id, source_payload
      from industrial_dot_compliance_records
      where tenant_id = ${tenant.id}::uuid and archived_at is null`;
    const active = [];
    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      if (isDotDqf(row, payload)) active.push(row.title);
    }
    const archivedTerm = await sql`
      select count(*)::int as n
      from industrial_dot_compliance_records
      where tenant_id = ${tenant.id}::uuid
        and archived_at is not null
        and (
          title ilike '%terminated%'
          or source_payload::text ilike '%terminated%'
        )`;
    console.log(JSON.stringify({
      tenant: TENANT_KEY,
      activeDqfTitles: active.length,
      titles: active.sort(),
      personnelDotFlags: flags[0].dot_flags,
      companyDrivers: flags[0].company,
      archivedTerminatedish: archivedTerm[0].n,
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
