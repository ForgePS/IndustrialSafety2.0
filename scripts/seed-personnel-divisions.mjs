/**
 * Seed Producers Rice Mill division catalog for the Add Person dropdown.
 * Values match the Firebase org structure (Operations, Safety).
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-personnel-divisions.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
/** Distinct division names from the Firebase Producers Rice Mill org seed. */
const DIVISIONS = ["Operations", "Safety"];

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
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    const existing = await sql`
      select id::text as id from tenant_settings
      where tenant_id = ${tenantId}::uuid
        and namespace = 'industrial'
        and setting_key = 'personnel.divisions'
      limit 1
    `;

    const valueJson = JSON.stringify(DIVISIONS);
    if (existing[0]) {
      await sql`
        update tenant_settings
        set value_json = ${valueJson}::jsonb,
            updated_at = now(),
            record_version = record_version + 1
        where id = ${existing[0].id}::uuid
      `;
    } else {
      await sql`
        insert into tenant_settings (
          id, tenant_id, namespace, setting_key, value_json,
          schema_version, is_sensitive, record_version, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          'industrial',
          'personnel.divisions',
          ${valueJson}::jsonb,
          1,
          false,
          1,
          now(),
          now()
        )
      `;
    }

    console.log(
      JSON.stringify({ tenantKey: TENANT_KEY, tenantId, divisions: DIVISIONS, ok: true }, null, 2),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
