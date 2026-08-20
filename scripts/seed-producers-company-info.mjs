/**
 * producers-rice-mill only: seed company profile, organization, branding,
 * business defaults, HQ facility, positions catalog, employment types, and
 * personnel company contact fields.
 *
 * Dry-run by default. APPLY=1 writes.
 *
 *   TENANT_KEY=producers-rice-mill node scripts/seed-producers-company-info.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/seed-producers-company-info.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

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

/** Public company profile (producersrice.com / FMCSA). */
const COMPANY = {
  displayName: "Producers Rice Mill",
  legalName: "Producers Rice Mill, Inc.",
  slug: "producers-rice-mill",
  orgSlug: "producers-rice-mill",
  timezone: "America/Chicago",
  phone: "870-673-4444",
  email: "info@producersrice.com",
  website: "https://producersrice.com",
  addressLine1: "518 East Harrison Street",
  addressLine2: "P.O. Box 1248",
  city: "Stuttgart",
  stateProvince: "AR",
  postalCode: "72160",
  countryCode: "US",
  companyName: "Producers Rice Mill, Inc.",
  shortName: "Producers Rice Mill",
  supportEmail: "info@producersrice.com",
  contactName: "Producers Rice Mill",
  primaryColor: "#1a365d",
  secondaryColor: "#2d3748",
  accentColor: "#3182ce",
};

const BUSINESS_DEFAULTS = {
  timezone: "America/Chicago",
  dateFormat: "MM/DD/YYYY",
  employeeIdFormat: "EMP-####",
  emailNotifications: true,
  mobileAccess: true,
  employeePortal: true,
  incidentNumbering: "INC-",
  inspectionNumbering: "INSP-",
  fleetNumbering: "FLT-",
};

const DIVISIONS = ["Operations", "Safety"];
const EMPLOYMENT_TYPES = ["Full time", "Part time", "Seasonal", "Temporary"];

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

