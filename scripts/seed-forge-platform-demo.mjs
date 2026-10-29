/**
 * Seed existing tenant `forge-platform` with synthetic Industrial demo data.
 * Mirrors IndustrialDemoSeedService.applySeed + DEMO_SEED_TARGETS.
 *
 * Runs inside the platform-api ECS image (same import pattern as phase1 seed).
 *
 * Env:
 *   DATABASE_SECRET_ARN  required
 *   TENANT_KEY           default forge-platform (must be forge-platform or forge-industrial-demo)
 *   APPLY=1              required to write (dry-run otherwise prints plan)
 *   COMPANY_NAME         default Forge Demo Manufacturing
 *
 * Dry-run:
 *   node scripts/seed-forge-platform-demo.mjs
 *
 * Apply (via ECS runner):
 *   APPLY=1 TENANT_KEY=forge-platform node scripts/seed-forge-platform-demo.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "forge-platform").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const COMPANY_NAME = (process.env.COMPANY_NAME || "Forge Demo Manufacturing").trim();

const ALLOWED_DEMO_TENANT_KEYS = new Set(["forge-platform", "forge-industrial-demo"]);
if (!ALLOWED_DEMO_TENANT_KEYS.has(TENANT_KEY.toLowerCase())) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "tenant_not_allowed_for_demo_seed",
      tenantKey: TENANT_KEY,
      allowed: [...ALLOWED_DEMO_TENANT_KEYS],
      message:
        "Refusing demo seed for customer tenants. Use forge-platform or forge-industrial-demo only.",
    }),
  );
  process.exit(1);
}

const ROLE_CODE = "IND3V_INDUSTRIAL_ADMIN";

/** Hardcoded from @forge/contracts DEMO_LOCATIONS (avoid importing contracts in image). */
const DEMO_LOCATIONS = [
  "Main Manufacturing Plant",
  "Distribution Center",
  "Maintenance Operations",
  "Corporate Office",
];

/** Hardcoded from @forge/contracts DEMO_DIVISIONS. */
const DEMO_DIVISIONS = [
  "Production",
  "Maintenance",
  "Warehouse",
  "Transportation",
  "Environmental Health & Safety",
  "Administration",
];

/** Hardcoded from @forge/contracts DEMO_SEED_TARGETS (+ departments from DEMO_DIVISIONS length). */
const DEMO_SEED_TARGETS = {
  sites: 4,
  departments: 6,
  employees: 75,
  trainingSources: 4,
  trainingAssignments: 20,
  incidents: 8,
  oshaRecordables: 6,
  workersCompCases: 5,
  inspections: 30,
  vehicles: 25,
  equipmentAssets: 75,
  safetySupplyItems: 40,
  lotoProcedures: 15,
  qrEquipmentRecords: 12,
  tasks: 20,
  reminders: 10,
  calendarEvents: 15,
  reports: 12,
};

const FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Casey",
  "Morgan",
  "Riley",
  "Avery",
  "Quinn",
  "Parker",
  "Reese",
  "Cameron",
  "Drew",
  "Jamie",
  "Skyler",
  "Harper",
];

const LAST_NAMES = [
  "Nguyen",
  "Patel",
  "Garcia",
  "Johnson",
  "Williams",
  "Brown",
  "Davis",
  "Miller",
  "Wilson",
  "Moore",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
];

const SUPPLY_NAMES = [
  "Nitrile Gloves",
  "Safety Glasses",
  "Hard Hat",
  "Ear Plugs",
  "Hi-Vis Vest",
  "Respirator Cartridges",
  "First Aid Kit",
  "Lockout Hasps",
  "Padlocks",
  "Spill Pads",
];

const MODULE_CODES = [
  "PERSONNEL",
  "FIRST_AID",
  "EQUIPMENT",
  "LOCKOUT_TAGOUT",
  "TRAINING",
  "FORMS",
  "INSPECTIONS",
  "INCIDENTS",
  "QR_LINKS",
  "CONFINED_SPACE",
  "HOT_WORK",
  "TASKS",
  "MESSAGING",
  "EMERGENCY_RESPONSE",
  "DOCUMENTS",
  "REPORTING",
  "IMPORT",
  "FLEET",
];

const FLAG_KEYS = [
  "industrial.enabled",
  "industrial.module.personnel.enabled",
  "industrial.module.first_aid.enabled",
  "industrial.module.equipment.enabled",
  "industrial.module.loto.enabled",
  "industrial.module.training.enabled",
  "industrial.module.forms.enabled",
  "industrial.module.inspections.enabled",
  "industrial.module.incidents.enabled",
  "industrial.module.qr_links.enabled",
  "industrial.module.confined_space.enabled",
  "industrial.module.hot_work.enabled",
  "industrial.module.tasks.enabled",
  "industrial.module.messaging.enabled",
  "industrial.module.emergency_response.enabled",
  "industrial.module.documents.enabled",
  "industrial.module.reporting.enabled",
  "industrial.module.fleet.enabled",
];

