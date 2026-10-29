/**
 * producers-rice-mill: import legacy Training Database.xlsx completions into
 * industrial_training_records and attach matched rows to personnel transcripts.
 *
 * Unmatched employees are stored with personnel_id = null and
 * source_payload.pendingPersonnelLink = true for later linking when a
 * personnel file is created.
 *
 * Env:
 *   DATABASE_SECRET_ARN   required
 *   TENANT_KEY            default producers-rice-mill
 *   TRAINING_XLSX_PATH    local path (ECS: downloaded from S3)
 *   APPLY                 1 to write (default dry-run)
 *
 *   TENANT_KEY=producers-rice-mill TRAINING_XLSX_PATH=/tmp/Training-Database.xlsx node scripts/import-training-database.mjs
 *   APPLY=1 TENANT_KEY=producers-rice-mill TRAINING_XLSX_PATH=/tmp/Training-Database.xlsx node scripts/import-training-database.mjs
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;
const xlsx = apiRequire("xlsx");

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const XLSX_PATH = (process.env.TRAINING_XLSX_PATH || "/tmp/Training-Database.xlsx").trim();
const ALLOWED = new Set(["producers-rice-mill"]);
const SOURCE_COLLECTION = "training_database_xlsx";
const IMPORT_RUN_ID =
  process.env.IMPORT_RUN_ID || `training-db-${new Date().toISOString().replace(/[:.]/g, "-")}`;

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
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

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeEmployeeNumber(value) {
  let s = asText(value).toUpperCase();
  if (!s) return "";
  s = s.replace(/^EMP[-_\s]*/i, "").replace(/\s+/g, "");
  if (/^\d+$/.test(s)) return String(Number(s));
  return s;
}

function canonicalEmployeeNumber(value) {
  const normalized = normalizeEmployeeNumber(value);
  if (!normalized) return "";
  if (/^\d+$/.test(normalized)) return `EMP-${normalized}`;
  return normalized.startsWith("EMP") ? normalized : `EMP-${normalized}`;
}

function employeeLookupKeys(value) {
  const keys = new Set();
  const raw = asText(value);
  if (!raw) return [];
  keys.add(raw.toLowerCase());
  const canonical = canonicalEmployeeNumber(raw).toLowerCase();
  keys.add(canonical);
  const normalized = normalizeEmployeeNumber(raw);
  if (normalized) {
    keys.add(normalized);
    keys.add(`emp-${normalized}`);
    keys.add(`emp${normalized}`);
  }
  return [...keys];
}

function normalizePersonKey(value) {
  const text = asText(value).toUpperCase();
  if (!text) return "";
  const comma = text.includes(",") ? text.split(",") : null;
  if (comma && comma.length >= 2) {
    const last = comma[0].trim();
    const rest = comma.slice(1).join(" ").trim();
    const first = rest.split(/\s+/)[0] ?? "";
    return `${last}|${first}`.toLowerCase();
  }
  const parts = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(jr|sr|ii|iii|iv|v)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
}