async function upsertTenantSetting(sql, tenantId, namespace, settingKey, valueJson) {
  const existing = await sql`
    select id::text as id from tenant_settings
    where tenant_id = ${tenantId}::uuid
      and namespace = ${namespace}
      and setting_key = ${settingKey}
    limit 1
  `;
  const payload = JSON.stringify(valueJson);
  if (existing[0]) {
    await sql`
      update tenant_settings
      set value_json = ${payload}::jsonb,
          updated_at = now(),
          record_version = record_version + 1
      where id = ${existing[0].id}::uuid
    `;
    return { created: false };
  }
  await sql`
    insert into tenant_settings (
      id, tenant_id, namespace, setting_key, value_json,
      schema_version, is_sensitive, record_version, created_at, updated_at
    ) values (
      ${randomUUID()}::uuid,
      ${tenantId}::uuid,
      ${namespace},
      ${settingKey},
      ${payload}::jsonb,
      1,
      false,
      1,
      now(),
      now()
    )
  `;
  return { created: true };
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

  const summary = {
    tenantKey: TENANT_KEY,
    apply: APPLY,
    tenantUpdated: false,
    organization: { created: false, updated: false },
    branding: { created: false, updated: false },
    settings: {},
    facility: { created: false },
    positions: { created: 0, skipped: 0 },
    employmentTypes: { created: 0, skipped: 0 },
    personnelCompanyFields: { wouldUpdate: 0, updated: 0 },
  };

  try {
    const tenantRows = await sql`
      select id::text as id, display_name, legal_name, status, timezone
      from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenantRows[0]) throw new Error(`tenant ${TENANT_KEY} not found`);
    const tenantId = tenantRows[0].id;

    const orgType = await sql`
      select id::text as id from organization_types where code = 'SAFETY_COMPANY' limit 1
    `;
    if (!orgType[0]) throw new Error("organization_types.SAFETY_COMPANY missing");
    const orgTypeId = orgType[0].id;

    const jobTitles = await sql`
      select distinct trim(job_title) as name
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
        and job_title is not null
        and trim(job_title) <> ''
      order by 1
    `;

    const personnelBlank = await sql`
      select count(*)::int as n
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
        and (
          company_name is null or trim(company_name) = ''
          or company_phone is null or trim(company_phone) = ''
          or company_email is null or trim(company_email) = ''
        )
    `;
    summary.personnelCompanyFields.wouldUpdate = personnelBlank[0]?.n ?? 0;
    summary.positions.distinctJobTitles = jobTitles.length;

    if (!APPLY) {
      console.log(JSON.stringify({ status: "dry-run", tenantId, ...summary }, null, 2));
      return;
    }

    await sql`
      update tenants
      set display_name = ${COMPANY.displayName},
          legal_name = ${COMPANY.legalName},
          timezone = ${COMPANY.timezone},
          status = 'ACTIVE',
          updated_at = now()
      where id = ${tenantId}::uuid
    `;
    summary.tenantUpdated = true;

    const orgExisting = await sql`
      select id::text as id from organizations
      where tenant_id = ${tenantId}::uuid and slug = ${COMPANY.orgSlug}
      limit 1
    `;
    if (orgExisting[0]) {
      await sql`
        update organizations
        set display_name = ${COMPANY.displayName},
            legal_name = ${COMPANY.legalName},
            phone = ${COMPANY.phone},
            email = ${COMPANY.email},
            website = ${COMPANY.website},
            address_line_1 = ${COMPANY.addressLine1},
            address_line_2 = ${COMPANY.addressLine2},
            city = ${COMPANY.city},
            state_province = ${COMPANY.stateProvince},
            postal_code = ${COMPANY.postalCode},
            country_code = ${COMPANY.countryCode},
            timezone = ${COMPANY.timezone},
            status = 'ACTIVE',
            updated_at = now()
        where id = ${orgExisting[0].id}::uuid
      `;
      summary.organization.updated = true;
    } else {
      const orgId = randomUUID();
      await sql`
        insert into organizations (
          id, tenant_id, organization_type_id, slug, legal_name, display_name,
          status, timezone, phone, email, website,
          address_line_1, address_line_2, city, state_province, postal_code, country_code,
          created_at, updated_at
        ) values (
          ${orgId}::uuid,
          ${tenantId}::uuid,
          ${orgTypeId}::uuid,
          ${COMPANY.orgSlug},
          ${COMPANY.legalName},
          ${COMPANY.displayName},
          'ACTIVE',
          ${COMPANY.timezone},
          ${COMPANY.phone},
          ${COMPANY.email},
          ${COMPANY.website},
          ${COMPANY.addressLine1},
          ${COMPANY.addressLine2},
          ${COMPANY.city},
          ${COMPANY.stateProvince},
          ${COMPANY.postalCode},
          ${COMPANY.countryCode},
          now(),
          now()
        )
      `;
      summary.organization.created = true;
    }

    const brandingExisting = await sql`
      select id::text as id from tenant_branding where tenant_id = ${tenantId}::uuid limit 1
    `;
    if (brandingExisting[0]) {
      await sql`
        update tenant_branding
        set display_name = ${COMPANY.displayName},
            short_name = ${COMPANY.shortName},
            contact_name = ${COMPANY.contactName},
            contact_phone = ${COMPANY.phone},
            support_email = ${COMPANY.supportEmail},
            email_sender_name = ${COMPANY.displayName},
            primary_color = coalesce(primary_color, ${COMPANY.primaryColor}),
            secondary_color = coalesce(secondary_color, ${COMPANY.secondaryColor}),
            accent_color = coalesce(accent_color, ${COMPANY.accentColor}),
            updated_at = now(),
            record_version = record_version + 1
        where id = ${brandingExisting[0].id}::uuid
      `;
      summary.branding.updated = true;
    } else {
      await sql`
        insert into tenant_branding (
          id, tenant_id, display_name, short_name, contact_name, contact_phone,
          support_email, email_sender_name, primary_color, secondary_color, accent_color,
          approved_colors_json, custom_css_enabled, record_version, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${COMPANY.displayName},
          ${COMPANY.shortName},
          ${COMPANY.contactName},
          ${COMPANY.phone},
          ${COMPANY.supportEmail},
          ${COMPANY.displayName},
          ${COMPANY.primaryColor},
          ${COMPANY.secondaryColor},
          ${COMPANY.accentColor},
          '[]'::jsonb,
          false,
          1,
          now(),
          now()
        )
      `;
      summary.branding.created = true;
    }

    summary.settings.businessDefaults = await upsertTenantSetting(
      sql,
      tenantId,
      "business",
      "defaults",
      BUSINESS_DEFAULTS,
    );
    summary.settings.personnelDivisions = await upsertTenantSetting(
      sql,
      tenantId,
      "industrial",
      "personnel.divisions",
      DIVISIONS,
    );

    const facilityKey = "producers-hq-stuttgart";
    const facilityExisting = await sql`
      select id::text as id from facilities
      where tenant_id = ${tenantId}::uuid and facility_key = ${facilityKey}
      limit 1
    `;
    if (!facilityExisting[0]) {
      const orgIdRow = await sql`
        select id::text as id from organizations
        where tenant_id = ${tenantId}::uuid and slug = ${COMPANY.orgSlug}
        limit 1
      `;
      await sql`
        insert into facilities (
          id, tenant_id, organization_id, facility_key, name, facility_type, status,
          address_line_1, address_line_2, city, state_province, postal_code, country_code,
          timezone, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${orgIdRow[0]?.id ?? null}::uuid,
          ${facilityKey},
          ${"Producers Rice Mill - Stuttgart HQ"},
          'SITE',
          'ACTIVE',
          ${COMPANY.addressLine1},
          ${COMPANY.addressLine2},
          ${COMPANY.city},
          ${COMPANY.stateProvince},
          ${COMPANY.postalCode},
          ${COMPANY.countryCode},
          ${COMPANY.timezone},
          now(),
          now()
        )
      `;
      summary.facility.created = true;
    }

    for (const row of jobTitles) {
      const name = row.name?.trim();
      if (!name) continue;
      const existing = await sql`
        select id::text as id from industrial_positions
        where tenant_id = ${tenantId}::uuid and lower(name) = lower(${name})
        limit 1
      `;
      if (existing[0]) {
        summary.positions.skipped += 1;
        continue;
      }
      await sql`
        insert into industrial_positions (
          id, tenant_id, name, status, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${name},
          'ACTIVE',
          now(),
          now()
        )
      `;
      summary.positions.created += 1;
    }

    for (const name of EMPLOYMENT_TYPES) {
      const existing = await sql`
        select id::text as id from industrial_employment_types
        where tenant_id = ${tenantId}::uuid and lower(name) = lower(${name})
        limit 1
      `;
      if (existing[0]) {
        summary.employmentTypes.skipped += 1;
        continue;
      }
      await sql`
        insert into industrial_employment_types (
          id, tenant_id, name, status, created_at, updated_at
        ) values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${name},
          'ACTIVE',
          now(),
          now()
        )
      `;
      summary.employmentTypes.created += 1;
    }

    const personnelResult = await sql`
      update industrial_personnel
      set company_name = coalesce(nullif(trim(company_name), ''), ${COMPANY.companyName}),
          company_phone = coalesce(nullif(trim(company_phone), ''), ${COMPANY.phone}),
          company_email = coalesce(nullif(trim(company_email), ''), ${COMPANY.email}),
          updated_at = now()
      where tenant_id = ${tenantId}::uuid
        and archived_at is null
        and (
          company_name is null or trim(company_name) = ''
          or company_phone is null or trim(company_phone) = ''
          or company_email is null or trim(company_email) = ''
        )
    `;
    summary.personnelCompanyFields.updated = personnelResult.count ?? 0;

    console.log(JSON.stringify({ status: "ok", tenantId, ...summary }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
