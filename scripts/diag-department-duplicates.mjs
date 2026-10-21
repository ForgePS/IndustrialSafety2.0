/**
 * Read-only: list Producers departments per site/division, flag duplicate names,
 * and count references to each department row across all department_id columns.
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

const TENANT_KEY = process.env.DIAG_TENANT_KEY || "producers-rice-mill";
const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

function normName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+-\s+stuttgart$/i, "")
    .replace(/\bmaint\.?$/i, "maintenance")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
  `;
  const tenantId = tenant.id;

  const depts = await sql`
    select d.id::text as id, d.name, d.division_name, d.site_id::text as site_id,
           s.name as site_name, d.status, d.source_system, d.source_collection,
           d.source_document_id, d.created_at
    from industrial_departments d
    left join industrial_sites s on s.id = d.site_id
    where d.tenant_id = ${tenantId}::uuid and d.archived_at is null
    order by s.name nulls first, d.division_name nulls first, lower(d.name), d.created_at
  `;

  const refCols = await sql`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'department_id'
      and table_name <> 'industrial_departments'
  `;
  const refs = new Map();
  for (const { table_name } of refCols) {
    const hasTenant = await sql`
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = ${table_name} and column_name = 'tenant_id'
    `;
    const rows = hasTenant.length
      ? await sql`
          select department_id::text as id, count(*)::int as n
          from ${sql(table_name)}
          where tenant_id = ${tenantId}::uuid and department_id is not null
          group by department_id
        `
      : await sql`
          select department_id::text as id, count(*)::int as n
          from ${sql(table_name)}
          where department_id is not null
          group by department_id
        `;
    for (const row of rows) {
      const entry = refs.get(row.id) ?? {};
      entry[table_name] = row.n;
      refs.set(row.id, entry);
    }
  }

  const groups = new Map();
  for (const d of depts) {
    const key = `${d.site_id ?? "-"}|${(d.division_name ?? "").toLowerCase()}|${d.name.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }
  const exactDupes = [...groups.values()].filter((list) => list.length > 1);

  const nearGroups = new Map();
  for (const d of depts) {
    const key = `${d.site_id ?? "-"}|${(d.division_name ?? "").toLowerCase()}|${normName(d.name)}`;
    const list = nearGroups.get(key) ?? [];
    list.push(d);
    nearGroups.set(key, list);
  }
  const nearDupes = [...nearGroups.values()].filter(
    (list) => list.length > 1 && new Set(list.map((d) => d.name.trim().toLowerCase())).size > 1,
  );

  const show = (d) => ({
    id: d.id,
    name: d.name,
    division: d.division_name,
    site: d.site_name,
    source: [d.source_system, d.source_collection].filter(Boolean).join("/"),
    sourceDoc: d.source_document_id,
    created: d.created_at,
    refs: refs.get(d.id) ?? {},
  });

  const stuttgartMilling = depts.filter(
    (d) =>
      String(d.site_name ?? "").toLowerCase().includes("stuttgart") &&
      String(d.division_name ?? "").toLowerCase() === "stuttgart milling operations",
  );

  console.log(
    "SUMMARY " +
      JSON.stringify({
        totalDepartments: depts.length,
        exactDuplicateGroups: exactDupes.length,
        exactDuplicateRows: exactDupes.reduce((n, l) => n + l.length, 0),
        nearDuplicateGroups: nearDupes.length,
        stuttgartMillingCount: stuttgartMilling.length,
      }),
  );
  for (const d of stuttgartMilling) console.log("SM " + JSON.stringify(show(d)));
  exactDupes.forEach((l, i) => l.forEach((d) => console.log(`EXACT${i} ` + JSON.stringify(show(d)))));
  nearDupes.forEach((l, i) => l.forEach((d) => console.log(`NEAR${i} ` + JSON.stringify(show(d)))));
} finally {
  await sql.end({ timeout: 5 });
}
