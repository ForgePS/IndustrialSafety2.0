/**
 * Backfill industrial_osha_cases for producers-rice-mill from injury incidents
 * (and enrich imported Firebase oshaCases from their source_payload).
 *
 * Firebase oshaCases shape (observed on producers):
 *   incidentId (Firebase doc id), incidentTitle, employeeName, dateOfInjury,
 *   establishmentName, recordability, privacyCase, decidedBy, daysAway, …
 *
 * Idempotent. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-osha-from-incidents.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-osha-from-incidents.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function isInjury(payload) {
  const cat = asText(payload.category || payload.incidentCategory).toLowerCase();
  if (cat === "injuries" || cat === "injury") return true;
  if (
    !cat &&
    (payload.oshaRecordable != null || payload.workersComp || payload.workersCompIncident)
  ) {
    return true;
  }
  return false;
}

function normalizeRecordability(raw) {
  const text = asText(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (text === "RECORDABLE" || text === "YES") return "RECORDABLE";
  if (text === "NOT_RECORDABLE" || text === "NON_RECORDABLE" || text === "NO")
    return "NOT_RECORDABLE";
  if (text === "PRIVACY_CASE" || text === "PRIVACY") return "PRIVACY_CASE";
  if (text === "PENDING" || text === "UNDETERMINED" || !text) return "PENDING";
  return "PENDING";
}

function recordabilityFromPayload(payload) {
  if (payload.privacyCase === true || payload.isPrivacyCase === true) return "PRIVACY_CASE";
  const status = normalizeRecordability(
    payload.recordabilityStatus || payload.recordability || payload.classification,
  );
  if (status !== "PENDING") return status;
  if (payload.oshaRecordable === true || payload.recordable === true) return "RECORDABLE";
  if (payload.oshaRecordable === false || payload.recordable === false) return "NOT_RECORDABLE";
  return "PENDING";
}

function injuryDateFrom(payload, fallback = "") {
  return (
    asText(payload.injuryDate) ||
    asText(payload.dateOfInjury) ||
    asText(payload.dateOccurred) ||
    asText(payload.occurredAt) ||
    asText(fallback)
  ).slice(0, 10);
}

function buildCasePayload({
  awsIncidentId,
  sourceIncidentId,
  incidentTitle,
  incidentPayload = {},
  existing = {},
}) {
  const merged = { ...incidentPayload, ...existing };
  const injuryDate = injuryDateFrom(merged) || null;
  const recordabilityStatus = recordabilityFromPayload(merged);
  const oshaRecordable =
    recordabilityStatus === "RECORDABLE" || recordabilityStatus === "PRIVACY_CASE"
      ? true
      : recordabilityStatus === "NOT_RECORDABLE"
        ? false
        : null;

  return {
    ...existing,
    incidentId: sourceIncidentId || asText(existing.incidentId) || "",
    awsIncidentId: awsIncidentId || asText(existing.awsIncidentId) || "",
    title:
      asText(existing.title) ||
      asText(existing.incidentTitle) ||
      asText(incidentTitle) ||
      asText(incidentPayload.title) ||
      asText(merged.employeeName) ||
      "OSHA case",
    incidentTitle:
      asText(existing.incidentTitle) ||
      asText(incidentTitle) ||
      asText(incidentPayload.title) ||
      "",
    employeeName:
      asText(existing.employeeName) ||
      asText(merged.employeeName) ||
      asText(merged.personAffected) ||
      asText(merged.workerName) ||
      "",
    injuryDate,
    dateOfInjury: injuryDate,
    establishment:
      asText(existing.establishment) ||
      asText(existing.establishmentName) ||
      asText(merged.establishmentName) ||
      asText(merged.establishment) ||
      asText(merged.site) ||
      "",
    establishmentName:
      asText(existing.establishmentName) ||
      asText(merged.establishmentName) ||
      asText(merged.establishment) ||
      asText(merged.site) ||
      "",
    recordabilityStatus,
    recordability: recordabilityStatus,
    oshaRecordable,
    privacyCase: recordabilityStatus === "PRIVACY_CASE" || merged.privacyCase === true,
    reviewer:
      asText(existing.reviewer) ||
      asText(existing.decidedBy) ||
      asText(merged.decidedBy) ||
      asText(merged.reportedBy) ||
      "",
    decidedBy: asText(existing.decidedBy) || asText(merged.decidedBy) || "",
    jobTitle: asText(existing.jobTitle) || asText(merged.jobTitle) || "",
    description:
      asText(existing.description) ||
      asText(existing.decisionRationale) ||
      asText(merged.description) ||
      asText(merged.injuryNarrative) ||
      "",
    daysAway: existing.daysAway ?? merged.daysAway ?? null,
    restrictedDays:
      existing.restrictedDays ??
      existing.daysRestricted ??
      merged.restrictedDays ??
      merged.daysRestricted ??
      merged.daysJobTransfer ??
      null,
    daysRestricted: existing.daysRestricted ?? merged.daysRestricted ?? null,
    caseNumber: asText(existing.caseNumber) || asText(merged.caseNumber) || "",
    calendarYear: injuryDate ? Number(injuryDate.slice(0, 4)) : null,
  };
}

function normalizePerson(name) {
  return asText(name).toLowerCase().replace(/\s+/g, " ");
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");

const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1, prepare: false });

try {
  const [tenant] = await sql`
    select id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant.id;

  await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;

  const incidents = await sql`
    select id, title, site_id, source_document_id, source_payload, status
    from industrial_incidents
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
    order by updated_at desc
  `;

  const incidentsById = new Map();
  const incidentsBySourceId = new Map();
  for (const row of incidents) {
    incidentsById.set(row.id, row);
    if (row.source_document_id) incidentsBySourceId.set(String(row.source_document_id), row);
  }

  const oshaRows = await sql`
    select id, title, site_id, record_date, personnel_id, source_payload, status
    from industrial_osha_cases
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  const coveredIncidentIds = new Set();
  const byEmployeeDate = new Map();

  let createCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  const samples = [];

  // Pass 1: enrich existing OSHA rows (especially Firebase imports).
  for (const row of oshaRows) {
    const current = unwrapPayload(row.source_payload);
    const sourceIncidentId = asText(current.incidentId || current.incident_id);
    const linked =
      (UUID_RE.test(asText(current.awsIncidentId))
        ? incidentsById.get(current.awsIncidentId)
        : null) ||
      (UUID_RE.test(sourceIncidentId) ? incidentsById.get(sourceIncidentId) : null) ||
      (sourceIncidentId ? incidentsBySourceId.get(sourceIncidentId) : null) ||
      null;

    const incidentPayload = linked ? unwrapPayload(linked.source_payload) : {};
    const next = buildCasePayload({
      awsIncidentId: linked?.id || asText(current.awsIncidentId),
      sourceIncidentId: sourceIncidentId || linked?.source_document_id || "",
      incidentTitle: linked?.title || asText(current.incidentTitle),
      incidentPayload,
      existing: current,
    });

    if (linked?.id) coveredIncidentIds.add(linked.id);
    const empDate = `${normalizePerson(next.employeeName)}|${asText(next.injuryDate)}`;
    if (next.employeeName && next.injuryDate) byEmployeeDate.set(empDate, row);

    const needs =
      asText(row.title) !== next.title ||
      asText(row.record_date) !== asText(next.injuryDate) ||
      asText(current.awsIncidentId) !== asText(next.awsIncidentId) ||
      asText(current.recordabilityStatus) !== next.recordabilityStatus ||
      asText(current.injuryDate) !== asText(next.injuryDate) ||
      asText(current.establishment || current.establishmentName) !==
        asText(next.establishment || next.establishmentName) ||
      typeof row.source_payload === "string";

    if (!needs) {
      skipCount += 1;
      continue;
    }

    updateCount += 1;
    if (samples.length < 5) {
      samples.push({
        action: "update",
        id: row.id,
        title: next.title,
        employeeName: next.employeeName,
        injuryDate: next.injuryDate,
        awsIncidentId: next.awsIncidentId,
      });
    }
    if (APPLY) {
      await sql`
        update industrial_osha_cases
        set title = ${next.title},
            record_date = ${next.injuryDate},
            site_id = coalesce(${linked?.site_id ?? null}, site_id),
            source_payload = ${sql.json(next)},
            updated_at = now()
        where id = ${row.id}::uuid
      `;
    }
  }

  // Pass 2: create OSHA cases for injury incidents not already covered.
  for (const incident of incidents) {
    const payload = unwrapPayload(incident.source_payload);
    if (!isInjury(payload)) continue;
    if (coveredIncidentIds.has(incident.id)) continue;

    const emp = normalizePerson(
      payload.employeeName || payload.personAffected || payload.workerName,
    );
    const date = injuryDateFrom(payload);
    if (emp && date && byEmployeeDate.has(`${emp}|${date}`)) {
      skipCount += 1;
      continue;
    }

    const next = buildCasePayload({
      awsIncidentId: incident.id,
      sourceIncidentId: incident.source_document_id || "",
      incidentTitle: incident.title,
      incidentPayload: payload,
      existing: {},
    });

    createCount += 1;
    if (samples.length < 8) {
      samples.push({
        action: "create",
        title: next.title,
        employeeName: next.employeeName,
        injuryDate: next.injuryDate,
      });
    }
    if (APPLY) {
      const id = randomUUID();
      await sql`
        insert into industrial_osha_cases (
          id, tenant_id, site_id, title, status, record_date,
          source_system, source_payload, created_at, updated_at
        ) values (
          ${id}::uuid,
          ${tenantId}::uuid,
          ${incident.site_id},
          ${next.title},
          'OPEN',
          ${next.injuryDate},
          'FORGE',
          ${sql.json(next)},
          now(),
          now()
        )
      `;
      coveredIncidentIds.add(incident.id);
      if (emp && date) byEmployeeDate.set(`${emp}|${date}`, { id });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantKey: TENANT_KEY,
        tenantId,
        apply: APPLY,
        incidents: incidents.length,
        existingOsha: oshaRows.length,
        existingSamples: oshaRows.slice(0, 2).map((row) => {
          const p = unwrapPayload(row.source_payload);
          return {
            id: row.id,
            title: row.title,
            employeeName: p.employeeName ?? null,
            dateOfInjury: p.dateOfInjury ?? null,
            incidentId: p.incidentId ?? null,
            recordability: p.recordability ?? p.recordabilityStatus ?? null,
          };
        }),
        createCount,
        updateCount,
        skipCount,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
