/**
 * producers-rice-mill only: set industrial_personnel.is_company_driver from the
 * Firebase import flag already sitting in source_payload.isCompanyDriver.
 *
 * Also marks active people whose job title is clearly a driver role when the
 * payload flag is missing (Commercial Driver, DRIVER/LOADER, etc.).
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-company-drivers.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-company-drivers.mjs
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
/**
 * title  = job titles that are clearly drivers (safe default for this tenant)
 * payload = trust source_payload.isCompanyDriver (noisy on producers-rice-mill)
 * both   = union of title + payload
 */
const MODE = (process.env.MODE || "title").trim().toLowerCase();
const ALLOWED = new Set(["producers-rice-mill"]);
const ALLOWED_MODES = new Set(["title", "payload", "both"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}
if (!ALLOWED_MODES.has(MODE)) {
  throw new Error(`Refusing MODE=${MODE}; allowed: ${[...ALLOWED_MODES].join(", ")}`);
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

function truthy(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "y";
  }
  return false;
}

/** Job titles that mean "this person drives for the company". */
const DRIVER_TITLE =
  /\b(commercial\s+driver|driver\s*\/\s*loader|company\s+driver|truck\s+driver|cdl\s+driver|^drivers?$)\b/i;

function isDriverTitle(jobTitle) {
  const title = typeof jobTitle === "string" ? jobTitle.trim() : "";
  return title !== "" && DRIVER_TITLE.test(title);
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
        job_title,
        is_company_driver,
        archived_at is not null as archived,
        source_payload
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
    `;

    const fromPayload = [];
    const fromTitle = [];
    const already = [];
    const samples = [];
    const payloadTitleCounts = new Map();

    for (const row of rows) {
      const payload = unwrap(row.source_payload);
      const payloadSaysDriver = truthy(payload.isCompanyDriver);
      const titleSaysDriver = isDriverTitle(row.job_title);
      const shouldBeDriver =
        MODE === "title"
          ? titleSaysDriver
          : MODE === "payload"
            ? payloadSaysDriver
            : payloadSaysDriver || titleSaysDriver;

      if (payloadSaysDriver) {
        const title = (row.job_title || "(none)").trim() || "(none)";
        payloadTitleCounts.set(title, (payloadTitleCounts.get(title) || 0) + 1);
      }

      if (!shouldBeDriver) continue;

      if (row.is_company_driver) {
        already.push(row.id);
        continue;
      }

      const reason = titleSaysDriver ? "title" : "payload";
      if (reason === "payload") fromPayload.push(row.id);
      else fromTitle.push(row.id);

      if (samples.length < 25) {
        samples.push({
          id: row.id,
          employeeNumber: row.employee_number,
          displayName: row.display_name,
          jobTitle: row.job_title,
          archived: row.archived,
          reason,
        });
      }

      if (!APPLY) continue;

      const nextPayload = {
        ...payload,
        isCompanyDriver: true,
      };

      await sql`
        update industrial_personnel
        set
          is_company_driver = true,
          source_payload = ${sql.json(nextPayload)},
          updated_at = now()
        where id = ${row.id}::uuid
          and tenant_id = ${tenantId}::uuid
      `;
    }

    const [after] = APPLY
      ? await sql`
          select count(*)::int as drivers
          from industrial_personnel
          where tenant_id = ${tenantId}::uuid
            and is_company_driver = true
        `
      : [{ drivers: null }];

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId,
          mode: MODE,
          apply: APPLY,
          scanned: rows.length,
          wouldSetFromPayload: fromPayload.length,
          wouldSetFromTitle: fromTitle.length,
          alreadyFlagged: already.length,
          totalWouldFlag: fromPayload.length + fromTitle.length + already.length,
          driversAfterApply: after.drivers,
          topPayloadTitles: [...payloadTitleCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([jobTitle, count]) => ({ jobTitle, count })),
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
