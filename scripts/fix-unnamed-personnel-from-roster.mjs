/**
 * producers-rice-mill only: repair personnel rows labeled "Unnamed employee"
 * using a roster index JSON (from parse-employee-roster-xlsx.mjs).
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   ROSTER_INDEX_JSON=/path/to/employee-roster-index.json
 *   TENANT_KEY=producers-rice-mill node scripts/fix-unnamed-personnel-from-roster.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-unnamed-personnel-from-roster.mjs
 */
import { readFileSync } from "node:fs";
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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ROSTER_INDEX_JSON = (process.env.ROSTER_INDEX_JSON || "").trim();
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}
if (!ROSTER_INDEX_JSON) {
  throw new Error("ROSTER_INDEX_JSON required");
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
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function blank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function isUnnamedDisplay(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "unnamed employee" || text === "unnamed" || text === "";
}

function normalizeEmpKey(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

function parseHireDate(raw) {
  if (blank(raw)) return null;
  const text = String(raw).trim();
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!slash) return null;
  let year = Number(slash[3]);
  if (slash[3].length === 2) year += year >= 70 ? 1900 : 2000;
  const month = Number(slash[1]);
  const day = Number(slash[2]);
  if (!month || !day || !year) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const rosterPayload = JSON.parse(readFileSync(ROSTER_INDEX_JSON, "utf8"));
const rosterByKey = new Map();
for (const emp of rosterPayload.employees ?? []) {
  if (emp?.employeeKey) rosterByKey.set(String(emp.employeeKey), emp);
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant[0]) throw new Error(`tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant[0].id;

  const rows = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      first_name,
      middle_name,
      last_name,
      suffix,
      email,
      phone,
      job_title,
      department_name,
      hire_date,
      source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  const unnamedRows = rows.filter(
    (row) =>
      isUnnamedDisplay(row.display_name) ||
      (isUnnamedDisplay(row.first_name) && isUnnamedDisplay(row.last_name)),
  );

  let wouldUpdate = 0;
  let updated = 0;
  const matched = [];
  const unmatched = [];

  for (const row of unnamedRows) {
    const key = normalizeEmpKey(row.employee_number);
    const roster = key ? rosterByKey.get(key) : null;
    if (!roster) {
      unmatched.push({
        id: row.id,
        employeeNumber: row.employee_number,
        displayName: row.display_name,
      });
      continue;
    }

    const payload = unwrap(row.source_payload);
    const nextPayload = {
      ...payload,
      employeeNumber: roster.employeeNumber,
      firstName: roster.firstName,
      middleName: roster.middleName ?? "",
      lastName: roster.lastName,
      suffix: roster.suffix ?? "",
      displayName: roster.displayName,
      email: roster.email ?? payload.email ?? "",
      phone: roster.phone ?? payload.phone ?? "",
      jobTitle: roster.jobTitle ?? payload.jobTitle ?? "",
      department: roster.departmentName ?? payload.department ?? "",
      departmentName: roster.departmentName ?? payload.departmentName ?? "",
      rosterNameRepairSource: roster.sourceFile,
      rosterNameRepairAt: new Date().toISOString(),
    };

    const hireFromRoster = parseHireDate(roster.hireDateRaw);
    const next = {
      display_name: roster.displayName,
      first_name: roster.firstName,
      middle_name: roster.middleName,
      last_name: roster.lastName,
      suffix: roster.suffix,
      email: blank(row.email) ? roster.email : row.email,
      phone: blank(row.phone) ? roster.phone : row.phone,
      job_title: blank(row.job_title) ? roster.jobTitle : row.job_title,
      department_name: blank(row.department_name) ? roster.departmentName : row.department_name,
      hire_date: row.hire_date ?? hireFromRoster,
    };

    wouldUpdate += 1;
    if (matched.length < 8) {
      matched.push({
        id: row.id,
        employeeNumber: row.employee_number,
        before: row.display_name,
        after: next.display_name,
        sourceFile: roster.sourceFile,
      });
    }

    if (!APPLY) continue;

    await sql`
      update industrial_personnel
      set
        display_name = ${next.display_name},
        first_name = ${next.first_name},
        middle_name = ${next.middle_name},
        last_name = ${next.last_name},
        suffix = ${next.suffix},
        email = ${next.email},
        phone = ${next.phone},
        job_title = ${next.job_title},
        department_name = ${next.department_name},
        hire_date = ${next.hire_date},
        source_payload = ${sql.json(nextPayload)},
        updated_at = now()
      where id = ${row.id}::uuid
        and tenant_id = ${tenantId}::uuid
    `;
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        rosterSourceFiles: rosterPayload.sourceFiles ?? [],
        rosterEmployeeCount: rosterByKey.size,
        personnelScanned: rows.length,
        unnamedFound: unnamedRows.length,
        wouldUpdate,
        updated,
        matchedSamples: matched,
        unmatchedCount: unmatched.length,
        unmatchedSample: unmatched.slice(0, 20),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
