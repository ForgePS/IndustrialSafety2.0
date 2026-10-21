/**
 * Rebuild industrial_incidents.title to `yy-mm-dd   Name - Location`
 * for producers-rice-mill from person / area / date on source_payload.
 *
 * Keeps a location already present in the title; only fills location from
 * payload when the title has no ` - Location` segment.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-incident-titles.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-incident-titles.mjs
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
const LIMIT = Number(process.env.LIMIT || 0) || 0;

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
  return typeof value === "string" ? value.trim() : "";
}

function unwrapPayload(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}

function isGenericLocation(value) {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return true;
  return (
    /producers\s+rice\s+mill/.test(cleaned) ||
    cleaned === "all locations" ||
    cleaned === "n/a" ||
    cleaned === "na"
  );
}

function firstLocation(...candidates) {
  for (const candidate of candidates) {
    const value = asText(candidate);
    if (value && !isGenericLocation(value)) return value;
  }
  return "";
}

function parseTitleParts(title) {
  const existing = asText(title);
  if (!existing) return {};
  const dated = existing.match(/^(\d{2})[-/](\d{2})[-/](\d{2})\s+(.*)$/);
  const restRaw = dated ? dated[4].trim() : existing;
  const rest = restRaw.replace(/\b(Jr\.?|Sr\.?)\s*-/gi, "$1 - ");
  const dateOccurred = dated ? `20${dated[1]}-${dated[2]}-${dated[3]}` : undefined;
  const spaced = rest.split(/\s+-\s+/);
  if (spaced.length >= 2) {
    return {
      dateOccurred,
      personAffected: spaced[0].trim(),
      location: spaced.slice(1).join(" - ").trim(),
    };
  }
  return {
    dateOccurred,
    personAffected: rest || undefined,
  };
}

function parseDate(value) {
  const raw = asText(value);
  if (!raw) return null;
  const compact = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
  if (compact) return new Date(`20${compact[1]}-${compact[2]}-${compact[3]}T12:00:00`);
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatStamp(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function deriveTitle(rowTitle, payload) {
  const parsed = parseTitleParts(rowTitle);
  const personField =
    asText(payload.personAffected) ||
    asText(payload.PersonAffected) ||
    asText(payload.Person);
  const hasDatedTitle = Boolean(parsed.dateOccurred);
  const payloadDate =
    asText(payload.dateOccurred) ||
    asText(payload.IncidentDateTime) ||
    asText(payload.DTStamp) ||
    asText(payload.reportDateTime);

  if (!personField && !hasDatedTitle && !payloadDate) {
    return asText(rowTitle) || "Untitled incident";
  }

  const name = personField || asText(parsed.personAffected) || "Incident";
  const location = firstLocation(
    parsed.location,
    payload.community,
    payload.Community,
    payload.division,
    payload.Division,
    payload.departmentName,
    payload.DepartmentName,
    payload.locationDetail,
    payload.LocationDetail,
    payload.location,
    payload.IncidentLocationName,
  );

  // Keep the title's own date when present so freeform historical stamps stay stable.
  const occurred =
    parseDate(parsed.dateOccurred) ||
    parseDate(payloadDate) ||
    new Date();
  const stamp = formatStamp(occurred);
  return (location ? `${stamp}   ${name} - ${location}` : `${stamp}   ${name}`).slice(0, 500);
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id, tenant_key, display_name
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const rows = await sql`
    select id::text as id, title, source_payload
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    order by updated_at desc
  `;

  const considered = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
  const changes = [];
  for (const row of considered) {
    const next = deriveTitle(row.title, unwrapPayload(row.source_payload));
    const current = asText(row.title);
    if (next && next !== current) {
      changes.push({ id: row.id, from: current, to: next });
    }
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant.id, key: tenant.tenant_key, name: tenant.display_name },
        scanned: considered.length,
        wouldUpdate: changes.length,
        apply: APPLY,
        sample: changes.slice(0, 12),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with APPLY=1 to update titles.");
    process.exit(0);
  }

  let updated = 0;
  for (const change of changes) {
    await sql`
      update industrial_incidents
      set title = ${change.to}, updated_at = now()
      where id = ${change.id}::uuid
        and tenant_id = ${tenant.id}::uuid
    `;
    updated += 1;
  }
  console.log(JSON.stringify({ updated }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
