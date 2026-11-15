/**
 * READ-ONLY: exercise feature-flags.effective path the bootstrap service uses.
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

const TENANT_KEY = "producers-rice-mill";

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
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;

    const defs = await sql`
      select count(*)::int as n from feature_definitions where status = 'ACTIVE'
    `;
    const overrides = await sql`
      select count(*)::int as n from feature_overrides where tenant_id = ${tenant.id}::uuid
    `;
    const sample = await sql`
      select fd.key, fd.default_value_json, fo.value_json
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenant.id}::uuid
      where fd.key like 'industrial%'
      order by fd.key
      limit 20
    `;

    // Simulate Boolean() coercion bootstrap does on flag values
    const coerced = sample.map((row) => ({
      key: row.key,
      defaultBool: Boolean(row.default_value_json),
      overridePresent: row.value_json !== null && row.value_json !== undefined,
      overrideBool: Boolean(row.value_json),
    }));

    console.log(JSON.stringify({ tenantId: tenant.id, defs, overrides, coerced }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
