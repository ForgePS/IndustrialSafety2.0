/**
 * CONTROLLED-AURORA-IMPORT-S1 — schema + RLS + WC medical security validate.
 * Runs inside platform-api ECS image. Never prints secret values.
 *
 * Env:
 *   DATABASE_SECRET_ARN       forge-production-secrets-database (admin)
 *   APP_DATABASE_SECRET_ARN   forge-production-secrets-database-app
 */
import { pathToFileURL } from "node:url";

const envMod = await import(pathToFileURL("/app/packages/environment/dist/index.js").href);
const { resolveDatabaseSecret, buildDatabaseUrl } = envMod;
const postgresMod = await import(
  pathToFileURL("/app/node_modules/postgres/src/index.js").href
).catch(
  async () =>
    import(pathToFileURL("/app/packages/database/node_modules/postgres/src/index.js").href),
);
const postgres = postgresMod.default ?? postgresMod;

const PRODUCERS = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REGION = process.env.AWS_REGION || "us-east-1";

const REQUIRED_TABLES = [
  "industrial_sites",
  "industrial_departments",
  "industrial_personnel",
  "industrial_equipment",
  "industrial_training_records",
  "industrial_certificate_templates",
  "industrial_incidents",
  "industrial_inspections",
  "industrial_form_definitions",
  "industrial_form_submissions",
  "industrial_loto_libraries",
  "industrial_loto_procedures",
  "industrial_loto_records",
  "industrial_dot_compliance_records",
  "industrial_fleet_vehicles",
  "industrial_fleet_drivers",
  "industrial_workers_comp_cases",
  "industrial_workers_comp_medical_encounters",
  "industrial_corrective_actions",
  "industrial_observations",
  "industrial_jsas",
  "industrial_scan_qr_codes",
  "qr_links",
  "industrial_attachments",
  "platform_documents",
  "industrial_history_records",
  "industrial_migration_id_map",
  "platform_ehs_audit_templates",
];

function fail(msg, extra = {}) {
  console.info(JSON.stringify({ ok: false, error: msg, ...extra }, null, 2));
  process.exit(2);
}