function slugify(value) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function deterministicUuid(parts) {
  const hex = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function excelSerialToDate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const ms = (serial - 25569) * 86400000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseWorkbook(buffer) {
  const wb = xlsx.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("Sheet2") ? "Sheet2" : wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const headerRowIndex = rows.findIndex(
    (row) =>
      asText(row[0]).toUpperCase() === "EMPLOYEE NUMBER" &&
      asText(row[1]).toUpperCase().includes("NAME"),
  );
  if (headerRowIndex < 0) throw new Error("Could not locate header row (EMPLOYEE NUMBER)");
  const header = rows[headerRowIndex];
  const courses = header
    .map((name, index) => ({ index, name: asText(name) }))
    .filter((col) => col.index >= 8 && col.name);

  const employees = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const employeeNumber = asText(row[0]);
    const employeeName = asText(row[1]);
    if (!employeeNumber && !employeeName) continue;
    if (employeeNumber.toUpperCase() === "EMPLOYEE NUMBER") continue;

    const completions = [];
    for (const course of courses) {
      const raw = row[course.index];
      if (raw === "" || raw == null) continue;
      let completedAt = null;
      let completionCode = null;
      if (typeof raw === "number") {
        completedAt = excelSerialToDate(raw);
      } else {
        const text = asText(raw).toUpperCase();
        if (text === "A" || text === "T") completionCode = text;
        else continue;
      }
      completions.push({
        courseName: course.name,
        completedAt,
        completionCode,
        rawValue: raw,
      });
    }

    employees.push({
      rowNumber: i + 1,
      employeeNumber,
      employeeName,
      hireDate: typeof row[2] === "number" ? excelSerialToDate(row[2]) : null,
      statusCode: asText(row[3]),
      title: asText(row[4]),
      location: asText(row[5]),
      completions,
    });
  }
  return { courses, employees, sheetName, headerRowIndex };
}

function buildPersonnelIndex(people) {
  const byEmployee = new Map();
  const byName = new Map();

  for (const person of people) {
    for (const key of employeeLookupKeys(person.employee_number)) {
      if (!byEmployee.has(key)) byEmployee.set(key, []);
      byEmployee.get(key).push(person);
    }
    for (const candidate of [
      person.display_name,
      `${person.last_name ?? ""}, ${person.first_name ?? ""}`,
      `${person.first_name ?? ""} ${person.last_name ?? ""}`,
    ]) {
      const key = normalizePersonKey(candidate);
      if (key) {
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(person);
      }
      const full = asText(candidate).toLowerCase();
      if (full) {
        if (!byName.has(full)) byName.set(full, []);
        byName.get(full).push(person);
      }
    }
  }

  return { byEmployee, byName };
}

function pickPerson(candidates, employeeNumber) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];
  const preferred = canonicalEmployeeNumber(employeeNumber).toLowerCase();
  const exact = candidates.find((p) => asText(p.employee_number).toLowerCase() === preferred);
  if (exact) return exact;
  const active = candidates.find((p) => !p.archived_at);
  return active ?? candidates[0];
}

