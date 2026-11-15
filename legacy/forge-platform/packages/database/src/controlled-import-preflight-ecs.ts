/**
 * Production DB preflight probe for CONTROLLED-AURORA-IMPORT-S1.
 * Resolves DATABASE_SECRET_ARN (admin only). Never prints credentials.
 *
 * Command: node /app/packages/database/dist/controlled-import-preflight-ecs.js
 */
import { buildDatabaseUrl, resolveDatabaseSecret } from "@forge/environment";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

const PRODUCERS_TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(2);
}

async function resolveAdminDatabaseUrl(): Promise<string> {
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) fail("DATABASE_SECRET_ARN required");
  if (arn.includes("database-app")) {
    fail("Refusing app secret (database-app) for controlled-import preflight");
  }
  if (!arn.includes("forge-production-secrets-database")) {
    fail("DATABASE_SECRET_ARN must be admin forge-production-secrets-database");
  }
  const region = process.env.AWS_REGION || "us-east-1";
  const fields = await resolveDatabaseSecret(arn, region);
  if (!fields) fail("Failed to resolve database secret");
  return buildDatabaseUrl(fields);
}

async function main(): Promise<void> {
  const sql = postgres(await resolveAdminDatabaseUrl(), { max: 1 });
  try {
    const eng = await sql`
      select version() as v, current_user as u, current_database() as db
    `;
    const migrations = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at asc
    `.catch(() => [] as Array<{ id: number; hash: string; created_at: Date }>);

    const role = await sql`
      select r.rolname, r.rolsuper, r.rolbypassrls
      from pg_roles r
      where r.rolname = 'forge_app'
    `;

    const industrial = await sql`
      select
        c.relname as table_name,
        c.relrowsecurity as rls,
        c.relforcerowsecurity as force_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (
          c.relname like 'industrial_%'
          or c.relname in (
            'qr_links',
            'qr_link_versions',
            'platform_documents',
            'platform_document_versions',
            'platform_ehs_audit_templates',
            'platform_ehs_audit_template_versions'
          )
        )
      order by 1
    `;

    const tenant = await sql`
      select id::text as id, tenant_key, slug, status
      from tenants
      where id = ${PRODUCERS_TENANT_ID}::uuid
      limit 1
    `;

    // eslint-disable-next-line no-console -- CLI output for ECS one-off
    console.info(
      JSON.stringify(
        {
          ok: true,
          engine: String(eng[0]?.v ?? "").slice(0, 80),
          currentUser: eng[0]?.u ?? null,
          database: eng[0]?.db ?? null,
          migrationCount: migrations.length,
          migrations: migrations.map((m) => ({
            id: m.id,
            hash: m.hash,
            createdAt: m.created_at,
          })),
          lastMigrationId: migrations.at(-1)?.id ?? null,
          lastMigrationCreatedAt: migrations.at(-1)?.created_at ?? null,
          forgeApp: role[0]
            ? {
                rolname: role[0].rolname,
                rolsuper: role[0].rolsuper,
                rolbypassrls: role[0].rolbypassrls,
              }
            : null,
          industrialTableCount: industrial.length,
          industrialTables: industrial,
          producersTenant: tenant[0] ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isDirect =
  Boolean(process.argv[1]) &&
  (pathToFileURL(path.resolve(process.argv[1]!)).href === import.meta.url ||
    process.argv[1]!.endsWith("controlled-import-preflight-ecs.ts") ||
    process.argv[1]!.endsWith("controlled-import-preflight-ecs.js"));

if (isDirect) {
  main().catch((error: unknown) => {
    console.error(JSON.stringify({ ok: false, error: String(error) }));
    process.exit(1);
  });
}
