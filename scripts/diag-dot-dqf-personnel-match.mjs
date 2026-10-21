/**
 * READ-ONLY: diagnose DQF / DOT driver -> industrial_personnel linking.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-dot-dqf-personnel-match.mjs
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

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeEmp(value) {
  let s = asText(value).toUpperCase();
  if (!s) return "";
  s = s.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

function normalizePersonKey(value) {
  const parts = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(jr|sr|ii|iii|iv|v)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
}

function isDriverRow(row, payload) {
  const cat = asText(payload.category).toLowerCase();
  if (payload.dqf === true || cat.includes("driver") || cat.includes("dqf")) return true;
  const collection = asText(row.source_collection).toLowerCase();
  const path = asText(row.source_path).toLowerCase();
  if (collection.includes("dqf") || /\/drivers\//.test(path)) return true;
  if (/\bdrv-\d{4}-\d+\b/i.test(`${row.source_document_id} ${path} ${row.title}`)) return true;
  return false;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant.id;

  const people = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      first_name,
      last_name,
      archived_at
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const activePeople = people.filter((p) => !p.archived_at);
  const byEmployee = new Map();
  const byEmployeeRaw = new Map();
  const byName = new Map();
  const empSamples = [];

  for (const person of activePeople) {
    const raw = asText(person.employee_number);
    const emp = normalizeEmp(raw);
    if (raw) byEmployeeRaw.set(raw.toUpperCase(), person.id);
    if (emp) byEmployee.set(emp, person.id);
    if (empSamples.length < 15 && raw) {
      empSamples.push({ raw, normalized: emp, name: person.display_name });
    }
    const full = asText(person.display_name).toLowerCase();
    if (full) byName.set(full, person.id);
    const fl = `${asText(person.first_name)} ${asText(person.last_name)}`.trim().toLowerCase();
    if (fl) byName.set(fl, person.id);
    const nameKey = normalizePersonKey(person.display_name);
    if (nameKey) byName.set(nameKey, person.id);
  }

  const rows = await sql`
    select
      id::text as id,
      title,
      personnel_id::text as personnel_id,
      source_collection,
      source_document_id,
      source_path,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  const drivers = [];
  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    if (!isDriverRow(row, payload)) continue;
    const empRaw = asText(
      payload.employeeNumber ??
        payload.employee_number ??
        payload.details?.employeeNumber ??
        payload.details?.employee_number,
    );
    const emp = normalizeEmp(empRaw);
    const name =
      asText(row.title) ||
      asText(payload.driverName || payload.workerName || payload.displayName || payload.personnelName);
    const nameKey = normalizePersonKey(name);
    const cdl = asText(payload.cdlNumber || payload.licenseNumber || payload.details?.cdlNumber);

    let matchHow = null;
    let matchId = null;
    if (row.personnel_id) {
      matchHow = "already_linked";
      matchId = row.personnel_id;
    } else if (emp && byEmployee.has(emp)) {
      matchHow = "employee_normalized";
      matchId = byEmployee.get(emp);
    } else if (empRaw && byEmployeeRaw.has(empRaw.toUpperCase())) {
      matchHow = "employee_raw";
      matchId = byEmployeeRaw.get(empRaw.toUpperCase());
    } else if (nameKey && byName.has(nameKey)) {
      matchHow = "name_key";
      matchId = byName.get(nameKey);
    } else if (name && byName.has(name.toLowerCase())) {
      matchHow = "name_full";
      matchId = byName.get(name.toLowerCase());
    }

    drivers.push({
      id: row.id,
      title: row.title,
      sourceCollection: row.source_collection,
      personnelId: row.personnel_id,
      empRaw: empRaw || null,
      empNorm: emp || null,
      cdl: cdl || null,
      nameKey: nameKey || null,
      matchHow,
      matchId,
    });
  }

  const withPid = drivers.filter((d) => d.personnelId).length;
  const withoutPid = drivers.filter((d) => !d.personnelId).length;
  const withEmp = drivers.filter((d) => d.empRaw).length;
  const empWouldMatch = drivers.filter(
    (d) => !d.personnelId && (d.matchHow === "employee_normalized" || d.matchHow === "employee_raw"),
  ).length;
  const nameWouldMatch = drivers.filter(
    (d) => !d.personnelId && (d.matchHow === "name_key" || d.matchHow === "name_full"),
  ).length;
  const unmatched = drivers.filter((d) => !d.personnelId && !d.matchHow);

  const workbookish = drivers.filter(
    (d) =>
      String(d.sourceCollection || "").toLowerCase().includes("dqf") ||
      String(d.sourceCollection || "").toLowerCase() === "dqfworkbookimport",
  );

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        personnelActive: activePeople.length,
        personnelArchived: people.length - activePeople.length,
        personnelEmpSamples: empSamples,
        driverRows: drivers.length,
        workbookImportRows: workbookish.length,
        withPersonnelId: withPid,
        withoutPersonnelId: withoutPid,
        withEmployeeNumberInPayload: withEmp,
        unlinkedButEmpWouldMatch: empWouldMatch,
        unlinkedButNameWouldMatch: nameWouldMatch,
        unmatchedCount: unmatched.length,
        matchHowBreakdown: drivers.reduce((acc, d) => {
          const k = d.matchHow || "none";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        sourceCollections: drivers.reduce((acc, d) => {
          const k = d.sourceCollection || "(null)";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        unmatched: unmatched.map((d) => ({
          title: d.title,
          empRaw: d.empRaw,
          empNorm: d.empNorm,
          cdl: d.cdl,
          sourceCollection: d.sourceCollection,
        })),
        sampleUnlinked: drivers
          .filter((d) => !d.personnelId)
          .slice(0, 20)
          .map((d) => ({
            title: d.title,
            empRaw: d.empRaw,
            empNorm: d.empNorm,
            matchHow: d.matchHow,
            sourceCollection: d.sourceCollection,
          })),
        sampleLinked: drivers
          .filter((d) => d.personnelId)
          .slice(0, 10)
          .map((d) => ({
            title: d.title,
            empRaw: d.empRaw,
            personnelId: d.personnelId,
            sourceCollection: d.sourceCollection,
          })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
