/**
 * producers-rice-mill only: remove company-driver roster rows from DOT
 * Drivers (DQF). Those people already live under Personnel → Company Drivers.
 *
 * Keeps true DQF files (DRV-YYYY-NNNN / DQF Import / drivers/DRV- path).
 * Soft-archives the rest of the mis-seeded driver rows. Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-dot-dqf-vs-company-drivers.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-dot-dqf-vs-company-drivers.mjs
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

const KEEP_DRV = new Set([
  "DRV-2026-0001",
  "DRV-2026-0002",
  "DRV-2026-0003",
  "DRV-2026-0004",
  "DRV-2026-0005",
  "DRV-2026-0006",
  "DRV-2026-0008",
  "DRV-2026-0009",
  "DRV-2026-0011",
  "DRV-2026-0012",
  "DRV-2026-0013",
  "DRV-2026-0014",
  "DRV-2026-0015",
  "DRV-2026-0016",
  "DRV-2026-0021",
  "DRV-2026-0022",
  "DRV-2026-0023",
  "DRV-2026-0024",
  "DRV-2026-0025",
  "DRV-2026-0026",
  "DRV-2026-0027",
  "DRV-2026-0031",
  "DRV-2026-0032",
  "DRV-2026-0034",
  "DRV-2026-0035",
  "DRV-2026-0036",
  "DRV-2026-0037",
  "DRV-2026-0038",
  "DRV-2026-0039",
  "DRV-2026-0041",
  "DRV-2026-0043",
  "DRV-2026-0044",
  "DRV-2026-0045",
  "DRV-2026-0046",
  "DRV-2026-0047",
  "DRV-2026-0048",
]);

const KEEP_NAMES = new Set(
  [
    "BILLY M BAKER",
    "ROGERS A CLARK",
    "LEROY M BONES",
    "DAVID D DAVIS",
    "DON D BAITY",
    "MARCUS J BAITY",
    "OSCAR C CURLETT",
    "DARRION R DAWKINS",
    "TRSITON S FREEMAN",
    "WILLIAM L GIBBINS",
    "AARON L GRAYSON",
    "GARRY L GUYDON",
    "ANGELA J HENDERSON",
    "THOMAS R HENDERSON",
    "DONALD E MORRIS",
    "RICKY D MUNNERLYN",
    "Hunter Oswalt",
    "DANIEL T PATTON",
    "CHRISTOPHER R PENISTER",
    "Alexander Pike",
    "STEVEN L RASDON",
    "Jeremy Watson",
    "BRANDON M STATON",
    "SHANNON L YARBROUGH",
    "JAMES D MCCLINTON JR.",
    "MARQUISE D OLIVER",
    "QUINNTAURUS L GLASPER",
    "LADELWYN E MANNING",
    "JOHN M CONRAD",
    "CLIFTON T MCCOLLUM",
    "BRANDON D WOOD",
    "AUSTIN T LAMBERSON",
    "BLAKE A HUTTON",
    "JACKSON T HOLLEY",
    "CRIS O TOWNSEND",
    "JAMES R SYKES JR",
  ].map(normalizePersonKey),
);

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

function hay(row, payload) {
  return [
    row.source_document_id,
    row.source_path,
    row.source_collection,
    row.title,
    payload.sourceDocumentId,
    payload.recordNumber,
    payload.createdByName,
    payload.seededFrom,
    JSON.stringify(payload),
  ]
    .map((value) => String(value ?? ""))
    .join(" ");
}

function drvIdsIn(text) {
  return [...String(text).toUpperCase().matchAll(/\bDRV-\d{4}-\d+\b/g)].map((m) => m[0]);
}

function normalizePersonKey(value) {
  const parts = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !/^(jr|sr|ii|iii|iv|v)$/.test(part));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[parts.length - 1]}|${parts[0]}`;
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

function isRealDqf(row, payload) {
  if (isCompanyDriverSource(row, payload)) return false;
  const text = hay(row, payload);
  const ids = drvIdsIn(text);
  if (ids.some((id) => KEEP_DRV.has(id))) return true;
  const nameKey = normalizePersonKey(row.title || payload.workerName || payload.driverName || "");
  if (nameKey && KEEP_NAMES.has(nameKey) && (/dqf\s*import/i.test(text) || /\/drivers\//i.test(text))) {
    return true;
  }
  return false;
}

function looksLikeDriverCategory(row, payload) {
  const cat = String(payload.category ?? "").toLowerCase();
  if (cat.includes("driver") || cat.includes("dqf") || payload.dqf === true) return true;
  const collection = String(row.source_collection ?? row.source_path ?? "").toLowerCase();
  if (collection.includes("dqf")) return true;
  if (collection.includes("driver") && !collection.includes("fleetvehicle")) return true;
  return false;
}

function otherDotCategory(row, payload) {
  const text = hay(row, payload).toLowerCase();
  if (/\bdvirs?\b|pre[-\s]?trip|post[-\s]?trip|vehicle inspection report/.test(text)) return true;
  if (/\broadside\b|out[-\s]?of[-\s]?service/.test(text)) return true;
  if (/\baccidents?\b|\bcrashes?\b|\bcollisions?\b/.test(text)) return true;
  if (/drug\s*(&|and)?\s*alcohol|\bclearinghouse\b/.test(text)) return true;
  const cat = String(payload.category ?? "").toLowerCase();
  if (["vehicles", "dvirs", "accidents", "roadside", "company", "drug-alcohol"].some((c) => cat.includes(c))) {
    return true;
  }
  return false;
}

function shouldArchive(row) {
  const payload = unwrap(row.source_payload);
  if (isRealDqf(row, payload)) return false;
  if (isCompanyDriverSource(row, payload)) return true;
  const text = hay(row, payload);
  if (/dqf\s*import/i.test(text)) return true;
  const path = String(row.source_path ?? "").toLowerCase();
  if (path.includes("/drivers/") && !path.includes("/vehicles/") && !path.includes("/dvir")) {
    return true;
  }
  const cat = String(payload.category ?? "").toLowerCase();
  if (cat.includes("driver") || cat.includes("dqf") || payload.dqf === true) return true;
  return looksLikeDriverCategory(row, payload) && !otherDotCategory(row, payload);
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

    const rows = await sql`
      select
        id::text as id,
        title,
        status,
        source_collection,
        source_document_id,
        source_path,
        source_payload
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;

    const keep = [];
    const archive = [];
    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      const summary = {
        id: row.id,
        title: row.title,
        sourceCollection: row.source_collection,
        sourceDocumentId: row.source_document_id,
        seededFrom: payload.seededFrom ?? null,
        dqf: payload.dqf === true,
        category: payload.category ?? null,
      };
      if (isRealDqf(row, payload)) keep.push(summary);
      else if (shouldArchive(row)) archive.push(summary);
    }

    if (APPLY) {
      for (const row of archive) {
        await sql`
          update industrial_dot_compliance_records
          set archived_at = now(), updated_at = now()
          where id = ${row.id}::uuid
            and tenant_id = ${tenantId}::uuid
            and archived_at is null
        `;
      }
    }

    const remaining = await sql`
      select
        id::text as id,
        title,
        source_collection,
        source_document_id,
        source_payload
      from industrial_dot_compliance_records
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;
    const remainingDqf = remaining.filter((row) => isRealDqf(row, unwrap(row.source_payload)));
    const leftoverDqfShaped = remaining
      .map((row) => {
        const payload = unwrap(row.source_payload);
        return { row, payload };
      })
      .filter(({ row, payload }) => {
        if (isRealDqf(row, payload)) return false;
        const text = hay(row, payload);
        const cat = String(payload.category ?? "").toLowerCase();
        return (
          /dqf\s*import/i.test(text) ||
          cat.includes("driver") ||
          cat.includes("dqf") ||
          payload.dqf === true ||
          String(row.source_path ?? "").toLowerCase().includes("/drivers/")
        );
      })
      .map(({ row, payload }) => ({
        title: row.title,
        sourceCollection: row.source_collection,
        sourceDocumentId: row.source_document_id,
        sourcePath: row.source_path,
        category: payload.category ?? null,
        seededFrom: payload.seededFrom ?? null,
      }));

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId,
          apply: APPLY,
          activeBefore: rows.length,
          keepDqf: keep.length,
          keepDqfTitles: keep.map((r) => `${r.sourceDocumentId || ""} ${r.title}`.trim()).sort(),
          archiveCount: archive.length,
          archiveBySeededFrom: archive.reduce((acc, row) => {
            const key = String(row.seededFrom || row.sourceCollection || "unknown");
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {}),
          archiveSamples: archive.slice(0, 12),
          remainingActive: remaining.length,
          remainingDqf: remainingDqf.length,
          remainingDqfTitles: remainingDqf
            .map((r) => `${r.source_document_id || ""} ${r.title}`.trim())
            .sort(),
          leftoverDqfShaped: leftoverDqfShaped.length,
          leftoverDqfShapedTitles: leftoverDqfShaped,
          note: APPLY
            ? "Archived company-driver DOT rows. Drivers (DQF) should now be the DRV files only."
            : "Dry-run only. Re-run with APPLY=1 to archive.",
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
