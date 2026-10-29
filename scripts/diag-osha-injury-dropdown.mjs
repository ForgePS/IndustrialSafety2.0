/**
 * Diag: incident category shape + OSHA-linked coverage for producers-rice-mill.
 * FORGE_ENV=production node scripts/run-ecs-diag-osha-injury-dropdown.mjs
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

async function resolveDatabaseUrl(secretArn) {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${raw.host ?? raw.hostname}:${raw.port ?? 5432}/${raw.dbname ?? raw.database}`;
}

function unwrap(raw) {
  let cur = raw;
  for (let i = 0; i < 4; i += 1) {
    if (typeof cur === "string") {
      try {
        cur = JSON.parse(cur.trim());
        continue;
      } catch {
        return {};
      }
    }
    if (cur && typeof cur === "object" && !Array.isArray(cur)) return cur;
    return {};
  }
  return {};
}

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), {
  max: 1,
  prepare: false,
});
const TENANT_KEY = "producers-rice-mill";
try {
  const [tenant] = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY}`;
  await sql`select set_config('app.current_tenant_id', ${tenant.id}, false)`;

  const samples = await sql`
    select title,
      jsonb_typeof(source_payload) as payload_type,
      source_payload->>'category' as cat_direct,
      left(source_payload::text, 160) as payload_start
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    order by updated_at desc
    limit 6
  `;

  const cats = await sql`
    select coalesce(source_payload->>'category', source_payload->>'incidentCategory', '(null)') as cat,
           count(*)::int as n
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    group by 1 order by n desc
  `;

  const injuriesSql = await sql`
    select count(*)::int as n from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
      and lower(coalesce(source_payload->>'category', source_payload->>'incidentCategory', '')) = 'injuries'
  `;

  const incidents = await sql`
    select id::text as id, title, source_payload
    from industrial_incidents
    where tenant_id = ${tenant.id}::uuid and archived_at is null
  `;
  let injuryUnwrapped = 0;
  for (const row of incidents) {
    const p = unwrap(row.source_payload);
    const cat = String(p.category ?? p.incidentCategory ?? "").toLowerCase();
    if (cat === "injuries" || cat === "injury") injuryUnwrapped += 1;
  }

  const osha = await sql`
    select id::text as id, source_payload from industrial_osha_cases
    where tenant_id = ${tenant.id}::uuid and archived_at is null
  `;
  const linked = new Set();
  for (const row of osha) {
    const p = unwrap(row.source_payload);
    if (p.awsIncidentId) linked.add(String(p.awsIncidentId));
    if (p.incidentId && /^[0-9a-f-]{36}$/i.test(String(p.incidentId)))
      linked.add(String(p.incidentId));
  }

  let openable = 0;
  for (const row of incidents) {
    const p = unwrap(row.source_payload);
    const cat = String(p.category ?? p.incidentCategory ?? "").toLowerCase();
    if (cat !== "injuries" && cat !== "injury") continue;
    if (!linked.has(row.id)) openable += 1;
  }

  console.log(
    JSON.stringify(
      {
        samples,
        cats,
        injuriesSql: injuriesSql[0]?.n,
        injuryUnwrapped,
        oshaCount: osha.length,
        linkedIncidentIds: linked.size,
        openableInjuries: openable,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
