#!/usr/bin/env node
/**
 * Parse Producers DQF workbook (DQF Files.xlsx) into JSON for seed-dot-dqf-from-source.mjs.
 *
 *   node scripts/parse-dqf-xlsx.mjs [path-to-xlsx] [output-json]
 *
 * Default source:
 *   C:/Users/jerem/OneDrive/Forge Public Safety/Industrial Safety/DQF Files.xlsx
 * Default output:
 *   .tmp/dqf-drivers.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

function resolveXlsx() {
  const candidates = [
    path.join(repoRoot, "node_modules", "xlsx"),
    path.join(repoRoot, "..", "safety-reports-clone", "node_modules", "xlsx"),
    "C:/Users/jerem/Projects/safety-reports-clone/node_modules/xlsx",
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next
    }
  }
  throw new Error("xlsx package not found; install in repo or safety-reports-clone");
}

const XLSX = resolveXlsx();

const defaultSource =
  "C:/Users/jerem/OneDrive/Forge Public Safety/Industrial Safety/DQF Files.xlsx";
const source = process.argv[2] ?? defaultSource;
const output = process.argv[3] ?? path.join(repoRoot, ".tmp", "dqf-drivers.json");

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
}

const DQF_COLUMN_FIELDS = {
  2: "locationDepartment",
  3: "cdlNumber",
  4: "cdlExpiry",
  5: "driversLicenseOnFile",
  9: "employeeNumber",
  10: "hireDate",
  11: "driversApplicationForEmployment",
  13: "medicalCertExpiry",
  14: "medicalExaminationReportMer",
  15: "medicalExaminerNationalRegistryVerification",
  16: "certificationOfRoadTest",
  17: "mvrReleaseForm",
  18: "mvrAnnual",
  19: "employmentEligibilityI9",
  20: "certificationComplianceDriverLicense",
  21: "driverStatementOnDutyHours",
  22: "safetyPerformanceHistoryRequest",
  23: "drugAlcoholRecordkeepingLog",
  24: "consentDrugAlcoholTest",
  26: "drugAlcoholTestRandom",
  27: "preEmploymentDrugAlcoholStatement",
  28: "drugAlcoholRecordsRequest",
  29: "drugAlcoholEmployeeCertifiedReceipt",
  30: "drugAlcoholTestNotification",
  31: "observedBehaviorReasonableSuspicion",
  32: "drugAlcoholClearinghouseConsent",
  33: "documentationRefusalToTest",
  34: "documentationActualKnowledgeViolation",
};

const yesNoNaFields = new Set(["driversLicenseOnFile"]);

function parseDqfDriverName(raw) {
  const name = clean(raw);
  if (!name) return { driverName: "", driverRestrictions: "" };

  const parenMatch = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return { driverName: parenMatch[1].trim(), driverRestrictions: parenMatch[2].trim() };
  }

  const trailingRestricted = name.match(/^(.+?)\s+(Restricted\)?)$/i);
  if (trailingRestricted) {
    return {
      driverName: trailingRestricted[1].replace(/,\s*$/, "").trim(),
      driverRestrictions: "Restricted",
    };
  }

  return { driverName: name, driverRestrictions: "" };
}

function parseDqfDate(raw) {
  const text = clean(raw);
  if (!text || /^n\/a$/i.test(text)) return "";

  const datePart = text.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)?.[0];
  if (!datePart) return "";

  const [month, day, yearPart] = datePart.split("/");
  const monthNum = Number(month);
  const dayNum = Number(day);
  let yearNum = Number(yearPart);
  if (!Number.isFinite(monthNum) || !Number.isFinite(dayNum) || !Number.isFinite(yearNum))
    return "";
  if (yearPart.length === 2) yearNum += yearNum >= 70 ? 1900 : 2000;

  const iso = `${String(yearNum).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return iso;
}

function normalizeFieldValue(fieldId, raw) {
  if (fieldId === "cdlNumber" || fieldId === "employeeNumber" || fieldId === "locationDepartment") {
    const text = clean(raw);
    return text.replace(/\.0$/, "");
  }

  if (yesNoNaFields.has(fieldId)) {
    const text = clean(raw);
    if (!text || /^n\/a$/i.test(text)) return "";
    if (/^yes$/i.test(text)) return "Yes";
    if (/^no$/i.test(text)) return "No";
    return text;
  }

  const asDate = parseDqfDate(raw);
  if (asDate) return asDate;

  const text = clean(raw);
  if (!text || /^n\/a$/i.test(text) || text === "X") return "";
  return text;
}

function deriveDueDate(details) {
  const fields = ["cdlExpiry", "medicalCertExpiry", "mvrAnnual"];
  const dates = fields
    .map((fieldId) => details[fieldId])
    .filter((value) => value && /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates[0] ?? "";
}

function isExpired(dueDate) {
  if (!dueDate) return false;
  return new Date(`${dueDate}T23:59:59`).getTime() < Date.now();
}

function rowToDriver(row) {
  const rawName = clean(row[0]);
  if (!rawName) return null;

  const { driverName, driverRestrictions } = parseDqfDriverName(rawName);
  const details = {};
  if (driverRestrictions) details.driverRestrictions = driverRestrictions;

  for (const [indexText, fieldId] of Object.entries(DQF_COLUMN_FIELDS)) {
    const value = normalizeFieldValue(fieldId, row[Number(indexText)]);
    if (value) details[fieldId] = value;
  }

  const cdlExpiryNote = clean(row[4])
    .match(/\(([^)]+)\)/)?.[1]
    ?.trim();
  if (cdlExpiryNote) {
    const existing = details.driverRestrictions?.trim();
    details.driverRestrictions = existing ? `${existing}; ${cdlExpiryNote}` : cdlExpiryNote;
  }

  if (!details.cdlNumber) return null;
  details.employmentStatus = details.employmentStatus || "Active";

  const dueDate = deriveDueDate(details);
  return {
    driverName,
    status: isExpired(dueDate) ? "expired" : "open",
    details,
  };
}

const wb = XLSX.readFile(source);
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false });
const headers = rows[2]?.map(clean).filter(Boolean) ?? [];
const drivers = rows.slice(3).map(rowToDriver).filter(Boolean);

const payload = {
  sourceFile: path.basename(source),
  sheetName,
  seedVersion: 1,
  driverCount: drivers.length,
  columns: headers,
  drivers,
};

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      source,
      output,
      sheetName,
      driverCount: drivers.length,
      columnCount: headers.length,
    },
    null,
    2,
  ),
);
