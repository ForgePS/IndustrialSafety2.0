/**
 * READ-ONLY: find where the rich personnel attributes live for producers-rice-mill.
 * Checks source_payload shape, migration_records, and industrial_attachments.
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
const EMPLOYEE_NUMBER = (process.env.EMPLOYEE_NUMBER || "EMP-25080").trim();

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
  const tenant = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  const tenantId = tenant[0].id;

  const person = await sql`
    select id::text as id, display_name, employee_number,
           pg_typeof(source_payload)::text as payload_type,
           length(source_payload::text) as payload_len,
           left(source_payload::text, 500) as payload_head
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid and employee_number = ${EMPLOYEE_NUMBER}
    limit 1
  `;

  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name ilike '%migration%'
        or table_name ilike '%import%'
        or table_name ilike '%personnel%'
        or table_name ilike '%attach%'
        or table_name ilike '%document%'
      )
    order by table_name
  `;

  let migrationHits = [];
  try {
    migrationHits = await sql`
      select id::text as id, entity_type, source_identifier, disposition,
             left(coalesce(source_payload::text, ''), 400) as source_head,
             left(coalesce(normalized_payload::text, ''), 400) as normalized_head
      from migration_records
      where tenant_id = ${tenantId}::uuid
        and (
          source_identifier ilike ${`%${EMPLOYEE_NUMBER}%`}
          or source_payload::text ilike ${`%${EMPLOYEE_NUMBER}%`}
          or normalized_payload::text ilike ${`%${EMPLOYEE_NUMBER}%`}
          or source_payload::text ilike '%ROBY%'
        )
      limit 10
    `;
  } catch (e) {
    migrationHits = [{ error: String(e.message || e) }];
  }

  let attachCount = null;
  try {
    const rows = await sql`
      select count(*)::int as n
      from industrial_attachments
      where tenant_id = ${tenantId}::uuid
        and entity_type ilike '%personnel%'
    `;
    attachCount = rows[0]?.n ?? 0;
  } catch (e) {
    attachCount = String(e.message || e);
  }

  let sampleAttach = [];
  try {
    sampleAttach = await sql`
      select entity_type, entity_id::text as entity_id, file_name, content_type,
             left(coalesce(storage_key, ''), 120) as storage_key
      from industrial_attachments
      where tenant_id = ${tenantId}::uuid
      order by created_at desc nulls last
      limit 15
    `;
  } catch (e) {
    sampleAttach = [{ error: String(e.message || e) }];
  }

  // Non-empty payload samples if any exist
  const richPayloads = await sql`
    select employee_number, display_name,
           length(source_payload::text) as payload_len,
           left(source_payload::text, 300) as payload_head
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and source_payload is not null
      and length(source_payload::text) > 5
    order by length(source_payload::text) desc
    limit 5
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        person: person[0] ?? null,
        relatedTables: tables.map((t) => t.table_name),
        migrationHits,
        personnelAttachmentCount: attachCount,
        sampleAttachments: sampleAttach,
        richestPayloads: richPayloads,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
