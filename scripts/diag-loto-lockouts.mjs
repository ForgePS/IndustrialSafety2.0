/**
 * Read-only: LOTO lockout record counts + sample source_payload for producers.
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

const sql = postgres(
  await (async () => {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.DATABASE_SECRET_ARN }),
    );
    const raw = JSON.parse(res.SecretString);
    return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${raw.host ?? raw.hostname}:${raw.port ?? 5432}/${raw.dbname ?? raw.database}`;
  })(),
  { max: 1 },
);

try {
  const [tenant] =
    await sql`select id::text as id from tenants where tenant_key='producers-rice-mill'`;
  const [counts] = await sql`
    select
      count(*)::int as total,
      count(*) filter (where archived_at is null)::int as active,
      count(*) filter (where status ilike 'ISSUED')::int as issued,
      count(*) filter (where status ilike 'VERIFIED')::int as verified,
      count(*) filter (where status ilike 'OPEN')::int as open,
      count(*) filter (where status ilike 'CLOSED')::int as closed,
      count(*) filter (where procedure_id is null)::int as no_procedure
    from industrial_loto_records
    where tenant_id = ${tenant.id}::uuid
  `;
  const statusRows = await sql`
    select coalesce(status,'(null)') as status, count(*)::int as c
    from industrial_loto_records
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    group by 1 order by c desc
  `;
  const samples = await sql`
    select id::text as id, title, status, procedure_id::text as procedure_id,
           source_document_id, source_collection, source_payload
    from industrial_loto_records
    where tenant_id = ${tenant.id}::uuid and archived_at is null
    order by updated_at desc
    limit 5
  `;
  const out = {
    counts,
    statuses: statusRows,
    samples: samples.map((row) => {
      const p = unwrap(row.source_payload);
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        procedureId: row.procedure_id,
        sourceDocumentId: row.source_document_id,
        sourceCollection: row.source_collection,
        payloadKeys: Object.keys(p).slice(0, 50),
        hasAppliedLocks:
          Array.isArray(p.appliedLocks) || Array.isArray(p.lockItems) || Array.isArray(p.items),
        appliedLocksLen: Array.isArray(p.appliedLocks)
          ? p.appliedLocks.length
          : Array.isArray(p.lockItems)
            ? p.lockItems.length
            : Array.isArray(p.items)
              ? p.items.length
              : 0,
        sampleItem: Array.isArray(p.appliedLocks)
          ? p.appliedLocks[0]
          : Array.isArray(p.lockItems)
            ? p.lockItems[0]
            : Array.isArray(p.items)
              ? p.items[0]
              : Array.isArray(p.steps)
                ? p.steps[0]
                : null,
        authorizedEmployee: p.authorizedEmployee ?? p.authorizedEmployeeName ?? null,
        lockTagId: p.lockTagId ?? p.lockNumber ?? null,
      };
    }),
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
