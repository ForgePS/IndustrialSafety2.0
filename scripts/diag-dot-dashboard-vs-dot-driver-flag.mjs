/**
 * Compare DOT Dashboard Drivers (DQF) count vs personnel.is_dot_driver.
 * Mirrors industrial-web isDotDqfDriverRecord + profile collapse by personnelId/name.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-dot-dashboard-vs-dot-driver-flag.mjs
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
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return { ...current };
    }
    return {};
  }
  return {};
}

function hay(row, payload) {
  return [
    row.source_document_id,
    row.source_path,
    row.source_collection,
    row.title,
    payload.sourceDocumentId,
    payload.recordNumber,
    payload.createdByName,
    payload.seededFrom,
    payload.category,
    JSON.stringify(payload),
  ]
    .map((v) => String(v ?? ""))
    .join(" ")
    .toLowerCase();
}

function isCompanyDriverSource(row, payload) {
  const seeded = String(payload.seededFrom ?? "").toLowerCase();
  const collection = String(row.source_collection ?? "").toLowerCase();
  const path = String(row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) {
    return true;
  }
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") {
    return true;
  }
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

/** Match apps/industrial-web isDotDqfDriverRecord */
function isDotDqfDriverRecord(row, payload) {
  if (isCompanyDriverSource(row, payload)) return false;
  const text = hay(row, payload);
  if (/\bdrv-\d{4}-\d+\b/.test(text)) return true;
  if (/dqf\s*import/.test(text)) return true;
  if (/dot-compliance\/[^/]+\/drivers\/drv-/.test(text)) return true;
  const cat = String(payload.category ?? row.category ?? "").trim().toLowerCase();
  if (cat.includes("dqf")) return true;
  if (payload.dqf === true) return true;
  return false;
}

function normalizeName(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.'"]/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned.includes(",")) return cleaned;
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return cleaned.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
}

function profileKey(row, payload) {
  const pid = String(row.personnel_id ?? payload.personnelId ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(pid)) return `p:${pid}`;
  const name = normalizeName(
    payload.workerName || payload.driverName || payload.personnelName || row.title || "",
  );
  if (name) return `n:${name}`;
  return `id:${row.id}`;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const flags = await sql`
      select
        count(*) filter (where is_company_driver)::int as company_drivers,
        count(*) filter (where is_dot_driver)::int as dot_driver_flag,
        count(*) filter (where is_company_driver and is_dot_driver)::int as both_flags,
        count(*) filter (where is_company_driver and not is_dot_driver)::int as company_only
      from industrial_personnel
      where tenant_id = ${tenant.id}::uuid and archived_at is null
    `;

    const rows = await sql`
      select
        id::text as id,
        title,
        personnel_id::text as personnel_id,
        source_collection,
        source_path,
        source_document_id,
        source_payload,
        status
      from industrial_dot_compliance_records
      where tenant_id = ${tenant.id}::uuid and archived_at is null
    `;

    const dqfRows = [];
    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      if (isDotDqfDriverRecord(row, payload)) {
        dqfRows.push({ row, payload, key: profileKey(row, payload) });
      }
    }

    const profiles = new Map();
    for (const item of dqfRows) {
      const list = profiles.get(item.key) ?? [];
      list.push(item);
      profiles.set(item.key, list);
    }

    let withPersonnel = 0;
    let withoutPersonnel = 0;
    let flagOn = 0;
    let flagOff = 0;
    const sampleMissingFlag = [];
    const sampleNoPersonnel = [];

    const flagById = new Map(
      (
        await sql`
          select id::text as id, is_dot_driver, is_company_driver, display_name
          from industrial_personnel
          where tenant_id = ${tenant.id}::uuid and archived_at is null
        `
      ).map((p) => [p.id, p]),
    );

    for (const [key, members] of profiles) {
      const pid = key.startsWith("p:")
        ? key.slice(2)
        : members.map((m) => String(m.row.personnel_id ?? "").trim()).find((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (pid) {
        withPersonnel += 1;
        const person = flagById.get(pid);
        if (person?.is_dot_driver) flagOn += 1;
        else {
          flagOff += 1;
          if (sampleMissingFlag.length < 12) {
            sampleMissingFlag.push({
              key,
              personnelId: pid,
              name: person?.display_name ?? members[0]?.row.title,
              isCompanyDriver: person?.is_company_driver ?? null,
              recordCount: members.length,
            });
          }
        }
      } else {
        withoutPersonnel += 1;
        if (sampleNoPersonnel.length < 12) {
          sampleNoPersonnel.push({
            key,
            title: members[0]?.row.title,
            recordCount: members.length,
          });
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          tenant: TENANT_KEY,
          personnelFlags: flags[0],
          dashboard: {
            dqfRawRows: dqfRows.length,
            collapsedDriverProfiles: profiles.size,
            profilesWithPersonnelId: withPersonnel,
            profilesWithoutPersonnelId: withoutPersonnel,
            linkedAndFlagOn: flagOn,
            linkedButFlagOff: flagOff,
          },
          mismatch:
            profiles.size !== flags[0].dot_driver_flag
              ? `Dashboard drivers=${profiles.size} vs is_dot_driver=${flags[0].dot_driver_flag}`
              : "counts match",
          sampleMissingFlag,
          sampleNoPersonnel,
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