const ADMIN_PERMS = [
  "industrial.access",
  "industrial.personnel.view",
  "industrial.personnel.manage",
  "industrial.first_aid.view",
  "industrial.first_aid.manage",
  "industrial.training.view",
  "industrial.training.manage",
  "industrial.forms.view",
  "industrial.forms.manage",
  "industrial.inspections.view",
  "industrial.inspections.manage",
  "industrial.incidents.view",
  "industrial.incidents.manage",
  "industrial.equipment.view",
  "industrial.equipment.manage",
  "industrial.fleet.view",
  "industrial.fleet.manage",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.loto.approve",
  "industrial.confined_space.view",
  "industrial.confined_space.manage",
  "industrial.confined_space.approve",
  "industrial.hot_work.view",
  "industrial.hot_work.manage",
  "industrial.hot_work.approve",
  "import.view",
  "import.upload",
  "import.template.manage",
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.walkthrough.demo.manage",
  "industrial.walkthrough.demo.reset",
];

function demoEmail(localPart, index) {
  const safe = localPart.toLowerCase().replace(/[^a-z0-9]+/g, ".") || "user";
  return `${safe}.${String(index).padStart(3, "0")}@example.forge-demo.local`;
}

function demoPhone(index) {
  const n = 1000 + (index % 8999);
  return `+1555550${String(n).slice(-4)}`;
}

function isoDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sourceFields(documentId, extraPayload = {}) {
  return {
    sourceSystem: "FORGE_DEMO",
    sourceCollection: "demo_seed",
    sourceDocumentId: documentId,
    sourcePayload: JSON.stringify({ synthetic: true, ...extraPayload }),
  };
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

async function tableExists(sql, name) {
  const rows = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function columnExists(sql, tableName, columnName) {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    limit 1
  `;
  return Boolean(rows[0]);
}

async function ensureRole(sql, tenantId) {
  let role = await sql`
    select id::text as id from roles
    where tenant_id = ${tenantId}::uuid and code = ${ROLE_CODE}
    limit 1
  `;
  if (!role[0]) {
    const id = randomUUID();
    await sql`
      insert into roles (
        id, tenant_id, code, name, description, status, is_system_managed, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${ROLE_CODE}, ${ROLE_CODE},
        'Forge Platform industrial admin', 'ACTIVE', false, now(), now()
      )
    `;
    role = await sql`select id::text as id from roles where id = ${id}::uuid`;
  }
  const roleId = role[0].id;
  const missingFromCatalog = [];
  for (const code of ADMIN_PERMS) {
    const perm = await sql`
      select id::text as id from permissions where code = ${code} limit 1
    `;
    if (!perm[0]) {
      missingFromCatalog.push(code);
      continue;
    }
    const existing = await sql`
      select 1 from role_permissions
      where role_id = ${roleId}::uuid and permission_id = ${perm[0].id}::uuid
      limit 1
    `;
    if (!existing[0]) {
      await sql`
        insert into role_permissions (role_id, permission_id, effect, created_at)
        values (${roleId}::uuid, ${perm[0].id}::uuid, 'ALLOW', now())
      `;
    }
  }
  const requiredMissing = missingFromCatalog.filter((code) => {
    if (code.startsWith("industrial.walkthrough.")) return false;
    // Optional elevated approve/permit codes — seed data still works without them.
    if (code.endsWith(".approve")) return false;
    if (code.startsWith("industrial.confined_space.")) return false;
    if (code.startsWith("industrial.hot_work.")) return false;
    return true;
  });
  if (requiredMissing.length > 0) {
    throw new Error(
      `Permission catalog is missing ${requiredMissing.length} code(s) required by ${ROLE_CODE}: ` +
        `${requiredMissing.join(", ")}. Run the platform permission seed before this script.`,
    );
  }
  return {
    roleId,
    missingOptionalPerms: missingFromCatalog,
  };
}

async function ensureAdminUser(sql, tenantId, tenantKey, roleId) {
  const email = `demo-admin@${tenantKey}.forge.test`;
  let user = await sql`
    select id::text as id from users
    where tenant_id = ${tenantId}::uuid and lower(primary_email) = ${email}
    limit 1
  `;
  let userCreated = false;
  if (!user[0]) {
    const id = randomUUID();
    await sql`
      insert into users (
        id, tenant_id, primary_email, status, activated_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${email}, 'ACTIVE', now(), now(), now()
      )
    `;
    user = await sql`select id::text as id from users where id = ${id}::uuid`;
    userCreated = true;
  }
  const userId = user[0].id;

  let membership = await sql`
    select id::text as id, status from user_tenant_memberships
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid
    limit 1
  `;
  let membershipCreated = false;
  if (!membership[0]) {
    const id = randomUUID();
    await sql`
      insert into user_tenant_memberships (
        id, tenant_id, user_id, status, is_default_tenant, activated_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'ACTIVE', true, now(), now(), now()
      )
    `;
    membership = await sql`
      select id::text as id, status from user_tenant_memberships where id = ${id}::uuid
    `;
    membershipCreated = true;
  } else if (membership[0].status !== "ACTIVE") {
    await sql`
      update user_tenant_memberships
      set status = 'ACTIVE', updated_at = now(), activated_at = coalesce(activated_at, now())
      where id = ${membership[0].id}::uuid
    `;
  }
  const membershipId = membership[0].id;

  const existingRole = await sql`
    select id::text as id from membership_role_assignments
    where membership_id = ${membershipId}::uuid and role_id = ${roleId}::uuid
    limit 1
  `;
  if (!existingRole[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_role_assignments (
        id, tenant_id, membership_id, role_id, status, granted_by_user_id, granted_at, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${roleId}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now(), now()
      )
    `;
  }

  return { userId, email, userCreated, membershipId, membershipCreated };
}

async function entitle(sql, tenantId, membershipId, userId) {
  const product = await sql`
    select id::text as id from platform_products where code = 'FORGE_INDUSTRIAL' limit 1
  `;
  if (!product[0])
    throw new Error("FORGE_INDUSTRIAL product missing — run platform catalog seed first");

  const tp = await sql`
    select id::text as id from tenant_products
    where tenant_id = ${tenantId}::uuid and product_id = ${product[0].id}::uuid
    limit 1
  `;
  if (!tp[0]) {
    const id = randomUUID();
    await sql`
      insert into tenant_products (id, tenant_id, product_id, status, enabled_at, created_at, updated_at)
      values (${id}::uuid, ${tenantId}::uuid, ${product[0].id}::uuid, 'ACTIVE', now(), now(), now())
    `;
  }

  const mpa = await sql`
    select id::text as id from membership_product_access
    where membership_id = ${membershipId}::uuid and product_id = ${product[0].id}::uuid
    limit 1
  `;
  if (!mpa[0]) {
    const id = randomUUID();
    await sql`
      insert into membership_product_access (
        id, tenant_id, membership_id, product_id, status, granted_by_user_id, created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${product[0].id}::uuid,
        'ACTIVE', ${userId}::uuid, now(), now()
      )
    `;
  }

  let modulesEntitled = 0;
  const missingModules = [];
  for (const code of MODULE_CODES) {
    const mod = await sql`
      select id::text as id from platform_modules
      where product_id = ${product[0].id}::uuid and code = ${code}
      limit 1
    `;
    if (!mod[0]) {
      missingModules.push(code);
      continue;
    }
    const tme = await sql`
      select id::text as id, status from tenant_module_entitlements
      where tenant_id = ${tenantId}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!tme[0]) {
      const id = randomUUID();
      await sql`
        insert into tenant_module_entitlements (
          id, tenant_id, module_id, status, starts_at, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${mod[0].id}::uuid, 'ACTIVE', now(), now(), now()
        )
      `;
    } else if (tme[0].status !== "ACTIVE") {
      await sql`
        update tenant_module_entitlements set status = 'ACTIVE', updated_at = now()
        where id = ${tme[0].id}::uuid
      `;
    }
    const mma = await sql`
      select id::text as id from membership_module_access
      where membership_id = ${membershipId}::uuid and module_id = ${mod[0].id}::uuid
      limit 1
    `;
    if (!mma[0]) {
      const id = randomUUID();
      await sql`
        insert into membership_module_access (
          id, tenant_id, membership_id, module_id, status, granted_by_user_id, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${membershipId}::uuid, ${mod[0].id}::uuid,
          'ACTIVE', ${userId}::uuid, now(), now()
        )
      `;
    }
    modulesEntitled += 1;
  }
  return { modulesEntitled, missingModules };
}

async function enableFlags(sql, tenantId, actorUserId) {
  const results = [];
  for (const key of FLAG_KEYS) {
    const def = await sql`
      select id::text as id from feature_definitions where key = ${key} limit 1
    `;
    if (!def[0]) {
      results.push({ key, action: "skipped_missing_definition" });
      continue;
    }
    const ov = await sql`
      select id::text as id from feature_overrides
      where tenant_id = ${tenantId}::uuid and feature_definition_id = ${def[0].id}::uuid
      limit 1
    `;
    if (!ov[0]) {
      const id = randomUUID();
      await sql`
        insert into feature_overrides (
          id, tenant_id, feature_definition_id, value_json, created_by_user_id, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${def[0].id}::uuid, 'true'::jsonb,
          ${actorUserId}::uuid, now(), now()
        )
      `;
      results.push({ key, action: "created" });
    } else {
      await sql`
        update feature_overrides
        set value_json = 'true'::jsonb, updated_at = now()
        where id = ${ov[0].id}::uuid
      `;
      results.push({ key, action: "updated" });
    }
  }
  return results;
}

async function cleanupPriorDemo(sql, tenantId, tables, warnings) {
  if (tables.reminders) {
    await sql`
      delete from industrial_reminders
      where tenant_id = ${tenantId}::uuid and title like 'DEMO:%'
    `;
  }
  if (tables.calendar) {
    await sql`
      delete from industrial_calendar_events
      where tenant_id = ${tenantId}::uuid and title like 'DEMO:%'
    `;
  }
  await sql`
    delete from qr_links
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_loto_procedures
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  if (tables.trainingAssignments) {
    await sql`
      delete from industrial_training_assignments
      where tenant_id = ${tenantId}::uuid and title like 'DEMO:%'
    `;
  } else {
    warnings.push("skip cleanup industrial_training_assignments (table missing)");
  }
  if (tables.trainingSources) {
    await sql`
      delete from industrial_training_sources
      where tenant_id = ${tenantId}::uuid and title like 'DEMO:%'
    `;
  } else {
    warnings.push("skip cleanup industrial_training_sources (table missing)");
  }
  await sql`
    delete from industrial_tasks
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_workers_comp_cases
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_osha_cases
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_incidents
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_inspections
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  if (tables.fleet) {
    await sql`
      delete from industrial_fleet_vehicles
      where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
    `;
  } else {
    warnings.push("skip cleanup industrial_fleet_vehicles (table missing)");
  }
  await sql`
    delete from industrial_equipment
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  if (tables.supply) {
    await sql`
      delete from industrial_supply_items
      where tenant_id = ${tenantId}::uuid and item_number like 'DEMO-%'
    `;
  }
  await sql`
    delete from report_definitions
    where tenant_id = ${tenantId}::uuid and report_key like 'demo.%'
  `;
  await sql`
    delete from industrial_personnel
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_departments
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
  await sql`
    delete from industrial_sites
    where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO'
  `;
}

async function insertSyntheticDataset(sql, tenantId, tables, warnings) {
  const now = new Date();
  const counts = {
    sites: 0,
    departments: 0,
    personnel: 0,
    trainingSources: 0,
    trainingAssignments: 0,
    incidents: 0,
    oshaRecordables: 0,
    workersCompCases: 0,
    inspections: 0,
    vehicles: 0,
    equipmentAssets: 0,
    safetySupplyItems: 0,
    lotoProcedures: 0,
    qrEquipmentRecords: 0,
    tasks: 0,
    reminders: 0,
    calendarEvents: 0,
    reports: 0,
  };

  const siteIds = [];
  for (let i = 0; i < DEMO_LOCATIONS.length; i += 1) {
    const id = randomUUID();
    siteIds.push(id);
    const src = sourceFields(`site-${i + 1}`);
    await sql`
      insert into industrial_sites (
        id, tenant_id, name, site_key, timezone, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${DEMO_LOCATIONS[i]}, ${`demo-site-${i + 1}`},
        'America/Chicago', 'ACTIVE',
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.sites = siteIds.length;

  const departmentIds = [];
  for (let i = 0; i < DEMO_DIVISIONS.length; i += 1) {
    const id = randomUUID();
    departmentIds.push(id);
    const name = DEMO_DIVISIONS[i];
    const src = sourceFields(`dept-${i + 1}`);
    await sql`
      insert into industrial_departments (
        id, tenant_id, site_id, name, division_name, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
        ${name}, ${name}, 'ACTIVE',
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.departments = departmentIds.length;

  const personnelIds = [];
  for (let i = 0; i < DEMO_SEED_TARGETS.employees; i += 1) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const displayName = `${firstName} ${lastName}`;
    const divisionName = DEMO_DIVISIONS[i % DEMO_DIVISIONS.length];
    const id = randomUUID();
    personnelIds.push(id);
    const src = sourceFields(`personnel-${i + 1}`, { demoIndex: i + 1 });
    await sql`
      insert into industrial_personnel (
        id, tenant_id, site_id, department_id, employee_number,
        first_name, last_name, display_name, email, phone, company_email, company_name,
        department_name, division_name, job_title, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${departmentIds[i % departmentIds.length]}::uuid,
        ${`DEMO-${String(i + 1).padStart(4, "0")}`},
        ${firstName}, ${lastName}, ${displayName},
        ${demoEmail(`${firstName}.${lastName}`, i + 1)},
        ${demoPhone(i + 1)},
        ${demoEmail(`c.${firstName}.${lastName}`, i + 1)},
        ${COMPANY_NAME},
        ${divisionName}, ${divisionName},
        ${i % 5 === 0 ? "Supervisor" : "Operator"},
        'ACTIVE',
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.personnel = personnelIds.length;

  const trainingSourceIds = [];
  if (tables.trainingSources) {
    for (let i = 0; i < DEMO_SEED_TARGETS.trainingSources; i += 1) {
      const id = randomUUID();
      trainingSourceIds.push(id);
      await sql`
        insert into industrial_training_sources (
          id, tenant_id, title, description, status, question_count, published_at, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid,
          ${`DEMO: Safety Course ${i + 1}`},
          'Synthetic demo training source for Walkthrough Studio.',
          'PUBLISHED', 10, ${now}, ${now}, ${now}
        )
      `;
    }
    counts.trainingSources = trainingSourceIds.length;

    if (tables.trainingAssignments) {
      for (let i = 0; i < DEMO_SEED_TARGETS.trainingAssignments; i += 1) {
        const dueAt = new Date(Date.now() + (i + 7) * 86_400_000);
        await sql`
          insert into industrial_training_assignments (
            id, tenant_id, title, description, source_id, due_at,
            passing_percent, quiz_mode, option_count, feedback_enabled, status,
            created_at, updated_at
          ) values (
            ${randomUUID()}::uuid, ${tenantId}::uuid,
            ${`DEMO: Assignment ${i + 1}`},
            'Demo training assignment',
            ${trainingSourceIds[i % trainingSourceIds.length]}::uuid,
            ${dueAt},
            80, 'STANDARD', 4, true, 'ACTIVE',
            ${now}, ${now}
          )
        `;
      }
      counts.trainingAssignments = DEMO_SEED_TARGETS.trainingAssignments;
    } else {
      warnings.push("skip insert industrial_training_assignments (table missing)");
    }
  } else {
    warnings.push("skip insert industrial_training_sources (table missing)");
    if (!tables.trainingAssignments) {
      warnings.push("skip insert industrial_training_assignments (table missing)");
    }
  }

  for (let i = 0; i < DEMO_SEED_TARGETS.incidents; i += 1) {
    const src = sourceFields(`incident-${i + 1}`);
    await sql`
      insert into industrial_incidents (
        id, tenant_id, site_id, title, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
        ${`DEMO Near Miss ${i + 1}`},
        ${i % 3 === 0 ? "CLOSED" : "ACTIVE"},
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.incidents = DEMO_SEED_TARGETS.incidents;

  for (let i = 0; i < DEMO_SEED_TARGETS.oshaRecordables; i += 1) {
    const src = sourceFields(`osha-${i + 1}`);
    await sql`
      insert into industrial_osha_cases (
        id, tenant_id, site_id, department_id, personnel_id, title, status, record_date,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${departmentIds[i % departmentIds.length]}::uuid,
        ${personnelIds[i % personnelIds.length]}::uuid,
        ${`DEMO OSHA Case ${i + 1}`},
        'ACTIVE',
        ${isoDateOffset(-(i + 10))},
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.oshaRecordables = DEMO_SEED_TARGETS.oshaRecordables;

  for (let i = 0; i < DEMO_SEED_TARGETS.workersCompCases; i += 1) {
    const src = sourceFields(`wc-${i + 1}`);
    const claimSummary = JSON.stringify({ synthetic: true, demoIndex: i + 1 });
    await sql`
      insert into industrial_workers_comp_cases (
        id, tenant_id, site_id, department_id, personnel_id, case_number, status, severity,
        reported_at, claim_summary,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${departmentIds[i % departmentIds.length]}::uuid,
        ${personnelIds[i % personnelIds.length]}::uuid,
        ${`DEMO-WC-${String(i + 1).padStart(3, "0")}`},
        'OPEN',
        ${i % 2 === 0 ? "MEDICAL_ONLY" : "LOST_TIME"},
        ${now},
        ${claimSummary}::jsonb,
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.workersCompCases = DEMO_SEED_TARGETS.workersCompCases;

  for (let i = 0; i < DEMO_SEED_TARGETS.inspections; i += 1) {
    const src = sourceFields(`inspection-${i + 1}`);
    const completed = i % 4 === 0;
    await sql`
      insert into industrial_inspections (
        id, tenant_id, site_id, department_id, title, status, inspection_type, completed_at,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${departmentIds[i % departmentIds.length]}::uuid,
        ${`DEMO Inspection ${i + 1}`},
        ${completed ? "COMPLETED" : "ACTIVE"},
        ${i % 2 === 0 ? "AREA" : "EQUIPMENT"},
        ${completed ? now : null},
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.inspections = DEMO_SEED_TARGETS.inspections;

  if (tables.fleet) {
    for (let i = 0; i < DEMO_SEED_TARGETS.vehicles; i += 1) {
      const src = sourceFields(`vehicle-${i + 1}`);
      await sql`
        insert into industrial_fleet_vehicles (
          id, tenant_id, site_id, asset_number, asset_type, year, make, model,
          license_plate, license_state, status, out_of_service, dot_regulated,
          source_system, source_collection, source_document_id, source_payload,
          created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
          ${`DEMO-VEH-${String(i + 1).padStart(3, "0")}`},
          'FLEET_VEHICLE',
          ${2018 + (i % 7)},
          ${i % 2 === 0 ? "Ford" : "Chevrolet"},
          ${i % 2 === 0 ? "F-150" : "Silverado"},
          ${`DM${String(i + 1).padStart(4, "0")}`},
          'TX', 'ACTIVE', false, ${i % 3 === 0},
          ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
          ${now}, ${now}
        )
      `;
    }
    counts.vehicles = DEMO_SEED_TARGETS.vehicles;
  } else {
    warnings.push("skip insert industrial_fleet_vehicles (table missing)");
  }

  const equipmentIds = [];
  for (let i = 0; i < DEMO_SEED_TARGETS.equipmentAssets; i += 1) {
    const id = randomUUID();
    equipmentIds.push(id);
    const src = sourceFields(`equipment-${i + 1}`);
    await sql`
      insert into industrial_equipment (
        id, tenant_id, site_id, name, equipment_number, equipment_type, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
        ${`DEMO Equipment ${i + 1}`},
        ${`DEMO-EQ-${String(i + 1).padStart(3, "0")}`},
        ${i % 2 === 0 ? "PRESS" : "CONVEYOR"},
        'ACTIVE',
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.equipmentAssets = equipmentIds.length;

  if (tables.supply) {
    for (let i = 0; i < DEMO_SEED_TARGETS.safetySupplyItems; i += 1) {
      const name = SUPPLY_NAMES[i % SUPPLY_NAMES.length];
      await sql`
        insert into industrial_supply_items (
          id, tenant_id, item_number, name, short_name, status, inventory_type, unit_of_measure,
          created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid,
          ${`DEMO-${String(i + 1).padStart(4, "0")}`},
          ${`${name} ${i + 1}`},
          ${name},
          'ACTIVE', 'CONSUMABLE', 'EA',
          ${now}, ${now}
        )
      `;
    }
    counts.safetySupplyItems = DEMO_SEED_TARGETS.safetySupplyItems;
  } else {
    warnings.push("skip insert industrial_supply_items (table missing)");
  }

  for (let i = 0; i < DEMO_SEED_TARGETS.lotoProcedures; i += 1) {
    const src = sourceFields(`loto-${i + 1}`);
    await sql`
      insert into industrial_loto_procedures (
        id, tenant_id, site_id, equipment_id, title, procedure_number, revision, status,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${equipmentIds[i % equipmentIds.length]}::uuid,
        ${`DEMO LOTO Procedure ${i + 1}`},
        ${`DEMO-LOTO-${String(i + 1).padStart(3, "0")}`},
        'A', 'ACTIVE',
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.lotoProcedures = DEMO_SEED_TARGETS.lotoProcedures;

  for (let i = 0; i < DEMO_SEED_TARGETS.qrEquipmentRecords; i += 1) {
    const src = sourceFields(`qr-equipment-${i + 1}`);
    const actionConfig = JSON.stringify({ kind: "equipment_profile" });
    const metadata = JSON.stringify({ synthetic: true });
    await sql`
      insert into qr_links (
        id, tenant_id, site_id, label, display_code, status, access_mode, action_config,
        target_type, target_id, scan_count, metadata,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
        ${`DEMO QR Equipment ${i + 1}`},
        ${`DEMOQR${String(i + 1).padStart(3, "0")}`},
        'ACTIVE', 'AUTHENTICATED_ONLY', ${actionConfig}::jsonb,
        'EQUIPMENT', ${equipmentIds[i % equipmentIds.length]}::uuid, 0, ${metadata}::jsonb,
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.qrEquipmentRecords = DEMO_SEED_TARGETS.qrEquipmentRecords;

  const taskIds = [];
  for (let i = 0; i < DEMO_SEED_TARGETS.tasks; i += 1) {
    const id = randomUUID();
    taskIds.push(id);
    const src = sourceFields(`task-${i + 1}`);
    const completed = i % 5 === 0;
    await sql`
      insert into industrial_tasks (
        id, tenant_id, site_id, department_id, title, status, assignee_personnel_id,
        due_date, completed_at,
        source_system, source_collection, source_document_id, source_payload,
        created_at, updated_at
      ) values (
        ${id}::uuid, ${tenantId}::uuid,
        ${siteIds[i % siteIds.length]}::uuid,
        ${departmentIds[i % departmentIds.length]}::uuid,
        ${`DEMO Task ${i + 1}`},
        ${completed ? "COMPLETED" : "ACTIVE"},
        ${personnelIds[i % personnelIds.length]}::uuid,
        ${isoDateOffset(i + 3)},
        ${completed ? now : null},
        ${src.sourceSystem}, ${src.sourceCollection}, ${src.sourceDocumentId}, ${src.sourcePayload}::jsonb,
        ${now}, ${now}
      )
    `;
  }
  counts.tasks = taskIds.length;

  const eventIds = [];
  if (tables.calendar) {
    for (let i = 0; i < DEMO_SEED_TARGETS.calendarEvents; i += 1) {
      const id = randomUUID();
      eventIds.push(id);
      const startsAt = new Date(Date.now() + (i + 1) * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      await sql`
        insert into industrial_calendar_events (
          id, tenant_id, site_id, title, description, starts_at, ends_at, all_day, status, task_id,
          created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantId}::uuid, ${siteIds[i % siteIds.length]}::uuid,
          ${`DEMO: Safety Meeting ${i + 1}`},
          'Synthetic demo calendar event',
          ${startsAt}, ${endsAt}, false, 'SCHEDULED',
          ${taskIds[i % taskIds.length]}::uuid,
          ${now}, ${now}
        )
      `;
    }
    counts.calendarEvents = eventIds.length;
  } else {
    warnings.push("skip insert industrial_calendar_events (table missing)");
  }

  if (tables.reminders && eventIds.length > 0) {
    for (let i = 0; i < DEMO_SEED_TARGETS.reminders; i += 1) {
      const remindAt = new Date(Date.now() + (i + 2) * 86_400_000);
      await sql`
        insert into industrial_reminders (
          id, tenant_id, event_id, task_id, title, remind_at, channel, status, recipient_user_ids,
          created_at, updated_at
        ) values (
          ${randomUUID()}::uuid, ${tenantId}::uuid,
          ${eventIds[i % eventIds.length]}::uuid,
          ${taskIds[i % taskIds.length]}::uuid,
          ${`DEMO: Reminder ${i + 1}`},
          ${remindAt}, 'IN_APP', 'PENDING', '[]'::jsonb,
          ${now}, ${now}
        )
      `;
    }
    counts.reminders = DEMO_SEED_TARGETS.reminders;
  } else if (!tables.reminders) {
    warnings.push("skip insert industrial_reminders (table missing)");
  }

  for (let i = 0; i < DEMO_SEED_TARGETS.reports; i += 1) {
    const payload = JSON.stringify({ synthetic: true, demoIndex: i + 1 });
    await sql`
      insert into report_definitions (
        id, tenant_id, report_key, name, description, origin, category, module_code,
        report_type, payload_json, status, created_at, updated_at
      ) values (
        ${randomUUID()}::uuid, ${tenantId}::uuid,
        ${`demo.report.${i + 1}`},
        ${`DEMO Safety Report ${i + 1}`},
        'Synthetic demo saved report',
        'saved', 'safety', 'industrial', 'standard', ${payload}::jsonb, 'ACTIVE',
        ${now}, ${now}
      )
    `;
  }
  counts.reports = DEMO_SEED_TARGETS.reports;

  return counts;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  const warnings = [];

  try {
    const tenantRows = await sql`
      select id::text as id, tenant_key, display_name, status
      from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenantRows[0]) {
      throw new Error(`Tenant not found for tenant_key=${TENANT_KEY}`);
    }
    const tenantId = tenantRows[0].id;
    const hasIsDemoTenant = await columnExists(sql, "tenants", "is_demo_tenant");

    const tables = {
      fleet: await tableExists(sql, "industrial_fleet_vehicles"),
      trainingSources: await tableExists(sql, "industrial_training_sources"),
      trainingAssignments: await tableExists(sql, "industrial_training_assignments"),
      demoSeedVersions: await tableExists(sql, "demo_seed_versions"),
      calendar: await tableExists(sql, "industrial_calendar_events"),
      reminders: await tableExists(sql, "industrial_reminders"),
      supply: await tableExists(sql, "industrial_supply_items"),
    };

    const existingDemo = await sql`
      select
        (select count(*)::int from industrial_sites
          where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO') as sites,
        (select count(*)::int from industrial_personnel
          where tenant_id = ${tenantId}::uuid and source_system = 'FORGE_DEMO') as personnel
    `;
    const demoSites = existingDemo[0]?.sites ?? 0;
    const demoPersonnel = existingDemo[0]?.personnel ?? 0;
    const empty = demoSites === 0 && demoPersonnel === 0;

    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "dry-run",
            phase: "FORGE-PLATFORM-DEMO-SEED",
            at: new Date().toISOString(),
            tenantKey: TENANT_KEY,
            tenantId,
            displayName: tenantRows[0].display_name,
            empty,
            existingDemoCounts: { sites: demoSites, personnel: demoPersonnel },
            hasIsDemoTenantColumn: hasIsDemoTenant,
            companyName: COMPANY_NAME,
            plannedTargets: DEMO_SEED_TARGETS,
            optionalTables: tables,
            note: "Set APPLY=1 to write. No changes made.",
          },
          null,
          2,
        ),
      );
      return;
    }

    let result;
    await sql.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;

      if (hasIsDemoTenant) {
        await tx`
          update tenants
          set is_demo_tenant = true, updated_at = now()
          where id = ${tenantId}::uuid
        `;
      } else {
        warnings.push("tenants.is_demo_tenant column missing; skipped");
      }

      const roleResult = await ensureRole(tx, tenantId);
      const roleId = roleResult.roleId;
      if (roleResult.missingOptionalPerms.length > 0) {
        warnings.push(
          `optional permissions missing from catalog: ${roleResult.missingOptionalPerms.join(", ")}`,
        );
      }
      const admin = await ensureAdminUser(tx, tenantId, TENANT_KEY, roleId);
      const entitlements = await entitle(tx, tenantId, admin.membershipId, admin.userId);
      const flags = await enableFlags(tx, tenantId, admin.userId);

      await cleanupPriorDemo(tx, tenantId, tables, warnings);
      const counts = await insertSyntheticDataset(tx, tenantId, tables, warnings);

      let seedVersionId = null;
      if (tables.demoSeedVersions) {
        await tx`
          update demo_seed_versions
          set is_active = false, updated_at = now()
          where tenant_id = ${tenantId}::uuid
        `;
        seedVersionId = randomUUID();
        const snapshot = JSON.stringify({
          plan: {
            tenantSlug: TENANT_KEY,
            companyName: COMPANY_NAME,
            locations: DEMO_LOCATIONS,
            divisions: DEMO_DIVISIONS,
            targets: DEMO_SEED_TARGETS,
          },
          counts,
          appliedAt: new Date().toISOString(),
          note: "Synthetic Forge Industrial Demo rows (FORGE_DEMO / DEMO: prefixes).",
        });
        const version = `apply-${new Date().toISOString().slice(0, 19)}`;
        await tx`
          insert into demo_seed_versions (
            id, tenant_id, seed_key, version, snapshot_json, is_active, seeded_at, created_at, updated_at
          ) values (
            ${seedVersionId}::uuid, ${tenantId}::uuid, 'default', ${version},
            ${snapshot}::jsonb, true, now(), now(), now()
          )
        `;
      } else {
        warnings.push("skip demo_seed_versions (table missing)");
      }

      result = {
        ok: true,
        mode: "apply",
        phase: "FORGE-PLATFORM-DEMO-SEED",
        at: new Date().toISOString(),
        tenantKey: TENANT_KEY,
        tenantId,
        isDemoTenantSet: hasIsDemoTenant,
        roleId,
        admin,
        entitlements,
        flagsEnabled: flags.filter((f) => f.action !== "skipped_missing_definition").length,
        flagSkipped: flags
          .filter((f) => f.action === "skipped_missing_definition")
          .map((f) => f.key),
        seedVersionId,
        counts,
        warnings,
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
