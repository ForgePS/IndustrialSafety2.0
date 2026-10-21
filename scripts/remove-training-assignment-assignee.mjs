/**
 * Remove a single training assignment assignee row (e.g. duplicate employee number).
 *
 *   TENANT_KEY=producers-rice-mill ASSIGNMENT_TITLE="Dozer Safe Operations" EMPLOYEE_NUMBER=25063 node scripts/remove-training-assignment-assignee.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 ASSIGNMENT_TITLE="Dozer Safe Operations" EMPLOYEE_NUMBER=25063 node scripts/remove-training-assignment-assignee.mjs
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
const ASSIGNMENT_TITLE = (process.env.ASSIGNMENT_TITLE || "").trim();
const EMPLOYEE_NUMBER = (process.env.EMPLOYEE_NUMBER || "").trim();
const STATUS = (process.env.STATUS || "NOT_STARTED").trim().toUpperCase();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}
if (!ASSIGNMENT_TITLE) throw new Error("ASSIGNMENT_TITLE is required");
if (!EMPLOYEE_NUMBER) throw new Error("EMPLOYEE_NUMBER is required");

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

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

const tenantRows = await sql`
  select id::text as tenant_id
  from tenants
  where tenant_key = ${TENANT_KEY}
  limit 1
`;
const tenantId = tenantRows[0]?.tenant_id;
if (!tenantId) throw new Error(`Tenant not found: ${TENANT_KEY}`);

const matches = await sql`
  select
    aa.id::text as assignee_id,
    aa.employee_number,
    aa.status,
    a.id::text as assignment_id,
    a.title as assignment_title
  from industrial_training_assignment_assignees aa
  join industrial_training_assignments a on a.id = aa.assignment_id
  where aa.tenant_id = ${tenantId}::uuid
    and a.archived_at is null
    and a.title ilike ${`%${ASSIGNMENT_TITLE}%`}
    and upper(trim(aa.status)) = ${STATUS}
    and lower(trim(aa.employee_number)) = lower(trim(${EMPLOYEE_NUMBER}))
  order by aa.created_at asc
`;

if (!matches.length) {
  console.log(
    JSON.stringify({
      ok: true,
      tenantKey: TENANT_KEY,
      assignmentTitle: ASSIGNMENT_TITLE,
      employeeNumber: EMPLOYEE_NUMBER,
      status: STATUS,
      removed: 0,
      message: "No matching assignee rows",
    }),
  );
  await sql.end();
  process.exit(0);
}

console.log(JSON.stringify({ preview: matches, apply: APPLY }, null, 2));

if (!APPLY) {
  console.log("Dry run only. Set APPLY=1 to delete.");
  await sql.end();
  process.exit(0);
}

let removed = 0;
for (const row of matches) {
  await sql`
    delete from industrial_training_assignment_assignees
    where id = ${row.assignee_id}::uuid
      and tenant_id = ${tenantId}::uuid
  `;
  removed += 1;
  console.log(`Removed assignee ${row.assignee_id} (${row.employee_number}) from ${row.assignment_title}`);
}

console.log(
  JSON.stringify({
    ok: true,
    tenantKey: TENANT_KEY,
    removed,
  }),
);

await sql.end();
