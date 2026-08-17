/**
 * READ-ONLY: dump one producers personnel row (columns + source_payload) so we
 * can see why the personnel file only shows employee number / status.
 *
 *   TENANT_KEY=producers-rice-mill EMPLOYEE_NUMBER=EMP-25080 node scripts/diag-personnel-file-row.mjs
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
const EMPLOYEE_NUMBER = (process.env.EMPLOYEE_NUMBER || "EMP-25080").trim();
const DISPLAY_NAME = (process.env.DISPLAY_NAME || "ALBERT J. ROBY").trim();

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

function summarize(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}…` : value;
  }
  if (typeof value === "object") return value;
  return value;
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
      employee_number,
      status,
      email,
      phone,
      company_email,
      company_phone,
      job_title,
      department_name,
      company_name,
      division_name,
      supervisor_name,
      hire_date,
      site_id::text as site_id,
      department_id::text as department_id,
      position_id::text as position_id,
      is_company_driver,
      allergies,
      medical_history,
      emergency_contact_1_name,
      emergency_contact_1_phone,
      emergency_contact_2_name,
      notes,
      signature_url is not null as has_signature,
      source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and (
        employee_number = ${EMPLOYEE_NUMBER}
        or display_name ilike ${`%${DISPLAY_NAME}%`}
      )
    order by updated_at desc
    limit 3
  `;

  const columnFill = await sql`
    select
      count(*)::int as total,
      count(first_name)::int as first_name,
      count(last_name)::int as last_name,
      count(email)::int as email,
      count(phone)::int as phone,
      count(job_title)::int as job_title,
      count(department_name)::int as department_name,
      count(division_name)::int as division_name,
      count(supervisor_name)::int as supervisor_name,
      count(hire_date)::int as hire_date,
      count(site_id)::int as site_id,
      count(department_id)::int as department_id,
      count(source_payload)::int as source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and archived_at is null
  `;

  const payloadKeyHits = new Map();
  const samples = await sql`
    select source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid and source_payload is not null
    limit 50
  `;
  for (const row of samples) {
    const p = row.source_payload;
    if (!p || typeof p !== "object") continue;
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === "") continue;
      payloadKeyHits.set(k, (payloadKeyHits.get(k) || 0) + 1);
    }
  }

  const people = rows.map((row) => {
    const payload =
      row.source_payload && typeof row.source_payload === "object" ? row.source_payload : {};
    const columns = { ...row };
    delete columns.source_payload;
    return {
      columns,
      payloadKeys: Object.keys(payload).sort(),
      payload: Object.fromEntries(
        Object.entries(payload)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, summarize(v)]),
      ),
    };
  });

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        employeeNumber: EMPLOYEE_NUMBER,
        columnFill: columnFill[0],
        payloadKeysTop: [...payloadKeyHits.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 80),
        matches: people,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
