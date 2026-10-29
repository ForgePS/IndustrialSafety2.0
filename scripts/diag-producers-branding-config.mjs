/**
 * READ-ONLY: verify logo link + published config for producers-rice-mill.
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
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    const tenantId = tenant[0]?.id;
    const branding = await sql`
      select logo_document_id::text, display_name, support_email, primary_color
      from tenant_branding where tenant_id = ${tenantId}::uuid limit 1
    `;
    const doc = await sql`
      select id::text, object_key, upload_status from forge_documents
      where id = ${branding[0]?.logo_document_id}::uuid limit 1
    `;
    const configs = await sql`
      select o.namespace, o.object_key, v.state, v.version, v.published_at, v.payload_json
      from config_objects o
      join config_versions v on v.id = o.current_published_version_id
      where o.tenant_id = ${tenantId}::uuid
        and o.namespace in ('tenant_profile', 'branding')
      order by o.namespace
    `;
    console.log(
      JSON.stringify(
        {
          tenantId,
          tenantBranding: branding[0] ?? null,
          logoDocument: doc[0] ?? null,
          publishedConfigs: configs.map((c) => ({
            namespace: c.namespace,
            state: c.state,
            version: c.version,
            publishedAt: c.published_at,
            payload: c.payload_json,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
