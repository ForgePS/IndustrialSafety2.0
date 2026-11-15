/**
 * READ-ONLY: show print bridge rows + forge.printing.bridge flag for producers-rice-mill.
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

const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";

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
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const bridges = await sql`
      select id::text, name, computer_name, status, enabled, bridge_version,
             last_seen_at, registered_at, created_at, updated_at
      from industrial_printer_bridges
      where tenant_id = ${tenant.id}::uuid
      order by created_at desc
    `;

    const flag = await sql`
      select fd.key, fd.default_value_json, fo.value_json as override_value,
             fo.reason as override_reason, fo.updated_at as override_updated_at
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenant.id}::uuid
      where fd.key = 'forge.printing.bridge.enabled'
      limit 1
    `;

    console.log(JSON.stringify({ tenant, bridges, flag }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
