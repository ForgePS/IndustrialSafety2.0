/**
 * Backfill industrial_fleet_drivers.personnel_id using employee # and legacy Firebase ids.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-fleet-driver-personnel-links.mjs
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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function legacyKeys(payload) {
  const keys = new Set();
  for (const field of ["id", "_id", "firebaseId", "docId", "personnelId"]) {
    const raw = payload[field];
    if (typeof raw === "string" && raw.trim()) keys.add(raw.trim());
  }
  return [...keys];
}

function normalizeEmployeeNumber(value) {
  let s = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!s) return "";
  s = s.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

function employeeKeys(value) {
  const keys = new Set();
  const raw = String(value ?? "").trim();
  if (!raw) return keys;
  keys.add(raw.toUpperCase());
  keys.add(raw.toLowerCase());
  const normalized = normalizeEmployeeNumber(raw);
  if (normalized) {
    keys.add(normalized);
    keys.add(normalized.toLowerCase());
    keys.add(`EMP-${normalized}`);
    keys.add(`emp-${normalized}`);
  }
  return keys;
}

function resolvePersonnelId(row, payload, index) {
  const columnId = String(row.personnel_id ?? "").trim();
  if (columnId && UUID_PATTERN.test(columnId)) return columnId;

  for (const key of legacyKeys(payload)) {
    if (UUID_PATTERN.test(key)) return key;
    const hit = index.byLegacyId.get(key);
    if (hit) return hit;
  }
  const payloadPersonnelId =
    typeof payload.personnelId === "string" ? payload.personnelId.trim() : "";
  if (payloadPersonnelId) {
    if (UUID_PATTERN.test(payloadPersonnelId)) return payloadPersonnelId;
    const hit = index.byLegacyId.get(payloadPersonnelId);
    if (hit) return hit;
  }
  for (const key of employeeKeys(
    payload.employeeNumber ?? payload.employee_number ?? row.employee_number ?? "",
  )) {
    const hit = index.byEmployee.get(key);
    if (hit) return hit;
  }
  return null;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenant[0]?.id;
  if (!tenantId) throw new Error(`tenant ${TENANT_KEY} not found`);

  const people = await sql`
    select id::text as id, employee_number, source_payload, source_document_id
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;

  const byLegacyId = new Map();
  const byEmployee = new Map();
  for (const person of people) {
    byLegacyId.set(person.id, person.id);
    const sourceDoc = String(person.source_document_id ?? "").trim();
    if (sourceDoc) byLegacyId.set(sourceDoc, person.id);
    for (const key of employeeKeys(person.employee_number)) {
      if (!byEmployee.has(key)) byEmployee.set(key, person.id);
    }
    const payload = unwrap(person.source_payload);
    for (const key of legacyKeys(payload)) byLegacyId.set(key, person.id);
  }

  const drivers = await sql`
    select id::text as id, personnel_id::text as personnel_id, personnel_name, employee_number, source_payload
    from industrial_fleet_drivers
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;

  const updates = [];
  for (const driver of drivers) {
    const payload = unwrap(driver.source_payload);
    const resolved = resolvePersonnelId(driver, payload, { byLegacyId, byEmployee });
    if (!resolved) continue;
    if (driver.personnel_id === resolved) continue;
    updates.push({
      driverId: driver.id,
      name: driver.personnel_name,
      from: driver.personnel_id,
      to: resolved,
    });
    if (APPLY) {
      await sql`
        update industrial_fleet_drivers
        set personnel_id = ${resolved}::uuid, updated_at = now()
        where id = ${driver.id}::uuid
          and tenant_id = ${tenantId}::uuid
      `;
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        updates: updates.length,
        sample: updates.slice(0, 25),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
