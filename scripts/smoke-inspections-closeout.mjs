/**
 * Smoke: inspections No → CA → public close-out for producers-rice-mill.
 * Creates a throwaway inspection + finding, hits public closeout API, verifies COMPLETED.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const API_BASE = (process.env.API_BASE || "https://dygmtx4vxgy9i.cloudfront.net").replace(/\/$/, "");
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) throw new Error(`Refusing tenant ${TENANT_KEY}`);

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
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const [dept] = await sql`
      select id::text as id, name, contact_name, contact_personnel_id::text as contact_personnel_id
      from industrial_departments
      where tenant_id = ${tenant.id}::uuid and archived_at is null
      order by case when lower(name) like '%mill%' then 0 else 1 end, name
      limit 1
    `;
    if (!dept) throw new Error("No departments found");

    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inspectionId = randomUUID();
    const caId = randomUUID();
    const now = new Date();
    const title = `SMOKE ${now.toISOString().slice(0, 10)} ${dept.name}`;

    await sql`
      insert into industrial_inspections (
        id, tenant_id, department_id, title, status, inspection_type,
        source_system, source_payload, completed_at, created_at, updated_at
      ) values (
        ${inspectionId}::uuid, ${tenant.id}::uuid, ${dept.id}::uuid, ${title}, 'COMPLETED', 'AREA',
        'FORGE',
        ${sql.json({
          departmentId: dept.id,
          departmentName: dept.name,
          items: [
            {
              id: "smoke-1",
              label: "Smoke finding aisle clear",
              answer: "NO",
              notes: "Smoke test trip hazard",
              correctiveActionId: caId,
              closeoutUrl: `https://producersrice.forgepublicsafety.com/closeout/?token=${token}`,
            },
          ],
        })},
        ${now}, ${now}, ${now}
      )
    `;

    await sql`
      insert into industrial_corrective_actions (
        id, tenant_id, parent_entity_type, parent_entity_id, title, description, finding,
        status, owner_name, closeout_token_hash, closeout_token_expires_at,
        source_system, source_payload, created_at, updated_at
      ) values (
        ${caId}::uuid, ${tenant.id}::uuid, 'INSPECTION', ${inspectionId}::uuid,
        ${`Inspection finding: Smoke finding aisle clear`},
        ${"Smoke test trip hazard"}, ${"Smoke test trip hazard"},
        'OPEN', ${dept.contact_name || "Smoke Owner"}, ${tokenHash},
        ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)},
        'FORGE',
        ${sql.json({ inspectionId, inspectionItemId: "smoke-1", photos: [] })},
        ${now}, ${now}
      )
    `;

    const getRes = await fetch(
      `${API_BASE}/api/v1/public/corrective-actions/closeout/${encodeURIComponent(token)}`,
    );
    const getJson = await getRes.json();
    if (!getRes.ok) {
      throw new Error(`GET closeout failed: ${getRes.status} ${JSON.stringify(getJson)}`);
    }

    const postRes = await fetch(
      `${API_BASE}/api/v1/public/corrective-actions/closeout/${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: "Corrected during smoke test",
          completedByName: "Smoke Runner",
        }),
      },
    );
    const postJson = await postRes.json();
    if (!postRes.ok) {
      throw new Error(`POST closeout failed: ${postRes.status} ${JSON.stringify(postJson)}`);
    }

    const [ca] = await sql`
      select status, evidence_notes, closeout_completed_by_name
      from industrial_corrective_actions where id = ${caId}::uuid
    `;

    const contactCount = await sql`
      select count(*)::int as n from industrial_departments
      where tenant_id = ${tenant.id}::uuid and contact_personnel_id is not null and archived_at is null
    `;

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantKey: TENANT_KEY,
          department: dept.name,
          departmentContact: dept.contact_name || null,
          departmentsWithContact: contactCount[0]?.n ?? 0,
          inspectionId,
          caId,
          getStatus: getJson?.data?.status ?? getJson?.status,
          postStatus: postJson?.data?.status ?? postJson?.status,
          dbStatus: ca?.status,
          evidenceNotes: ca?.evidence_notes,
          closeoutCompletedByName: ca?.closeout_completed_by_name,
          closeoutPage: `https://producersrice.forgepublicsafety.com/closeout/?token=${token}`,
        },
        null,
        2,
      ),
    );

    if (String(ca?.status).toUpperCase() !== "COMPLETED") {
      throw new Error(`Expected COMPLETED, got ${ca?.status}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
