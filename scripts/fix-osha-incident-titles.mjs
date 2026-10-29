/**
 * Sync industrial_osha_cases.title from linked industrial_incidents.title
 * for producers-rice-mill (OSHA list was still showing pre-format titles).
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-osha-incident-titles.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-osha-incident-titles.mjs
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const incidents = await sql`
    select id::text as id, title, source_document_id, source_payload
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
  `;
  const byId = new Map(incidents.map((r) => [r.id, r]));
  const bySourceDoc = new Map();
  for (const row of incidents) {
    const doc = asText(row.source_document_id);
    if (doc) bySourceDoc.set(doc, row);
    const payload = unwrapPayload(row.source_payload);
    const incidentDocId = asText(payload.IncidentDocId);
    if (incidentDocId) bySourceDoc.set(incidentDocId, row);
  }

  const oshaRows = await sql`
    select id::text as id, title, source_payload
    from industrial_osha_cases
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
  `;

  const changes = [];
  for (const row of oshaRows) {
    const payload = unwrapPayload(row.source_payload);
    const awsId = asText(payload.awsIncidentId);
    const incidentId = asText(payload.incidentId || payload.incident_id);
    const linked =
      (UUID_RE.test(awsId) ? byId.get(awsId) : null) ||
      (UUID_RE.test(incidentId) ? byId.get(incidentId) : null) ||
      (incidentId ? bySourceDoc.get(incidentId) : null) ||
      null;
    if (!linked) continue;
    const nextTitle = asText(linked.title);
    const current = asText(row.title);
    if (!nextTitle || nextTitle === current) continue;
    changes.push({
      id: row.id,
      from: current,
      to: nextTitle,
      payload: {
        ...payload,
        awsIncidentId: linked.id,
        incidentTitle: nextTitle,
        title: nextTitle,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenant.id, key: tenant.tenant_key, name: tenant.display_name },
        oshaCases: oshaRows.length,
        wouldUpdate: changes.length,
        apply: APPLY,
        sample: changes.slice(0, 12),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with APPLY=1 to update OSHA titles.");
    process.exit(0);
  }

  let updated = 0;
  for (const change of changes) {
    await sql`
      update industrial_osha_cases
      set title = ${change.to},
          source_payload = ${sql.json(change.payload)},
          updated_at = now()
      where id = ${change.id}::uuid
        and tenant_id = ${tenant.id}::uuid
    `;
    updated += 1;
  }
  console.log(JSON.stringify({ updated }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