async function urlFromArn(arn) {
  if (!arn) fail("missing_secret_arn");
  const fields = await resolveDatabaseSecret(arn, REGION);
  if (!fields) fail("secret_resolve_failed");
  return buildDatabaseUrl(fields);
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  const appArn = process.env.APP_DATABASE_SECRET_ARN?.trim();
  if (!adminArn || adminArn.includes("database-app")) fail("admin_secret_required");
  if (!appArn || !appArn.includes("database-app")) fail("app_secret_required");

  const admin = postgres(await urlFromArn(adminArn), { max: 1 });
  const cases = [];
  const report = { ok: false, cases: [], schema: {}, rls: {}, wc: {}, tenant: {} };

  try {
    const tip = await admin`
      select id, hash, created_at from drizzle.__drizzle_migrations
      order by created_at desc limit 1
    `;
    report.schema.lastMigrationCreatedAt = String(tip[0]?.created_at ?? "");
    report.schema.expectedWhen = "1754950000000";
    cases.push({
      name: "schema_tip_0040",
      pass: String(tip[0]?.created_at) === "1754950000000",
    });

    const tables = await admin`
      select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname = any(${REQUIRED_TABLES})
      order by 1
    `;
    const byName = Object.fromEntries(tables.map((t) => [t.name, t]));
    const missing = REQUIRED_TABLES.filter((t) => !byName[t]);
    report.schema.requiredPresent = REQUIRED_TABLES.length - missing.length;
    report.schema.missing = missing;
    cases.push({
      name: "required_tables_present",
      pass: missing.length === 0,
      detail: missing.join(","),
    });

    const rlsOff = tables.filter((t) => !t.rls);
    cases.push({
      name: "required_tables_rls_enabled",
      pass: rlsOff.length === 0,
      detail: rlsOff.map((t) => t.name).join(","),
    });

    const role = await admin`
      select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'forge_app'
    `;
    report.rls.forgeApp = role[0] ?? null;
    cases.push({ name: "forge_app_nosuperuser", pass: role[0] && role[0].rolsuper === false });
    cases.push({ name: "forge_app_nobypassrls", pass: role[0] && role[0].rolbypassrls === false });

    const existing = await admin`
      select id::text as id, tenant_key, slug from tenants
      where id = ${PRODUCERS}::uuid or tenant_key = 'producers-rice-mill' or slug = 'producers-rice-mill'
    `;
    report.tenant.before = existing;
    const byId = existing.find((t) => t.id === PRODUCERS);
    const byKey = existing.find(
      (t) => t.tenant_key === "producers-rice-mill" || t.slug === "producers-rice-mill",
    );
    if (byKey && byKey.id !== PRODUCERS) {
      fail("producers_tenant_exists_with_wrong_uuid", { found: byKey });
    }
    if (!byId) {
      await admin`
        insert into tenants (
          id, tenant_key, slug, legal_name, display_name, tenant_type, status,
          timezone, default_locale, data_region, created_at, updated_at
        ) values (
          ${PRODUCERS}::uuid, 'producers-rice-mill', 'producers-rice-mill',
          'Producers Rice Mill', 'Producers Rice Mill', 'CUSTOMER', 'ACTIVE',
          'America/Chicago', 'en-US', 'us-east-1', now(), now()
        )
        on conflict (id) do nothing
      `;
      report.tenant.created = true;
    } else {
      report.tenant.created = false;
    }
    const after = await admin`
      select id::text as id, tenant_key, slug, status from tenants where id = ${PRODUCERS}::uuid
    `;
    report.tenant.after = after[0] ?? null;
    cases.push({ name: "producers_tenant_present", pass: Boolean(after[0]) });

    await admin`
      insert into tenants (
        id, tenant_key, slug, legal_name, display_name, tenant_type, status,
        timezone, default_locale, data_region, created_at, updated_at
      ) values (
        ${OTHER}::uuid, 'controlled-import-isolation-b', 'controlled-import-isolation-b',
        'Controlled Import Isolation B', 'Controlled Import Isolation B', 'CUSTOMER', 'ACTIVE',
        'UTC', 'en-US', 'us-east-1', now(), now()
      )
      on conflict (id) do nothing
    `;

    const probeSiteId = "11111111-2222-4333-8444-555555555555";
    await admin`
      insert into industrial_sites (
        id, tenant_id, name, status, created_at, updated_at
      ) values (
        ${probeSiteId}::uuid, ${PRODUCERS}::uuid, '__rls_probe_site__', 'ACTIVE', now(), now()
      )
      on conflict (id) do update set name = excluded.name, updated_at = now()
    `;

    const medId = "22222222-3333-4444-8555-666666666666";
    const caseId = "33333333-4444-4555-8666-777777777777";
    await admin`
      insert into industrial_workers_comp_cases (
        id, tenant_id, status, created_at, updated_at
      ) values (
        ${caseId}::uuid, ${PRODUCERS}::uuid, 'OPEN', now(), now()
      )
      on conflict (id) do nothing
    `;
    await admin`
      insert into industrial_workers_comp_medical_encounters (
        id, tenant_id, case_id, created_at, updated_at
      ) values (
        ${medId}::uuid, ${PRODUCERS}::uuid, ${caseId}::uuid, now(), now()
      )
      on conflict (id) do nothing
    `;
  } finally {
    await admin.end({ timeout: 5 });
  }

  const app = postgres(await urlFromArn(appArn), { max: 1 });
  try {
    const who = await app`select current_user as u`;
    cases.push({ name: "connected_as_forge_app", pass: who[0]?.u === "forge_app" });

    const noCtx = await app`select count(*)::int as c from industrial_sites`;
    cases.push({
      name: "missing_tenant_context_denied",
      pass: (noCtx[0]?.c ?? -1) === 0,
      detail: String(noCtx[0]?.c),
    });

    await app`select set_config('app.current_tenant_id', ${OTHER}, false)`;
    const crossRead = await app`
      select count(*)::int as c from industrial_sites where id = '11111111-2222-4333-8444-555555555555'::uuid
    `;
    cases.push({
      name: "cross_tenant_read_denied",
      pass: (crossRead[0]?.c ?? -1) === 0,
      detail: String(crossRead[0]?.c),
    });
    report.rls.crossTenantRead = (crossRead[0]?.c ?? -1) === 0 ? "DENIED" : "FAIL";

    let crossWriteDenied = true;
    try {
      await app`
        insert into industrial_sites (id, tenant_id, name, status, created_at, updated_at)
        values (
          '99999999-8888-4777-8666-555555555555'::uuid,
          ${PRODUCERS}::uuid,
          '__should_fail__',
          'ACTIVE',
          now(),
          now()
        )
      `;
      crossWriteDenied = false;
    } catch {
      crossWriteDenied = true;
    }
    cases.push({ name: "cross_tenant_write_denied", pass: crossWriteDenied });
    report.rls.crossTenantWrite = crossWriteDenied ? "DENIED" : "FAIL";

    await app`select set_config('app.current_tenant_id', ${PRODUCERS}, false)`;
    const own = await app`
      select count(*)::int as c from industrial_sites where id = '11111111-2222-4333-8444-555555555555'::uuid
    `;
    cases.push({
      name: "same_tenant_read_allowed",
      pass: (own[0]?.c ?? 0) >= 1,
      detail: String(own[0]?.c),
    });

    await app`select set_config('app.industrial_wc_medical_access', 'off', false)`;
    const medDenied = await app`
      select count(*)::int as c from industrial_workers_comp_medical_encounters
      where id = '22222222-3333-4444-8555-666666666666'::uuid
    `;
    cases.push({
      name: "wc_medical_ordinary_denied",
      pass: (medDenied[0]?.c ?? -1) === 0,
      detail: String(medDenied[0]?.c),
    });

    await app`select set_config('app.industrial_wc_medical_access', 'on', false)`;
    const medAllow = await app`
      select count(*)::int as c from industrial_workers_comp_medical_encounters
      where id = '22222222-3333-4444-8555-666666666666'::uuid
    `;
    cases.push({
      name: "wc_medical_elevated_allowed",
      pass: (medAllow[0]?.c ?? 0) >= 1,
      detail: String(medAllow[0]?.c),
    });

    await app`select set_config('app.industrial_wc_medical_access', 'off', false)`;
    const afterReset = await app`
      select count(*)::int as c from industrial_workers_comp_medical_encounters
      where id = '22222222-3333-4444-8555-666666666666'::uuid
    `;
    cases.push({
      name: "wc_medical_no_guc_leak_after_reset",
      pass: (afterReset[0]?.c ?? -1) === 0,
      detail: String(afterReset[0]?.c),
    });

    report.wc.ordinary = (medDenied[0]?.c ?? -1) === 0 ? "DENIED" : "FAIL";
    report.wc.elevated = (medAllow[0]?.c ?? 0) >= 1 ? "ALLOWED" : "FAIL";
  } finally {
    await app.end({ timeout: 5 });
  }

  const admin2 = postgres(await urlFromArn(adminArn), { max: 1 });
  try {
    await admin2`delete from industrial_workers_comp_medical_encounters where id = '22222222-3333-4444-8555-666666666666'::uuid`;
    await admin2`delete from industrial_workers_comp_cases where id = '33333333-4444-4555-8666-777777777777'::uuid`;
    await admin2`delete from industrial_sites where id = '11111111-2222-4333-8444-555555555555'::uuid`;
  } finally {
    await admin2.end({ timeout: 5 });
  }

  report.cases = cases;
  report.ok = cases.every((c) => c.pass);
  console.info(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => fail(String(e?.stack || e)));
