/**
 * READ-ONLY: deeper DQF link dig (workbook import rows + EMP- format).
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-dot-dqf-personnel-match-deep.mjs
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

function unwrap(raw) {
  let current = raw;
  for (let i = 0; i < 3; i += 1) {
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
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function asText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeEmp(value) {
  let s = asText(value).toUpperCase();
  if (!s) return "";
  s = s.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(s)) s = String(Number(s));
  return s;
}

function normalizePersonKey(value) {
  const parts = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(jr|sr|ii|iii|iv|v|not|diabetic|terminated)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);
  const tenantId = tenant.id;

  const collectionCounts = await sql`
    select
      coalesce(source_collection, '(null)') as source_collection,
      count(*)::int as n,
      count(*) filter (where personnel_id is not null)::int as with_pid,
      count(*) filter (where personnel_id is null)::int as without_pid,
      count(*) filter (where archived_at is not null)::int as archived
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
    group by 1
    order by n desc
  `;

  const workbook = await sql`
    select
      id::text as id,
      title,
      personnel_id::text as personnel_id,
      source_collection,
      source_document_id,
      archived_at is not null as archived,
      source_payload
    from industrial_dot_compliance_records
    where tenant_id = ${tenantId}::uuid
      and (
        lower(coalesce(source_collection, '')) like '%dqf%'
        or lower(coalesce(source_system, '')) like '%dqf%'
        or source_payload::text ilike '%dqfWorkbookImport%'
        or source_payload::text ilike '%DQF Files.xlsx%'
        or source_payload::text ilike '%"dqf":true%'
        or source_payload::text ilike '%"dqf": true%'
      )
    order by updated_at desc
    limit 80
  `;

  const people = await sql`
    select id::text as id, employee_number, display_name, archived_at
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const byEmpNorm = new Map();
  const byName = new Map();
  for (const p of people) {
    if (p.archived_at) continue;
    const emp = normalizeEmp(p.employee_number);
    if (emp)
      byEmpNorm.set(emp, { id: p.id, displayName: p.display_name, empRaw: p.employee_number });
    const nk = normalizePersonKey(p.display_name);
    if (nk) byName.set(nk, { id: p.id, displayName: p.display_name, empRaw: p.employee_number });
  }

  // Specific lookups for unmatched + sample EMP format
  const checkEmps = ["24934", "19628", "2500", "1401", "EMP-24934", "EMP-19628"];
  const empLookups = {};
  for (const e of checkEmps) {
    const hits = people.filter(
      (p) =>
        asText(p.employee_number).toUpperCase() === e.toUpperCase() ||
        normalizeEmp(p.employee_number) === normalizeEmp(e),
    );
    empLookups[e] = hits.map((h) => ({
      id: h.id,
      emp: h.employee_number,
      name: h.display_name,
      archived: Boolean(h.archived_at),
    }));
  }

  const workbookSummary = workbook.map((row) => {
    const payload = unwrap(row.source_payload);
    const empRaw = asText(
      payload.employeeNumber ??
        payload.employee_number ??
        payload.details?.employeeNumber ??
        payload.details?.employee_number,
    );
    const empNorm = normalizeEmp(empRaw);
    const nameKey = normalizePersonKey(
      row.title || payload.driverName || payload.workerName || payload.displayName,
    );
    const empHit = empNorm ? byEmpNorm.get(empNorm) : null;
    const nameHit = nameKey ? byName.get(nameKey) : null;
    return {
      id: row.id,
      title: row.title,
      personnelId: row.personnel_id,
      archived: row.archived,
      sourceCollection: row.source_collection,
      sourceDocumentId: row.source_document_id,
      empRaw: empRaw || null,
      empNorm: empNorm || null,
      dqfFlag: payload.dqf === true,
      seededFrom: payload.seededFrom || payload.dqfSourceFile || null,
      wouldMatchEmp: empHit
        ? { id: empHit.id, name: empHit.displayName, emp: empHit.empRaw }
        : null,
      wouldMatchName: nameHit
        ? { id: nameHit.id, name: nameHit.displayName, emp: nameHit.empRaw }
        : null,
    };
  });

  const unlinkedWorkbook = workbookSummary.filter((r) => !r.personnelId && !r.archived);

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        collectionCounts,
        workbookLikeCount: workbook.length,
        workbookUnlinked: unlinkedWorkbook.length,
        empLookups,
        workbookUnlinkedSample: unlinkedWorkbook.slice(0, 40),
        workbookLinkedSample: workbookSummary.filter((r) => r.personnelId).slice(0, 10),
        workbookNoMatch: unlinkedWorkbook
          .filter((r) => !r.wouldMatchEmp && !r.wouldMatchName)
          .map((r) => ({ title: r.title, empRaw: r.empRaw, sourceCollection: r.sourceCollection })),
        workbookWouldLinkViaEmp: unlinkedWorkbook.filter((r) => r.wouldMatchEmp).length,
        workbookWouldLinkViaName: unlinkedWorkbook.filter(
          (r) => !r.wouldMatchEmp && r.wouldMatchName,
        ).length,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
