/**
 * Check whether industrial_personnel.is_dot_driver exists in production.
 * Dry-run query only.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-is-dot-driver-column.mjs
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const cols = await sql`
      select column_name, data_type, column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'industrial_personnel'
        and column_name in ('is_company_driver', 'is_dot_driver')
      order by column_name
    `;
    const counts = await sql`
      select
        count(*)::int as total,
        count(*) filter (where is_company_driver = true)::int as company_drivers,
        count(*) filter (where is_dot_driver = true)::int as dot_drivers
      from industrial_personnel
      where archived_at is null
    `;
    console.log(JSON.stringify({ columns: cols, counts: counts[0] }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
