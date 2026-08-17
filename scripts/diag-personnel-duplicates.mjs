/**
 * READ-ONLY: is the 1,058-row roster inflated by repeated imports?
 * Groups personnel by source record id, employee number, and name to show
 * where the extra rows came from.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-personnel-duplicates.mjs
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
    if (current && typeof current === "object" && !Array.isArray(current)) return current;
    return {};
  }
  return {};
}

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
      first_name,
      last_name,
      status,
      job_title,
      archived_at,
      created_at,
      source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  const sourceIds = new Map();
  const keySignatures = new Map();
  const collections = new Map();
  const byEmp = new Map();
  const byName = new Map();
  let payloadEmpty = 0;

  for (const row of rows) {
    const payload = unwrap(row.source_payload);
    if (Object.keys(payload).length === 0) payloadEmpty += 1;

    const sourceId = String(
      payload.id ?? payload._id ?? payload.firebaseId ?? payload.docId ?? "",
    ).trim();
    if (sourceId) sourceIds.set(sourceId, (sourceIds.get(sourceId) || 0) + 1);

    const collection = String(
      payload.collection ?? payload._collection ?? payload.sourceCollection ?? "(none)",
    ).trim();
    collections.set(collection, (collections.get(collection) || 0) + 1);

    const signature = Object.keys(payload).sort().slice(0, 12).join(",") || "(empty)";
    keySignatures.set(signature, (keySignatures.get(signature) || 0) + 1);

    const emp = String(row.employee_number ?? "").trim().toLowerCase();
    if (emp) {
      if (!byEmp.has(emp)) byEmp.set(emp, []);
      byEmp.get(emp).push(row);
    }
    const name = String(row.display_name ?? "").trim().toLowerCase();
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(row);
    }
  }

  const repeatedSourceIds = [...sourceIds.entries()].filter(([, n]) => n > 1);
  const repeatedEmp = [...byEmp.entries()].filter(([, list]) => list.length > 1);
  const repeatedName = [...byName.entries()].filter(
    ([name, list]) => list.length > 1 && name !== "unnamed employee",
  );

  const nameSample = repeatedName.slice(0, 6).map(([name, list]) => ({
    name,
    rows: list.map((r) => {
      const payload = unwrap(r.source_payload);
      return {
        id: r.id,
        employeeNumber: r.employee_number,
        status: r.status,
        jobTitle: r.job_title,
        createdAt: r.created_at,
        sourceId: String(payload.id ?? payload._id ?? payload.firebaseId ?? "").slice(0, 40),
        payloadKeys: Object.keys(payload).length,
        sampleKeys: Object.keys(payload).sort().slice(0, 10),
      };
    }),
  }));

  const unnamed = await sql`
    select id::text as id, employee_number, status, job_title, department_name
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
      and lower(btrim(display_name)) = 'unnamed employee'
    limit 10
  `;

  const [empPrefix] = await sql`
    select
      count(*) filter (where employee_number ~* '^emp-')::int as emp_dash,
      count(*) filter (where employee_number ~* '^[0-9]+$')::int as numeric_only,
      count(*) filter (where nullif(btrim(employee_number), '') is null)::int as blank
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid
  `;

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        totalRows: rows.length,
        payloadEmpty,
        distinctSourceIds: sourceIds.size,
        repeatedSourceIds: {
          count: repeatedSourceIds.length,
          sample: repeatedSourceIds.slice(0, 10),
        },
        collections: [...collections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
        payloadKeySignatures: [...keySignatures.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([sig, count]) => ({ count, sig })),
        employeeNumberPatterns: empPrefix,
        repeatedEmployeeNumbers: {
          count: repeatedEmp.length,
          sample: repeatedEmp.slice(0, 10).map(([emp, list]) => ({ emp, rows: list.length })),
        },
        repeatedNames: {
          count: repeatedName.length,
          rowsInvolved: repeatedName.reduce((sum, [, list]) => sum + list.length, 0),
          sample: nameSample,
        },
        unnamedSample: unnamed,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
