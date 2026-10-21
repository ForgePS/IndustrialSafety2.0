/**
 * Enrich industrial_workers_comp_cases for producers-rice-mill from Firebase
 * source_payload (nested claim / employee / intake / nextAction).
 *
 * - Unwraps double-encoded source_payload JSON strings
 * - Backfills case_number, claim_summary, status, workflow, days, reported_at
 * - Claim Number = Case Number (prefer claim.claimNumber, else caseNumber)
 * - Optionally links personnel_id via industrial_migration_id_map
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-workers-comp-from-source.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-workers-comp-from-source.mjs
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

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function unwrapPayload(raw) {
  let current = raw;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (!trimmed) return {};
      try {
        current = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    const obj = asRecord(current);
    if (obj) return obj;
    return {};
  }
  return {};
}

function hydrate(row) {
  const payload = unwrapPayload(row.source_payload);
  const claim = asRecord(payload.claim) ?? {};
  const employee = asRecord(payload.employee) ?? {};
  const intake = asRecord(payload.intake) ?? {};
  const next = asRecord(payload.nextAction);

  const adjusterFromList =
    Array.isArray(claim.adjusters) && claim.adjusters[0] && typeof claim.adjusters[0] === "object"
      ? asText(claim.adjusters[0].name)
      : "";

  const caseNumber =
    asText(claim.claimNumber) || asText(payload.caseNumber) || asText(row.case_number) || "";

  const claimSummary = {
    carrierId: asText(claim.carrierId),
    carrierName: asText(claim.carrierName),
    claimNumber: caseNumber,
    adjuster: asText(claim.adjusterName) || asText(claim.adjuster) || adjusterFromList,
    dateOfInjury: (asText(intake.incidentDate) || asText(claim.dateOfInjury)).slice(0, 10),
    bodyParts: [asText(intake.bodyPart), asText(intake.bodySide)].filter(Boolean).join(" ").trim(),
    notes: asText(claim.notes),
    lostTimeStart: "",
    lostTimeEnd: "",
  };

  const workStatus = asText(payload.workStatus).toLowerCase();
  const stageRaw = asText(payload.workflowStage) || asText(row.workflow_stage);
  let status = asText(row.status) || "OPEN";
  if (stageRaw.toLowerCase() === "closed") status = "CLOSED";
  else if (workStatus.includes("restricted")) status = "RESTRICTED";
  else if (workStatus.includes("off-work") || workStatus.includes("lost")) status = "LOST_TIME";
  else status = status.toUpperCase() === "OPEN" || !status ? "OPEN" : status.toUpperCase();

  const s = stageRaw.toLowerCase();
  let workflowStage = stageRaw.toUpperCase() || "INTAKE";
  if (s === "closed") workflowStage = "CLOSED";
  else if (s === "reported" || s === "intake") workflowStage = "INTAKE";
  else if (s.includes("treat")) workflowStage = "TREATMENT";
  else if (s.includes("return") || s.includes("rtw")) workflowStage = "RETURN_TO_WORK";
  else if (s.includes("claim")) workflowStage = "CLAIM_ADMIN";
  else if (s.includes("invest")) workflowStage = "INVESTIGATION";

  const workerName =
    asText(payload.workerName) || asText(employee.employeeName) || asText(employee.name) || "";
  const locationText =
    asText(payload.locationText) || asText(intake.exactLocation) || asText(payload.site) || "";
  const notes =
    asText(payload.notes) || asText(intake.injuryNarrative) || asText(claim.notes) || "";

  const reportedRaw = asText(intake.incidentDate) || asText(intake.reportedDate);
  const reportedAt = reportedRaw ? reportedRaw.slice(0, 10) : null;

  const daysAway =
    payload.daysAway != null && Number.isFinite(Number(payload.daysAway))
      ? Number(payload.daysAway)
      : row.days_away;
  const restrictedDays =
    payload.restrictedDays != null && Number.isFinite(Number(payload.restrictedDays))
      ? Number(payload.restrictedDays)
      : row.restricted_days;

  const nextAction =
    next && (asText(next.label) || asText(next.dueDate))
      ? {
          label: asText(next.label),
          dueDate: asText(next.dueDate).slice(0, 10),
          owner: asText(next.owner),
          priority: asText(next.priority) || "MEDIUM",
        }
      : null;

  const firebasePersonnelId =
    asText(payload.personnelId) || asText(employee.personnelId) || "";

  const sourcePayload = {
    ...payload,
    workerName,
    locationText,
    notes,
    caseNumber,
    claimSummary,
    nextAction,
  };

  return {
    caseNumber,
    status,
    severity: asText(payload.severity) || asText(row.severity) || null,
    workflowStage,
    daysAway,
    restrictedDays,
    reportedAt,
    claimSummary,
    workerName,
    firebasePersonnelId,
    sourcePayload,
  };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const rows = await sql`
      select
        id::text as id,
        case_number,
        status,
        severity,
        workflow_stage,
        days_away,
        restricted_days,
        claim_summary,
        personnel_id::text as personnel_id,
        source_document_id,
        source_payload
      from industrial_workers_comp_cases
      where tenant_id = ${tenant.id}::uuid
        and archived_at is null
        and source_collection = 'workersCompCases'
      order by updated_at desc
    `;

    const idMap = new Map();
    const mapRows = await sql`
      select source_document_id, target_id::text as target_id
      from industrial_migration_id_map
      where aws_tenant_id = ${tenant.id}::uuid
        and target_entity in ('industrial_personnel', 'personnelRecords', 'personnel')
    `;
    for (const m of mapRows) {
      if (m.source_document_id && m.target_id) idMap.set(String(m.source_document_id), m.target_id);
    }

    const report = {
      tenantKey: TENANT_KEY,
      tenantId: tenant.id,
      apply: APPLY,
      considered: rows.length,
      updated: 0,
      linkedPersonnel: 0,
      samples: [],
    };

    for (const row of rows) {
      const h = hydrate(row);
      if (!h.caseNumber && !h.workerName) continue;

      let personnelId = row.personnel_id;
      if (!personnelId && h.firebasePersonnelId && idMap.has(h.firebasePersonnelId)) {
        personnelId = idMap.get(h.firebasePersonnelId);
        report.linkedPersonnel += 1;
      }

      const sample = {
        id: row.id,
        before: { caseNumber: row.case_number, claimSummary: row.claim_summary },
        after: {
          caseNumber: h.caseNumber,
          claimNumber: h.claimSummary.claimNumber,
          workerName: h.workerName,
          status: h.status,
          workflowStage: h.workflowStage,
          personnelId,
        },
      };
      if (report.samples.length < 5) report.samples.push(sample);

      if (!APPLY) continue;

      const nextPersonnel = personnelId || null;
      await sql`
        update industrial_workers_comp_cases
        set
          case_number = ${h.caseNumber || row.case_number},
          status = ${h.status},
          severity = ${h.severity},
          workflow_stage = ${h.workflowStage},
          days_away = ${h.daysAway},
          restricted_days = ${h.restrictedDays},
          reported_at = ${h.reportedAt ? new Date(`${h.reportedAt}T12:00:00.000Z`) : null},
          claim_summary = ${sql.json(h.claimSummary)},
          personnel_id = ${nextPersonnel},
          source_payload = ${sql.json(h.sourcePayload)},
          updated_at = now()
        where id = ${row.id}::uuid
          and tenant_id = ${tenant.id}::uuid
      `;
      report.updated += 1;
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
