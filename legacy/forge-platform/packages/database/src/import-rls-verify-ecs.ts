/**
 * Import Platform live RLS matrix (forge_app). Requires 0022 + acceptance fixtures.
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabase, createId, withTenantTransaction } from "./index.js";

const TABLES = [
  "import_profiles",
  "import_jobs",
  "import_files",
  "import_column_mappings",
  "import_batches",
  "import_rows",
  "import_row_errors",
  "import_duplicate_candidates",
  "import_rollback_events",
] as const;

type CaseResult = { name: string; pass: boolean; detail?: string };

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const db = createDatabase(env.DATABASE_URL);
  const cases: CaseResult[] = [];
  const out: Record<string, unknown> = {
    ok: false,
    crossTenantReads: 0,
    crossTenantWrites: 0,
    metadataLeakage: 0,
    rlsBypass: 0,
    unexpectedPasses: 0,
  };

  const who = [
    ...(await db.execute(sql`select current_user as u, rolsuper, rolbypassrls
    from pg_roles r where r.rolname = current_user`)),
  ][0] as {
    u?: string;
    rolsuper?: boolean;
    rolbypassrls?: boolean;
  };
  out.currentUser = who?.u ?? null;
  out.roleAttrs = { superuser: !!who?.rolsuper, bypassrls: !!who?.rolbypassrls };
  cases.push({
    name: "app_role_not_superuser",
    pass: who?.u === "forge_app" && !who?.rolsuper,
  });
  cases.push({
    name: "app_role_no_bypassrls",
    pass: who?.u === "forge_app" && !who?.rolbypassrls,
  });
  if (who?.rolsuper || who?.rolbypassrls) out.rlsBypass = Number(out.rlsBypass) + 1;

  const force: Record<string, { rs: boolean; force: boolean }> = {};
  for (const t of TABLES) {
    const rls = [
      ...(await db.execute(sql`
        select c.relrowsecurity as rs, c.relforcerowsecurity as fr
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname = ${t}
      `)),
    ][0] as { rs?: boolean; fr?: boolean } | undefined;
    force[t] = { rs: !!rls?.rs, force: !!rls?.fr };
    cases.push({ name: `force_rls_${t}`, pass: !!rls?.rs && !!rls?.fr });
  }
  out.tables = force;

  // Policy presence
  for (const t of TABLES) {
    const pols = [
      ...(await db.execute(sql`
        select polname, pg_get_expr(polqual, polrelid) as using_expr,
               pg_get_expr(polwithcheck, polrelid) as check_expr
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname = ${t}
      `)),
    ] as Array<{ polname: string; using_expr: string | null; check_expr: string | null }>;
    const ok =
      pols.length > 0 &&
      pols.some(
        (p) =>
          (p.using_expr ?? "").includes("app.current_tenant_id") &&
          (p.check_expr ?? "").includes("app.current_tenant_id"),
      );
    cases.push({ name: `policy_${t}`, pass: ok, detail: pols.map((p) => p.polname).join(",") });
  }

  // forge_app cannot SELECT tenants without tenant context; prefer env IDs from seed output.
  const envTenantA = process.env.IMPORT_ACCEPTANCE_TENANT_A_ID?.trim();
  const envTenantB = process.env.IMPORT_ACCEPTANCE_TENANT_B_ID?.trim();
  let tenantA = envTenantA || "";
  let tenantB = envTenantB || "";
  if (!tenantA || !tenantB) {
    const tenants = [
      ...(await db.execute(sql`
        select id::text as id, tenant_key from tenants
        where tenant_key in ('import-acceptance-tenant-a','import-acceptance-tenant-b')
      `)),
    ] as Array<{ id: string; tenant_key: string }>;
    out.tenantsFound = tenants.length;
    tenantA = tenants.find((t) => t.tenant_key === "import-acceptance-tenant-a")?.id || "";
    tenantB = tenants.find((t) => t.tenant_key === "import-acceptance-tenant-b")?.id || "";
  } else {
    out.tenantsFound = 2;
    out.tenantSource = "env";
  }
  out.tenantA = tenantA || null;
  out.tenantB = tenantB || null;
  if (!tenantA || !tenantB) {
    // eslint-disable-next-line no-console -- CLI output for ECS verify task
    console.info(JSON.stringify({ ...out, error: "missing acceptance tenants", cases }));
    process.exit(2);
  }

  // Missing context deny-by-default
  for (const t of TABLES) {
    const rows = [...(await db.execute(sql.raw(`select count(*)::int as c from ${t}`)))] as Array<{
      c: number;
    }>;
    const c = rows[0]?.c ?? 0;
    const pass = c === 0;
    cases.push({ name: `missing_context_${t}`, pass, detail: String(c) });
    if (!pass) {
      out.metadataLeakage = Number(out.metadataLeakage) + 1;
      out.crossTenantReads = Number(out.crossTenantReads) + c;
    }
  }

  // Same-tenant read positive (profiles)
  const aProfiles = await withTenantTransaction(
    db,
    tenantA,
    async (tx) =>
      [...(await tx.execute(sql`select count(*)::int as c from import_profiles`))] as Array<{
        c: number;
      }>,
  );
  cases.push({
    name: "tenant_a_read_own_profiles",
    pass: (aProfiles[0]?.c ?? 0) >= 1,
    detail: String(aProfiles[0]?.c ?? 0),
  });

  const bProfiles = await withTenantTransaction(
    db,
    tenantB,
    async (tx) =>
      [...(await tx.execute(sql`select count(*)::int as c from import_profiles`))] as Array<{
        c: number;
      }>,
  );
  cases.push({
    name: "tenant_b_read_own_profiles",
    pass: (bProfiles[0]?.c ?? 0) >= 1,
    detail: String(bProfiles[0]?.c ?? 0),
  });

  // Cross-tenant child table denials using A's job id from B
  const aJob = await withTenantTransaction(
    db,
    tenantA,
    async (tx) =>
      [
        ...(await tx.execute(sql`
        select id::text as id from import_jobs where profile_key like 's1-acceptance-%' limit 1
      `)),
      ] as Array<{ id: string }>,
  );
  const jobAId = aJob[0]?.id;
  if (!jobAId) {
    // eslint-disable-next-line no-console -- CLI output for ECS verify task
    console.info(JSON.stringify({ ...out, error: "missing acceptance job fixture", cases }));
    process.exit(2);
  }

  const childTables = [
    "import_files",
    "import_column_mappings",
    "import_batches",
    "import_rows",
    "import_row_errors",
    "import_duplicate_candidates",
    "import_rollback_events",
  ] as const;

  for (const t of childTables) {
    const leaked = await withTenantTransaction(
      db,
      tenantB,
      async (tx) =>
        [
          ...(await tx.execute(
            sql.raw(`select count(*)::int as c from ${t} where job_id = '${jobAId}'`),
          )),
        ] as Array<{
          c: number;
        }>,
    );
    const c = leaked[0]?.c ?? 0;
    const pass = c === 0;
    cases.push({ name: `cross_deny_${t}`, pass, detail: String(c) });
    if (!pass) out.crossTenantReads = Number(out.crossTenantReads) + c;
  }

  // Cross-tenant profile select by id
  const profileA = await withTenantTransaction(
    db,
    tenantA,
    async (tx) =>
      [
        ...(await tx.execute(sql`
        select id::text as id from import_profiles where profile_key like 's1-acceptance-profile-%' limit 1
      `)),
      ] as Array<{ id: string }>,
  );
  const profileAId = profileA[0]?.id;
  if (profileAId) {
    const cross = await withTenantTransaction(db, tenantB, async (tx) => [
      ...(await tx.execute(
        sql`select id::text as id from import_profiles where id = ${profileAId}::uuid`,
      )),
    ]);
    cases.push({ name: "cross_deny_profile_by_id", pass: cross.length === 0 });
    if (cross.length) out.crossTenantReads = Number(out.crossTenantReads) + cross.length;
  }

  // Guessed UUID
  const guess = await withTenantTransaction(db, tenantB, async (tx) => [
    ...(await tx.execute(sql`select id::text as id from import_jobs where id = ${jobAId}::uuid`)),
  ]);
  cases.push({ name: "guessed_uuid_job_denied", pass: guess.length === 0 });
  if (guess.length) out.crossTenantReads = Number(out.crossTenantReads) + guess.length;

  // Cross-tenant insert blocked
  let insertBlocked = false;
  try {
    await withTenantTransaction(db, tenantB, async (tx) => {
      const id = createId();
      await tx.execute(sql`
        insert into import_profiles (
          id, tenant_id, profile_key, display_name, product_code, module_code, record_type, source_type, version, created_at, updated_at
        ) values (
          ${id}::uuid, ${tenantA}::uuid, 'cross-insert-probe', 'x', 'FORGE_RMS', 'CORE', 'personnel', 'csv', 1, now(), now()
        )
      `);
    });
  } catch {
    insertBlocked = true;
  }
  cases.push({ name: "cross_insert_blocked", pass: insertBlocked });
  if (!insertBlocked) out.crossTenantWrites = Number(out.crossTenantWrites) + 1;

  // Same-tenant insert/update probe then cleanup
  const probeId = createId();
  await withTenantTransaction(db, tenantA, async (tx) => {
    await tx.execute(sql`
      insert into import_profiles (
        id, tenant_id, profile_key, display_name, product_code, module_code, record_type, source_type, version, created_at, updated_at
      ) values (
        ${probeId}::uuid, ${tenantA}::uuid, 'rls-probe-live', 'probe', 'FORGE_RMS', 'CORE', 'personnel', 'csv', 1, now(), now()
      )
    `);
    await tx.execute(sql`
      update import_profiles set display_name = 'probe2', version = version + 1, updated_at = now()
      where id = ${probeId}::uuid
    `);
  });
  const updated = await withTenantTransaction(
    db,
    tenantA,
    async (tx) =>
      [
        ...(await tx.execute(sql`
        select display_name from import_profiles where id = ${probeId}::uuid
      `)),
      ] as Array<{ display_name: string }>,
  );
  cases.push({
    name: "tenant_a_insert_update_own",
    pass: updated[0]?.display_name === "probe2",
  });

  // Cross update denied
  let updateBlocked = false;
  try {
    await withTenantTransaction(db, tenantB, async (tx) => {
      const res = await tx.execute(sql`
        update import_profiles set display_name = 'hacked' where id = ${probeId}::uuid
      `);
      // drizzle may not throw if 0 rows; treat 0 as deny success
      void res;
    });
    const still = await withTenantTransaction(
      db,
      tenantA,
      async (tx) =>
        [
          ...(await tx.execute(
            sql`select display_name from import_profiles where id = ${probeId}::uuid`,
          )),
        ] as Array<{ display_name: string }>,
    );
    updateBlocked = still[0]?.display_name === "probe2";
  } catch {
    updateBlocked = true;
  }
  cases.push({ name: "cross_update_denied", pass: updateBlocked });
  if (!updateBlocked) out.crossTenantWrites = Number(out.crossTenantWrites) + 1;

  // Cross delete denied
  let deleteBlocked = false;
  try {
    await withTenantTransaction(db, tenantB, async (tx) => {
      await tx.execute(sql`delete from import_profiles where id = ${probeId}::uuid`);
    });
    const still = await withTenantTransaction(db, tenantA, async (tx) => [
      ...(await tx.execute(sql`select id from import_profiles where id = ${probeId}::uuid`)),
    ]);
    deleteBlocked = still.length === 1;
  } catch {
    deleteBlocked = true;
  }
  cases.push({ name: "cross_delete_denied", pass: deleteBlocked });
  if (!deleteBlocked) out.crossTenantWrites = Number(out.crossTenantWrites) + 1;

  await withTenantTransaction(db, tenantA, async (tx) => {
    await tx.execute(sql`delete from import_profiles where id = ${probeId}::uuid`);
  });

  // Cannot disable RLS
  let cannotDisable = false;
  try {
    await db.execute(sql.raw("alter table import_jobs disable row level security"));
  } catch {
    cannotDisable = true;
  }
  cases.push({ name: "cannot_disable_rls", pass: cannotDisable });
  if (!cannotDisable) out.rlsBypass = Number(out.rlsBypass) + 1;

  const failed = cases.filter((c) => !c.pass);
  out.cases = cases;
  out.totals = {
    cases: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: failed.length,
  };
  out.ok =
    failed.length === 0 &&
    Number(out.crossTenantReads) === 0 &&
    Number(out.crossTenantWrites) === 0 &&
    Number(out.metadataLeakage) === 0 &&
    Number(out.rlsBypass) === 0;

  // eslint-disable-next-line no-console -- CLI output for ECS verify task
  console.info(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("import-rls-verify-ecs.ts") ||
  process.argv[1]?.endsWith("import-rls-verify-ecs.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
