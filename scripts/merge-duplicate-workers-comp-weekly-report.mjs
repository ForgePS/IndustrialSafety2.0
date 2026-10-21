#!/usr/bin/env node
/**
 * Merge duplicate open workers-comp cases that still appear as duplicates on
 * the Weekly updates report: same worker name + same claim number
 * (incident dates may differ due to bad imports).
 *
 * Also merges any leftover weekly_update rows that share the same worker name
 * and week_of across cases (keeps notes on the survivor case).
 *
 * Env:
 *   DATABASE_SECRET_ARN required
 *   TENANT_KEY default producers-rice-mill
 *   APPLY 1 to write
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
const MERGE_RUN_ID =
  process.env.MERGE_RUN_ID ||
  `merge-dup-wc-weekly-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const ALLOWED = new Set(["producers-rice-mill"]);
if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}`);
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

function asObject(value) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function pickText(...values) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickMaxNumber(...values) {
  let max = null;
  for (const value of values) {
    const n = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value);
    if (!Number.isFinite(n)) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

function isOpenStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "OPEN" || s === "ACTIVE" || s === "RESTRICTED" || s === "LOST_TIME" || s === "DRAFT";
}

function claimSummaryOf(row) {
  return asObject(row.claim_summary);
}

function payloadOf(row) {
  return asObject(row.source_payload);
}

function richnessScore(row) {
  const claim = claimSummaryOf(row);
  const payload = payloadOf(row);
  let score = 0;
  if (isOpenStatus(row.status)) score += 50;
  if (pickText(row.case_number)) score += 20;
  if (pickText(claim.claimNumber)) score += 20;
  if (pickText(claim.carrierName, claim.carrierId)) score += 10;
  if (row.personnel_id) score += 15;
  if (row.incident_id) score += 15;
  if (Number(row.child_count) > 0) score += Number(row.child_count) * 8;
  if (pickText(payload.oshaCaseId)) score += 10;
  return score;
}

function compareKeepers(a, b) {
  const aOpen = isOpenStatus(a.status) ? 1 : 0;
  const bOpen = isOpenStatus(b.status) ? 1 : 0;
  if (bOpen !== aOpen) return bOpen - aOpen;
  const richDiff = richnessScore(b) - richnessScore(a);
  if (richDiff !== 0) return richDiff;
  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aCreated - bCreated;
}

function mergeClaimSummary(rows) {
  const claims = rows.map(claimSummaryOf);
  // Prefer earliest injury date when claim numbers match (true original DOI).
  const dois = claims
    .map((c) => pickText(c.dateOfInjury))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return {
    carrierId: pickText(...claims.map((c) => c.carrierId)),
    carrierName: pickText(...claims.map((c) => c.carrierName)),
    claimNumber: pickText(...claims.map((c) => c.claimNumber)),
    adjuster: pickText(...claims.map((c) => c.adjuster)),
    dateOfInjury: dois[0] || pickText(...claims.map((c) => c.dateOfInjury)),
    bodyParts: pickText(...claims.map((c) => c.bodyParts)),
    notes: pickText(...claims.map((c) => c.notes)),
    lostTimeStart: pickText(...claims.map((c) => c.lostTimeStart)),
    lostTimeEnd: pickText(...claims.map((c) => c.lostTimeEnd)),
  };
}

function mergeSourcePayload(keeper, duplicates, claimSummary) {
  const all = [keeper, ...duplicates];
  const payloads = all.map(payloadOf);
  const base = { ...payloads[0] };
  base.workerName = pickText(...payloads.map((p) => p.workerName), ...all.map((r) => r.worker_name));
  base.locationText = pickText(...payloads.map((p) => p.locationText));
  base.oshaCaseId = pickText(...payloads.map((p) => p.oshaCaseId));
  if (payloads.some((p) => p.oshaRecordable === true)) base.oshaRecordable = true;
  if (payloads.some((p) => p.oshaPrivacyCase === true)) base.oshaPrivacyCase = true;
  base.claim = { ...asObject(base.claim), ...claimSummary };
  base.intake = {
    ...asObject(base.intake),
    incidentDate: claimSummary.dateOfInjury,
  };
  base.mergedDuplicateIds = duplicates.map((row) => row.id);
  base.mergeRunId = MERGE_RUN_ID;
  base.mergedAt = new Date().toISOString();
  base.mergedFromCount = all.length;
  base.mergeReason = "weekly-report-same-name-same-claim";
  return base;
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const cases = await sql`
    select
      c.id::text as id,
      c.status,
      c.case_number,
      c.personnel_id::text as personnel_id,
      c.incident_id::text as incident_id,
      c.days_away,
      c.restricted_days,
      c.claim_summary,
      c.source_payload,
      c.created_at,
      c.updated_at,
      coalesce(
        nullif(trim(p.display_name), ''),
        nullif(trim(c.source_payload->>'workerName'), ''),
        nullif(trim(c.source_payload->'employee'->>'employeeName'), '')
      ) as worker_name,
      upper(nullif(trim(coalesce(
        nullif(trim(c.claim_summary->>'claimNumber'), ''),
        nullif(trim(c.case_number), '')
      )), '')) as claim_key,
      coalesce(
        nullif(trim(c.claim_summary->>'dateOfInjury'), ''),
        nullif(trim(c.source_payload->'intake'->>'incidentDate'), ''),
        nullif(trim(c.source_payload->'claim'->>'dateOfInjury'), '')
      ) as injury_date,
      (
        select count(*)::int from (
          select 1 from industrial_workers_comp_medical_encounters m
            where m.case_id = c.id and m.tenant_id = c.tenant_id and m.archived_at is null
          union all
          select 1 from industrial_workers_comp_restrictions r
            where r.case_id = c.id and r.tenant_id = c.tenant_id and r.archived_at is null
          union all
          select 1 from industrial_workers_comp_work_status_periods w
            where w.case_id = c.id and w.tenant_id = c.tenant_id and w.archived_at is null
          union all
          select 1 from industrial_workers_comp_weekly_updates u
            where u.case_id = c.id and u.tenant_id = c.tenant_id and u.archived_at is null
        ) kids
      ) as child_count
    from industrial_workers_comp_cases c
    left join industrial_personnel p
      on p.id = c.personnel_id and p.tenant_id = c.tenant_id
    where c.tenant_id = ${tenant.id}::uuid
      and c.archived_at is null
      and upper(c.status) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT')
  `;

  // Group open weekly-report rows by name + claim # (claim may be PENDING → fall back to name+DOI).
  const groupsMap = new Map();
  for (const row of cases) {
    const nameKey = String(row.worker_name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!nameKey) continue;
    const claimKey = String(row.claim_key || "").trim();
    const doiKey = String(row.injury_date || "").trim().slice(0, 10);
    let groupKey;
    if (claimKey && claimKey !== "PENDING") {
      groupKey = `claim:${nameKey}||${claimKey}`;
    } else if (doiKey && /^\d{4}-\d{2}-\d{2}$/.test(doiKey)) {
      groupKey = `doi:${nameKey}||${doiKey}`;
    } else {
      continue;
    }
    if (!groupsMap.has(groupKey)) groupsMap.set(groupKey, []);
    groupsMap.get(groupKey).push(row);
  }

  const duplicateGroups = [...groupsMap.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const report = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    mergeRunId: MERGE_RUN_ID,
    openCasesScanned: cases.length,
    duplicateGroups: duplicateGroups.length,
    casesKept: 0,
    casesArchived: 0,
    childrenReparented: 0,
    weeklyConflictsMerged: 0,
    incidentsRelinked: 0,
    samples: [],
  };

  for (const [groupKey, rows] of duplicateGroups) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort(compareKeepers);
    const keeper = sorted[0];
    const duplicates = sorted.slice(1);
    const claimSummary = mergeClaimSummary([keeper, ...duplicates]);
    const sourcePayload = mergeSourcePayload(keeper, duplicates, claimSummary);
    const personnelId =
      pickText(keeper.personnel_id, ...duplicates.map((r) => r.personnel_id)) || null;
    const incidentId =
      pickText(keeper.incident_id, ...duplicates.map((r) => r.incident_id)) || null;
    const caseNumber =
      pickText(keeper.case_number, ...duplicates.map((r) => r.case_number)) || null;
    const daysAway = pickMaxNumber(keeper.days_away, ...duplicates.map((r) => r.days_away));
    const restrictedDays = pickMaxNumber(
      keeper.restricted_days,
      ...duplicates.map((r) => r.restricted_days),
    );
    const status =
      pickText(...[keeper, ...duplicates].filter((r) => isOpenStatus(r.status)).map((r) => r.status)) ||
      keeper.status;

    report.casesKept += 1;
    report.casesArchived += duplicates.length;
    if (report.samples.length < 40) {
      report.samples.push({
        groupKey,
        workerName: keeper.worker_name,
        keepId: keeper.id,
        keepStatus: keeper.status,
        keepDoi: keeper.injury_date,
        archiveIds: duplicates.map((r) => r.id),
        archiveDois: duplicates.map((r) => r.injury_date),
        claimKey: keeper.claim_key,
      });
    }

    if (!APPLY) continue;

    const dupIds = duplicates.map((r) => r.id);
    await sql.begin(async (tx) => {
      const weeks = await tx`
        select id::text as id, case_id::text as case_id, week_of::text as week_of, notes
        from industrial_workers_comp_weekly_updates
        where tenant_id = ${tenant.id}::uuid
          and archived_at is null
          and case_id = any(${[keeper.id, ...dupIds]}::uuid[])
        order by week_of asc, created_at asc
      `;
      const byWeek = new Map();
      for (const week of weeks) {
        const key = String(week.week_of || "").slice(0, 10);
        if (!byWeek.has(key)) byWeek.set(key, []);
        byWeek.get(key).push(week);
      }
      for (const [, weekRows] of byWeek) {
        const keeperWeek = weekRows.find((w) => w.case_id === keeper.id) || weekRows[0];
        const others = weekRows.filter((w) => w.id !== keeperWeek.id);
        if (others.length) {
          report.weeklyConflictsMerged += others.length;
          const notes = pickText(keeperWeek.notes, ...others.map((w) => w.notes));
          if (keeperWeek.case_id !== keeper.id) {
            await tx`
              update industrial_workers_comp_weekly_updates
              set case_id = ${keeper.id}::uuid,
                  notes = ${notes || keeperWeek.notes},
                  updated_at = now()
              where id = ${keeperWeek.id}::uuid
                and tenant_id = ${tenant.id}::uuid
            `;
          } else if (notes && notes !== keeperWeek.notes) {
            await tx`
              update industrial_workers_comp_weekly_updates
              set notes = ${notes}, updated_at = now()
              where id = ${keeperWeek.id}::uuid and tenant_id = ${tenant.id}::uuid
            `;
          }
          await tx`
            update industrial_workers_comp_weekly_updates
            set archived_at = now(),
                updated_at = now(),
                source_payload = coalesce(source_payload, '{}'::jsonb) || ${tx.json({
                  mergedIntoWeeklyUpdateId: keeperWeek.id,
                  mergedIntoCaseId: keeper.id,
                  mergeRunId: MERGE_RUN_ID,
                  mergedAt: new Date().toISOString(),
                })}
            where tenant_id = ${tenant.id}::uuid
              and id = any(${others.map((w) => w.id)}::uuid[])
              and archived_at is null
          `;
        } else if (keeperWeek.case_id !== keeper.id) {
          await tx`
            update industrial_workers_comp_weekly_updates
            set case_id = ${keeper.id}::uuid, updated_at = now()
            where id = ${keeperWeek.id}::uuid and tenant_id = ${tenant.id}::uuid
          `;
          report.childrenReparented += 1;
        }
      }

      const reparentMedical = await tx`
        update industrial_workers_comp_medical_encounters
        set case_id = ${keeper.id}::uuid, updated_at = now()
        where tenant_id = ${tenant.id}::uuid and archived_at is null
          and case_id = any(${dupIds}::uuid[])
        returning id
      `;
      const reparentRestrictions = await tx`
        update industrial_workers_comp_restrictions
        set case_id = ${keeper.id}::uuid, updated_at = now()
        where tenant_id = ${tenant.id}::uuid and archived_at is null
          and case_id = any(${dupIds}::uuid[])
        returning id
      `;
      const reparentWorkStatus = await tx`
        update industrial_workers_comp_work_status_periods
        set case_id = ${keeper.id}::uuid, updated_at = now()
        where tenant_id = ${tenant.id}::uuid and archived_at is null
          and case_id = any(${dupIds}::uuid[])
        returning id
      `;
      report.childrenReparented +=
        reparentMedical.length + reparentRestrictions.length + reparentWorkStatus.length;

      await tx`
        update industrial_workers_comp_cases
        set
          status = ${status},
          case_number = ${caseNumber},
          personnel_id = ${personnelId}::uuid,
          incident_id = ${incidentId}::uuid,
          days_away = ${daysAway},
          restricted_days = ${restrictedDays},
          claim_summary = ${tx.json(claimSummary)},
          source_payload = ${tx.json(sourcePayload)},
          updated_at = now()
        where id = ${keeper.id}::uuid and tenant_id = ${tenant.id}::uuid
      `;

      await tx`
        update industrial_workers_comp_cases
        set
          status = 'ARCHIVED',
          archived_at = now(),
          updated_at = now(),
          source_payload = coalesce(source_payload, '{}'::jsonb) || ${tx.json({
            mergedIntoCaseId: keeper.id,
            mergeRunId: MERGE_RUN_ID,
            mergedAt: new Date().toISOString(),
            mergeReason: "weekly-report-same-name-same-claim",
          })}
        where tenant_id = ${tenant.id}::uuid
          and id = any(${dupIds}::uuid[])
          and archived_at is null
      `;

      const incidents = incidentId
        ? await tx`
            select id::text as id, source_payload
            from industrial_incidents
            where tenant_id = ${tenant.id}::uuid
              and archived_at is null
              and (
                id = ${incidentId}::uuid
                or source_payload->>'workersCompCaseId' = any(${dupIds}::text[])
              )
          `
        : await tx`
            select id::text as id, source_payload
            from industrial_incidents
            where tenant_id = ${tenant.id}::uuid
              and archived_at is null
              and source_payload->>'workersCompCaseId' = any(${dupIds}::text[])
          `;
      for (const incident of incidents) {
        const payload = asObject(incident.source_payload);
        await tx`
          update industrial_incidents
          set source_payload = ${tx.json({
            ...payload,
            workersCompCaseId: keeper.id,
            workersCompRelevant: true,
          })},
              updated_at = now()
          where id = ${incident.id}::uuid and tenant_id = ${tenant.id}::uuid
        `;
        report.incidentsRelinked += 1;
      }
    });
  }

  const [after] = APPLY
    ? await sql`
        select count(*)::int as open_cases
        from industrial_workers_comp_cases
        where tenant_id = ${tenant.id}::uuid
          and archived_at is null
          and upper(status) in ('OPEN','ACTIVE','RESTRICTED','LOST_TIME','DRAFT')
      `
    : [{ open_cases: null }];

  console.log(JSON.stringify({ ...report, openCasesAfter: after?.open_cases ?? null }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
