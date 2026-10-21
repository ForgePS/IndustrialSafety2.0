/**
 * READ-ONLY: duplicate legacy ids in personnel source_payload vs row id.
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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant[0].id;

  const mixedStatus = await sql`
    select id::text, status, display_name, source_payload->>'id' as payload_id
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and status = 'Active'
    order by display_name
  `;

  const dupPayloadIds = await sql`
    select source_payload->>'id' as payload_id, count(*)::int as count
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
      and nullif(btrim(source_payload->>'id'), '') is not null
    group by 1
    having count(*) > 1
    order by count desc
    limit 30
  `;

  const [payloadIdStats] = await sql`
    select
      count(*)::int as rows,
      count(distinct id)::int as distinct_row_ids,
      count(distinct nullif(btrim(source_payload->>'id'), ''))::int as distinct_payload_ids
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        mixedStatusActiveRows: mixedStatus,
        duplicatePayloadIds: dupPayloadIds,
        payloadIdStats,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
