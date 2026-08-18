/**
 * Seed Safety Incidents Detail report rows into industrial_incidents for
 * producers-rice-mill. Idempotent on source_payload.IncidentDocId.
 *
 * Expects SAFETY_INCIDENTS_JSON_PATH (local file inside the ECS task) or
 * SAFETY_INCIDENTS_JSON (inline — not used by the runner).
 *
 * Dry-run by default. APPLY=1 writes.
 * Optional LIMIT=N processes only the first N rows.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-safety-incidents-detail.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-safety-incidents-detail.mjs
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
const LIMIT = Number(process.env.LIMIT || "0");
const ALLOWED = new Set(["producers-rice-mill"]);
const SOURCE_SYSTEM = "SAFETY_INCIDENTS_DETAIL_RPT";

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
  const path = (process.env.SAFETY_INCIDENTS_JSON_PATH || "").trim();
  if (path) {
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const inline = (process.env.SAFETY_INCIDENTS_JSON || "").trim();
  if (inline) return JSON.parse(inline);
  throw new Error("Set SAFETY_INCIDENTS_JSON_PATH or SAFETY_INCIDENTS_JSON");
}

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function mapCategory(typeName) {
  const t = str(typeName).toLowerCase();
  if (t.includes("near")) return "near-misses";
  if (t.includes("property")) return "property-damage";
  if (t.includes("vehicle") || t.includes("auto")) return "automotive";
  if (t.includes("general liability") || t.includes("liability")) return "property-damage";
  if (t.includes("illness") || t.includes("injury")) return "injuries";
  return "injuries";
}

function mapStatus(code) {
  const s = str(code).toUpperCase();
  if (s === "O" || s === "OPEN") return "open";
  if (s === "C" || s === "CLOSED" || s === "COMPLETE") return "closed";
  return s ? s.toLowerCase() : "closed";
}

function parseReportDate(raw) {
  const text = str(raw);
  if (!text) return null;
  // "07/21/2025 04:16 PM CDT" / "01/14/2025 03:45 AM CST"
  const m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*[A-Z]{2,4}$/i,
  );
  if (m) {
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const ampm = m[6].toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const iso = `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Map report body-part labels onto Safety Tim region ids. */
function mapBodyToken(token, preferredView) {
  const n = str(token)
    .toLowerCase()
    .replace(/\(s\)/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;

  const table = [
    ["eye", "face-front"],
    ["face", "face-front"],
    ["mouth", "face-front"],
    ["ear", "head-front"],
    ["head", preferredView === "back" ? "head-back" : "head-front"],
    ["neck", preferredView === "back" ? "neck-back" : "neck-front"],
    ["lumbar", "lower-back"],
    ["lower back", "lower-back"],
    ["upper back", "upper-back"],
    ["spine", "upper-back"],
    ["back", preferredView === "back" ? "upper-back" : "upper-back"],
    ["chest", "chest-front"],
    ["abdomen", "abdomen-front"],
    ["hip", preferredView === "back" ? "buttocks-back" : "hips-front"],
    ["groin", "hips-front"],
    ["buttock", "buttocks-back"],
    ["left shoulder", preferredView === "back" ? "left-shoulder-back" : "left-shoulder-front"],
    ["right shoulder", preferredView === "back" ? "right-shoulder-back" : "right-shoulder-front"],
    ["left wrist", preferredView === "back" ? "left-hand-back" : "left-hand-front"],
    ["right wrist", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["left hand", preferredView === "back" ? "left-hand-back" : "left-hand-front"],
    ["right hand", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["left finger", preferredView === "back" ? "left-hand-back" : "left-hand-front"],
    ["right finger", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["left thumb", preferredView === "back" ? "left-hand-back" : "left-hand-front"],
    ["right thumb", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["left arm", preferredView === "back" ? "left-arm-back" : "left-arm-front"],
    ["right arm", preferredView === "back" ? "right-arm-back" : "right-arm-front"],
    ["left bicep", preferredView === "back" ? "left-arm-back" : "left-arm-front"],
    ["right bicep", preferredView === "back" ? "right-arm-back" : "right-arm-front"],
    ["left knee", preferredView === "back" ? "left-leg-back" : "left-leg-front"],
    ["right knee", preferredView === "back" ? "right-leg-back" : "right-leg-front"],
    ["left ankle", preferredView === "back" ? "left-foot-back" : "left-foot-front"],
    ["right ankle", preferredView === "back" ? "right-foot-back" : "right-foot-front"],
    ["left foot", preferredView === "back" ? "left-foot-back" : "left-foot-front"],
    ["right foot", preferredView === "back" ? "right-foot-back" : "right-foot-front"],
    ["left thigh", preferredView === "back" ? "left-leg-back" : "left-leg-front"],
    ["right thigh", preferredView === "back" ? "right-leg-back" : "right-leg-front"],
    ["left leg", preferredView === "back" ? "left-leg-back" : "left-leg-front"],
    ["right leg", preferredView === "back" ? "right-leg-back" : "right-leg-front"],
    ["shoulder", preferredView === "back" ? "right-shoulder-back" : "right-shoulder-front"],
    ["wrist", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["hand", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["finger", preferredView === "back" ? "right-hand-back" : "right-hand-front"],
    ["knee", preferredView === "back" ? "right-leg-back" : "right-leg-front"],
    ["ankle", preferredView === "back" ? "right-foot-back" : "right-foot-front"],
    ["foot", preferredView === "back" ? "right-foot-back" : "right-foot-front"],
    ["arm", preferredView === "back" ? "right-arm-back" : "right-arm-front"],
  ];

  for (const [needle, id] of table) {
    if (n === needle || n.includes(needle)) return id;
  }
  return null;
}

function splitParts(raw) {
  return str(raw)
    .split(/[,;/|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function bodyLocationsFromRow(row) {
  const seen = new Set();
  const out = [];
  for (const token of splitParts(row.InjuriesFront)) {
    const id = mapBodyToken(token, "front");
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const token of splitParts(row.InjuriesBack)) {
    const id = mapBodyToken(token, "back");
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function buildLocation(row) {
  const parts = [row.Division, row.Community, row.LocationDetail, row.IncidentLocationName]
    .map(str)
    .filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

function buildTitle(row) {
  const name = str(row.IncidentName);
  if (name) return name.slice(0, 500);
  const person = str(row.PersonAffected || row.Person);
  const type = str(row.IncidentTypeName) || "Incident";
  return `${type}${person ? ` — ${person}` : ""}`.slice(0, 500);
}

function toInsert(row) {
  const docId = String(row.IncidentDocId);
  const category = mapCategory(row.IncidentTypeName);
  const status = mapStatus(row.Status);
  const bodyLocations = bodyLocationsFromRow(row);
  const occurredAt = parseReportDate(row.IncidentDateTime) || parseReportDate(row.DTStamp);
  const reportedAt = parseReportDate(row.reportDateTime) || parseReportDate(row.IncidentSubmitted);
  const createdAt = occurredAt || reportedAt || new Date();
  const description =
    str(row.IncidentDescription) ||
    str(row.WorkDayDetails) ||
    str(row.InjuryTypeDesc) ||
    "";

  const payload = {
    ...row,
    category,
    incidentCategory: category,
    severity: category === "injuries" ? "moderate" : "low",
    location: buildLocation(row),
    description,
    reportedBy: str(row.SubmittedBy) || str(row.Person),
    personAffected: str(row.PersonAffected || row.Person),
    bodyLocations,
    InjuriesFront: str(row.InjuriesFront),
    InjuriesBack: str(row.InjuriesBack),
    sourceImport: {
      system: SOURCE_SYSTEM,
      file: "26-08-17 SafetyIncidents_Detail_Rpt.xlsx",
      incidentDocId: docId,
    },
  };

  return {
    docId,
    title: buildTitle(row),
    status,
    category,
    bodyLocations,
    createdAt,
    updatedAt: reportedAt || createdAt,
    payload,
  };
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const filePayload = loadPayload();
const items = Array.isArray(filePayload.items) ? filePayload.items : [];
const sliced = LIMIT > 0 ? items.slice(0, LIMIT) : items;

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const existing = await sql`
    select coalesce(source_payload->>'IncidentDocId', source_payload->'sourceImport'->>'incidentDocId') as doc_id
    from industrial_incidents
    where tenant_id = ${tenant.id}
      and archived_at is null
      and (
        source_system = ${SOURCE_SYSTEM}
        or source_payload ? 'IncidentDocId'
        or source_payload->'sourceImport'->>'system' = ${SOURCE_SYSTEM}
      )
  `;
  const existingIds = new Set(
    existing.map((r) => String(r.doc_id ?? "").trim()).filter(Boolean),
  );

  const planned = [];
  const skipped = [];
  const byCategory = {};

  for (const row of sliced) {
    const mapped = toInsert(row);
    byCategory[mapped.category] = (byCategory[mapped.category] ?? 0) + 1;
    if (existingIds.has(mapped.docId)) {
      skipped.push(mapped.docId);
      continue;
    }
    planned.push(mapped);
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant.id, key: tenant.tenant_key, name: tenant.display_name },
        sourceCount: items.length,
        considered: sliced.length,
        alreadyPresent: skipped.length,
        toInsert: planned.length,
        byCategory,
        apply: APPLY,
        sample: planned.slice(0, 3).map((p) => ({
          docId: p.docId,
          title: p.title,
          category: p.category,
          status: p.status,
          bodyLocations: p.bodyLocations,
        })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with APPLY=1 to insert.");
    process.exit(0);
  }

  let inserted = 0;
  for (const row of planned) {
    await sql`
      insert into industrial_incidents (
        id, tenant_id, site_id, title, status,
        source_system, source_payload, created_at, updated_at
      ) values (
        ${randomUUID()},
        ${tenant.id},
        null,
        ${row.title},
        ${row.status},
        ${SOURCE_SYSTEM},
        ${sql.json(row.payload)},
        ${row.createdAt},
        ${row.updatedAt}
      )
    `;
    inserted += 1;
  }

  console.log(JSON.stringify({ inserted, skipped: skipped.length }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
