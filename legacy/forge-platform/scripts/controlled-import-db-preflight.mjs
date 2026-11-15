#!/usr/bin/env node
/**
 * Production DB preflight probe for CONTROLLED-AURORA-IMPORT-S1.
 * Uses DATABASE_SECRET_ARN (admin). Never prints credentials.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

async function resolveDatabaseUrl() {
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) throw new Error("DATABASE_SECRET_ARN required");
  if (arn.includes("database-app")) throw new Error("Refusing app secret for schema probe");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${Number(raw.port ?? 5432)}/${dbname}`;
}

async function main() {
  const sql = postgres(await resolveDatabaseUrl(), { max: 1 });
  try {
    const eng = await sql`select version() as v, current_user as u, current_database() as db`;
    const migrations = await sql`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at asc
    `.catch(() => []);
    const role = await sql`
      select r.rolname, r.rolsuper, r.rolbypassrls
      from pg_roles r
      where r.rolname = 'forge_app'
    `;
    const industrial = await sql`
      select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (c.relname like 'industrial_%' or c.relname in ('qr_links','qr_link_versions','platform_documents','platform_document_versions'))
      order by 1
    `;
    const tenant = await sql`
      select id::text, tenant_key, slug, status
      from tenants
      where id = '5da680d3-50f5-46ac-8b85-6cf454b6a0da'::uuid
      limit 1
    `;
    console.log(
      JSON.stringify(
        {
          ok: true,
          engine: eng[0]?.v?.slice?.(0, 80),
          currentUser: eng[0]?.u,
          database: eng[0]?.db,
          migrationCount: migrations.length,
          lastMigrationId: migrations.at(-1)?.id ?? null,
          lastMigrationCreatedAt: migrations.at(-1)?.created_at ?? null,
          forgeApp: role[0] ?? null,
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

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }));
  process.exit(1);
});
