#!/usr/bin/env node
/**
 * READ-ONLY: sample industrial form rows for producers-rice-mill.
 * Uploaded and run via ECS one-off when needed.
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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

const tenantRows = await sql`
  select id::text as id from tenants where tenant_key = 'producers-rice-mill' limit 1
`;
const tenant = tenantRows[0]?.id;
if (!tenant) throw new Error("tenant not found");

const defs = await sql`
  select count(*)::int as n from industrial_form_definitions
  where tenant_id = ${tenant}::uuid and archived_at is null
`;
const subs = await sql`
  select count(*)::int as n from industrial_form_submissions
  where tenant_id = ${tenant}::uuid and archived_at is null
`;
const emptyAnswers = await sql`
  select count(*)::int as n from industrial_form_submissions
  where tenant_id = ${tenant}::uuid and archived_at is null
    and (answers is null or answers::text in ('{}', 'null'))
`;
const linked = await sql`
  select count(*)::int as n from industrial_form_submissions
  where tenant_id = ${tenant}::uuid and archived_at is null
    and form_definition_id is not null
`;
const withResponses = await sql`
  select count(*)::int as n from industrial_form_submissions
  where tenant_id = ${tenant}::uuid and archived_at is null
    and coalesce(source_payload->>'responses','') <> ''
`;
const sample = await sql`
  select title,
    form_definition_id::text as form_id,
    left(coalesce(answers::text, ''), 160) as answers_head,
    left(coalesce(source_payload::text, ''), 240) as payload_head,
    source_collection,
    source_document_id
  from industrial_form_submissions
  where tenant_id = ${tenant}::uuid and archived_at is null
  order by updated_at desc
  limit 3
`;

console.log(
  JSON.stringify(
    {
      tenant,
      defs: defs[0]?.n,
      subs: subs[0]?.n,
      emptyAnswers: emptyAnswers[0]?.n,
      linked: linked[0]?.n,
      withResponses: withResponses[0]?.n,
      sample,
    },
    null,
    2,
  ),
);
await sql.end({ timeout: 5 });
