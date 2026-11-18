/**
 * Recently completed inspections (sanitation + inspections module), and
 * soft-delete of one inspection with its findings and corrective actions.
 *
 *   MODE=list   TENANT_KEY=producers-rice-mill SINCE_HOURS=12
 *   MODE=delete KIND=sanitation|inspection INSPECTION_ID=<uuid> APPLY=1
 *
 * Delete mirrors the app's soft delete (archived_at + status DELETED); rows stay
 * in the database. Without APPLY=1 delete only reports what it would change.
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

const MODE = (process.env.MODE || "list").trim();
const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const SINCE_HOURS = Math.min(Math.max(Number(process.env.SINCE_HOURS || 12), 1), 168);
const KIND = (process.env.KIND || "").trim();
const INSPECTION_ID = (process.env.INSPECTION_ID || "").trim();
const APPLY = process.env.APPLY === "1";

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
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
  `;
  if (!tenant) throw new Error(`tenant ${TENANT_KEY} not found`);

  if (MODE === "list") {
    const sanitation = await sql`
      select i.id::text as id, i.inspection_number, i.title, i.status, i.compliance_status,
             i.score_percent, i.completed_at, i.updated_at,
             coalesce(cu.primary_email, uu.primary_email) as completed_by,
             (select count(*) from industrial_sanitation_findings f
               where f.inspection_id = i.id and f.archived_at is null) as open_findings
      from industrial_sanitation_inspections i
      left join users cu on cu.id = i.inspector_user_id
      left join users uu on uu.id = i.updated_by_user_id
      where i.tenant_id = ${tenant.id}::uuid
        and i.archived_at is null
        and (i.completed_at > now() - make_interval(hours => ${SINCE_HOURS})
             or i.updated_at > now() - make_interval(hours => ${SINCE_HOURS}))
      order by coalesce(i.completed_at, i.updated_at) desc
      limit 25
    `;
    const inspections = await sql`
      select id::text as id, title, status, inspection_type, completed_at, updated_at
      from industrial_inspections
      where tenant_id = ${tenant.id}::uuid
        and archived_at is null
        and (completed_at > now() - make_interval(hours => ${SINCE_HOURS})
             or updated_at > now() - make_interval(hours => ${SINCE_HOURS}))
      order by coalesce(completed_at, updated_at) desc
      limit 25
    `;
    console.log(
      JSON.stringify({ mode: MODE, sinceHours: SINCE_HOURS, sanitation, inspections }, null, 2),
    );
  } else if (MODE === "delete") {
    if (!/^[0-9a-f-]{36}$/i.test(INSPECTION_ID)) throw new Error("INSPECTION_ID required");
    if (KIND !== "sanitation" && KIND !== "inspection")
      throw new Error("KIND must be sanitation or inspection");
    const report = { mode: MODE, kind: KIND, apply: APPLY, inspectionId: INSPECTION_ID };

    await sql.begin(async (tx) => {
      if (KIND === "sanitation") {
        const [row] = await tx`
          select id::text as id, inspection_number, title, status, completed_at
          from industrial_sanitation_inspections
          where id = ${INSPECTION_ID}::uuid and tenant_id = ${tenant.id}::uuid and archived_at is null
        `;
        if (!row) throw new Error("inspection not found (or already deleted)");
        report.inspection = row;
        const findings = await tx`
          select id::text as id, finding_number, corrective_action_id::text as corrective_action_id
          from industrial_sanitation_findings
          where inspection_id = ${INSPECTION_ID}::uuid and archived_at is null
        `;
        report.findings = findings;
        const findingIds = findings.map((f) => f.id);
        const actions = findingIds.length
          ? await tx`
              select id::text as id, title, status from industrial_corrective_actions
              where tenant_id = ${tenant.id}::uuid and archived_at is null
                and parent_entity_type = 'SANITATION_FINDING'
                and parent_entity_id = any(${findingIds}::uuid[])
            `
          : [];
        report.correctiveActions = actions;
        if (APPLY) {
          await tx`
            update industrial_sanitation_inspections
            set archived_at = now(), status = 'DELETED', updated_at = now()
            where id = ${INSPECTION_ID}::uuid
          `;
          if (findingIds.length) {
            await tx`
              update industrial_sanitation_findings set archived_at = now(), updated_at = now()
              where id = any(${findingIds}::uuid[])
            `;
          }
          if (actions.length) {
            await tx`
              update industrial_corrective_actions set archived_at = now(), updated_at = now()
              where id = any(${actions.map((a) => a.id)}::uuid[])
            `;
          }
        }
      } else {
        const [row] = await tx`
          select id::text as id, title, status, completed_at from industrial_inspections
          where id = ${INSPECTION_ID}::uuid and tenant_id = ${tenant.id}::uuid and archived_at is null
        `;
        if (!row) throw new Error("inspection not found (or already deleted)");
        report.inspection = row;
        const actions = await tx`
          select id::text as id, title, status from industrial_corrective_actions
          where tenant_id = ${tenant.id}::uuid and archived_at is null
            and parent_entity_type = 'INSPECTION' and parent_entity_id = ${INSPECTION_ID}::uuid
        `;
        report.correctiveActions = actions;
        if (APPLY) {
          await tx`
            update industrial_inspections set archived_at = now(), status = 'DELETED', updated_at = now()
            where id = ${INSPECTION_ID}::uuid
          `;
          if (actions.length) {
            await tx`
              update industrial_corrective_actions set archived_at = now(), updated_at = now()
              where id = any(${actions.map((a) => a.id)}::uuid[])
            `;
          }
        }
      }
    });
    console.log(JSON.stringify(report, null, 2));
  } else {
    throw new Error(`unknown MODE ${MODE}`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
