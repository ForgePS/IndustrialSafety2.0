/**
 * Dump LOTO source_payload.steps[0] shapes for producers-rice-mill (read-only).
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
  for (let i = 0; i < 4; i++) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
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

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
try {
  const [tenant] =
    await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  const rows = await sql`
    select id::text as id, title, source_payload
    from industrial_loto_procedures
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    order by updated_at desc
    limit 40
  `;
  const samples = [];
  const keyFreq = {};
  let withSteps = 0;
  let emptySteps = 0;
  let stringSteps = 0;
  let usable = 0;
  for (const row of rows) {
    const p = unwrap(row.source_payload);
    const steps = Array.isArray(p.steps) ? p.steps : [];
    if (!steps.length) emptySteps += 1;
    else withSteps += 1;
    if (steps.length && typeof steps[0] === "string") stringSteps += 1;
    const first = steps[0];
    if (first && typeof first === "object") {
      for (const k of Object.keys(first)) keyFreq[k] = (keyFreq[k] ?? 0) + 1;
      const hasEnergy =
        first.energySourceName || first.energyType || first.energySource || first.energy;
      const hasDevice = first.lockoutDeviceName || first.label || first.deviceName;
      const hasLoc = first.isolationLocationText || first.locationDescription || first.location;
      const hasInstr = first.instruction || first.text;
      if (hasEnergy || hasDevice || hasLoc || hasInstr) usable += 1;
      if (samples.length < 12) {
        samples.push({
          id: row.id,
          title: row.title,
          stepCount: steps.length,
          restorationCount: Array.isArray(p.restorationChecks) ? p.restorationChecks.length : 0,
          firstStep: first,
          restoration0: Array.isArray(p.restorationChecks) ? p.restorationChecks[0] : null,
        });
      }
    } else if (samples.length < 12) {
      samples.push({
        id: row.id,
        title: row.title,
        stepCount: steps.length,
        firstStepType: first == null ? "null" : typeof first,
        firstStep: first ?? null,
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        scanned: rows.length,
        withSteps,
        emptySteps,
        stringSteps,
        usable,
        keyFreq,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
