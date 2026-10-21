/**
 * Seed / enrich DOT Drivers (DQF) for producers-rice-mill from the DQF workbook JSON.
 *
 * Expects DQF_DRIVERS_JSON_PATH (output of scripts/parse-dqf-xlsx.mjs).
 * Matches existing DQF rows by CDL, employee #, or driver name; merges worksheet
 * fields into source_payload without wiping uploaded document blobs.
 *
 * Dry-run unless APPLY=1. FORCE=1 updates rows that already have workbook data.
 *
 *   TENANT_KEY=producers-rice-mill DQF_DRIVERS_JSON_PATH=.tmp/dqf-drivers.json node scripts/seed-dot-dqf-from-source.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 DQF_DRIVERS_JSON_PATH=.tmp/dqf-drivers.json node scripts/seed-dot-dqf-from-source.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const SOURCE_SYSTEM = "DQF_XLSX";
const SOURCE_COLLECTION = "dqfWorkbookImport";

const PRESERVE_WHEN_BLANK = new Set([
  "licenseFrontUpload",
  "licenseBackUpload",
  "driversLicenseFront",
  "driversLicenseBack",
  "driversLicenseCopy",
  "medicalCertCopy",
  "driversApplicationCopy",
  "mvrReleaseUpload",
  "mvrAnnualUpload",
]);

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

function loadPayload() {
  const filePath = (process.env.DQF_DRIVERS_JSON_PATH || "").trim();
  if (!filePath) throw new Error("Set DQF_DRIVERS_JSON_PATH");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
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

/** Strip EMP- prefix and leading zeros so "EMP-24952" matches workbook "24952". */
function normalizeEmployeeNumber(value) {
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
    .filter((part) => !/^(jr|sr|ii|iii|iv|v|not|diabetic|terminated|restricted)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
}

function displayTitle(driverName) {
  return driverName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function forgeStatus(status) {
  const raw = asText(status).toLowerCase();
  if (raw === "expired") return "EXPIRED";
  if (raw === "open" || raw === "compliant") return "OPEN";
  if (!raw) return "OPEN";
  return raw.toUpperCase();
}

function cleanDetails(details) {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter(([, value]) => asText(value) !== ""),
  );
}

function buildSourcePayload(driver, meta) {
  const details = cleanDetails(driver.details);
  const driverName = asText(driver.driverName);
  const cdl = asText(details.cdlNumber);

  const mapped = {
    ...details,
    details,
    category: "drivers",
    dqf: true,
    driverName,
    workerName: driverName,
    displayName: driverName,
    personnelName: driverName,
    employeeNumber: details.employeeNumber,
    hireDate: details.hireDate,
    locationDepartment: details.locationDepartment,
    locationText: details.locationDepartment,
    siteName: details.locationDepartment,
    licenseNumber: cdl,
    licenseExpiryDate: details.cdlExpiry,
    medicalCardExpiry: details.medicalCertExpiry,
    medicalExaminer: details.medicalExaminerNationalRegistryVerification,
    lastMvrDate: details.mvrAnnual,
    nextMvrDueDate: details.mvrAnnual,
    mvrReleaseDate: details.mvrReleaseForm,
    initialMvrDate: details.mvrReleaseForm || details.mvrAnnual,
    driversLicenseOnFile: details.driversLicenseOnFile,
    dueDate: deriveDueDate(details),
    seededFrom: meta.sourceFile,
    dqfSourceFile: meta.sourceFile,
    reportedBy: "DQF Import",
    dqfSeedVersion: meta.seedVersion,
  };

  return mapped;
}

function deriveDueDate(details) {
  const fields = ["cdlExpiry", "medicalCertExpiry", "mvrAnnual"];
  const dates = fields
    .map((fieldId) => asText(details[fieldId]))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates[0] ?? "";
}

function mergePayload(existing, incoming) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value == null || asText(value) === "") continue;
    if (PRESERVE_WHEN_BLANK.has(key)) {
      const current = merged[key];
      if (current != null && asText(current) !== "") continue;
    }
    merged[key] = value;
  }
  return merged;
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

function deterministicId(parts) {
  const h = createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function indexExisting(rows) {
  const byCdl = new Map();
  const byEmployee = new Map();
  const byName = new Map();

  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    if (!isDriverRow(row, payload)) continue;

    const cdl = asText(payload.cdlNumber || payload.licenseNumber);
    if (cdl) byCdl.set(cdl, row);

    const emp = normalizeEmployeeNumber(payload.employeeNumber || payload.employee_number);
    if (emp) byEmployee.set(emp, row);

    const nameKey = normalizePersonKey(
      row.title || payload.driverName || payload.workerName || payload.displayName,
    );
    if (nameKey) byName.set(nameKey, row);
  }

  return { byCdl, byEmployee, byName };
}

