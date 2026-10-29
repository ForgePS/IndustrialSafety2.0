/**
 * Check whether names archived only for personnel_archived still need an active DQF.
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
const NAMES = [
  "CURTIS LOTT",
  "REBECCA THOMAS",
  "STEVEN RASDON",
  "JEFF THOMAS",
  "KEVIN JAMISON",
  "DESHANNON MCNEIL",
];

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

function norm(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(JR|SR|II|III|IV|TERMINATED|RESTRICTED|NOT|DIABETIC)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const sql = postgres(await resolveDatabaseUrl(process.env.DATABASE_SECRET_ARN), { max: 1 });
  try {
    const [tenant] =
      await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
    const out = [];
    for (const name of NAMES) {
      const key = norm(name);
      const people = await sql`
        select id::text as id, display_name, status, archived_at is not null as archived,
               is_company_driver, is_dot_driver, employee_number
        from industrial_personnel
        where tenant_id = ${tenant.id}::uuid
          and regexp_replace(upper(coalesce(display_name,'')), '[^A-Z0-9]+', ' ', 'g')
              like ${"%" + key.replace(/ /g, "%") + "%"}
        order by archived_at nulls first
        limit 8
      `;
      const dots = await sql`
        select id::text as id, title, archived_at is not null as archived,
               personnel_id::text as personnel_id
        from industrial_dot_compliance_records
        where tenant_id = ${tenant.id}::uuid
          and upper(coalesce(title,'')) like ${"%" + key.split(" ")[0] + "%"}
          and upper(coalesce(title,'')) like ${"%" + key.split(" ").slice(-1)[0] + "%"}
        order by archived_at nulls first
        limit 8
      `;
      out.push({
        name,
        people: people.map((p) => ({
          id: p.id,
          display_name: p.display_name,
          archived: p.archived,
          status: p.status,
          is_company_driver: p.is_company_driver,
          is_dot_driver: p.is_dot_driver,
          employee_number: p.employee_number,
        })),
        dots: dots.map((d) => ({
          id: d.id,
          title: d.title,
          archived: d.archived,
          personnel_id: d.personnel_id,
        })),
      });
    }

    const activeDqf = await sql`
      select count(*)::int as n
      from industrial_dot_compliance_records d
      where d.tenant_id = ${tenant.id}::uuid
        and d.archived_at is null
        and (
          coalesce(d.source_path, '') ~* 'drivers/DRV-'
          or coalesce(d.source_document_id, '') ~* 'DRV-'
          or lower(coalesce(d.source_collection, '')) like '%dqf%'
          or (d.source_payload->>'dqf') in ('true','True','1')
          or coalesce(d.source_payload::text, '') ~* 'DRV-[0-9]{4}-'
        )
        and not (
          lower(coalesce(d.source_collection, '')) in ('companyvehicledrivers','personneldriverqualification')
          or lower(coalesce(d.source_payload->>'seededFrom','')) like '%industrial_fleet_drivers%'
        )
    `;
    const flags = await sql`
      select count(*) filter (where is_dot_driver)::int as dot_flags
      from industrial_personnel
      where tenant_id = ${tenant.id}::uuid and archived_at is null
    `;
    console.log(
      JSON.stringify(
        { activeDqfApprox: activeDqf[0].n, dotFlags: flags[0].dot_flags, checks: out },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
