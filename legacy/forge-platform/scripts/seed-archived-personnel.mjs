/**
 * producers-rice-mill only: set industrial_personnel.archived_at for people who
 * are already marked archived/terminated in status, display name, or
 * source_payload, so the Archived Personnel view can find them.
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-archived-personnel.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-archived-personnel.mjs
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

function looksGoneStatus(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  return (
    s === "archived" ||
    s === "terminated" ||
    s === "inactive" ||
    s.includes("terminat") ||
    s.includes("archiv") ||
    s.includes("inactive")
  );
}

function looksGoneName(value) {
  return /\bterminat|\binactive\b|\barchived\b/i.test(String(value ?? ""));
}

function parseArchiveDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    // Firestore-style { seconds, nanoseconds } or {_seconds}
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return new Date(seconds * 1000);
    }
  }
  return null;
}

function shouldArchive(row, payload) {
  const reasons = [];
  if (looksGoneStatus(row.status)) reasons.push("status");
  if (looksGoneName(row.display_name)) reasons.push("name");
  if (looksGoneStatus(payload.status ?? payload.employmentStatus ?? payload.employeeStatus)) {
    reasons.push("payload-status");
  }
  if (payload.archived === true || payload.isArchived === true) reasons.push("payload-flag");
  if (parseArchiveDate(payload.archivedAt)) reasons.push("payload-archivedAt");
  return reasons;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  try {
    const tenant = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    const rows = await sql`
      select
        id::text as id,
        employee_number,
        display_name,
        status,
        archived_at,
        source_payload
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
    `;

    const toArchive = [];
    const already = [];
    const samples = [];
    const reasonCounts = new Map();

    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      const reasons = shouldArchive(row, payload);
      if (reasons.length === 0) continue;

      for (const reason of reasons) {
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }

      if (row.archived_at) {
        already.push(row.id);
        continue;
      }

      const archivedAt =
        parseArchiveDate(payload.archivedAt) ??
        parseArchiveDate(payload.terminatedAt) ??
        new Date();

      const nextStatus = looksGoneStatus(row.status)
        ? row.status
        : looksGoneName(row.display_name)
          ? "Terminated"
          : "ARCHIVED";

      toArchive.push({
        id: row.id,
        employeeNumber: row.employee_number,
        displayName: row.display_name,
        status: row.status,
        nextStatus,
        archivedAt: archivedAt.toISOString(),
        reasons,
      });

      if (samples.length < 25) {
        samples.push({
          id: row.id,
          employeeNumber: row.employee_number,
          displayName: row.display_name,
          status: row.status,
          nextStatus,
          reasons,
        });
      }

      if (!APPLY) continue;

      const nextPayload = {
        ...payload,
        status: String(nextStatus).toLowerCase() === "terminated" ? "terminated" : "archived",
        archivedAt: archivedAt.toISOString(),
        archivedReason:
          payload.archivedReason ||
          (reasons.includes("name") ? "display-name" : "seed-archived-personnel"),
      };

      await sql`
        update industrial_personnel
        set
          archived_at = ${archivedAt},
          status = ${nextStatus},
          source_payload = ${sql.json(nextPayload)},
          updated_at = now()
        where id = ${row.id}::uuid
          and tenant_id = ${tenantId}::uuid
      `;
    }

    const [after] = APPLY
      ? await sql`
          select
            count(*) filter (where archived_at is not null)::int as archived,
            count(*) filter (where archived_at is null)::int as active
          from industrial_personnel
          where tenant_id = ${tenantId}::uuid
        `
      : [{ archived: null, active: null }];

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId,
          apply: APPLY,
          scanned: rows.length,
          wouldArchive: toArchive.length,
          alreadyArchived: already.length,
          reasonCounts: Object.fromEntries([...reasonCounts.entries()].sort()),
          after,
          samples,
          ok: true,
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