function findMatch(driver, indexes) {
  const details = cleanDetails(driver.details);
  const cdl = asText(details.cdlNumber);
  const emp = normalizeEmployeeNumber(details.employeeNumber);
  const nameKey = normalizePersonKey(driver.driverName);

  if (cdl && indexes.byCdl.has(cdl)) return indexes.byCdl.get(cdl);
  if (emp && indexes.byEmployee.has(emp)) return indexes.byEmployee.get(emp);
  if (nameKey && indexes.byName.has(nameKey)) return indexes.byName.get(nameKey);
  return null;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const workbook = loadPayload();
    const drivers = Array.isArray(workbook.drivers) ? workbook.drivers : [];
    if (drivers.length === 0) throw new Error("No drivers in workbook payload");

    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const tenantId = tenant.id;

    const people = await sql`
      select id::text as id, employee_number, display_name, first_name, last_name
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid and archived_at is null
    `;
    const byEmployee = new Map();
    const byName = new Map();
    for (const person of people) {
      const emp = normalizeEmployeeNumber(person.employee_number);
      if (emp) byEmployee.set(emp, person.id);
      const full = asText(person.display_name).toLowerCase();
      if (full) byName.set(full, person.id);
      const fl = `${asText(person.first_name)} ${asText(person.last_name)}`.trim().toLowerCase();
      if (fl) byName.set(fl, person.id);
      const nameKey = normalizePersonKey(person.display_name);
      if (nameKey) byName.set(nameKey, person.id);
    }

    const existingRows = await sql`
      select
        id::text as id,
        title,
        status,
        personnel_id::text as personnel_id,
        source_collection,
        source_document_id,
        source_path,
        source_payload
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    const indexes = indexExisting(existingRows);
    const report = {
      tenantKey: TENANT_KEY,
      tenantId,
      apply: APPLY,
      force: FORCE,
      sourceFile: workbook.sourceFile,
      driverCount: drivers.length,
      updated: 0,
      inserted: 0,
      skipped: 0,
      linkedPersonnel: 0,
      samples: [],
    };

    for (const driver of drivers) {
      const incoming = buildSourcePayload(driver, workbook);
      const cdl = asText(incoming.cdlNumber || incoming.licenseNumber);
      if (!cdl) {
        report.skipped += 1;
        continue;
      }

      const match = findMatch(driver, indexes);
      const title = displayTitle(driver.driverName);
      const status = forgeStatus(driver.status);
      const emp = normalizeEmployeeNumber(incoming.employeeNumber);
      let personnelId =
        match?.personnel_id && /^[0-9a-f-]{36}$/i.test(match.personnel_id)
          ? match.personnel_id
          : null;
      if (!personnelId && emp && byEmployee.has(emp)) {
        personnelId = byEmployee.get(emp);
        report.linkedPersonnel += 1;
      }
      if (!personnelId) {
        const nameKey = normalizePersonKey(driver.driverName);
        if (nameKey && byName.has(nameKey)) {
          personnelId = byName.get(nameKey);
          report.linkedPersonnel += 1;
        }
      }

      if (match) {
        const existingPayload = unwrap(match.source_payload);
        if (
          !FORCE &&
          asText(existingPayload.dqfSourceFile) === asText(workbook.sourceFile) &&
          asText(existingPayload.cdlNumber) === cdl
        ) {
          report.skipped += 1;
          continue;
        }

        const merged = mergePayload(existingPayload, incoming);
        if (report.samples.length < 8) {
          report.samples.push({
            action: "update",
            id: match.id,
            title,
            cdl,
            employeeNumber: incoming.employeeNumber,
            personnelId,
          });
        }

        if (APPLY) {
          await sql`
            update industrial_dot_compliance_records
            set
              title = ${title},
              status = ${status},
              personnel_id = coalesce(${personnelId}::uuid, personnel_id),
              source_payload = ${sql.json(merged)},
              updated_at = now()
            where id = ${match.id}::uuid
              and tenant_id = ${tenantId}::uuid
          `;
        }
        report.updated += 1;
        continue;
      }

      const sourceDocumentId = `cdl:${cdl}`;
      const id = deterministicId(["dot-dqf", tenantId, SOURCE_COLLECTION, sourceDocumentId]);
      const sourcePath = `dot-compliance/drivers/${sourceDocumentId}`;

      if (report.samples.length < 8) {
        report.samples.push({
          action: "insert",
          id,
          title,
          cdl,
          employeeNumber: incoming.employeeNumber,
          personnelId,
        });
      }

      if (APPLY) {
        await sql`
          insert into industrial_dot_compliance_records (
            id, tenant_id, title, status, personnel_id,
            source_system, source_collection, source_document_id, source_path, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${title}, ${status}, ${personnelId}::uuid,
            ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION}, ${sourceDocumentId}, ${sourcePath},
            ${sql.json(incoming)},
            now(), now()
          )
          on conflict do nothing
        `;
      }
      report.inserted += 1;
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
