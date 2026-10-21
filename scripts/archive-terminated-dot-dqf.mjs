/**
 * producers-rice-mill: soft-archive terminated Drivers (DQF) DOT files
 * (and linked terminated personnel when still active).
 *
 * A DQF row is treated as terminated when:
 * - title / worker / driver name contains "terminated", or
 * - linked personnel is already archived, or
 * - linked personnel status is terminated / inactive / archived
 *
 * Dry-run:
 *   TENANT_KEY=producers-rice-mill node scripts/archive-terminated-dot-dqf.mjs
 * Apply:
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/archive-terminated-dot-dqf.mjs
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
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return { ...current };
    }
    return {};
  }
  return {};
}

function looksTerminatedText(...parts) {
  const text = parts.map((p) => String(p ?? "")).join(" ").toLowerCase();
  return /\bterminated\b/.test(text) || /[-_\s]terminated\b/.test(text);
}

function isInactivePersonnelStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return (
    s === "terminated" ||
    s === "inactive" ||
    s === "archived" ||
    s.startsWith("terminated") ||
    s.startsWith("inactive")
  );
}

function isCompanyDriverSource(row, payload) {
  const seeded = String(payload.seededFrom ?? "").toLowerCase();
  const collection = String(row.source_collection ?? "").toLowerCase();
  const path = String(row.source_path ?? "").toLowerCase();
  if (seeded.includes("industrial_fleet_drivers") || seeded.includes("is_company_driver")) {
    return true;
  }
  if (collection === "companyvehicledrivers" || collection === "personneldriverqualification") {
    return true;
  }
  if (path.includes("companyvehicledrivers")) return true;
  return false;
}

function isDotDqfDriverRecord(row, payload) {
  if (isCompanyDriverSource(row, payload)) return false;
  const hay = [
    row.source_document_id,
    row.source_path,
    row.source_collection,
    row.title,
    payload.sourceDocumentId,
    payload.recordNumber,
    payload.createdByName,
    payload.seededFrom,
    payload.category,
  ]
    .map((v) => String(v ?? ""))
    .join(" ")
    .toLowerCase();
  if (/\bdrv-\d{4}-\d+\b/.test(hay)) return true;
  if (/dqf\s*import/.test(hay)) return true;
  if (/dot-compliance\/[^/]+\/drivers\/drv-/.test(hay)) return true;
  const cat = String(payload.category ?? "").trim().toLowerCase();
  if (cat.includes("dqf")) return true;
  if (payload.dqf === true) return true;
  return false;
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
    const tenantId = tenant.id;

    const people = await sql`
      select
        id::text as id,
        display_name,
        status,
        archived_at is not null as archived,
        is_dot_driver,
        is_company_driver
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
    `;
    const byId = new Map(people.map((p) => [p.id, p]));

    const rows = await sql`
      select
        id::text as id,
        title,
        personnel_id::text as personnel_id,
        source_collection,
        source_path,
        source_document_id,
        source_payload,
        status
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    const archiveDot = [];
    const archivePersonnelIds = new Set();

    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      if (!isDotDqfDriverRecord(row, payload)) continue;

      const nameBits = [
        row.title,
        payload.workerName,
        payload.driverName,
        payload.personnelName,
        payload.displayName,
      ];
      const person = row.personnel_id ? byId.get(row.personnel_id) : null;
      const reasonParts = [];

      if (looksTerminatedText(...nameBits)) reasonParts.push("dqf_title_terminated");
      if (person?.archived) reasonParts.push("personnel_archived");
      if (person && isInactivePersonnelStatus(person.status)) {
        reasonParts.push(`personnel_status:${person.status}`);
      }
      if (person && looksTerminatedText(person.display_name)) {
        reasonParts.push("personnel_name_terminated");
      }

      if (reasonParts.length === 0) continue;

      archiveDot.push({
        id: row.id,
        title: row.title,
        personnelId: row.personnel_id,
        reasons: reasonParts,
      });

      if (person && !person.archived) {
        if (
          looksTerminatedText(person.display_name) ||
          isInactivePersonnelStatus(person.status) ||
          looksTerminatedText(...nameBits)
        ) {
          archivePersonnelIds.add(person.id);
        }
      }
    }

    // Also archive active personnel clearly marked terminated even without a DQF hit.
    for (const person of people) {
      if (person.archived) continue;
      if (looksTerminatedText(person.display_name) || isInactivePersonnelStatus(person.status)) {
        archivePersonnelIds.add(person.id);
      }
    }

    const beforeDrivers = rows.filter((row) =>
      isDotDqfDriverRecord(row, unwrap(row.source_payload)),
    ).length;

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          tenant: TENANT_KEY,
          beforeActiveDqfRows: beforeDrivers,
          wouldArchiveDot: archiveDot.length,
          wouldArchivePersonnel: archivePersonnelIds.size,
          samples: archiveDot.slice(0, 20),
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("Dry-run only. Re-run with APPLY=1 to archive.");
      return;
    }

    const now = new Date();
    let archivedDot = 0;
    let archivedPersonnel = 0;

    await sql.begin(async (tx) => {
      for (const row of archiveDot) {
        const updated = await tx`
          update industrial_dot_compliance_records
          set
            archived_at = ${now},
            status = 'ARCHIVED',
            updated_at = ${now}
          where id = ${row.id}::uuid
            and tenant_id = ${tenantId}::uuid
            and archived_at is null
          returning id
        `;
        archivedDot += updated.length;
      }

      for (const personnelId of archivePersonnelIds) {
        const updated = await tx`
          update industrial_personnel
          set
            archived_at = coalesce(archived_at, ${now}),
            status = case
              when lower(coalesce(status, '')) in ('terminated', 'inactive', 'archived')
                then status
              else 'TERMINATED'
            end,
            is_dot_driver = false,
            updated_at = ${now}
          where id = ${personnelId}::uuid
            and tenant_id = ${tenantId}::uuid
            and archived_at is null
          returning id
        `;
        archivedPersonnel += updated.length;
      }

      // Recompute DOT driver flags from remaining active DQF links.
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
        WHERE p.tenant_id = ${tenantId}::uuid
          AND p.archived_at IS NULL
      `;

      await tx`
        UPDATE industrial_personnel AS p
        SET is_company_driver = true
        WHERE p.tenant_id = ${tenantId}::uuid
          AND p.archived_at IS NULL
          AND p.is_dot_driver = true
          AND p.is_company_driver = false
      `;
    });

    const after = await sql`
      select
        (select count(*)::int
           from industrial_dot_compliance_records d
          where d.tenant_id = ${tenantId}::uuid and d.archived_at is null) as active_dot_rows,
        (select count(*)::int
           from industrial_personnel p
          where p.tenant_id = ${tenantId}::uuid
            and p.archived_at is null
            and p.is_dot_driver) as active_dot_driver_flags
    `;

    console.log(
      JSON.stringify(
        {
          archivedDot,
          archivedPersonnel,
          after: after[0],
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
