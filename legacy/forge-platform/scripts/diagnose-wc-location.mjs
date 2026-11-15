#!/usr/bin/env node
/**
 * Read-only: show where each open WC case's "Location" (weekly report) comes from,
 * next to body-part fields and the linked incident's location fields.
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

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const raw = await sql`
    select
      c.id::text as id,
      c.status,
      c.source_system,
      c.source_payload as wc_payload,
      c.claim_summary as claim_summary,
      i.source_payload as inc_payload
    from industrial_workers_comp_cases c
    left join industrial_incidents i on i.id = c.incident_id and i.tenant_id = c.tenant_id
    where c.tenant_id = ${tenant.id}::uuid
      and c.archived_at is null
      and upper(c.status) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT')
    order by c.created_at
  `;

  const unwrap = (value) => {
    let current = value;
    for (let i = 0; i < 4; i += 1) {
      if (typeof current === "string") {
        try {
          current = JSON.parse(current);
          continue;
        } catch {
          return {};
        }
      }
      return current && typeof current === "object" && !Array.isArray(current) ? current : {};
    }
    return {};
  };
  const pick = (obj, keys) =>
    Object.fromEntries(keys.filter((k) => obj[k] != null && obj[k] !== "").map((k) => [k, obj[k]]));

  const rows = raw.map((r) => {
    const wc = unwrap(r.wc_payload);
    const intake = unwrap(wc.intake);
    const claim = unwrap(wc.claim);
    const inc = unwrap(r.inc_payload);
    return {
      id: r.id,
      status: r.status,
      sourceSystem: r.source_system,
      wc: pick(wc, ["locationText", "site", "bodyParts", "bodyLocations"]),
      wcIntake: pick(intake, [
        "exactLocation",
        "bodyParts",
        "bodyPart",
        "injuryLocation",
        "location",
      ]),
      wcClaim: pick(claim, ["bodyParts", "location"]),
      claimSummaryBodyParts: unwrap(r.claim_summary).bodyParts ?? null,
      incident: pick(inc, [
        "location",
        "site",
        "locationDetail",
        "LocationDetail",
        "IncidentLocationName",
        "community",
        "departmentName",
        "bodyLocations",
      ]),
    };
  });

  console.log(JSON.stringify({ tenantKey: TENANT_KEY, openCases: rows.length, rows }));
} finally {
  await sql.end({ timeout: 5 });
}
