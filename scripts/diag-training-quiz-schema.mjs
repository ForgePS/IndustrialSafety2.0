/**
 * READ-ONLY diagnostic: reports whether the Training quiz schema (migration
 * 0042, which exists only on master) is present in the production database,
 * and which drizzle migrations are recorded. Determines whether shipping the
 * Training LMS code also requires a migration.
 *
 * SELECT-only. Resolves the DB URL from DATABASE_SECRET_ARN inside the
 * container so the secret never leaves the task.
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
  const report = {};

  report.trainingTables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'industrial_training%'
    order by table_name
  `;

  report.quizLikeTables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (table_name like '%quiz%' or table_name like '%question%' or table_name like '%attempt%')
    order by table_name
  `;

  try {
    report.appliedMigrations = await sql`
      select id, created_at
      from drizzle.__drizzle_migrations
      order by created_at desc
      limit 10
    `;
  } catch (e) {
    report.appliedMigrations = { error: String(e.message || e) };
  }

  report.trainingRecordCount = await sql`
    select count(*)::int as total from industrial_training_records
  `;

  console.log(JSON.stringify(report, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
