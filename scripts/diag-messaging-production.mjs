/**
 * READ-ONLY: verify industrial messaging migration + tenant enablement.
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const FLAG_KEY = "industrial.module.messaging.enabled";

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
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const [tables] = await sql`
      select count(*)::int as n
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'industrial_messaging_threads',
          'industrial_messaging_thread_members',
          'industrial_messaging_messages',
          'industrial_messaging_attachments'
        )
    `;

    const [flag] = await sql`
      select fd.key,
             fd.default_value_json,
             fo.value_json as override_value_json
      from feature_definitions fd
      left join feature_overrides fo
        on fo.feature_definition_id = fd.id and fo.tenant_id = ${tenant.id}::uuid
      where fd.key = ${FLAG_KEY}
      limit 1
    `;

    const [entitlement] = await sql`
      select tme.status, pm.code as module_code
      from tenant_module_entitlements tme
      inner join platform_modules pm on pm.id = tme.module_id
      where tme.tenant_id = ${tenant.id}::uuid
        and pm.code = 'MESSAGING'
      limit 1
    `;

    const effectiveFlag =
      flag?.override_value_json !== null && flag?.override_value_json !== undefined
        ? Boolean(flag.override_value_json)
        : Boolean(flag?.default_value_json);

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          messagingTablesPresent: tables.n,
          messagingTablesExpected: 4,
          migrationReady: tables.n === 4,
          featureFlag: {
            key: FLAG_KEY,
            definitionFound: Boolean(flag),
            effectiveEnabled: effectiveFlag,
          },
          moduleEntitlement: entitlement ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
