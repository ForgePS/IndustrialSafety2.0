/**
 * Restore all soft-archived industrial_equipment rows for producers-rice-mill.
 * Clears archived_at and sets status back to ACTIVE (or prior ACTIVE when already ACTIVE).
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/restore-archived-equipment.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/restore-archived-equipment.mjs
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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

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
  const tenant =
    await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant[0]) throw new Error(`tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant[0].id;

  const rows = await sql`
    select
      id::text as id,
      name,
      equipment_number,
      status,
      archived_at
    from industrial_equipment
    where tenant_id = ${tenantId}::uuid
      and (archived_at is not null or upper(coalesce(status, '')) = 'ARCHIVED')
    order by archived_at desc nulls last, updated_at desc
  `;

  const samples = rows.slice(0, 10).map((row) => ({
    id: row.id,
    name: row.name,
    equipmentNumber: row.equipment_number,
    status: row.status,
    archivedAt: row.archived_at,
  }));

  let restored = 0;
  if (APPLY && rows.length > 0) {
    const result = await sql`
      update industrial_equipment
      set
        archived_at = null,
        status = case
          when upper(coalesce(status, '')) = 'ARCHIVED' then 'ACTIVE'
          else coalesce(nullif(trim(status), ''), 'ACTIVE')
        end,
        updated_at = now()
      where tenant_id = ${tenantId}::uuid
        and (archived_at is not null or upper(coalesce(status, '')) = 'ARCHIVED')
      returning id
    `;
    restored = result.length;
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        archivedFound: rows.length,
        restored: APPLY ? restored : 0,
        wouldRestore: APPLY ? undefined : rows.length,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
