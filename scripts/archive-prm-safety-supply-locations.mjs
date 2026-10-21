/**
 * Archive Safety Supplies locations whose name or code starts with PRM
 * (case-insensitive) for producers-rice-mill.
 *
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/archive-prm-safety-supply-locations.mjs
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const summary = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    matched: 0,
    archived: 0,
    locations: [],
  };

  try {
    const [tenant] = await sql`
      select id::text as id
      from tenants
      where tenant_key = ${TENANT_KEY} and archived_at is null
      limit 1
    `;
    if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const tenantId = tenant.id;

    const rows = await sql`
      select id::text as id, code, name, status
      from industrial_supply_locations
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
        and (
          name ~* '^prm'
          or code ~* '^prm'
        )
      order by name
    `;
    summary.matched = rows.length;
    summary.locations = rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status }));

    if (APPLY && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const updated = await sql`
        update industrial_supply_locations
        set archived_at = now(),
            status = 'INACTIVE',
            updated_at = now()
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
          and id = any(${ids}::uuid[])
        returning id::text as id
      `;
      summary.archived = updated.length;
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
