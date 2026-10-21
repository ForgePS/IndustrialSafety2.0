#!/usr/bin/env node
/**
 * Diagnose open WC cases that would appear as duplicates on Weekly updates
 * (same normalized worker name; optional same injury date).
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

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const openCases = await sql`
    select
      c.id::text as id,
      c.status,
      c.case_number,
      c.claim_summary->>'claimNumber' as claim_number,
      c.claim_summary->>'dateOfInjury' as doi_claim,
      c.source_payload->'intake'->>'incidentDate' as doi_intake,
      coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(c.source_payload->>'workerName'), '')
      ) as worker_name,
      (
        select count(*)::int
        from industrial_workers_comp_weekly_updates u
        where u.case_id = c.id and u.tenant_id = c.tenant_id and u.archived_at is null
      ) as weekly_count
    from industrial_workers_comp_cases c
    left join industrial_personnel p on p.id = c.personnel_id and p.tenant_id = c.tenant_id
    where c.tenant_id = ${tenant.id}::uuid
      and c.archived_at is null
      and upper(c.status) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT')
    order by worker_name, c.created_at
  `;

  const byName = new Map();
  for (const row of openCases) {
    const key = String(row.worker_name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }

  const nameDupes = [...byName.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([name, rows]) => ({
      workerName: name,
      count: rows.length,
      cases: rows.map((r) => ({
        id: r.id,
        status: r.status,
        caseNumber: r.case_number,
        claimNumber: r.claim_number,
        doi: r.doi_claim || r.doi_intake || null,
        weeklyCount: r.weekly_count,
      })),
    }));

  const weeklyDupes = await sql`
    select
      case_id::text as case_id,
      week_of::text as week_of,
      count(*)::int as n,
      array_agg(id::text order by created_at) as ids
    from industrial_workers_comp_weekly_updates
    where tenant_id = ${tenant.id}::uuid
      and archived_at is null
    group by case_id, week_of
    having count(*) > 1
  `;

  // Same worker name + same week notes across different cases (weekly report dups)
  const weeklyByNameWeek = await sql`
    select
      lower(trim(coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(c.source_payload->>'workerName'), '')
      ))) as worker_key,
      u.week_of::text as week_of,
      count(*)::int as n,
      array_agg(u.id::text order by u.created_at) as update_ids,
      array_agg(c.id::text order by u.created_at) as case_ids,
      array_agg(left(u.notes, 80) order by u.created_at) as notes
    from industrial_workers_comp_weekly_updates u
    join industrial_workers_comp_cases c
      on c.id = u.case_id and c.tenant_id = u.tenant_id
    left join industrial_personnel p
      on p.id = c.personnel_id and p.tenant_id = c.tenant_id
    where u.tenant_id = ${tenant.id}::uuid
      and u.archived_at is null
      and c.archived_at is null
    group by 1, 2
    having count(*) > 1
    order by n desc
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        openCaseCount: openCases.length,
        openNameDuplicateGroups: nameDupes.length,
        nameDupes,
        weeklyCaseWeekDupes: weeklyDupes.length,
        weeklyDupes,
        weeklySameNameWeekGroups: weeklyByNameWeek.length,
        weeklyByNameWeek: weeklyByNameWeek.slice(0, 30),
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
