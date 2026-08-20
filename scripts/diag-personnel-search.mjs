/**
 * READ-ONLY: search personnel roster for a name/email needle.
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
const NEEDLE = (process.env.TARGET_NEEDLE || "bogy").trim().toLowerCase();

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
  const like = `%${NEEDLE}%`;
  try {
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const rows = await sql`
      select id::text as id, display_name, employee_number, status, archived_at,
             email, user_id::text as user_id
      from industrial_personnel
      where tenant_id = ${tenant[0].id}::uuid
        and (
          lower(coalesce(display_name, '')) like ${like}
          or lower(coalesce(email, '')) like ${like}
          or lower(coalesce(employee_number, '')) like ${like}
        )
      order by display_name
      limit 20
    `;
    console.log(JSON.stringify({ ok: true, tenantKey: TENANT_KEY, needle: NEEDLE, matches: rows }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
