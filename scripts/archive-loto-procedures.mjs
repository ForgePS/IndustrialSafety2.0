/**
 * Soft-archive all LOTO procedures (and their lockout records) for a tenant.
 * Matches UI "Delete" behavior: sets archived_at + status ARCHIVED.
 *
 * Dry-run unless APPLY=1.
 * Allowed tenant: producers-rice-mill only.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/archive-loto-procedures.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/archive-loto-procedures.mjs
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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });
try {
  const [tenant] = await sql`
    select id::text as id, tenant_key
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const procs = await sql`
    select id::text as id, title, status
    from industrial_loto_procedures
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    order by updated_at desc
  `;
  const lockouts = await sql`
    select id::text as id, title, status
    from industrial_loto_records
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    order by updated_at desc
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        tenantId: tenant.id,
        apply: APPLY,
        proceduresToArchive: procs.length,
        lockoutsToArchive: lockouts.length,
        sampleProcedures: procs.slice(0, 5).map((r) => ({ id: r.id, title: r.title, status: r.status })),
        sampleLockouts: lockouts.slice(0, 5).map((r) => ({ id: r.id, title: r.title, status: r.status })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with APPLY=1 to archive.");
    process.exit(0);
  }

  const now = new Date();
  const archivedProcs = await sql`
    update industrial_loto_procedures
    set archived_at = ${now},
        status = 'ARCHIVED',
        updated_at = ${now}
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    returning id::text as id
  `;
  const archivedLockouts = await sql`
    update industrial_loto_records
    set archived_at = ${now},
        status = 'ARCHIVED',
        updated_at = ${now}
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    returning id::text as id
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        archivedProcedures: archivedProcs.length,
        archivedLockouts: archivedLockouts.length,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
