/**
 * Seed Safety Supplies storage locations for producers-rice-mill from
 * industrial_sites (plant Locations). Also reports division / department
 * catalog counts so org filters are available.
 *
 * Creates one ACTIVE SUPPLY_ROOM per site when missing (matched by site_id or code).
 * Dry-run unless APPLY=1.
 *
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-safety-supplies-org-locations.mjs
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

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

function siteCode(name, siteKey) {
  const fromKey = String(siteKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (fromKey) return fromKey;
  return String(name || "SITE")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const summary = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    sites: 0,
    supplyLocationsExisting: 0,
    supplyLocationsCreated: 0,
    supplyLocationsLinked: 0,
    skipped: [],
    created: [],
    divisions: 0,
    departments: 0,
  };

  try {
    const [tenant] = await sql`
      select id::text as id
      from tenants
      where tenant_key = ${TENANT_KEY} and archived_at is null
      limit 1
    `;
    if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const tenantId = tenant.id;

    const sites = await sql`
      select id::text as id, name, site_key, status
      from industrial_sites
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
      order by name
    `;
    summary.sites = sites.length;

    const existing = await sql`
      select id::text as id, code, name, site_id::text as site_id
      from industrial_supply_locations
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;
    summary.supplyLocationsExisting = existing.length;

    const bySiteId = new Map(existing.filter((r) => r.site_id).map((r) => [r.site_id, r]));
    const byCode = new Map(existing.map((r) => [String(r.code || "").toUpperCase(), r]));

    for (const site of sites) {
      if (/^prm/i.test(String(site.name || "").trim())) {
        summary.skipped.push({ site: site.name, reason: "prm_prefix" });
        continue;
      }
      const code = siteCode(site.name, site.site_key);
      const already = bySiteId.get(site.id) || byCode.get(code);
      if (already) {
        if (!already.site_id && APPLY) {
          await sql`
            update industrial_supply_locations
            set site_id = ${site.id}::uuid,
                updated_at = now()
            where id = ${already.id}::uuid
              and tenant_id = ${tenantId}::uuid
          `;
          summary.supplyLocationsLinked += 1;
          summary.created.push({
            action: "linked",
            site: site.name,
            code: already.code,
            locationId: already.id,
          });
        } else {
          summary.skipped.push({ site: site.name, code: already.code, reason: "exists" });
        }
        continue;
      }

      const id = randomUUID();
      const name = `${site.name} Supply Room`;
      if (APPLY) {
        await sql`
          insert into industrial_supply_locations (
            id, tenant_id, site_id, location_type, code, name, status, path, created_at, updated_at
          ) values (
            ${id}::uuid,
            ${tenantId}::uuid,
            ${site.id}::uuid,
            'SUPPLY_ROOM',
            ${code},
            ${name},
            'ACTIVE',
            ${`/${code}`},
            now(),
            now()
          )
        `;
      }
      summary.supplyLocationsCreated += 1;
      summary.created.push({
        action: APPLY ? "created" : "would_create",
        site: site.name,
        code,
        name,
        locationId: id,
      });
    }

    const [divSetting] = await sql`
      select value_json
      from tenant_settings
      where tenant_id = ${tenantId}::uuid
        and namespace = 'industrial'
        and setting_key = 'personnel.divisions'
      limit 1
    `;
    const divRaw = divSetting?.value_json;
    summary.divisions = Array.isArray(divRaw) ? divRaw.length : 0;

    const [deptCount] = await sql`
      select count(*)::int as total
      from industrial_departments
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
    `;
    summary.departments = deptCount?.total ?? 0;

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
