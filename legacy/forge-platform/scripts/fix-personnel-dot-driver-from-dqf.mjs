/**
 * Recompute industrial_personnel.is_dot_driver from linked Drivers (DQF) files.
 * Undoes the 0068 "all company drivers are DOT drivers" backfill.
 * For producers-rice-mill, also sets is_company_driver on DOT drivers.
 *
 * Dry-run:
 *   node scripts/fix-personnel-dot-driver-from-dqf.mjs
 * Apply:
 *   APPLY=1 node scripts/fix-personnel-dot-driver-from-dqf.mjs
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

const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const PRODUCERS_KEY = "producers-rice-mill";

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
    const before = await sql`
      select
        count(*)::int as total,
        count(*) filter (where is_company_driver)::int as company_drivers,
        count(*) filter (where is_dot_driver)::int as dot_drivers,
        count(*) filter (where is_company_driver and is_dot_driver)::int as both_flags,
        count(*) filter (where is_company_driver and not is_dot_driver)::int as company_only,
        count(*) filter (where is_dot_driver and not is_company_driver)::int as dot_only
      from industrial_personnel
      where archived_at is null
    `;

    const preview = await sql`
      with dqf as (
        select distinct d.tenant_id, d.personnel_id
        from industrial_dot_compliance_records d
        where d.archived_at is null
          and d.personnel_id is not null
          and not (
            lower(coalesce(d.source_collection, '')) in (
              'companyvehicledrivers',
              'personneldriverqualification'
            )
            or lower(coalesce(d.source_path, '')) like '%companyvehicledrivers%'
            or lower(coalesce(d.source_payload->>'seededFrom', '')) like '%industrial_fleet_drivers%'
            or lower(coalesce(d.source_payload->>'seededFrom', '')) like '%is_company_driver%'
          )
          and (
            coalesce(d.source_path, '') ~* 'drivers/DRV-'
            or coalesce(d.source_document_id, '') ~* 'DRV-'
            or coalesce(d.title, '') ~* 'DRV-'
            or lower(coalesce(d.source_collection, '')) like '%dqf%'
            or lower(coalesce(d.source_payload->>'category', '')) like '%dqf%'
            or (d.source_payload->>'dqf') in ('true', 'True', '1')
            or coalesce(d.source_payload::text, '') ~* 'DRV-[0-9]{4}-[0-9]+'
            or (
              lower(coalesce(d.source_payload->>'category', '')) like '%driver%'
              and lower(coalesce(d.source_collection, '')) not like '%fleet%'
            )
          )
      )
      select
        count(*) filter (where p.is_dot_driver and d.personnel_id is null)::int as will_clear,
        count(*) filter (where not p.is_dot_driver and d.personnel_id is not null)::int as will_set,
        count(*) filter (
          where d.personnel_id is not null
            and t.tenant_key = ${PRODUCERS_KEY}
            and not p.is_company_driver
        )::int as producers_will_set_company
      from industrial_personnel p
      left join dqf d on d.tenant_id = p.tenant_id and d.personnel_id = p.id
      left join tenants t on t.id = p.tenant_id
      where p.archived_at is null
    `;

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          before: before[0],
          preview: preview[0],
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("Dry-run only. Re-run with APPLY=1 to write.");
      return;
    }

    await sql.begin(async (tx) => {
      await tx`
        UPDATE industrial_personnel AS p
        SET is_dot_driver = EXISTS (
          SELECT 1
          FROM industrial_dot_compliance_records AS d
          WHERE d.tenant_id = p.tenant_id
            AND d.personnel_id = p.id
            AND d.archived_at IS NULL
            AND NOT (
              lower(coalesce(d.source_collection, '')) IN (
                'companyvehicledrivers',
                'personneldriverqualification'
              )
              OR lower(coalesce(d.source_path, '')) LIKE '%companyvehicledrivers%'
              OR lower(coalesce(d.source_payload->>'seededFrom', '')) LIKE '%industrial_fleet_drivers%'
              OR lower(coalesce(d.source_payload->>'seededFrom', '')) LIKE '%is_company_driver%'
            )
            AND (
              coalesce(d.source_path, '') ~* 'drivers/DRV-'
              OR coalesce(d.source_document_id, '') ~* 'DRV-'
              OR coalesce(d.title, '') ~* 'DRV-'
              OR lower(coalesce(d.source_collection, '')) LIKE '%dqf%'
              OR lower(coalesce(d.source_payload->>'category', '')) LIKE '%dqf%'
              OR (d.source_payload->>'dqf') IN ('true', 'True', '1')
              OR coalesce(d.source_payload::text, '') ~* 'DRV-[0-9]{4}-[0-9]+'
              OR (
                lower(coalesce(d.source_payload->>'category', '')) LIKE '%driver%'
                AND lower(coalesce(d.source_collection, '')) NOT LIKE '%fleet%'
              )
            )
        )
      `;

      await tx`
        UPDATE industrial_personnel AS p
        SET is_company_driver = true
        FROM tenants AS t
        WHERE p.tenant_id = t.id
          AND t.tenant_key = ${PRODUCERS_KEY}
          AND p.is_dot_driver = true
          AND p.is_company_driver = false
      `;
    });

    const after = await sql`
      select
        count(*)::int as total,
        count(*) filter (where is_company_driver)::int as company_drivers,
        count(*) filter (where is_dot_driver)::int as dot_drivers,
        count(*) filter (where is_company_driver and is_dot_driver)::int as both_flags,
        count(*) filter (where is_company_driver and not is_dot_driver)::int as company_only,
        count(*) filter (where is_dot_driver and not is_company_driver)::int as dot_only
      from industrial_personnel
      where archived_at is null
    `;

    const producers = await sql`
      select
        count(*) filter (where p.is_company_driver)::int as company_drivers,
        count(*) filter (where p.is_dot_driver)::int as dot_drivers,
        count(*) filter (where p.is_company_driver and p.is_dot_driver)::int as both_flags,
        count(*) filter (where p.is_company_driver and not p.is_dot_driver)::int as company_only,
        count(*) filter (where p.is_dot_driver and not p.is_company_driver)::int as dot_only
      from industrial_personnel p
      join tenants t on t.id = p.tenant_id
      where t.tenant_key = ${PRODUCERS_KEY}
        and p.archived_at is null
    `;

    console.log(JSON.stringify({ after: after[0], producers: producers[0] }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
