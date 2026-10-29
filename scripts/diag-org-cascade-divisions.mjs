/**
 * Diagnose PRM division catalog vs sites for cascade filtering.
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

const TENANT_KEY = "producers-rice-mill";
const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const [tenant] = await sql`
    select id::text as id from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
  `;
  const tenantId = tenant.id;
  const sites = await sql`
    select id::text as id, name, archived_at
    from industrial_sites
    where tenant_id = ${tenantId}::uuid
    order by name
  `;
  const [setting] = await sql`
    select value_json
    from tenant_settings
    where tenant_id = ${tenantId}::uuid
      and namespace = 'industrial'
      and setting_key = 'personnel.divisions'
    limit 1
  `;
  const raw = setting?.value_json;
  const sample = Array.isArray(raw) ? raw.slice(0, 8) : raw;
  const entries = Array.isArray(raw) ? raw : [];
  const withSite = entries.filter((e) => e && typeof e === "object" && e.siteId).length;
  const withoutSite = entries.length - withSite;
  const stringOnly = entries.filter((e) => typeof e === "string").length;
  const siteIds = new Set(sites.map((s) => s.id));
  const orphanSiteIds = [
    ...new Set(
      entries
        .filter((e) => e && typeof e === "object" && e.siteId && !siteIds.has(e.siteId))
        .map((e) => e.siteId),
    ),
  ];
  const stuttgart = sites.find((s) => String(s.name).toLowerCase().includes("stuttgart"));
  const forStuttgart = stuttgart
    ? entries.filter((e) => e && typeof e === "object" && e.siteId === stuttgart.id)
    : [];
  const depts = await sql`
    select count(*)::int as total,
           count(division_name)::int as with_division,
           count(site_id)::int as with_site
    from industrial_departments
    where tenant_id = ${tenantId}::uuid and archived_at is null
  `;
  console.log(
    JSON.stringify(
      {
        sites: sites.map((s) => ({ id: s.id, name: s.name, archived: Boolean(s.archived_at) })),
        divisionCatalog: {
          total: entries.length,
          withSite,
          withoutSite,
          stringOnly,
          orphanSiteIds,
          sample,
        },
        stuttgart: stuttgart
          ? {
              id: stuttgart.id,
              name: stuttgart.name,
              divisionCount: forStuttgart.length,
              divisions: forStuttgart.slice(0, 20),
            }
          : null,
        departments: depts[0],
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
