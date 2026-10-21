/**
 * Deep-inspect a few lotoRecords payloads for "items"-like arrays.
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

function unwrap(raw) {
  let current = raw;
  for (let i = 0; i < 4; i++) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
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

function findArrays(obj, prefix = "", depth = 0, out = []) {
  if (!obj || typeof obj !== "object" || depth > 4) return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out.push({ path, len: v.length, sample: v[0] ?? null });
    } else if (v && typeof v === "object") {
      findArrays(v, path, depth + 1, out);
    }
  }
  return out;
}

const sql = postgres(await (async () => {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.DATABASE_SECRET_ARN }),
  );
  const raw = JSON.parse(res.SecretString);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${raw.host ?? raw.hostname}:${raw.port ?? 5432}/${raw.dbname ?? raw.database}`;
})(), { max: 1 });

try {
  const [tenant] = await sql`select id::text as id from tenants where tenant_key='producers-rice-mill'`;
  const rows = await sql`
    select id::text as id, title, status, source_payload
    from industrial_loto_records
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    order by updated_at desc
    limit 15
  `;
  const out = rows.map((row) => {
    const p = unwrap(row.source_payload);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      arrays: findArrays(p),
      detailsType: typeof p.details,
      details: p.details,
      notes: p.notes,
      customFields: p.customFields,
      workerName: p.workerName,
      equipmentUnit: p.equipmentUnit,
      lockTagId: p.lockTagId,
    };
  });

  // Also check whether procedures have matching titles we could link
  const [procMatch] = await sql`
    select
      (select count(*)::int from industrial_loto_procedures where tenant_id=${tenant.id}::uuid and archived_at is null) as procedures,
      (select count(*)::int from industrial_loto_energy_sources where tenant_id=${tenant.id}::uuid) as energy,
      (select count(*)::int from industrial_loto_isolation_points where tenant_id=${tenant.id}::uuid) as isolation,
      (select count(*)::int from industrial_loto_steps where tenant_id=${tenant.id}::uuid) as steps,
      (select count(*)::int from industrial_loto_records where tenant_id=${tenant.id}::uuid and archived_at is null and procedure_id is not null) as lockouts_with_proc
  `;

  console.log(JSON.stringify({ summary: procMatch, samples: out }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
