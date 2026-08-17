/**
 * READ-ONLY: department names + source_payload key frequency for producers.
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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
try {
  const tenant = await sql`select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1`;
  const tenantId = tenant[0].id;

  const depts = await sql`
    select name, count(*) over () as total
    from industrial_departments
    where tenant_id = ${tenantId}::uuid and archived_at is null
    order by name
    limit 100
  `;

  const samples = await sql`
    select source_payload
    from industrial_personnel
    where tenant_id = ${tenantId}::uuid and source_payload is not null
    limit 20
  `;

  const keyHits = new Map();
  const interesting = [];
  for (const row of samples) {
    const p = row.source_payload;
    if (!p || typeof p !== "object") continue;
    for (const k of Object.keys(p)) {
      keyHits.set(k, (keyHits.get(k) || 0) + 1);
      const lk = k.toLowerCase();
      if (lk.includes("div") || lk.includes("company") || lk.includes("org") || lk.includes("unit")) {
        interesting.push({ key: k, value: p[k] });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        tenantKey: TENANT_KEY,
        departmentCount: depts[0]?.total ?? 0,
        departments: depts.map((d) => d.name),
        payloadKeys: [...keyHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60),
        interesting,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
