#!/usr/bin/env node
/**
 * Diagnose heavy DOT source_payload shapes (size + top-level key sizes).
 * Run via ECS one-off like other seed scripts.
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
  const secret = JSON.parse(res.SecretString || "{}");
  const host = secret.host || secret.hostname;
  const port = secret.port || 5432;
  const user = secret.username || secret.user;
  const password = secret.password;
  const database = secret.dbname || secret.database || "forge";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function unwrap(raw) {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return unwrap(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function summarize(value, path = "", out = [], depth = 0) {
  if (depth > 6) return out;
  if (typeof value === "string") {
    if (value.length >= 200) {
      out.push({
        path,
        kind: value.startsWith("data:") ? "dataUrl" : "string",
        length: value.length,
        prefix: value.slice(0, 48),
      });
    }
    return out;
  }
  if (Array.isArray(value)) {
    const encoded = JSON.stringify(value);
    if (encoded.length >= 2000) {
      out.push({ path, kind: "array", length: encoded.length, items: value.length });
    }
    for (let i = 0; i < Math.min(value.length, 20); i += 1) {
      summarize(value[i], `${path}[${i}]`, out, depth + 1);
    }
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, nested] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (typeof nested === "string" && nested.length >= 200) {
      out.push({
        path: childPath,
        kind: nested.startsWith("data:") ? "dataUrl" : "string",
        length: nested.length,
        prefix: nested.slice(0, 48),
      });
      continue;
    }
    if (nested && typeof nested === "object") {
      const encoded = JSON.stringify(nested);
      if (encoded.length >= 2000) {
        out.push({
          path: childPath,
          kind: Array.isArray(nested) ? "array" : "object",
          length: encoded.length,
          items: Array.isArray(nested) ? nested.length : Object.keys(nested).length,
        });
      }
      summarize(nested, childPath, out, depth + 1);
    }
  }
  return out;
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

  const sizeBuckets = await sql`
    select
      case
        when pg_column_size(source_payload) < 10000 then 'lt10k'
        when pg_column_size(source_payload) < 50000 then '10k-50k'
        when pg_column_size(source_payload) < 200000 then '50k-200k'
        when pg_column_size(source_payload) < 1000000 then '200k-1m'
        else 'gte1m'
      end as bucket,
      count(*)::int as n,
      max(pg_column_size(source_payload))::int as max_bytes
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid and archived_at is null
    group by 1
    order by 1
  `;

  const heavy = await sql`
    select
      id::text as id,
      coalesce(title, '') as title,
      coalesce(source_collection, '') as source_collection,
      pg_column_size(source_payload) as payload_bytes,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and pg_column_size(source_payload) > 20000
    order by pg_column_size(source_payload) desc
    limit 12
  `;

  const samples = heavy.map((row) => {
    const payload = unwrap(row.source_payload);
    const hot = summarize(payload)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
    return {
      id: row.id,
      title: row.title,
      sourceCollection: row.source_collection,
      payloadBytes: Number(row.payload_bytes),
      topLevelKeys: Object.keys(payload).length,
      hot,
    };
  });

  console.log(JSON.stringify({ tenantKey: TENANT_KEY, tenantId, sizeBuckets, samples }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
