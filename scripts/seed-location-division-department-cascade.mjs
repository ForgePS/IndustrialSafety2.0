/**
 * Seed Location → Division → Department links for producers-rice-mill
 * from scripts/data/location-division-department-cascade.json.
 *
 * Dry-run unless APPLY=1.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
const SOURCE_SYSTEM = "LOCATION_DIVISION_DEPARTMENT_CASCADE";
const SOURCE_COLLECTION = "location-division-department-cascade-2026-09-02";

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

function loadPayload() {
  const path = (process.env.CASCADE_JSON_PATH || "").trim();
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const inline = (process.env.CASCADE_JSON || "").trim();
  if (inline) return JSON.parse(inline);
  throw new Error("Set CASCADE_JSON_PATH or CASCADE_JSON");
}

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function norm(value) {
  return str(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bar\b/g, "")
    .replace(/\bms\b/g, "")
    .trim();
}

function siteKeyFromName(name) {
  return str(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function resolveSiteId(locationName, sites) {
  const exact = sites.find((s) => str(s.name).toLowerCase() === locationName.toLowerCase());
  if (exact) return exact.id;
  const soft = sites.find((s) => {
    const a = norm(s.name);
    const b = norm(locationName);
    return a === b || a.includes(b) || b.includes(a);
  });
  return soft?.id || null;
}

async function tableHasColumn(sql, table, column) {
  const rows = await sql`
    select 1 as ok
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
      and column_name = ${column}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const payload = loadPayload();
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const summary = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    hasDivisionColumn: false,
    sites: { created: 0, matched: 0, missing: [] },
    divisions: { before: 0, after: 0, added: 0 },
    departments: { created: 0, updated: 0, skipped: 0 },
    proposals: [],
  };

  try {
    const [tenant] = await sql`
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const tenantId = tenant.id;

    summary.hasDivisionColumn = await tableHasColumn(sql, "industrial_departments", "division_name");
    if (!summary.hasDivisionColumn) {
      throw new Error("industrial_departments.division_name missing — run migration 0071 first");
    }

    const locations = Array.isArray(payload.locations) ? payload.locations : [];
    const divisionsIn = Array.isArray(payload.divisions) ? payload.divisions : [];
    const departmentsIn = Array.isArray(payload.departments) ? payload.departments : [];

    let sites = await sql`
      select id::text as id, name, site_key, archived_at
      from industrial_sites
      where tenant_id = ${tenantId}::uuid
    `;

    for (const loc of locations) {
      const name = str(loc.name);
      if (!name) continue;
      let siteId = resolveSiteId(name, sites);
      if (siteId) {
        summary.sites.matched += 1;
        continue;
      }
      summary.proposals.push({ kind: "site", name, action: "create" });
      if (!APPLY) {
        summary.sites.created += 1;
        continue;
      }
      const id = randomUUID();
      const siteKey = siteKeyFromName(name);
      await sql`
        insert into industrial_sites (
          id, tenant_id, name, site_key, status, source_system, source_collection, source_document_id,
          created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${name}, ${siteKey}, 'ACTIVE',
          ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION}, ${`site:${siteKey}`},
          now(), now()
        )
      `;
      summary.sites.created += 1;
    }

    sites = await sql`
      select id::text as id, name, site_key, archived_at
      from industrial_sites
      where tenant_id = ${tenantId}::uuid
    `;

    const siteIdByLocation = new Map();
    for (const loc of locations) {
      const name = str(loc.name);
      const id = resolveSiteId(name, sites);
      if (id) siteIdByLocation.set(name.toLowerCase(), id);
      else summary.sites.missing.push(name);
    }

    const [divisionSetting] = await sql`
      select id::text as id, value_json
      from tenant_settings
      where tenant_id = ${tenantId}::uuid
        and namespace = 'industrial'
        and setting_key = 'personnel.divisions'
      limit 1
    `;
    const current = Array.isArray(divisionSetting?.value_json) ? divisionSetting.value_json : [];
    const entries = [];
    for (const item of current) {
      if (typeof item === "string" && item.trim()) {
        entries.push({ name: item.trim(), siteId: null });
      } else if (item && typeof item === "object") {
        const name = str(item.name);
        if (!name) continue;
        entries.push({
          name,
          siteId: typeof item.siteId === "string" && item.siteId.trim() ? item.siteId.trim() : null,
        });
      }
    }
    summary.divisions.before = entries.length;
    const byKey = new Map(entries.map((e) => [`${e.siteId ?? ""}::${e.name.toLowerCase()}`, e]));
    for (const row of divisionsIn) {
      const name = str(row.name);
      const location = str(row.location);
      if (!name || !location) continue;
      const siteId = siteIdByLocation.get(location.toLowerCase()) || null;
      if (!siteId) continue;
      const key = `${siteId}::${name.toLowerCase()}`;
      if (!byKey.has(key)) {
        byKey.set(key, { name, siteId });
        summary.divisions.added += 1;
        summary.proposals.push({ kind: "division", location, name, siteId, action: "add" });
      }
    }
    const nextDivisions = [...byKey.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || (a.siteId ?? "").localeCompare(b.siteId ?? ""),
    );
    summary.divisions.after = nextDivisions.length;

    const existingDepts = await sql`
      select id::text as id, name, site_id::text as site_id, division_name, archived_at
      from industrial_departments
      where tenant_id = ${tenantId}::uuid
    `;

    for (const dept of departmentsIn) {
      const location = str(dept.location);
      const division = str(dept.division);
      const name = str(dept.department);
      if (!location || !division || !name) continue;
      const siteId = siteIdByLocation.get(location.toLowerCase()) || null;
      if (!siteId) {
        summary.departments.skipped += 1;
        continue;
      }

      const match =
        existingDepts.find(
          (d) =>
            !d.archived_at &&
            d.site_id === siteId &&
            str(d.name).toLowerCase() === name.toLowerCase() &&
            str(d.division_name).toLowerCase() === division.toLowerCase(),
        ) ||
        existingDepts.find(
          (d) =>
            !d.archived_at &&
            d.site_id === siteId &&
            str(d.name).toLowerCase() === name.toLowerCase() &&
            !str(d.division_name),
        ) ||
        null;

      summary.proposals.push({
        kind: "department",
        location,
        division,
        name,
        siteId,
        action: match ? "update" : "create",
      });

      if (!APPLY) {
        if (match) summary.departments.updated += 1;
        else summary.departments.created += 1;
        continue;
      }

      const payload = {
        importSource: SOURCE_COLLECTION,
        location,
        division,
      };

      if (match) {
        await sql`
          update industrial_departments set
            name = ${name},
            site_id = ${siteId}::uuid,
            division_name = ${division},
            status = 'ACTIVE',
            archived_at = null,
            source_system = ${SOURCE_SYSTEM},
            source_collection = ${SOURCE_COLLECTION},
            source_document_id = ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(division)}:${siteKeyFromName(name)}`},
            source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json(payload)},
            updated_at = now()
          where id = ${match.id}::uuid
        `;
        match.division_name = division;
        summary.departments.updated += 1;
      } else {
        const id = randomUUID();
        await sql`
          insert into industrial_departments (
            id, tenant_id, site_id, name, division_name, status,
            source_system, source_collection, source_document_id, source_payload,
            created_at, updated_at
          ) values (
            ${id}::uuid, ${tenantId}::uuid, ${siteId}::uuid, ${name}, ${division}, 'ACTIVE',
            ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION},
            ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(division)}:${siteKeyFromName(name)}`},
            ${sql.json(payload)},
            now(), now()
          )
        `;
        existingDepts.push({
          id,
          name,
          site_id: siteId,
          division_name: division,
          archived_at: null,
        });
        summary.departments.created += 1;
      }
    }

    if (APPLY) {
      if (divisionSetting) {
        await sql`
          update tenant_settings set
            value_json = ${sql.json(nextDivisions)},
            record_version = coalesce(record_version, 0) + 1,
            updated_at = now()
          where id = ${divisionSetting.id}::uuid
        `;
      } else {
        await sql`
          insert into tenant_settings (
            id, tenant_id, namespace, setting_key, value_json, schema_version, is_sensitive, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, 'industrial', 'personnel.divisions',
            ${sql.json(nextDivisions)}, 1, false, now(), now()
          )
        `;
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
