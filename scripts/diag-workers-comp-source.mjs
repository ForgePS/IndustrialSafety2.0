/**
 * Diagnose WC cases for producers-rice-mill (read-only).
 *
 *   TENANT_KEY=producers-rice-mill node scripts/diag-workers-comp-source.mjs
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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const counts = await sql`
      select
        count(*)::int as total,
        count(*) filter (where case_number is not null and case_number <> '')::int as with_case_number,
        count(*) filter (where claim_summary ? 'claimNumber' and coalesce(claim_summary->>'claimNumber','') <> '')::int as with_claim_number_in_summary,
        count(*) filter (where source_document_id is not null)::int as with_source_doc,
        count(*) filter (where source_payload ? 'employee')::int as with_employee_obj,
        count(*) filter (where source_payload ? 'claim')::int as with_claim_obj,
        count(*) filter (where source_payload ? 'intake')::int as with_intake_obj,
        count(*) filter (where source_payload ? 'nextAction')::int as with_next_action,
        count(*) filter (where personnel_id is not null)::int as with_personnel_fk,
        count(*) filter (where archived_at is null)::int as active
      from industrial_workers_comp_cases
      where tenant_id = ${tenant.id}::uuid
    `;

    const samples = await sql`
      select
        id::text as id,
        case_number,
        status,
        severity,
        workflow_stage,
        personnel_id::text as personnel_id,
        claim_summary,
        source_collection,
        source_document_id,
        source_payload->'employee'->>'employeeName' as employee_name,
        source_payload->'claim'->>'claimNumber' as source_claim_number,
        source_payload->>'caseNumber' as payload_case_number,
        source_payload->'nextAction' as next_action,
        left(coalesce(source_payload::text, ''), 200) as payload_prefix
      from industrial_workers_comp_cases
      where tenant_id = ${tenant.id}::uuid
      order by updated_at desc
      limit 5
    `;

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          counts: counts[0],
          samples,
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
