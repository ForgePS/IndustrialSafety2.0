/**
 * producers-rice-mill only: connect roster import fields onto typed personnel
 * columns and rewrite stringified source_payload to real jsonb objects.
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/backfill-personnel-payload-columns.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/backfill-personnel-payload-columns.mjs
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
    if (current && typeof current === "object" && !Array.isArray(current)) return { ...current };
    return {};
  }
  return {};
}

function blank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function filled(value) {
  return !blank(value);
}

function splitDisplayName(displayName) {
  const suffixes = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);
  const parts = String(displayName)
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/,/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return {};
  let suffix;
  if (parts.length > 1 && suffixes.has(parts[parts.length - 1].toUpperCase())) {
    suffix = parts.pop();
  }
  if (parts.length === 1) return { firstName: parts[0], suffix };
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts[parts.length - 1],
    suffix,
  };
}

function normalize(payload) {
  const out = { ...payload };
  const aliases = [
    ["goesBy", "preferredName"],
    ["hire_date", "hireDate"],
    ["job_title", "jobTitle"],
    ["employee_number", "employeeNumber"],
    ["first_name", "firstName"],
    ["last_name", "lastName"],
    ["middle_name", "middleName"],
    ["department", "departmentName"],
    ["company", "companyName"],
    ["division", "divisionName"],
    ["supervisor", "supervisorName"],
    ["site", "siteName"],
    ["location", "siteName"],
    ["locationName", "siteName"],
  ];
  for (const [from, to] of aliases) {
    if (blank(out[to]) && filled(out[from])) out[to] = out[from];
  }
  if (blank(out.firstName) && blank(out.lastName) && filled(out.displayName)) {
    const parsed = splitDisplayName(out.displayName);
    if (parsed.firstName) out.firstName = parsed.firstName;
    if (parsed.lastName) out.lastName = parsed.lastName;
    if (blank(out.middleName) && parsed.middleName) out.middleName = parsed.middleName;
    if (blank(out.suffix) && parsed.suffix) out.suffix = parsed.suffix;
  }
  return out;
}

function strOrNull(value) {
  if (blank(value)) return null;
  return String(value).trim();
}

function dateOrNull(value) {
  if (blank(value)) return null;
  if (typeof value === "object" && value && value.value) return dateOrNull(value.value);
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : null;
}

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenant = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  if (!tenant[0]) throw new Error(`tenant not found: ${TENANT_KEY}`);
  const tenantId = tenant[0].id;

  const rows = await sql`
    select
      id::text as id,
      display_name,
      first_name,
      middle_name,
      last_name,
      suffix,
      preferred_name,
      email,
      phone,
      job_title,
      department_name,
      company_name,
      division_name,
      supervisor_name,
      hire_date,
      employee_number,
      source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  let wouldUpdate = 0;
  let updated = 0;
  const samples = [];

  for (const row of rows) {
    const payload = normalize(unwrap(row.source_payload));
    if (Object.keys(payload).length === 0) continue;

    const next = {
      first_name: filled(row.first_name) ? row.first_name : strOrNull(payload.firstName),
      middle_name: filled(row.middle_name) ? row.middle_name : strOrNull(payload.middleName),
      last_name: filled(row.last_name) ? row.last_name : strOrNull(payload.lastName),
      suffix: filled(row.suffix) ? row.suffix : strOrNull(payload.suffix),
      preferred_name: filled(row.preferred_name)
        ? row.preferred_name
        : strOrNull(payload.preferredName),
      email: filled(row.email) ? row.email : strOrNull(payload.email),
      phone: filled(row.phone) ? row.phone : strOrNull(payload.phone),
      job_title: filled(row.job_title) ? row.job_title : strOrNull(payload.jobTitle),
      department_name: filled(row.department_name)
        ? row.department_name
        : strOrNull(payload.departmentName),
      company_name: filled(row.company_name) ? row.company_name : strOrNull(payload.companyName),
      division_name: filled(row.division_name)
        ? row.division_name
        : strOrNull(payload.divisionName),
      supervisor_name: filled(row.supervisor_name)
        ? row.supervisor_name
        : strOrNull(payload.supervisorName),
      hire_date: row.hire_date ?? dateOrNull(payload.hireDate),
    };

    const columnChanged =
      next.first_name !== (row.first_name ?? null) ||
      next.middle_name !== (row.middle_name ?? null) ||
      next.last_name !== (row.last_name ?? null) ||
      next.suffix !== (row.suffix ?? null) ||
      next.preferred_name !== (row.preferred_name ?? null) ||
      next.email !== (row.email ?? null) ||
      next.phone !== (row.phone ?? null) ||
      next.job_title !== (row.job_title ?? null) ||
      next.department_name !== (row.department_name ?? null) ||
      next.company_name !== (row.company_name ?? null) ||
      next.division_name !== (row.division_name ?? null) ||
      next.supervisor_name !== (row.supervisor_name ?? null) ||
      String(next.hire_date ?? "") !== String(row.hire_date ?? "");

    // Always rewrite stringified jsonb to a real object when needed.
    const payloadWasString = typeof row.source_payload === "string";
    if (!columnChanged && !payloadWasString) continue;

    wouldUpdate += 1;
    if (samples.length < 5) {
      samples.push({
        id: row.id,
        employeeNumber: row.employee_number,
        displayName: row.display_name,
        before: {
          first_name: row.first_name,
          last_name: row.last_name,
          job_title: row.job_title,
          hire_date: row.hire_date,
          payloadWasString,
        },
        after: {
          first_name: next.first_name,
          last_name: next.last_name,
          job_title: next.job_title,
          hire_date: next.hire_date,
        },
      });
    }

    if (!APPLY) continue;

    await sql`
      update industrial_personnel
      set
        first_name = ${next.first_name},
        middle_name = ${next.middle_name},
        last_name = ${next.last_name},
        suffix = ${next.suffix},
        preferred_name = ${next.preferred_name},
        email = ${next.email},
        phone = ${next.phone},
        job_title = ${next.job_title},
        department_name = ${next.department_name},
        company_name = ${next.company_name},
        division_name = ${next.division_name},
        supervisor_name = ${next.supervisor_name},
        hire_date = ${next.hire_date},
        source_payload = ${sql.json(payload)},
        updated_at = now()
      where id = ${row.id}::uuid
        and tenant_id = ${tenantId}::uuid
    `;
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        apply: APPLY,
        scanned: rows.length,
        wouldUpdate,
        updated,
        samples,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
