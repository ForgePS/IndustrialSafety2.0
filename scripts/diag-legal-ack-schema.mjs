/**
 * READ-ONLY: inspect legal_acknowledgment_requirements columns vs expected user_scope.
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
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'legal_acknowledgment_requirements'
      order by ordinal_position
    `;
    const journal = await sql`
      select * from drizzle.__drizzle_migrations order by created_at desc limit 15
    `
      .catch(async () => {
        return sql`select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 15`;
      })
      .catch(() => []);

    let probe = null;
    try {
      const rows = await sql`
        select id, user_scope from legal_acknowledgment_requirements limit 1
      `;
      probe = { ok: true, sample: rows[0] ?? null };
    } catch (e) {
      probe = { ok: false, error: String(e?.message || e) };
    }

    console.log(JSON.stringify({ cols, probe, journal }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
