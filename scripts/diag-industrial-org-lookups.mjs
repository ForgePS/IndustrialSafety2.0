/**
 * READ-ONLY diagnostic: count the org catalog rows that populate the Add Person
 * selects (Location, Department, Position) for a tenant.
 *
 * An empty catalog is not an error, but it makes those selects render as
 * "None available", so it is worth knowing before anyone reports it as a bug.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-industrial-org-lookups.mjs
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
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    // The form filters to ACTIVE and non-archived, so mirror that here.
    const selectable = async (table) => {
      const rows = await sql`
        select count(*)::int as n from ${sql(table)}
        where tenant_id = ${tenantId}::uuid
          and archived_at is null
          and (status is null or status = 'ACTIVE')
      `;
      return rows[0].n;
    };
    const total = async (table) => {
      const rows = await sql`
        select count(*)::int as n from ${sql(table)} where tenant_id = ${tenantId}::uuid
      `;
      return rows[0].n;
    };

    const report = { tenantKey: TENANT_KEY, tenantId, catalogs: {} };
    for (const [label, table] of [
      ["sites", "industrial_sites"],
      ["departments", "industrial_departments"],
      ["positions", "industrial_positions"],
    ]) {
      const [selectableCount, totalCount] = await Promise.all([
        selectable(table),
        total(table),
      ]);
      report.catalogs[label] = {
        selectable: selectableCount,
        total: totalCount,
        verdict:
          selectableCount > 0
            ? `dropdown shows ${selectableCount} option(s)`
            : totalCount > 0
              ? `EMPTY dropdown: ${totalCount} row(s) exist but none are ACTIVE and unarchived`
              : "EMPTY dropdown: no rows for this tenant",
      };
    }

    const personnel = await sql`
      select count(*)::int as n from industrial_personnel where tenant_id = ${tenantId}::uuid
    `;
    report.personnelRows = personnel[0].n;

    console.log(JSON.stringify({ ok: true, phase: "DIAG-INDUSTRIAL-ORG-LOOKUPS", report }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