function resolvePersonnel(employeeNumber, employeeName, index) {
  for (const key of employeeLookupKeys(employeeNumber)) {
    const match = pickPerson(index.byEmployee.get(key), employeeNumber);
    if (match) return { person: match, matchMethod: "employee_number" };
  }
  for (const key of [normalizePersonKey(employeeName), asText(employeeName).toLowerCase()]) {
    if (!key) continue;
    const match = pickPerson(index.byName.get(key), employeeNumber);
    if (match) return { person: match, matchMethod: "name" };
  }
  return { person: null, matchMethod: null };
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");

const buffer = readFileSync(XLSX_PATH);
const parsed = parseWorkbook(buffer);
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant.id;

  const people = await sql`
    select
      id::text as id,
      employee_number,
      display_name,
      first_name,
      last_name,
      archived_at,
      status
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;
  const personnelIndex = buildPersonnelIndex(people);

  const existing = await sql`
    select source_document_id
    from industrial_training_records
    where tenant_id = ${tenantId}::uuid
      and source_collection = ${SOURCE_COLLECTION}
  `;
  const existingIds = new Set(existing.map((row) => row.source_document_id));

  const report = {
    importRunId: IMPORT_RUN_ID,
    tenantKey: TENANT_KEY,
    tenantId,
    apply: APPLY,
    xlsxPath: XLSX_PATH,
    sheetName: parsed.sheetName,
    courseCount: parsed.courses.length,
    employeeRows: parsed.employees.length,
    matchedEmployees: 0,
    unmatchedEmployees: 0,
    archivedMatches: 0,
    activeMatches: 0,
    recordsPrepared: 0,
    recordsInserted: 0,
    recordsSkippedExisting: 0,
    recordsLinked: 0,
    recordsPendingLink: 0,
    unmatchedEmployeeSamples: [],
    matchMethodCounts: { employee_number: 0, name: 0 },
  };

  const inserts = [];
  const unmatchedEmployees = new Map();

  for (const employee of parsed.employees) {
    const { person, matchMethod } = resolvePersonnel(
      employee.employeeNumber,
      employee.employeeName,
      personnelIndex,
    );

    if (person) {
      report.matchedEmployees += 1;
      if (person.archived_at) report.archivedMatches += 1;
      else report.activeMatches += 1;
      if (matchMethod) report.matchMethodCounts[matchMethod] += 1;
    } else {
      report.unmatchedEmployees += 1;
      if (report.unmatchedEmployeeSamples.length < 25) {
        report.unmatchedEmployeeSamples.push({
          employeeNumber: employee.employeeNumber,
          employeeName: employee.employeeName,
          completionCount: employee.completions.length,
        });
      }
      unmatchedEmployees.set(
        canonicalEmployeeNumber(employee.employeeNumber) || employee.employeeName,
        employee,
      );
    }

    for (const completion of employee.completions) {
      const sourceDocumentId = deterministicUuid([
        tenantId,
        SOURCE_COLLECTION,
        canonicalEmployeeNumber(employee.employeeNumber) || employee.employeeName,
        slugify(completion.courseName),
        String(completion.rawValue),
      ]);
      if (existingIds.has(sourceDocumentId)) {
        report.recordsSkippedExisting += 1;
        continue;
      }

      report.recordsPrepared += 1;
      const recordId = deterministicUuid([tenantId, "training-record", sourceDocumentId]);
      const payload = {
        importRunId: IMPORT_RUN_ID,
        importEmployeeNumber: employee.employeeNumber,
        importEmployeeName: employee.employeeName,
        importStatusCode: employee.statusCode,
        importTitle: employee.title,
        importLocation: employee.location,
        employeeNumber: person?.employee_number ?? canonicalEmployeeNumber(employee.employeeNumber),
        personnelId: person?.id ?? null,
        courseName: completion.courseName,
        completionCode: completion.completionCode,
        rawCompletionValue: completion.rawValue,
        matchMethod: matchMethod ?? null,
        pendingPersonnelLink: !person,
      };

      inserts.push({
        id: recordId,
        tenantId,
        personnelId: person?.id ?? null,
        title: completion.courseName,
        courseName: completion.courseName,
        completedAt: completion.completedAt,
        sourceDocumentId,
        sourcePayload: payload,
      });

      if (person) report.recordsLinked += 1;
      else report.recordsPendingLink += 1;
    }
  }

  report.unmatchedEmployeeList = [...unmatchedEmployees.values()].map((employee) => ({
    employeeNumber: employee.employeeNumber,
    employeeName: employee.employeeName,
    statusCode: employee.statusCode,
    completionCount: employee.completions.length,
  }));

  if (APPLY && inserts.length) {
    const batchSize = 200;
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize);
      await sql.begin(async (tx) => {
        for (const row of batch) {
          await tx`
            insert into industrial_training_records (
              id,
              tenant_id,
              title,
              course_name,
              status,
              completed_at,
              personnel_id,
              source_system,
              source_collection,
              source_document_id,
              source_payload,
              created_at,
              updated_at
            ) values (
              ${row.id}::uuid,
              ${row.tenantId}::uuid,
              ${row.title},
              ${row.courseName},
              'ACTIVE',
              ${row.completedAt},
              ${row.personnelId}::uuid,
              'FORGE',
              ${SOURCE_COLLECTION},
              ${row.sourceDocumentId},
              ${tx.json(row.sourcePayload)},
              now(),
              now()
            )
            on conflict (tenant_id, source_collection, source_document_id)
            where source_document_id is not null
            do nothing
          `;
          report.recordsInserted += 1;
        }
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
