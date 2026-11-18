/**
 * READ-ONLY: recent industrial print batches with job status counts and failure details.
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const batches = await sql`
      select b.id::text, t.tenant_key, b.print_mode, b.stop_on_fail, b.total_jobs,
             b.completed_jobs, b.failed_jobs, b.status, b.created_at, b.completed_at
      from industrial_print_batches b
      join tenants t on t.id = b.tenant_id
      where b.created_at > now() - interval '3 days'
      order by b.created_at desc
      limit 8
    `;
    const out = [];
    for (const b of batches) {
      const counts = await sql`
        select status, count(*)::int as n
        from industrial_print_jobs where batch_id = ${b.id}::uuid
        group by status
      `;
      const problems = await sql`
        select id::text, status, error_code, error_message, created_at, completed_at, failed_at,
               artifact_storage_key is not null as has_artifact
        from industrial_print_jobs
        where batch_id = ${b.id}::uuid and status not in ('COMPLETED')
        order by created_at asc
        limit 5
      `;
      const timing = await sql`
        select min(completed_at) as first_done, max(completed_at) as last_done,
               count(*) filter (where artifact_storage_key is not null)::int as with_artifact
        from industrial_print_jobs where batch_id = ${b.id}::uuid
      `;
      const printerTrail = await sql`
        select e.created_at, e.status, e.metadata_json
        from industrial_print_job_events e
        join industrial_print_jobs j on j.id = e.print_job_id
        where j.batch_id = ${b.id}::uuid and e.metadata_json ? 'printer'
        order by e.created_at asc
      `;
      const compact = printerTrail.map((row) => {
        const m = row.metadata_json ?? {};
        const p = m.printer ?? {};
        return [
          m.label,
          new Date(row.created_at).toISOString().slice(11, 19),
          `upd=${m.printerUpdatesPrevLabel ?? "-"}`,
          `sup=${p.supplyRemainingPct ?? "-"}`,
          `rib=${p.ribbonRemainingPct ?? "-"}`,
          p.status ?? "-",
          p.severity ?? "",
          p.text ?? "",
          (m.printerUpdateKeys ?? []).join(","),
        ].join(" ");
      });
      out.push({ batch: b, counts, timing: timing[0], problems, printerTrail: compact });
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
