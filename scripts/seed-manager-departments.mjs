/**
 * Seed Company / Locations (sites) / Departments for producers-rice-mill
 * from Manager-Departments spreadsheet JSON.
 *
 * Expects MANAGER_DEPARTMENTS_JSON_PATH or MANAGER_DEPARTMENTS_JSON.
 * Dry-run unless APPLY=1.
 *
 * Mapping:
 *   - company        → organizations + tenant branding (fill missing only)
 *   - locations      → industrial_sites (+ facilities with address when present)
 *   - divisions      → tenant_settings industrial/personnel.divisions (union)
 *   - departments    → industrial_departments linked to location site
 *   - manager/phones → contact_name + source_payload (office/cell/address/reportsTo)
 *   - blank fields   → left null for later manual fill
 *   - as400Mappings  → tenant_settings industrial/integrations.as400.departmentMap
 *                      + industrial_departments.source_payload.as400Names
 *
 * Refresh: when the spreadsheet has a manager/phone/email, overwrite prior
 * contact fields from this source (still leave blank sheet cells alone).
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
const SOURCE_SYSTEM = "MANAGER_DEPARTMENTS_XLSX";
const SOURCE_COLLECTION = "manager-departments-2026-09-02";

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
  const path = (process.env.MANAGER_DEPARTMENTS_JSON_PATH || "").trim();
  if (path) return JSON.parse(readFileSync(path, "utf8"));
  const inline = (process.env.MANAGER_DEPARTMENTS_JSON || "").trim();
  if (inline) return JSON.parse(inline);
  throw new Error("Set MANAGER_DEPARTMENTS_JSON_PATH or MANAGER_DEPARTMENTS_JSON");
}

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function siteKeyFromName(name) {
  return str(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function facilityKeyFromName(name) {
  const key = siteKeyFromName(name);
  return key ? `prm-${key}` : `prm-${randomUUID().slice(0, 8)}`;
}

function normalizePerson(name) {
  return str(name)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .trim();
}

function scorePersonMatch(personName, targetName) {
  const a = normalizePerson(personName);
  const b = normalizePerson(targetName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  if (aParts.length >= 2 && bParts.length >= 2) {
    const aFirst = aParts[0];
    const aLast = aParts[aParts.length - 1];
    const bFirst = bParts[0];
    const bLast = bParts[bParts.length - 1];
    if (aLast === bLast && aFirst === bFirst) return 95;
    if (aLast === bLast && aFirst[0] === bFirst[0]) return 80;
    if (aLast === bLast) return 60;
  }
  if (a.includes(b) || b.includes(a)) return 50;
  return 0;
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
    company: { organizationUpdated: false, organizationCreated: false, brandingUpdated: false },
    sites: { created: 0, updated: 0, skipped: 0 },
    facilities: { created: 0, updated: 0, skipped: 0 },
    divisions: { before: 0, after: 0, added: [] },
    departments: {
      created: 0,
      updated: 0,
      skipped: 0,
      contactsLinked: 0,
      contactsNameOnly: 0,
      contactsRefreshed: 0,
      leftBlankManager: 0,
      leftBlankAddress: 0,
    },
    as400: {
      mappingsIn: 0,
      departmentsMatched: 0,
      aliasesAttached: 0,
      unmatchedForge: [],
      settingUpserted: false,
    },
    proposals: [],
  };

  try {
    const [tenant] = await sql`
      select id::text as id, display_name, legal_name
      from tenants where tenant_key = ${TENANT_KEY} and archived_at is null limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);
    const tenantId = tenant.id;

    const siteHasAddress = await tableHasColumn(sql, "industrial_sites", "address_line_1");
    const [orgType] = await sql`
      select id::text as id from organization_types where code = 'SAFETY_COMPANY' limit 1
    `;

    const company = payload.company || {};
    const locations = Array.isArray(payload.locations) ? payload.locations : [];
    const divisionsIn = Array.isArray(payload.divisions)
      ? payload.divisions.map(str).filter(Boolean)
      : [];
    const departmentsIn = Array.isArray(payload.departments) ? payload.departments : [];
    const as400Mappings = Array.isArray(payload.as400Mappings) ? payload.as400Mappings : [];
    summary.as400.mappingsIn = as400Mappings.length;
    const deptHasDivisionName = await tableHasColumn(
      sql,
      "industrial_departments",
      "division_name",
    );

    const existingSites = await sql`
      select id::text as id, name, site_key, status, archived_at
      from industrial_sites
      where tenant_id = ${tenantId}::uuid
    `;
    const sitesByName = new Map(existingSites.map((s) => [str(s.name).toLowerCase(), s]));
    const sitesByKey = new Map(
      existingSites.filter((s) => s.site_key).map((s) => [str(s.site_key).toLowerCase(), s]),
    );

    const existingDepts = await sql`
      select id::text as id, name, site_id::text as site_id, contact_name, contact_personnel_id::text as contact_personnel_id,
             contact_email, source_payload, archived_at, status
      from industrial_departments
      where tenant_id = ${tenantId}::uuid
    `;
    const deptsByName = new Map();
    for (const d of existingDepts) {
      const key = str(d.name).toLowerCase();
      if (!deptsByName.has(key)) deptsByName.set(key, []);
      deptsByName.get(key).push(d);
    }

    const people = await sql`
      select id::text as id, display_name, email, company_email, phone, company_phone
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
        and coalesce(status, 'ACTIVE') not in ('TERMINATED', 'INACTIVE', 'ARCHIVED')
    `;

    const [divisionSetting] = await sql`
      select id::text as id, value_json
      from tenant_settings
      where tenant_id = ${tenantId}::uuid
        and namespace = 'industrial'
        and setting_key = 'personnel.divisions'
      limit 1
    `;
    const currentDivisions = Array.isArray(divisionSetting?.value_json)
      ? divisionSetting.value_json.map(str).filter(Boolean)
      : [];
    summary.divisions.before = currentDivisions.length;
    const divisionSet = new Map(currentDivisions.map((d) => [d.toLowerCase(), d]));
    for (const d of divisionsIn) {
      if (!divisionSet.has(d.toLowerCase())) {
        divisionSet.set(d.toLowerCase(), d);
        summary.divisions.added.push(d);
      }
    }
    const nextDivisions = [...divisionSet.values()].sort((a, b) => a.localeCompare(b));
    summary.divisions.after = nextDivisions.length;

    const siteIdByLocation = new Map();

    for (const loc of locations) {
      const name = str(loc.name);
      if (!name) continue;
      const key = siteKeyFromName(name);
      const parts = loc.addressParts || {};
      const existing =
        sitesByName.get(name.toLowerCase()) || (key ? sitesByKey.get(key.toLowerCase()) : null);
      const proposal = {
        kind: "site",
        name,
        siteKey: key,
        address: loc.address || null,
        action: existing ? "update" : "create",
        existingId: existing?.id || null,
      };
      summary.proposals.push(proposal);

      if (!APPLY) {
        if (existing) summary.sites.skipped += 1;
        else summary.sites.created += 1;
        siteIdByLocation.set(name.toLowerCase(), existing?.id || `dry-${key}`);
        continue;
      }

      if (existing) {
        if (siteHasAddress && loc.address) {
          await sql`
            update industrial_sites set
              name = ${name},
              site_key = coalesce(site_key, ${key}),
              status = 'ACTIVE',
              archived_at = null,
              address_line_1 = coalesce(nullif(address_line_1, ''), ${parts.addressLine1 || null}),
              address_line_2 = coalesce(address_line_2, ${parts.addressLine2 || null}),
              city = coalesce(nullif(city, ''), ${parts.city || null}),
              state_province = coalesce(nullif(state_province, ''), ${parts.stateProvince || null}),
              postal_code = coalesce(nullif(postal_code, ''), ${parts.postalCode || null}),
              country_code = coalesce(nullif(country_code, ''), ${parts.countryCode || "US"}),
              source_system = ${SOURCE_SYSTEM},
              source_collection = ${SOURCE_COLLECTION},
              source_document_id = ${`location:${key}`},
              source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json({
                location: name,
                addressRaw: loc.address || null,
                divisions: loc.divisions || [],
              })},
              updated_at = now()
            where id = ${existing.id}::uuid
          `;
        } else {
          await sql`
            update industrial_sites set
              name = ${name},
              site_key = coalesce(site_key, ${key}),
              status = 'ACTIVE',
              archived_at = null,
              source_system = ${SOURCE_SYSTEM},
              source_collection = ${SOURCE_COLLECTION},
              source_document_id = ${`location:${key}`},
              source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json({
                location: name,
                addressRaw: loc.address || null,
                addressParts: parts,
                divisions: loc.divisions || [],
              })},
              updated_at = now()
            where id = ${existing.id}::uuid
          `;
        }
        summary.sites.updated += 1;
        siteIdByLocation.set(name.toLowerCase(), existing.id);
      } else {
        const id = randomUUID();
        if (siteHasAddress) {
          await sql`
            insert into industrial_sites (
              id, tenant_id, name, status, site_key, timezone,
              address_line_1, address_line_2, city, state_province, postal_code, country_code,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${id}::uuid, ${tenantId}::uuid, ${name}, 'ACTIVE', ${key}, ${company.timezone || "America/Chicago"},
              ${parts.addressLine1 || null}, ${parts.addressLine2 || null}, ${parts.city || null},
              ${parts.stateProvince || null}, ${parts.postalCode || null}, ${parts.countryCode || "US"},
              ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION}, ${`location:${key}`},
              ${sql.json({
                location: name,
                addressRaw: loc.address || null,
                divisions: loc.divisions || [],
              })},
              now(), now()
            )
          `;
        } else {
          await sql`
            insert into industrial_sites (
              id, tenant_id, name, status, site_key, timezone,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${id}::uuid, ${tenantId}::uuid, ${name}, 'ACTIVE', ${key}, ${company.timezone || "America/Chicago"},
              ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION}, ${`location:${key}`},
              ${sql.json({
                location: name,
                addressRaw: loc.address || null,
                addressParts: parts,
                divisions: loc.divisions || [],
              })},
              now(), now()
            )
          `;
        }
        summary.sites.created += 1;
        siteIdByLocation.set(name.toLowerCase(), id);
        sitesByName.set(name.toLowerCase(), { id, name, site_key: key });
      }

      // Mirror into facilities for company facility catalog.
      const fKey = facilityKeyFromName(name);
      const [facility] = await sql`
        select id::text as id from facilities
        where tenant_id = ${tenantId}::uuid and facility_key = ${fKey}
        limit 1
      `;
      const [orgRow] = await sql`
        select id::text as id from organizations
        where tenant_id = ${tenantId}::uuid and slug = ${company.slug || "producers-rice-mill"}
        limit 1
      `;
      if (facility) {
        await sql`
          update facilities set
            name = ${name},
            status = 'ACTIVE',
            address_line_1 = coalesce(nullif(address_line_1, ''), ${parts.addressLine1 || null}),
            city = coalesce(nullif(city, ''), ${parts.city || null}),
            state_province = coalesce(nullif(state_province, ''), ${parts.stateProvince || null}),
            postal_code = coalesce(nullif(postal_code, ''), ${parts.postalCode || null}),
            country_code = coalesce(nullif(country_code, ''), ${parts.countryCode || "US"}),
            timezone = coalesce(timezone, ${company.timezone || "America/Chicago"}),
            archived_at = null,
            updated_at = now()
          where id = ${facility.id}::uuid
        `;
        summary.facilities.updated += 1;
      } else if (loc.address || name) {
        await sql`
          insert into facilities (
            id, tenant_id, organization_id, facility_key, name, facility_type, status,
            address_line_1, city, state_province, postal_code, country_code, timezone,
            created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, ${orgRow?.id ?? null}::uuid, ${fKey},
            ${name}, 'SITE', 'ACTIVE',
            ${parts.addressLine1 || null}, ${parts.city || null}, ${parts.stateProvince || null},
            ${parts.postalCode || null}, ${parts.countryCode || "US"}, ${company.timezone || "America/Chicago"},
            now(), now()
          )
        `;
        summary.facilities.created += 1;
      }
    }

    for (const dept of departmentsIn) {
      const location = str(dept.location);
      const name = str(dept.department);
      if (!location || !name) continue;

      const siteId = siteIdByLocation.get(location.toLowerCase()) || null;
      const manager = str(dept.manager) || null;
      const officePhone = str(dept.officePhone) || null;
      const cellPhone = str(dept.cellPhone) || null;
      const address = str(dept.address) || null;
      const reportsTo = str(dept.reportsTo) || null;
      const division = str(dept.division) || null;

      if (!manager) summary.departments.leftBlankManager += 1;
      if (!address) summary.departments.leftBlankAddress += 1;

      let matchedPerson = null;
      if (manager) {
        let best = null;
        for (const p of people) {
          const score = scorePersonMatch(p.display_name, manager);
          if (score >= 80 && (!best || score > best.score)) {
            best = { person: p, score };
          }
        }
        matchedPerson = best?.person || null;
      }

      const candidates = deptsByName.get(name.toLowerCase()) || [];
      const multiLocationSameName =
        departmentsIn.filter((d) => str(d.department).toLowerCase() === name.toLowerCase()).length >
        1;
      // Never steal a same-named department already linked to a different site
      // (e.g. Parboil Mill at Stuttgart vs Greenville).
      let existing =
        candidates.find((d) => !d.archived_at && d.site_id && siteId && d.site_id === siteId) ||
        (!multiLocationSameName ? candidates.find((d) => !d.archived_at && !d.site_id) : null) ||
        null;

      const contactPayload = {
        importSource: SOURCE_COLLECTION,
        location,
        division,
        section: dept.section || null,
        siteArea: dept.siteArea || null,
        subArea: dept.subArea || null,
        addressRaw: address,
        addressParts: dept.addressParts || {},
        officePhone,
        cellPhone,
        reportsTo,
        divisionManager: dept.divisionManager || null,
        alternateContact: dept.alternateContact || null,
        excelRow: dept.excelRow || null,
      };

      const proposal = {
        kind: "department",
        location,
        name,
        manager,
        officePhone,
        cellPhone,
        address,
        siteId,
        action: existing ? "update" : "create",
        contactPersonnelId: matchedPerson?.id || null,
        contactName: manager,
      };
      summary.proposals.push(proposal);

      if (!APPLY) {
        if (existing) summary.departments.updated += 1;
        else summary.departments.created += 1;
        if (matchedPerson) summary.departments.contactsLinked += 1;
        else if (manager) summary.departments.contactsNameOnly += 1;
        if (existing && manager && existing.contact_name && existing.contact_name !== manager) {
          summary.departments.contactsRefreshed += 1;
        }
        continue;
      }

      if (existing) {
        // Refresh from sheet when present; keep prior value only if sheet blank.
        const nextContactName = manager || existing.contact_name || null;
        const nextContactPersonnelId = matchedPerson?.id || existing.contact_personnel_id || null;
        const nextContactEmail =
          matchedPerson?.email || matchedPerson?.company_email || existing.contact_email || null;
        if (manager && existing.contact_name && existing.contact_name !== manager) {
          summary.departments.contactsRefreshed += 1;
        }
        if (deptHasDivisionName) {
          await sql`
            update industrial_departments set
              name = ${name},
              site_id = coalesce(site_id, ${siteId}::uuid),
              division_name = coalesce(${division}, division_name),
              status = 'ACTIVE',
              archived_at = null,
              contact_name = ${nextContactName},
              contact_personnel_id = ${nextContactPersonnelId}::uuid,
              contact_email = ${nextContactEmail},
              source_system = ${SOURCE_SYSTEM},
              source_collection = ${SOURCE_COLLECTION},
              source_document_id = ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(name)}`},
              source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json(contactPayload)},
              updated_at = now()
            where id = ${existing.id}::uuid
          `;
        } else {
          await sql`
            update industrial_departments set
              name = ${name},
              site_id = coalesce(site_id, ${siteId}::uuid),
              status = 'ACTIVE',
              archived_at = null,
              contact_name = ${nextContactName},
              contact_personnel_id = ${nextContactPersonnelId}::uuid,
              contact_email = ${nextContactEmail},
              source_system = ${SOURCE_SYSTEM},
              source_collection = ${SOURCE_COLLECTION},
              source_document_id = ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(name)}`},
              source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json(contactPayload)},
              updated_at = now()
            where id = ${existing.id}::uuid
          `;
        }
        summary.departments.updated += 1;
        if (nextContactPersonnelId && !existing.contact_personnel_id) {
          summary.departments.contactsLinked += 1;
        } else if (nextContactName && !existing.contact_name) {
          summary.departments.contactsNameOnly += 1;
        }
      } else {
        const id = randomUUID();
        if (deptHasDivisionName) {
          await sql`
            insert into industrial_departments (
              id, tenant_id, site_id, name, division_name, status,
              contact_personnel_id, contact_name, contact_email,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${id}::uuid, ${tenantId}::uuid, ${siteId}::uuid, ${name}, ${division}, 'ACTIVE',
              ${matchedPerson?.id || null}::uuid, ${manager},
              ${matchedPerson?.email || matchedPerson?.company_email || null},
              ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION},
              ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(name)}`},
              ${sql.json(contactPayload)},
              now(), now()
            )
          `;
        } else {
          await sql`
            insert into industrial_departments (
              id, tenant_id, site_id, name, status,
              contact_personnel_id, contact_name, contact_email,
              source_system, source_collection, source_document_id, source_payload,
              created_at, updated_at
            ) values (
              ${id}::uuid, ${tenantId}::uuid, ${siteId}::uuid, ${name}, 'ACTIVE',
              ${matchedPerson?.id || null}::uuid, ${manager},
              ${matchedPerson?.email || matchedPerson?.company_email || null},
              ${SOURCE_SYSTEM}, ${SOURCE_COLLECTION},
              ${`dept:${siteKeyFromName(location)}:${siteKeyFromName(name)}`},
              ${sql.json(contactPayload)},
              now(), now()
            )
          `;
        }
        summary.departments.created += 1;
        if (matchedPerson) summary.departments.contactsLinked += 1;
        else if (manager) summary.departments.contactsNameOnly += 1;
        const list = deptsByName.get(name.toLowerCase()) || [];
        list.push({ id, name, site_id: siteId });
        deptsByName.set(name.toLowerCase(), list);
      }
    }

    // AS400 → Forge department aliases
    function normDept(value) {
      return str(value)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 #./&()-]+/g, "")
        .trim();
    }
    function forgeBaseName(value) {
      // "Parboil Mill - Stuttgart" → "Parboil Mill"
      return str(value)
        .replace(
          /\s*[-–]\s*(Stuttgart|Greenville|DeWitt|Dewitt|Boyle|Eudora|Fair Oaks|McGehee|Pine Bluff|Tyronza|Wilmot|Wilson|Wynne|AR|MS).*$/i,
          "",
        )
        .trim();
    }
    function findDeptMatches(forgeName) {
      const exact = deptsByName.get(forgeName.toLowerCase()) || [];
      if (exact.length) return exact;
      const base = forgeBaseName(forgeName);
      if (base && base.toLowerCase() !== forgeName.toLowerCase()) {
        const baseHits = deptsByName.get(base.toLowerCase()) || [];
        if (baseHits.length) return baseHits;
      }
      // Known spreadsheet naming drift (typos / Ave omitted / Members vs Member).
      const aliases = {
        "bran stabilizier-wrm": ["bran stabilizer"],
        "north park green rice": ["north park ave green rice", "north park ave"],
        "north park packing": ["north park ave packing"],
        "north park shipping": ["north park ave shipping"],
        "member services": ["members records", "members services"],
        "greenville construction": ["greenville ms - construction", "greenville ms construction"],
        "shite rice bulk shipping - stuttgart": [
          "white rice bulk shipping",
          "white rice old shipping",
        ],
        "little rock - sales": ["little rock - sales", "stuttgart headquarters sales"],
      };
      for (const alt of aliases[forgeName.toLowerCase()] || []) {
        const hits = deptsByName.get(alt.toLowerCase()) || [];
        if (hits.length) return hits;
      }
      const target = normDept(forgeName);
      const baseNorm = normDept(base || forgeName);
      const fuzzy = [];
      for (const [key, list] of deptsByName.entries()) {
        const kn = normDept(key);
        if (kn === target || kn === baseNorm || target.includes(kn) || kn.includes(baseNorm)) {
          fuzzy.push(...list);
        }
      }
      return fuzzy;
    }

    const as400ByForge = new Map();
    for (const row of as400Mappings) {
      const forge = str(row.forgeDepartment);
      const as400 = str(row.as400);
      if (!forge || !as400) continue;
      if (!as400ByForge.has(forge)) as400ByForge.set(forge, new Set());
      as400ByForge.get(forge).add(as400);
    }

    const matchedDeptIds = new Set();
    for (const [forgeName, aliases] of as400ByForge.entries()) {
      const matches = findDeptMatches(forgeName);
      if (!matches.length) {
        summary.as400.unmatchedForge.push(forgeName);
        continue;
      }
      summary.as400.departmentsMatched += 1;
      for (const dept of matches) {
        matchedDeptIds.add(dept.id);
        const aliasList = [...aliases].sort((a, b) => a.localeCompare(b));
        summary.as400.aliasesAttached += aliasList.length;
        summary.proposals.push({
          kind: "as400-alias",
          forgeDepartment: forgeName,
          departmentId: dept.id,
          departmentName: dept.name,
          as400Names: aliasList,
        });
        if (!APPLY) continue;
        await sql`
          update industrial_departments set
            source_payload = coalesce(source_payload, '{}'::jsonb) || ${sql.json({
              as400Names: aliasList,
              as400ForgeName: forgeName,
              as400MappedAt: new Date().toISOString(),
            })},
            updated_at = now()
          where id = ${dept.id}::uuid
        `;
      }
    }
    // Cap unmatched list in summary for logs
    if (summary.as400.unmatchedForge.length > 40) {
      summary.as400.unmatchedForge = [
        ...summary.as400.unmatchedForge.slice(0, 40),
        `...+${summary.as400.unmatchedForge.length - 40} more`,
      ];
    }

    if (APPLY) {
      // Company / organization fill (do not overwrite existing non-blank fields aggressively).
      if (orgType?.id) {
        const orgTypeId = orgType.id;
        const [orgExisting] = await sql`
          select id::text as id from organizations
          where tenant_id = ${tenantId}::uuid and slug = ${company.slug || "producers-rice-mill"}
          limit 1
        `;
        if (orgExisting) {
          await sql`
            update organizations set
              display_name = coalesce(nullif(trim(display_name), ''), ${company.displayName || null}),
              legal_name = coalesce(nullif(trim(legal_name), ''), ${company.legalName || null}),
              phone = coalesce(nullif(trim(phone), ''), ${company.phone || null}),
              email = coalesce(nullif(trim(email), ''), ${company.email || null}),
              website = coalesce(nullif(trim(website), ''), ${company.website || null}),
              address_line_1 = coalesce(nullif(trim(address_line_1), ''), ${company.addressLine1 || null}),
              address_line_2 = coalesce(nullif(trim(address_line_2), ''), ${company.addressLine2 || null}),
              city = coalesce(nullif(trim(city), ''), ${company.city || null}),
              state_province = coalesce(nullif(trim(state_province), ''), ${company.stateProvince || null}),
              postal_code = coalesce(nullif(trim(postal_code), ''), ${company.postalCode || null}),
              country_code = coalesce(nullif(trim(country_code), ''), ${company.countryCode || null}),
              timezone = coalesce(nullif(trim(timezone), ''), ${company.timezone || null}),
              status = 'ACTIVE',
              updated_at = now()
            where id = ${orgExisting.id}::uuid
          `;
          summary.company.organizationUpdated = true;
        } else if (orgTypeId) {
          await sql`
            insert into organizations (
              id, tenant_id, organization_type_id, slug, legal_name, display_name,
              status, timezone, phone, email, website,
              address_line_1, address_line_2, city, state_province, postal_code, country_code,
              created_at, updated_at
            ) values (
              ${randomUUID()}::uuid, ${tenantId}::uuid, ${orgTypeId}::uuid,
              ${company.slug || "producers-rice-mill"},
              ${company.legalName || "Producers Rice Mill, Inc."},
              ${company.displayName || "Producers Rice Mill"},
              'ACTIVE', ${company.timezone || "America/Chicago"},
              ${company.phone || null}, ${company.email || null}, ${company.website || null},
              ${company.addressLine1 || null}, ${company.addressLine2 || null},
              ${company.city || null}, ${company.stateProvince || null},
              ${company.postalCode || null}, ${company.countryCode || "US"},
              now(), now()
            )
          `;
          summary.company.organizationCreated = true;
        }
      }

      const [branding] = await sql`
        select id::text as id from tenant_branding where tenant_id = ${tenantId}::uuid limit 1
      `;
      if (branding) {
        await sql`
          update tenant_branding set
            display_name = coalesce(nullif(trim(display_name), ''), ${company.displayName || null}),
            contact_phone = coalesce(nullif(trim(contact_phone), ''), ${company.phone || null}),
            support_email = coalesce(nullif(trim(support_email), ''), ${company.email || null}),
            updated_at = now()
          where id = ${branding.id}::uuid
        `;
        summary.company.brandingUpdated = true;
      }

      if (divisionSetting) {
        await sql`
          update tenant_settings
          set value_json = ${sql.json(nextDivisions)},
              updated_at = now(),
              record_version = record_version + 1
          where id = ${divisionSetting.id}::uuid
        `;
      } else {
        await sql`
          insert into tenant_settings (
            id, tenant_id, namespace, setting_key, value_json,
            schema_version, is_sensitive, record_version, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, 'industrial', 'personnel.divisions',
            ${sql.json(nextDivisions)}, 1, false, 1, now(), now()
          )
        `;
      }

      // Full AS400 ↔ Forge department map for integration lookups.
      const as400SettingValue = as400Mappings
        .filter((r) => str(r.as400) && str(r.forgeDepartment))
        .map((r) => ({
          as400: str(r.as400),
          forgeDepartment: str(r.forgeDepartment),
          excelRow: r.excelRow || null,
        }));
      const [as400Setting] = await sql`
        select id::text as id
        from tenant_settings
        where tenant_id = ${tenantId}::uuid
          and namespace = 'industrial'
          and setting_key = 'integrations.as400.departmentMap'
        limit 1
      `;
      if (as400Setting) {
        await sql`
          update tenant_settings
          set value_json = ${sql.json(as400SettingValue)},
              updated_at = now(),
              record_version = record_version + 1
          where id = ${as400Setting.id}::uuid
        `;
      } else {
        await sql`
          insert into tenant_settings (
            id, tenant_id, namespace, setting_key, value_json,
            schema_version, is_sensitive, record_version, created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid, 'industrial',
            'integrations.as400.departmentMap',
            ${sql.json(as400SettingValue)}, 1, false, 1, now(), now()
          )
        `;
      }
      summary.as400.settingUpserted = true;
    } else if (as400Mappings.length) {
      // Dry-run still reports that the setting would be written.
      summary.as400.settingUpserted = false;
    }

    // Compact proposal list for logs
    const compact = {
      status: APPLY ? "ok" : "dry-run",
      tenantId,
      siteHasAddress,
      summary: {
        ...summary,
        proposals: undefined,
      },
      siteNames: locations.map((l) => l.name),
      departmentSample: summary.proposals.filter((p) => p.kind === "department").slice(0, 12),
      counts: {
        locations: locations.length,
        divisionsIn: divisionsIn.length,
        departmentsIn: departmentsIn.length,
        as400Mappings: as400Mappings.length,
        proposals: summary.proposals.length,
      },
      as400: summary.as400,
    };
    console.log(JSON.stringify(compact, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
