/**
 * READ-ONLY: simulate DOT Drivers (DQF) client grouping/sort on production data.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-dot-dqf-render.mjs
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
    if (current && typeof current === "object" && !Array.isArray(current)) return current;
    return {};
  }
  return {};
}

function mapRow(row) {
  const payload = unwrap(row.source_payload);
  return {
    ...payload,
    id: row.id,
    title: row.title ?? payload.title ?? payload.displayName ?? payload.name ?? row.id,
    displayName: row.title ?? payload.displayName ?? payload.name ?? row.title,
    name: row.title ?? payload.name ?? payload.displayName,
    status: row.status,
    personnelId: row.personnel_id ?? payload.personnelId ?? payload.personnel_id ?? "",
    sourceCollection: row.source_collection ?? payload.sourceCollection ?? "",
    sourceDocumentId: row.source_document_id ?? payload.sourceDocumentId ?? "",
    sourcePath: row.source_path ?? payload.sourcePath ?? "",
    createdAt: row.created_at?.toISOString?.() ?? String(row.created_at ?? ""),
    updatedAt: row.updated_at?.toISOString?.() ?? String(row.updated_at ?? ""),
  };
}

function haystackForCategory(row) {
  return [
    row.category,
    row.sourceCollection,
    row.sourcePath,
    row.source_collection,
    row.source_path,
    row.sourceDocumentId,
    row.source_document_id,
    row.title,
    row.recordType,
    row.type,
    row.seededFrom,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function isDotCompanyDriverSource(row) {
  const seeded = String(row.seededFrom ?? "").toLowerCase();
  const collection = String(row.sourceCollection ?? row.source_collection ?? "").toLowerCase();
  const path = String(row.sourcePath ?? row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) {
    return true;
  }
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") {
    return true;
  }
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

function isDotDqfDriverRecord(row) {
  if (isDotCompanyDriverSource(row)) return false;
  const hay = haystackForCategory(row);
  if (/\bdrv-\d{4}-\d+\b/.test(hay)) return true;
  if (/dqf\s*import/.test(hay)) return true;
  if (/dot-compliance\/[^/]+\/drivers\/drv-/.test(hay)) return true;
  const cat = String(row.category ?? "")
    .trim()
    .toLowerCase();
  if (cat.includes("dqf")) return true;
  if (row.dqf === true) return true;
  return false;
}

function dotRecordCategory(row) {
  const hay = haystackForCategory(row);
  if (/\bdvirs?\b|pre[-\s]?trip|post[-\s]?trip|vehicle inspection report/.test(hay)) {
    return "dvirs";
  }
  if (/\broadside\b|out[-\s]?of[-\s]?service|\boos\b|level (i|ii|iii) inspection/.test(hay)) {
    return "roadside";
  }
  if (/\baccidents?\b|\bcrashes?\b|\bcollisions?\b/.test(hay)) {
    return "accidents";
  }
  if (/drug\s*(&|and)?\s*alcohol|\bdapm\b|\bda\b testing|\bclearinghouse\b/.test(hay)) {
    return "drug-alcohol";
  }
  if (isDotCompanyDriverSource(row)) return "other";
  if (isDotDqfDriverRecord(row)) return "drivers";
  const cat = String(row.category ?? "")
    .trim()
    .toLowerCase();
  if (cat.includes("driver") || cat.includes("dqf")) return "drivers";
  if (cat.includes("vehicle")) return "vehicles";
  if (cat.includes("company")) return "company";
  const collection = String(
    row.sourceCollection ?? row.sourcePath ?? row.source_collection ?? "",
  ).toLowerCase();
  if (collection.includes("dqf")) return "drivers";
  if (collection.includes("driver") && !collection.includes("companyvehicle")) return "drivers";
  if (collection.includes("vehicle")) return "vehicles";
  if (collection.includes("company")) return "company";
  return "other";
}

function dotWorkerName(row) {
  return String(row.workerName ?? row.driverName ?? row.personnelName ?? "").trim();
}

function dotDisplayName(row) {
  return dotWorkerName(row) || String(row.displayName ?? row.name ?? row.title ?? "").trim();
}

function normalizeDotPersonName(value) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.'"]/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned.includes(",")) return cleaned;
  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length < 2) return cleaned.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return `${parts.slice(1).join(" ")} ${parts[0]}`.replace(/\s+/g, " ").trim();
}

function isDotPersonRecord(row) {
  return dotRecordCategory(row) === "drivers" || dotWorkerName(row) !== "";
}

function groupDotProfileMembers(rows) {
  const byId = new Map();
  let anon = 0;
  for (const row of rows) {
    const id = String(row.id ?? "").trim() || `__anon:${anon++}`;
    byId.set(id, row);
  }
  const ids = [...byId.keys()];
  if (ids.length === 0) return [];
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    const current = parent.get(id) ?? id;
    if (current !== id) {
      const root = find(current);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  const buckets = new Map();
  const add = (key, id) => {
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  };
  for (const [id, row] of byId) {
    const pid = String(row.personnelId ?? "").trim();
    if (pid) add(`pid:${pid}`, id);
    const employee = String(row.employeeNumber ?? "")
      .trim()
      .toLowerCase();
    if (employee) add(`emp:${employee}`, id);
    if (isDotPersonRecord(row)) {
      const name = normalizeDotPersonName(dotDisplayName(row));
      if (name) add(`name:${name}`, id);
    }
  }
  for (const list of buckets.values()) {
    for (let i = 1; i < list.length; i += 1) union(list[0], list[i]);
  }
  const groups = new Map();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root) ?? [];
    group.push(byId.get(id));
    groups.set(root, group);
  }
  return [...groups.values()];
}

function collapseDotDriverProfiles(rows) {
  return groupDotProfileMembers(rows)
    .map((members) => members.filter((row) => dotRecordCategory(row) === "drivers"))
    .filter((members) => members.length > 0)
    .map((members) => {
      const merged = {};
      for (const record of members) {
        for (const [key, value] of Object.entries(record)) {
          if (value != null && value !== "") merged[key] = value;
        }
      }
      merged.profileRecordCount = members.length;
      return merged;
    });
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const rows = await sql`
    select
      id::text as id,
      title,
      status,
      personnel_id::text as personnel_id,
      source_collection,
      source_document_id,
      source_path,
      source_payload,
      created_at,
      updated_at
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
    order by updated_at desc
  `;

  const mapped = rows.map(mapRow);
  console.log(`DOT records (active): ${mapped.length}`);

  const normalizeErrors = [];
  for (const row of mapped) {
    const name = dotDisplayName(row);
    try {
      if (name) normalizeDotPersonName(name);
    } catch (err) {
      normalizeErrors.push({ id: row.id, title: row.title, name, err: String(err) });
    }
  }

  let collapseError = null;
  let profiles = [];
  try {
    const drivers = mapped.filter((row) => dotRecordCategory(row) === "drivers");
    console.log(`Driver-category rows: ${drivers.length}`);
    profiles = collapseDotDriverProfiles(drivers);
    console.log(`Collapsed DQF profiles: ${profiles.length}`);
  } catch (err) {
    collapseError = String(err);
  }

  const badPersonnel = mapped.filter((row) => {
    const pid = String(row.personnelId ?? "").trim();
    return (
      pid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid)
    );
  });

  const hugeFields = [];
  let maxPayloadKeys = 0;
  let maxPayloadId = "";
  for (const row of mapped) {
    const payload = unwrap(rows.find((r) => r.id === row.id)?.source_payload);
    const keyCount = Object.keys(payload).length;
    if (keyCount > maxPayloadKeys) {
      maxPayloadKeys = keyCount;
      maxPayloadId = row.id;
    }
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "string" && value.length > 500000) {
        hugeFields.push({ id: row.id, key, len: value.length });
      }
    }
  }

  function uploadImageSrc(raw, seen = new Set(), depth = 0) {
    if (depth > 12) return null;
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value === "") return null;
      if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) return value;
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (seen.has(raw)) return null;
    seen.add(raw);
    const entry = raw;
    for (const key of ["dataUrl", "url", "downloadURL", "downloadUrl", "src", "href"]) {
      const nested = uploadImageSrc(entry[key], seen, depth + 1);
      if (nested) return nested;
    }
    return null;
  }

  function licenseShape(raw, seen = new Set(), depth = 0) {
    if (depth > 12) return "deep";
    if (raw == null) return "null";
    if (typeof raw === "string") return raw.length > 200 ? `string:${raw.length}` : "string";
    if (typeof raw !== "object") return typeof raw;
    if (seen.has(raw)) return "circular";
    seen.add(raw);
    if (Array.isArray(raw)) return `array:${raw.length}`;
    const keys = Object.keys(raw);
    const child = {};
    for (const key of keys.slice(0, 6)) {
      child[key] = licenseShape(raw[key], seen, depth + 1);
    }
    return child;
  }

  const licenseErrors = [];
  const licenseShapes = [];
  for (const row of mapped.filter((r) => dotRecordCategory(r) === "drivers")) {
    try {
      for (const field of [
        "licenseFrontUpload",
        "licenseBackUpload",
        "driversLicenseFront",
        "driversLicenseBack",
        "driversLicenseCopy",
      ]) {
        const shape = licenseShape(row[field]);
        if (shape === "circular" || shape === "deep") {
          licenseShapes.push({ id: row.id, title: row.title, field, shape });
        }
        uploadImageSrc(row[field]);
      }
    } catch (err) {
      licenseErrors.push({ id: row.id, title: row.title, err: String(err) });
    }
  }

  const byCategory = {};
  for (const row of mapped) {
    const cat = dotRecordCategory(row);
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  console.log("By category:", JSON.stringify(byCategory));
  console.log("Normalize errors:", normalizeErrors.length);
  if (normalizeErrors.length) console.log(JSON.stringify(normalizeErrors.slice(0, 10), null, 2));
  console.log("Collapse error:", collapseError ?? "none");
  console.log("Non-uuid personnelId:", badPersonnel.length);
  if (badPersonnel.length) {
    console.log(
      JSON.stringify(
        badPersonnel.slice(0, 15).map((r) => ({
          id: r.id,
          title: r.title,
          personnelId: r.personnelId,
        })),
        null,
        2,
      ),
    );
  }
  console.log("Huge string fields:", hugeFields.length);
  if (hugeFields.length) console.log(JSON.stringify(hugeFields.slice(0, 10), null, 2));
  console.log("Max payload keys:", maxPayloadKeys, maxPayloadId);
  console.log("License copy errors:", licenseErrors.length);
  if (licenseErrors.length) console.log(JSON.stringify(licenseErrors, null, 2));
  console.log("License circular/deep:", licenseShapes.length);
  if (licenseShapes.length) console.log(JSON.stringify(licenseShapes, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
