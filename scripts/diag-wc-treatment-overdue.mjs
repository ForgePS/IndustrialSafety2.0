#!/usr/bin/env node
/**
 * Read-only: for open WC cases whose stage resolves to TREATMENT, report which
 * dashboard Next Action rules still fire (mirrors buildWorkersCompNextActions).
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

function unwrap(p) {
  if (typeof p === "string") {
    try {
      return JSON.parse(p);
    } catch {
      return {};
    }
  }
  return p && typeof p === "object" ? p : {};
}

function normStage(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "closed") return "CLOSED";
  if (s === "reported" || s === "intake") return "INTAKE";
  if (s.includes("medical") && s.includes("review")) return "MEDICAL_REVIEW";
  if (s.includes("treat")) return "TREATMENT";
  if (s.includes("return") || s.includes("rtw")) return "RETURN_TO_WORK";
  if (s.includes("claim")) return "CLAIM_ADMIN";
  if (s.includes("invest")) return "INVESTIGATION";
  return String(raw || "").toUpperCase() || "INTAKE";
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const secretArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

try {
  const [tenant] =
    await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);

  const rows = await sql`
    select c.id::text as id, c.status, c.severity, c.workflow_stage, c.days_away,
      c.case_number, c.claim_summary, c.source_payload, c.reported_at, c.created_at,
      coalesce(nullif(trim(p.display_name), ''), nullif(trim(c.source_payload->>'workerName'), '')) as worker_name
    from industrial_workers_comp_cases c
    left join industrial_personnel p on p.id = c.personnel_id and p.tenant_id = c.tenant_id
    where c.tenant_id = ${tenant.id}::uuid and c.archived_at is null
  `;

  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  const ruleCounts = {};
  for (const r of rows) {
    const payload = unwrap(r.source_payload);
    const intake = payload.intake && typeof payload.intake === "object" ? payload.intake : {};
    const stageRaw = String(payload.workflowStage || r.workflow_stage || "");
    const stage = normStage(stageRaw);
    let status = String(r.status || "").toUpperCase();
    if (stageRaw.toLowerCase() === "closed") status = "CLOSED";
    if (status === "CLOSED" || status === "ARCHIVED") continue;
    if (stage !== "TREATMENT") continue;

    const severity = String(r.severity || payload.severity || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const daysAway =
      r.days_away ?? (Number.isFinite(Number(payload.daysAway)) ? Number(payload.daysAway) : null);
    const claimNo =
      r.case_number ||
      r.claim_summary?.claimNumber ||
      payload.claim?.claimNumber ||
      payload.caseNumber ||
      "";
    const reportedRaw =
      String(intake.incidentDate || intake.reportedDate || "") ||
      (r.reported_at ? new Date(r.reported_at).toISOString() : "");
    const base = (reportedRaw || new Date(r.created_at).toISOString()).slice(0, 10);
    const next =
      payload.nextAction && typeof payload.nextAction === "object" ? payload.nextAction : null;

    const fired = [];
    const add = (key, due) => fired.push({ rule: key, due, overdue: due < today });
    if (next && (next.label || next.dueDate)) {
      add(
        `source-next: ${next.label || "Follow-up required"}`,
        String(next.dueDate || "").slice(0, 10) || addDays(base, 7),
      );
    } else {
      if (!claimNo) add("claim-number-missing", addDays(base, 3));
      if (status === "RESTRICTED" || severity === "restricted")
        add("rtw (status/severity restricted)", addDays(base, 14));
      if (status === "LOST_TIME" || severity === "lost_time" || (daysAway != null && daysAway > 0))
        add("lost-time", addDays(base, 7));
    }
    for (const f of fired)
      if (f.overdue) ruleCounts[f.rule.split(":")[0]] = (ruleCounts[f.rule.split(":")[0]] || 0) + 1;
    out.push({
      worker: r.worker_name,
      status,
      severity,
      daysAway,
      claimNo: claimNo || null,
      stageRaw,
      reportBase: base,
      fired,
    });
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        today,
        treatmentCases: out.length,
        treatmentCasesOverdue: out.filter((o) => o.fired.some((f) => f.overdue)).length,
        overdueByRule: ruleCounts,
        cases: out,
      },
      null,
      1,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
