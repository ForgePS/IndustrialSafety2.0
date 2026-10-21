/**
 * READ-ONLY: verify industrial_fleet_vehicles.dot_regulated exists.
 *   TENANT_KEY=producers-rice-mill node scripts/diag-fleet-dot-regulated.mjs
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
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const cols = await sql`
    select column_name, data_type, column_default, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'industrial_fleet_vehicles'
      and column_name = 'dot_regulated'
  `;
  const migrations = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at desc
    limit 8
  `;
  const counts = await sql`
    select count(*)::int as total,
      count(*) filter (where dvir_public_token_hash is not null)::int as with_qr
    from industrial_fleet_vehicles
    where archived_at is null
  `;
  console.log(JSON.stringify({ cols, migrations, counts: counts[0] }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
