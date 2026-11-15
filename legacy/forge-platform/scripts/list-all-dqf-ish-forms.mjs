#!/usr/bin/env node
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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const tenantRows = await sql`
    select id::text as id from tenants where tenant_key = 'producers-rice-mill' limit 1
  `;
  const tenant = tenantRows[0]?.id;
  if (!tenant) throw new Error("tenant not found");

  const defs = await sql`
    select title, status, archived_at is not null as archived
    from industrial_form_definitions
    where tenant_id = ${tenant}::uuid
      and archived_at is null
    order by title
  `;
  const titles = defs.map((r) => r.title);
  const hits = titles.filter((t) =>
    /national|registry|examiner|medical|dqf|dot|driver|verification|mec|cdl/i.test(String(t)),
  );
  console.log(JSON.stringify({ total: titles.length, hits, all: titles }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
