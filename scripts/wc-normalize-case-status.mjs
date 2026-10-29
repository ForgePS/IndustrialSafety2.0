/**
 * Workers' comp case status -> ACTIVE | CLOSED | ARCHIVED.
 * Retired statuses (OPEN, DRAFT, RESTRICTED, LOST_TIME, ...) become ACTIVE.
 * RESTRICTED / LOST_TIME carry over into a blank severity (restricted / lost_time).
 * Dry run unless APPLY=1. Prints every affected row (id, old status, severity) before changing.
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
  const apply = process.env.APPLY === "1";
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const counts = await sql`
      select t.tenant_key, c.status, count(*)::int as n
      from industrial_workers_comp_cases c
      join tenants t on t.id = c.tenant_id
      group by 1, 2
      order by 1, 2
    `;
    console.log("BEFORE", JSON.stringify(counts));

    const affected = await sql`
      select c.id::text, t.tenant_key, c.case_number, c.status, c.severity
      from industrial_workers_comp_cases c
      join tenants t on t.id = c.tenant_id
      where c.status is null or c.status not in ('ACTIVE', 'CLOSED', 'ARCHIVED')
      order by t.tenant_key, c.status, c.case_number
    `;
    console.log(`AFFECTED ${affected.length}`);
    for (const r of affected) {
      console.log(
        `ROW ${r.id} tenant=${r.tenant_key} case=${r.case_number ?? ""} status=${r.status ?? ""} severity=${r.severity ?? ""}`,
      );
    }

    if (!apply) {
      console.log("DRY RUN - set APPLY=1 to update");
      return;
    }

    await sql.begin(async (tx) => {
      const sevRestricted = await tx`
        update industrial_workers_comp_cases
        set severity = 'restricted'
        where upper(btrim(status)) = 'RESTRICTED' and coalesce(btrim(severity), '') = ''
      `;
      const sevLost = await tx`
        update industrial_workers_comp_cases
        set severity = 'lost_time'
        where upper(btrim(status)) = 'LOST_TIME' and coalesce(btrim(severity), '') = ''
      `;
      const closedArchived = await tx`
        update industrial_workers_comp_cases
        set status = upper(btrim(status))
        where upper(btrim(status)) in ('CLOSED', 'ARCHIVED')
          and status not in ('CLOSED', 'ARCHIVED')
      `;
      const toActive = await tx`
        update industrial_workers_comp_cases
        set status = 'ACTIVE'
        where status is null or status not in ('ACTIVE', 'CLOSED', 'ARCHIVED')
      `;
      console.log(
        "APPLIED",
        JSON.stringify({
          severityRestricted: sevRestricted.count,
          severityLostTime: sevLost.count,
          closedArchivedCase: closedArchived.count,
          statusToActive: toActive.count,
        }),
      );
    });

    const after = await sql`
      select t.tenant_key, c.status, count(*)::int as n
      from industrial_workers_comp_cases c
      join tenants t on t.id = c.tenant_id
      group by 1, 2
      order by 1, 2
    `;
    console.log("AFTER", JSON.stringify(after));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
