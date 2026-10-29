#!/usr/bin/env node
/**
 * Lists observations created or dated on DATE (America/Chicago), or deletes one by id.
 *
 *   DATE=2026-10-07 node scripts/purge-test-observation.mjs                      (dry run)
 *   APPLY=1 OBSERVATION_ID=<uuid> node scripts/purge-test-observation.mjs        (delete)
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

const DATE = (process.env.DATE || "").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const OBSERVATION_ID = (process.env.OBSERVATION_ID || "").trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDatabaseUrl(secretArn) {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
try {
  if (!APPLY) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE))
      throw new Error("DATE=YYYY-MM-DD required for a dry run");
    const rows = await sql`
      select o.id::text as id, t.tenant_key, o.title, o.status,
        o.created_at, o.source_payload ->> 'observedAt' as observed_at,
        o.source_payload ->> 'reportedBy' as reported_by,
        left(coalesce(o.source_payload ->> 'description', ''), 120) as description,
        o.archived_at
      from industrial_observations o
      join tenants t on t.id = o.tenant_id
      where (o.created_at at time zone 'America/Chicago')::date = ${DATE}::date
         or (
           jsonb_typeof(o.source_payload) = 'object'
           and (o.source_payload ->> 'observedAt') ~ '^\\d{4}-\\d{2}-\\d{2}T'
           and ((o.source_payload ->> 'observedAt')::timestamptz at time zone 'America/Chicago')::date = ${DATE}::date
         )
      order by o.created_at desc
    `;
    console.log(
      JSON.stringify({ ok: true, apply: false, date: DATE, count: rows.length, rows }, null, 2),
    );
    process.exit(0);
  }

  if (!UUID_RE.test(OBSERVATION_ID)) throw new Error("OBSERVATION_ID (uuid) required to delete");
  const deleted = await sql`
    delete from industrial_observations
    where id = ${OBSERVATION_ID}::uuid
    returning id::text as id, title
  `;
  console.log(JSON.stringify({ ok: true, apply: true, deleted }));
} finally {
  await sql.end({ timeout: 5 });
}
