#!/usr/bin/env node
/**
 * Strip embedded base64 from DOT Copy fields stored as JSON *strings*
 * (e.g. driversApplicationCopy: "[{name,dataUrl:...}]"). Those blobs are
 * what made GET /dot/:id take ~15s even after remounting S3 documents.
 *
 * Dry-run unless APPLY=1.
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
const MIN_EMBED_CHARS = Number(process.env.MIN_EMBED_CHARS || 128);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString || "{}");
  const host = secret.host || secret.hostname;
  const port = secret.port || 5432;
  const user = secret.username || secret.user;
  const password = secret.password;
  const database = secret.dbname || secret.database || "forge";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function slimFileEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const next = { ...entry };
  let changed = false;
  for (const key of ["dataUrl", "dataURL", "downloadURL", "url"]) {
    const raw = next[key];
    if (typeof raw !== "string") continue;
    if (raw.startsWith("http://") || raw.startsWith("https://")) continue;
    if (raw.length <= MIN_EMBED_CHARS && !raw.startsWith("data:")) continue;
    if (raw.startsWith("data:")) {
      next[key] = "data:omitted";
      changed = true;
    } else if (raw.length > MIN_EMBED_CHARS) {
      next[key] = "[omitted]";
      changed = true;
    }
  }
  return changed ? next : entry;
}

function slimJsonString(value, stats) {
  if (typeof value !== "string" || value.length <= MIN_EMBED_CHARS) {
    return { value, changed: false };
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    if (trimmed.startsWith("data:") && trimmed.length > MIN_EMBED_CHARS) {
      stats.replacedStrings += 1;
      stats.bytesSaved += trimmed.length - "data:omitted".length;
      return { value: "data:omitted", changed: true };
    }
    return { value, changed: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { value, changed: false };
  }
  let changed = false;
  const slimParsed = Array.isArray(parsed)
    ? parsed.map((entry) => {
        const next = slimFileEntry(entry);
        if (next !== entry) changed = true;
        return next;
      })
    : slimFileEntry(parsed) !== parsed
      ? ((changed = true), slimFileEntry(parsed))
      : parsed;
  if (!changed) return { value, changed: false };
  const next = JSON.stringify(slimParsed);
  stats.replacedStrings += 1;
  stats.bytesSaved += value.length - next.length;
  return { value: next, changed: true };
}

function slimPayloadObject(payload, stats, depth = 0) {
  if (depth > 8 || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const next = { ...payload };
  for (const [key, nested] of Object.entries(payload)) {
    if (typeof nested === "string") {
      const slimmed = slimJsonString(nested, stats);
      if (slimmed.changed) next[key] = slimmed.value;
      continue;
    }
    if (nested && typeof nested === "object") {
      next[key] = slimPayloadObject(nested, stats, depth + 1);
    }
  }
  return next;
}

function unwrapPayload(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return unwrapPayload(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const tenantRows = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const rows = await sql`
    select
      id::text as id,
      coalesce(title, '') as title,
      pg_column_size(source_payload) as payload_bytes,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and pg_column_size(source_payload) > 20000
    order by pg_column_size(source_payload) desc
  `;

  const report = {
    tenantKey: TENANT_KEY,
    tenantId,
    apply: APPLY,
    scannedHeavyRows: rows.length,
    rowsChanged: 0,
    replacedStrings: 0,
    bytesSaved: 0,
    samples: [],
  };

  for (const row of rows) {
    const stats = { replacedStrings: 0, bytesSaved: 0 };
    const before = unwrapPayload(row.source_payload);
    const after = slimPayloadObject(before, stats);
    if (stats.replacedStrings === 0) continue;

    report.rowsChanged += 1;
    report.replacedStrings += stats.replacedStrings;
    report.bytesSaved += stats.bytesSaved;
    if (report.samples.length < 12) {
      report.samples.push({
        id: row.id,
        title: row.title,
        payloadBytesBefore: Number(row.payload_bytes),
        replacedStrings: stats.replacedStrings,
        bytesSaved: stats.bytesSaved,
      });
    }

    if (APPLY) {
      await sql`
        update industrial_dot_compliance_records
        set source_payload = ${sql.json(after)},
            updated_at = now()
        where id = ${row.id}::uuid and tenant_id = ${tenantId}::uuid
      `;
    }
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
