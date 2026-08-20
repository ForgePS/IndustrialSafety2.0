/**
 * READ-ONLY: summarize company / setup data for producers-rice-mill.
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
    const tenant = await sql`
      select id::text, tenant_key, slug, display_name, legal_name, status, timezone, default_locale
      from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenant[0].id;

    const orgs = await sql`
      select id::text, slug, display_name, legal_name, status
      from organizations where tenant_id = ${tenantId}::uuid order by created_at
    `;
    const branding = await sql`
      select display_name, short_name, primary_color, support_email, contact_phone, contact_name
      from tenant_branding where tenant_id = ${tenantId}::uuid limit 1
    `;
    const settings = await sql`
      select namespace, setting_key, value_json
      from tenant_settings where tenant_id = ${tenantId}::uuid
      order by namespace, setting_key
    `;
    const facilities = await sql`
      select facility_key, name, city, state_province, status from facilities
      where tenant_id = ${tenantId}::uuid order by name
    `;
    const sites = await sql`
      select name, status from industrial_sites where tenant_id = ${tenantId}::uuid order by name limit 20
    `;
    const deptCount = await sql`select count(*)::int as n from industrial_departments where tenant_id = ${tenantId}::uuid`;
    const posCount = await sql`select count(*)::int as n from industrial_positions where tenant_id = ${tenantId}::uuid`;
    const empTypeCount = await sql`select count(*)::int as n from industrial_employment_types where tenant_id = ${tenantId}::uuid`;
    const personnelCompany = await sql`
      select
        count(*) filter (where company_name is not null and trim(company_name) <> '')::int as with_company_name,
        count(*) filter (where company_phone is not null and trim(company_phone) <> '')::int as with_company_phone,
        count(*) filter (where company_email is not null and trim(company_email) <> '')::int as with_company_email,
        count(*)::int as total
      from industrial_personnel where tenant_id = ${tenantId}::uuid and archived_at is null
    `;
    const distinctDepts = await sql`
      select distinct trim(department_name) as name from industrial_personnel
      where tenant_id = ${tenantId}::uuid and department_name is not null and trim(department_name) <> ''
      order by 1 limit 30
    `;
    const distinctPositions = await sql`
      select distinct trim(job_title) as name from industrial_personnel
      where tenant_id = ${tenantId}::uuid and job_title is not null and trim(job_title) <> ''
      order by 1 limit 30
    `;
    const domains = await sql`
      select domain, verification_status from tenant_domains where tenant_id = ${tenantId}::uuid order by domain
    `;

    console.log(
      JSON.stringify(
        {
          tenant: tenant[0],
          organizations: orgs,
          branding: branding[0] ?? null,
          settingsCount: settings.length,
          settings: settings.slice(0, 20),
          facilities,
          sites,
          departments: deptCount[0]?.n ?? 0,
          positions: posCount[0]?.n ?? 0,
          employmentTypes: empTypeCount[0]?.n ?? 0,
          personnelCompany: personnelCompany[0],
          sampleDepartmentsFromPersonnel: distinctDepts.map((r) => r.name),
          samplePositionsFromPersonnel: distinctPositions.map((r) => r.name),
          domains,
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
