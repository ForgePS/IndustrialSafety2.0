/**
 * Live catalog verification for import_* objects (forge_admin).
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import * as schema from "./schema.js";

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

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const who = [...(await db.execute(sql`select current_user as u`))][0] as { u?: string };
    const ledger = [
      ...(await db.execute(sql`
        select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5
      `)),
    ];
    const tables: Record<string, unknown> = {};
    for (const t of TABLES) {
      const cols = [
        ...(await db.execute(sql`
          select column_name from information_schema.columns
          where table_schema='public' and table_name=${t}
          order by ordinal_position
        `)),
      ] as Array<{ column_name: string }>;
      const names = cols.map((c) => c.column_name);
      const rls = [
        ...(await db.execute(sql`
          select c.relrowsecurity as rs, c.relforcerowsecurity as fr
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname='public' and c.relname=${t}
        `)),
      ][0] as { rs?: boolean; fr?: boolean } | undefined;
      tables[t] = {
        columns: names,
        hasTenantId: names.includes("tenant_id"),
        hasCreatedBy: names.includes("created_by"),
        hasUpdatedBy: names.includes("updated_by"),
        hasVersion: names.includes("version"),
        rls: !!rls?.rs,
        force: !!rls?.fr,
      };
    }
    const enums = [
      ...(await db.execute(sql`
        select t.typname, e.enumlabel
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typname in ('import_job_status','import_rollback_safety')
        order by 1, e.enumsortorder
      `)),
    ];
    const perms = [
      ...(await db.execute(
        sql`select code from permissions where code like 'import.%' order by 1`,
      )),
    ] as Array<{ code: string }>;

    const ok =
      TABLES.every((t) => {
        const info = tables[t] as {
          hasTenantId: boolean;
          hasCreatedBy: boolean;
          hasUpdatedBy: boolean;
          hasVersion: boolean;
          rls: boolean;
          force: boolean;
        };
        return (
          info.hasTenantId &&
          info.hasCreatedBy &&
          info.hasUpdatedBy &&
          info.hasVersion &&
          info.rls &&
          info.force
        );
      }) && perms.length === 12;

    // eslint-disable-next-line no-console -- CLI output for ECS verify task
    console.info(
      JSON.stringify({
        ok,
        currentUser: who?.u,
        ledger,
        tables,
        enums,
        importPermissionCount: perms.length,
        importPermissions: perms.map((p) => p.code),
      }),
    );
    process.exit(ok ? 0 : 1);
  } finally {
    await client.end({ timeout: 5 });
  }
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("import-catalog-verify-ecs.ts") ||
  process.argv[1]?.endsWith("import-catalog-verify-ecs.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
