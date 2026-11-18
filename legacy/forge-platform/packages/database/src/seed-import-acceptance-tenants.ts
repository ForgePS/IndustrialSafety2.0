/**
 * Seed synthetic Import Platform acceptance tenants + representative rows (forge_admin).
 * Idempotent by profile_key / source_row_key markers.
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "./ids.js";
import * as schema from "./schema.js";
import { tenants } from "./schema.js";
import { seedPlatformData } from "./seed.js";

const TENANTS = [
  {
    key: "import-acceptance-tenant-a",
    slug: "import-acceptance-tenant-a",
    name: "Import Acceptance Tenant A",
  },
  {
    key: "import-acceptance-tenant-b",
    slug: "import-acceptance-tenant-b",
    name: "Import Acceptance Tenant B",
  },
] as const;

const MARKER = "s1-acceptance";

async function ensureTenant(
  db: ReturnType<typeof drizzle<typeof schema>>,
  t: (typeof TENANTS)[number],
): Promise<string> {
  let existing = await db.query.tenants.findFirst({
    where: eq(tenants.tenantKey, t.key),
  });
  if (!existing) {
    const id = createId();
    const now = new Date();
    await db.insert(tenants).values({
      id,
      tenantKey: t.key,
      slug: t.slug,
      legalName: t.name,
      displayName: t.name,
      tenantType: "CUSTOMER",
      status: "ACTIVE",
      timezone: "America/Chicago",
      defaultLocale: "en-US",
      dataRegion: "us-east-1",
      createdAt: now,
      updatedAt: now,
    });
    existing = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  }
  if (!existing) throw new Error(`Failed to seed ${t.key}`);
  return existing.id;
}

async function seedTenantFixture(
  client: postgres.Sql,
  tenantId: string,
  suffix: string,
): Promise<Record<string, string>> {
  const ids = {
    profileId: createId(),
    jobId: createId(),
    fileId: createId(),
    mappingId: createId(),
    batchId: createId(),
    rowId: createId(),
    errorId: createId(),
    dupId: createId(),
    rollbackId: createId(),
  };

  const existing = await client`
    select id::text as id from import_jobs
    where tenant_id = ${tenantId}::uuid and profile_key = ${`${MARKER}-${suffix}`}
    limit 1
  `;
  if (existing.length > 0) {
    return { jobId: String(existing[0]!.id), reused: "true" } as Record<string, string>;
  }

  await client`
    insert into import_profiles (
      id, tenant_id, profile_key, display_name, product_code, module_code, record_type, source_type,
      snapshot_json, is_snapshot, version, created_at, updated_at
    ) values (
      ${ids.profileId}::uuid, ${tenantId}::uuid, ${`${MARKER}-profile-${suffix}`},
      ${`Synthetic Profile ${suffix}`}, 'FORGE_RMS', 'CORE', 'personnel', 'csv',
      '{}'::jsonb, false, 1, now(), now()
    )
  `;

  await client`
    insert into import_jobs (
      id, tenant_id, product_code, module_code, record_type, status, profile_id, profile_key,
      profile_snapshot_json, format, display_name, source_type, correlation_id, progress_percent, version, created_at, updated_at
    ) values (
      ${ids.jobId}::uuid, ${tenantId}::uuid, 'FORGE_RMS', 'CORE', 'personnel', 'UPLOADED',
      ${ids.profileId}::uuid, ${`${MARKER}-${suffix}`}, '{}'::jsonb, 'csv',
      ${`Synthetic Job ${suffix}`}, 'csv',
      ${`corr-${suffix}`}, 0, 1, now(), now()
    )
  `;

  await client`
    insert into import_files (
      id, tenant_id, job_id, file_name, format, s3_bucket, s3_key, scan_status, version, created_at, updated_at
    ) values (
      ${ids.fileId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid,
      ${`synthetic-${suffix}.csv`}, 'csv', 'forge-dev-imports-synthetic',
      ${`acceptance/${suffix}/synthetic.csv`}, 'CLEAN', 1, now(), now()
    )
  `;

  await client`
    insert into import_column_mappings (
      id, tenant_id, job_id, profile_id, source_column, target_field, transform_json, is_required, ordinal, version, created_at, updated_at
    ) values (
      ${ids.mappingId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, ${ids.profileId}::uuid,
      'employee_id', 'externalId', '{}'::jsonb, true, 0, 1, now(), now()
    )
  `;

  await client`
    insert into import_batches (
      id, tenant_id, job_id, batch_number, status, row_count, idempotency_key, version, created_at, updated_at
    ) values (
      ${ids.batchId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, 1, 'PENDING', 1,
      ${`batch-${suffix}-1`}, 1, now(), now()
    )
  `;

  await client`
    insert into import_rows (
      id, tenant_id, job_id, batch_id, file_id, source_row_key, operation_key, status,
      mapped_json, contains_sensitive, version, created_at, updated_at
    ) values (
      ${ids.rowId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, ${ids.batchId}::uuid, ${ids.fileId}::uuid,
      ${`row-${suffix}-1`}, ${`op-${suffix}-1`}, 'STAGED',
      ${JSON.stringify({ externalId: `SYN-${suffix}-001` })}::jsonb, false, 1, now(), now()
    )
  `;

  await client`
    insert into import_row_errors (
      id, tenant_id, job_id, row_id, severity, rule_code, field_path, message, details_json, version, created_at, updated_at
    ) values (
      ${ids.errorId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, ${ids.rowId}::uuid,
      'WARNING', 'type', 'externalId', 'Synthetic warning for acceptance', '{}'::jsonb, 1, now(), now()
    )
  `;

  await client`
    insert into import_duplicate_candidates (
      id, tenant_id, job_id, row_id, confidence, recommended_action, match_fields_json, version, created_at, updated_at
    ) values (
      ${ids.dupId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, ${ids.rowId}::uuid,
      0.5000, 'SKIP', '{}'::jsonb, 1, now(), now()
    )
  `;

  await client`
    insert into import_rollback_events (
      id, tenant_id, job_id, batch_id, status, safety_class, reason, entities_json, version, created_at, updated_at
    ) values (
      ${ids.rollbackId}::uuid, ${tenantId}::uuid, ${ids.jobId}::uuid, ${ids.batchId}::uuid,
      'REQUESTED', 'SAFE', 'Synthetic rollback fixture', '[]'::jsonb, 1, now(), now()
    )
  `;

  return ids;
}

export async function seedImportAcceptanceTenants(): Promise<{
  tenants: Record<string, string>;
  fixtures: Record<string, Record<string, string>>;
}> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  const tenantMap: Record<string, string> = {};
  const fixtures: Record<string, Record<string, string>> = {};

  try {
    await seedPlatformData(db);
    // Ensure import tables exist (migration applied).
    const tables = [
      ...(await db.execute(sql`
        select count(*)::int as c from information_schema.tables
        where table_schema='public' and table_name='import_jobs'
      `)),
    ] as Array<{ c: number }>;
    if ((tables[0]?.c ?? 0) < 1) {
      throw new Error("import_jobs missing — apply migration 0022 before acceptance seed");
    }

    for (const t of TENANTS) {
      const tenantId = await ensureTenant(db, t);
      tenantMap[t.key] = tenantId;
      const suffix = t.key.endsWith("-a") ? "a" : "b";
      fixtures[t.key] = await seedTenantFixture(client, tenantId, suffix);
    }
    return { tenants: tenantMap, fixtures };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const result = await seedImportAcceptanceTenants();
  // eslint-disable-next-line no-console -- CLI output
  console.info(
    JSON.stringify(
      {
        ok: true,
        tenantKeys: Object.keys(result.tenants),
        fixtureKeys: Object.keys(result.fixtures),
      },
      null,
      2,
    ),
  );
  // Full IDs only to stdout JSON for controlled evidence capture (not CloudWatch-friendly logs beyond this).
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify({ ok: true, ...result }));
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-import-acceptance-tenants.ts") ||
  process.argv[1]?.endsWith("seed-import-acceptance-tenants.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
