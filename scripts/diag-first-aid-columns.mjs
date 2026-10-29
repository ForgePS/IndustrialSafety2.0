/**
 * Probe: verify first-aid columns exist and list/summary queries work.
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
    const cols = await sql`
      select column_name, data_type
      from information_schema.columns
      where table_name = 'industrial_personnel'
        and column_name in (
          'tracks_first_aid',
          'cpr_certification_expires_date',
          'first_aid_certification_expires_date'
        )
      order by column_name
    `;
    const tenant =
      await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
    const tenantId = tenant[0]?.id;
    let sample = null;
    let count = null;
    if (tenantId && cols.length === 3) {
      count = await sql`
        select count(*)::int as n
        from industrial_personnel
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
          and (
            tracks_first_aid = true
            or cpr_certification_expires_date is not null
            or first_aid_certification_expires_date is not null
          )
      `;
      sample = await sql`
        select tracks_first_aid, cpr_certification_expires_date, first_aid_certification_expires_date
        from industrial_personnel
        where tenant_id = ${tenantId}::uuid
        limit 1
      `;
    }
    const migrations = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at desc
      limit 5
    `;
    console.log(
      JSON.stringify({ cols, tracked: count?.[0]?.n, sample: sample?.[0], migrations }, null, 2),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
