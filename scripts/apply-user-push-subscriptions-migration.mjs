/**
 * Apply migration 0094_user_push_subscriptions_s1 on Aurora (admin secret).
 * Idempotent DDL (IF NOT EXISTS). Records drizzle.__drizzle_migrations row.
 *
 * Env:
 *   DATABASE_SECRET_ARN (required) — or DATABASE_URL for local
 *   APPLY=1 to mutate (default dry-run)
 *   FORGE_ENV=development|production|local
 *   ALLOW_PRODUCTION=1 (required if FORGE_ENV=production)
 *   SQL_0094_PATH — path to SQL file (default /tmp/... or packages path)
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const FORGE_ENV = (process.env.FORGE_ENV || "development").trim();
const ALLOW_PRODUCTION =
  process.env.ALLOW_PRODUCTION === "1" || process.env.ALLOW_PRODUCTION === "true";

if (FORGE_ENV === "production" && !ALLOW_PRODUCTION) {
  throw new Error("Refusing production apply without ALLOW_PRODUCTION=1");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultLocalSql = path.join(
  __dirname,
  "..",
  "packages",
  "database",
  "drizzle",
  "0094_user_push_subscriptions_s1.sql",
);

const MIG = {
  tag: "0094_user_push_subscriptions_s1",
  when: 1790179600000,
  path:
    process.env.SQL_0094_PATH ||
    (existsSync("/tmp/0094_user_push_subscriptions_s1.sql")
      ? "/tmp/0094_user_push_subscriptions_s1.sql"
      : defaultLocalSql),
  probeTable: "user_push_subscriptions",
};

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN or DATABASE_URL is required");

  const apiRequire = createRequire(
    existsSync("/app/apps/platform-api/package.json")
      ? "/app/apps/platform-api/package.json"
      : path.join(__dirname, "..", "apps", "platform-api", "package.json"),
  );
  const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
    "@aws-sdk/client-secrets-manager",
  );
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

function loadPostgres() {
  if (existsSync("/app/apps/platform-api/node_modules/@forge/database/package.json")) {
    const dbRequire = createRequire(
      "/app/apps/platform-api/node_modules/@forge/database/package.json",
    );
    return import(pathToFileURL(dbRequire.resolve("postgres")).href).then((m) => m.default ?? m);
  }
  const dbRequire = createRequire(
    path.join(__dirname, "..", "packages", "database", "package.json"),
  );
  return import(pathToFileURL(dbRequire.resolve("postgres")).href).then((m) => m.default ?? m);
}

function hashSql(content) {
  return createHash("sha256")
    .update(String(content).replace(/\r\n/g, "\n").trim(), "utf8")
    .digest("hex");
}

const url = await resolveDatabaseUrl();
const postgres = await loadPostgres();
const sql = postgres(url, { max: 1 });

try {
  const host = new URL(url).host;
  const body = readFileSync(MIG.path, "utf8");
  const hash = hashSql(body);

  console.log(
    JSON.stringify({
      forgeEnvironment: FORGE_ENV,
      apply: APPLY,
      host,
      tag: MIG.tag,
      hash,
    }),
  );

  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const probe = await sql`
    select 1 as ok
    from information_schema.tables
    where table_schema = 'public' and table_name = ${MIG.probeTable}
    limit 1
  `;
  const recorded = await sql`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    where hash = ${hash}
    limit 1
  `;
  const tableExists = probe.length > 0;
  const alreadyRecorded = recorded.length > 0;

  if (!APPLY) {
    console.log(
      JSON.stringify({
        tag: MIG.tag,
        hash,
        tableExists,
        alreadyRecorded,
        action: "dry-run",
      }),
    );
  } else {
    if (!tableExists) {
      await sql.unsafe(body);
    }
    if (!alreadyRecorded) {
      await sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${MIG.when})
      `;
    }
    const after = await sql`
      select 1 as ok
      from information_schema.tables
      where table_schema = 'public' and table_name = ${MIG.probeTable}
      limit 1
    `;
    console.log(
      JSON.stringify({
        tag: MIG.tag,
        hash,
        tableExistsBefore: tableExists,
        alreadyRecorded,
        appliedSql: !tableExists,
        recorded: !alreadyRecorded,
        tableExistsAfter: after.length > 0,
      }),
    );
  }
} finally {
  await sql.end({ timeout: 5 });
}
