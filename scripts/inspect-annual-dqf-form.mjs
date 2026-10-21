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
  const row = await sql`
    select title, schema_json, form_key, category
    from industrial_form_definitions
    where tenant_id = ${tenant}::uuid
      and title = 'Annual DQF Form'
      and archived_at is null
    limit 1
  `;
  const schema = row[0]?.schema_json;
  const fields = schema?.fields ?? [];
  console.log(
    JSON.stringify(
      {
        title: row[0]?.title,
        formKey: row[0]?.form_key,
        category: row[0]?.category,
        fieldCount: fields.length,
        fields: fields.map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          required: f.required,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
