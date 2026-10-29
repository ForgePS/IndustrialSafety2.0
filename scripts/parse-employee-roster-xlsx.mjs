#!/usr/bin/env node
/**
 * Parse Producers employee roster spreadsheets (Firebase roster import layout).
 *
 * Expected columns (row 0 headers):
 *   EMPLOYEE NUMBER, FIRST NAME, MIDDLE INTIAL, Last Name, Suffix, Email, Phone,
 *   TITLE, Department, D.O.H., Status
 *
 * Usage:
 *   node scripts/parse-employee-roster-xlsx.mjs <xlsx-path> [more.xlsx] --out <json>
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
  throw new Error("xlsx package not found");
}

const XLSX = resolveXlsx();

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
}

function normalizeEmpKey(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

function parseRosterFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const employees = [];
  for (const row of rows.slice(1)) {
    const empKey = normalizeEmpKey(row[0]);
    if (!empKey) continue;
    const firstName = clean(row[1]);
    const middleName = clean(row[2]);
    const lastName = clean(row[3]);
    const suffix = clean(row[4]);
    const email = clean(row[5]);
    const phone = clean(row[6]);
    const jobTitle = clean(row[7]);
    const department = clean(row[8]);
    const hireDateRaw = clean(row[9]);
    const status = clean(row[10]);
    const displayParts = [firstName, middleName, lastName, suffix].filter(Boolean);
    const displayName = displayParts.join(" ").replace(/\s+/g, " ").trim();
    if (!displayName) continue;
    employees.push({
      employeeKey: empKey,
      employeeNumber: `EMP-${empKey}`,
      firstName,
      middleName: middleName || null,
      lastName,
      suffix: suffix || null,
      displayName,
      email: email || null,
      phone: phone || null,
      jobTitle: jobTitle || null,
      departmentName: department || null,
      hireDateRaw: hireDateRaw || null,
      status: status || null,
      sourceFile: path.basename(filePath),
    });
  }
  return { sourceFile: path.basename(filePath), sheetName, employees };
}

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outPath =
  outIdx >= 0
    ? path.isAbsolute(argv[outIdx + 1])
      ? argv[outIdx + 1]
      : path.join(repoRoot, argv[outIdx + 1])
    : path.join(repoRoot, ".tmp", "employee-roster-index.json");

const sources = argv
  .filter((arg, i) => arg !== "--out" && i !== outIdx + 1)
  .map((arg) => (path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg)));

if (sources.length === 0) {
  console.error(
    "Usage: node scripts/parse-employee-roster-xlsx.mjs <xlsx> [more.xlsx] --out <json>",
  );
  process.exit(1);
}

const index = new Map();
const sourceFiles = [];
for (const source of sources) {
  const parsed = parseRosterFile(source);
  sourceFiles.push(parsed.sourceFile);
  for (const emp of parsed.employees) {
    index.set(emp.employeeKey, emp);
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFiles,
  employeeCount: index.size,
  employees: [...index.values()],
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: outPath,
      sourceFiles,
      employeeCount: index.size,
    },
    null,
    2,
  ),
);
