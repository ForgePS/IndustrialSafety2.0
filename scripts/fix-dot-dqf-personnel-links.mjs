/**
 * Backfill industrial_dot_compliance_records.personnel_id for DQF driver files.
 *
 * Matches by legacy Firebase ids, normalized employee number (strips EMP-),
 * CDL number, and normalized person name. Also restores archived
 * dqfWorkbookImport rows soft-archived by company-driver cleanup.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-dot-dqf-personnel-links.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-dot-dqf-personnel-links.mjs
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

/** Strip EMP- prefix and leading zeros so "EMP-24952" matches "24952". */
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

function legacyKeys(payload) {
  const keys = new Set();
  for (const field of ["id", "_id", "firebaseId", "docId", "personnelId"]) {
    const raw = payload[field];
    if (typeof raw === "string" && raw.trim()) keys.add(raw.trim());
  }
  return [...keys];
}

function isWorkbookImportRow(row, payload) {
  const collection = asText(row.source_collection).toLowerCase();
  if (collection === "dqfworkbookimport" || collection.includes("dqfworkbook")) return true;
  const seeded = asText(payload.seededFrom || payload.dqfSourceFile || payload.seededFromFile);
  return /dqf\s*files\.xlsx/i.test(seeded);
}

function isDriverDqfRow(row, payload) {
  if (isWorkbookImportRow(row, payload)) return true;
  const cat = asText(payload.category).toLowerCase();
  if (payload.dqf === true || cat.includes("driver") || cat.includes("dqf")) return true;
  const collection = asText(row.source_collection).toLowerCase();
  const path = asText(row.source_path).toLowerCase();
  if (collection.includes("dqf") || /\/drivers\//.test(path)) return true;
  if (/\bdrv-\d{4}-\d+\b/i.test(`${row.source_document_id} ${path} ${row.title}`)) return true;
  return false;
}

function resolvePersonnelId(row, payload, index) {
  const columnId = String(row.personnel_id ?? "").trim();
  if (columnId && UUID_PATTERN.test(columnId)) return { id: columnId, how: "already_linked" };

  for (const key of legacyKeys(payload)) {
    if (UUID_PATTERN.test(key)) return { id: key, how: "legacy_uuid" };
    const hit = index.byLegacyId.get(key);
    if (hit) return { id: hit, how: "legacy_id" };
  }
  const payloadPersonnelId =
    typeof payload.personnelId === "string" ? payload.personnelId.trim() : "";
  if (payloadPersonnelId) {
    if (UUID_PATTERN.test(payloadPersonnelId)) {
      return { id: payloadPersonnelId, how: "payload_personnel_uuid" };
    }
    const hit = index.byLegacyId.get(payloadPersonnelId);
    if (hit) return { id: hit, how: "payload_personnel_legacy" };
  }

  const empRaw = asText(
    payload.employeeNumber ??
      payload.employee_number ??
      payload.details?.employeeNumber ??
      payload.details?.employee_number,
  );
  const emp = normalizeEmployeeNumber(empRaw);
  if (emp && index.byEmployee.has(emp)) {
    return { id: index.byEmployee.get(emp), how: "employee_number" };
  }

  const cdl = asText(
    payload.cdlNumber || payload.licenseNumber || payload.details?.cdlNumber,
  ).toUpperCase();
  if (cdl && index.byCdl.has(cdl)) {
    return { id: index.byCdl.get(cdl), how: "cdl" };
  }

  const name = asText(
    row.title ||
      payload.driverName ||
      payload.workerName ||
      payload.displayName ||
      payload.personnelName,
  );
  const nameKey = normalizePersonKey(name);
  if (nameKey && index.byName.has(nameKey)) {
    return { id: index.byName.get(nameKey), how: "name" };
  }
  const full = name.toLowerCase();
  if (full && index.byName.has(full)) {
    return { id: index.byName.get(full), how: "name_full" };
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
    select
      id::text as id,
      employee_number,
      display_name,
      first_name,
      last_name,
      source_payload,
      source_document_id,
      archived_at
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const byLegacyId = new Map();
  const byEmployee = new Map();
  const byName = new Map();
  const byCdl = new Map();

  function indexPerson(person) {
    byLegacyId.set(person.id, person.id);
    const sourceDoc = String(person.source_document_id ?? "").trim();
    if (sourceDoc) byLegacyId.set(sourceDoc, person.id);

    const emp = normalizeEmployeeNumber(person.employee_number);
    if (emp) byEmployee.set(emp, person.id);

    const payload = unwrap(person.source_payload);
    for (const key of legacyKeys(payload)) byLegacyId.set(key, person.id);

    const cdl = asText(
      payload.cdlNumber || payload.licenseNumber || payload.driversLicenseNumber,
    ).toUpperCase();
    if (cdl) byCdl.set(cdl, person.id);

    const full = asText(person.display_name).toLowerCase();
    if (full) byName.set(full, person.id);
    const fl = `${asText(person.first_name)} ${asText(person.last_name)}`.trim().toLowerCase();
    if (fl) byName.set(fl, person.id);
    const nameKey = normalizePersonKey(person.display_name);
    if (nameKey) byName.set(nameKey, person.id);
  }

  // Archived first, then active overwrites so active personnel win collisions.
  for (const person of people.filter((p) => p.archived_at)) indexPerson(person);
  for (const person of people.filter((p) => !p.archived_at)) indexPerson(person);

  const rows = await sql`
    select
      id::text as id,
      title,
      personnel_id::text as personnel_id,
      source_collection,
      source_document_id,
      source_path,
      source_payload,
      archived_at is not null as archived
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
  `;

  const updates = [];
  const unmatched = [];
  let considered = 0;
  let alreadyLinked = 0;
  let unarchived = 0;

  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    if (!isDriverDqfRow(row, payload)) continue;
    considered += 1;

    const resolved = resolvePersonnelId(row, payload, { byLegacyId, byEmployee, byName, byCdl });
    const needsLink = Boolean(
      resolved && resolved.how !== "already_linked" && row.personnel_id !== resolved.id,
    );
    const needsUnarchive = Boolean(row.archived && isWorkbookImportRow(row, payload));

    if (!needsLink && !needsUnarchive) {
      if (row.personnel_id) alreadyLinked += 1;
      else {
        unmatched.push({
          title: row.title,
          emp:
            asText(
              payload.employeeNumber ??
                payload.employee_number ??
                payload.details?.employeeNumber,
            ) || null,
          cdl: asText(payload.cdlNumber || payload.licenseNumber) || null,
          sourceCollection: row.source_collection,
          archived: row.archived,
        });
      }
      continue;
    }

    const nextPersonnelId = needsLink ? resolved.id : row.personnel_id;
    updates.push({
      recordId: row.id,
      title: row.title,
      from: row.personnel_id,
      to: nextPersonnelId,
      how: resolved?.how ?? null,
      unarchive: needsUnarchive,
      sourceCollection: row.source_collection,
    });

    if (APPLY) {
      if (needsLink && needsUnarchive) {
        await sql`
          update industrial_dot_compliance_records
          set
            personnel_id = ${resolved.id}::uuid,
            archived_at = null,
            updated_at = now()
          where id = ${row.id}::uuid
            and tenant_id = ${tenantId}::uuid
        `;
        unarchived += 1;
      } else if (needsLink) {
        await sql`
          update industrial_dot_compliance_records
          set personnel_id = ${resolved.id}::uuid, updated_at = now()
          where id = ${row.id}::uuid
            and tenant_id = ${tenantId}::uuid
        `;
      } else if (needsUnarchive) {
        await sql`
          update industrial_dot_compliance_records
          set archived_at = null, updated_at = now()
          where id = ${row.id}::uuid
            and tenant_id = ${tenantId}::uuid
        `;
        unarchived += 1;
      }
    } else if (needsUnarchive) {
      unarchived += 1;
    }
  }

  const howBreakdown = updates.reduce((acc, u) => {
    const k = u.how || (u.unarchive ? "unarchive_only" : "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        considered,
        alreadyLinked,
        updates: updates.length,
        wouldUnarchive: unarchived,
        howBreakdown,
        sample: updates.slice(0, 25),
        unmatchedCount: unmatched.length,
        unmatched: unmatched.slice(0, 40),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
