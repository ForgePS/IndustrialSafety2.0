/**
 * Apply Emergency Alerts migrations 0077 + 0078 on Aurora (admin secret).
 * Idempotent DDL (IF NOT EXISTS). Records drizzle.__drizzle_migrations rows.
 *
 * Env:
 *   DATABASE_SECRET_ARN (required)
 *   APPLY=1 to mutate (default dry-run)
 *   FORGE_ENV=development|production
 *   ALLOW_PRODUCTION=1 (required if FORGE_ENV=production)
 *   SQL_0077_PATH / SQL_0078_PATH — local paths inside the task
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const FORGE_ENV = (process.env.FORGE_ENV || "development").trim();
const ALLOW_PRODUCTION =
  process.env.ALLOW_PRODUCTION === "1" || process.env.ALLOW_PRODUCTION === "true";

if (FORGE_ENV === "production" && !ALLOW_PRODUCTION) {
  throw new Error("Refusing production apply without ALLOW_PRODUCTION=1");
}
if (FORGE_ENV !== "development" && FORGE_ENV !== "production") {
  throw new Error(`Unsupported FORGE_ENV=${FORGE_ENV}`);
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

function hashSql(content) {
  return createHash("sha256")
    .update(String(content).replace(/\r\n/g, "\n").trim(), "utf8")
    .digest("hex");
}

const MIGRATIONS = [
  {
    tag: "0077_industrial_emergency_alerts_s0",
    when: 1788710400000,
    path: process.env.SQL_0077_PATH || "/tmp/0077_industrial_emergency_alerts_s0.sql",
    probeTable: "industrial_emergency_alerts",
  },
  {
    tag: "0078_industrial_emergency_alerts_targeting_s1",
    when: 1788796800000,
    path: process.env.SQL_0078_PATH || "/tmp/0078_industrial_emergency_alerts_targeting_s1.sql",
    probeTable: "industrial_emergency_alert_groups",
  },
];

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const url = await resolveDatabaseUrl(secretArn);
const sql = postgres(url, { max: 1 });

try {
  const host = new URL(url).host;
  console.log(
    JSON.stringify({
      forgeEnvironment: FORGE_ENV,
      apply: APPLY,
      host,
      migrations: MIGRATIONS.map((m) => m.tag),
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

  const results = [];
  for (const mig of MIGRATIONS) {
    const body = readFileSync(mig.path, "utf8");
    const hash = hashSql(body);
    const probe = await sql`
      select 1 as ok
      from information_schema.tables
      where table_schema = 'public' and table_name = ${mig.probeTable}
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
      results.push({
        tag: mig.tag,
        hash,
        tableExists,
        alreadyRecorded,
        action: "dry-run",
      });
      continue;
    }

    if (!tableExists) {
      await sql.unsafe(body);
    }

    if (!alreadyRecorded) {
      await sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${mig.when})
      `;
    }

    const after = await sql`
      select 1 as ok
      from information_schema.tables
      where table_schema = 'public' and table_name = ${mig.probeTable}
      limit 1
    `;
    results.push({
      tag: mig.tag,
      hash,
      tableExistsBefore: tableExists,
      alreadyRecorded,
      appliedSql: !tableExists,
      recorded: !alreadyRecorded,
      tableExistsAfter: after.length > 0,
    });
  }

  console.log(JSON.stringify({ status: "ok", apply: APPLY, results }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
