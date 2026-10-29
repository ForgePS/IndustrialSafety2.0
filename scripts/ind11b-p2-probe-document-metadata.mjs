#!/usr/bin/env node
/**
 * Read-only probe: platform document tables + staging tenant counts.
 * Runs inside platform-api ECS with DATABASE_SECRET_ARN (forge_admin).
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const PROD_TWIN = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";

async function resolveDatabaseUrl() {
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) throw new Error("DATABASE_SECRET_ARN required");
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = JSON.parse(res.SecretString);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${raw.host ?? raw.hostname}:${Number(raw.port ?? 5432)}/${raw.dbname ?? raw.database}`;
}

async function main() {
  const sql = postgres(await resolveDatabaseUrl(), { max: 1 });
  try {
    const user = (await sql`select current_user as u, current_database() as db`)[0];
    const tables = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and (
          table_name like '%document%'
          or table_name like 'platform_%'
          or table_name like 'industrial_%document%'
        )
      order by table_name
    `;

    const cols = {};
    for (const t of [
      "platform_documents",
      "platform_document_versions",
      "industrial_equipment_document_links",
    ]) {
      cols[t] = await sql`
        select column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = ${t}
        order by ordinal_position
      `;
    }

    async function counts(tenantId) {
      const out = { tenantId };
      try {
        out.platform_documents = Number(
          (
            await sql`select count(*)::int as c from platform_documents where tenant_id = ${tenantId}::uuid`
          )[0]?.c ?? 0,
        );
      } catch (e) {
        out.platform_documents = String(e.message || e);
      }
      try {
        out.versions_by_status = await sql`
          select availability_status, count(*)::int as c
          from platform_document_versions
          where tenant_id = ${tenantId}::uuid
          group by availability_status
          order by availability_status
        `;
      } catch (e) {
        out.versions_by_status = String(e.message || e);
      }
      try {
        out.equipment_doc_links = Number(
          (
            await sql`select count(*)::int as c from industrial_equipment_document_links where tenant_id = ${tenantId}::uuid`
          )[0]?.c ?? 0,
        );
      } catch (e) {
        out.equipment_doc_links = String(e.message || e);
      }
      try {
        out.sample_pending = await sql`
          select id::text, document_id::text, filename, storage_bucket, storage_key, availability_status, scan_status, content_length
          from platform_document_versions
          where tenant_id = ${tenantId}::uuid
          order by created_at nulls last
          limit 5
        `;
      } catch (e) {
        out.sample_pending = String(e.message || e);
      }
      return out;
    }

    const checks = {};
    try {
      checks.availability_check = await sql`
        select pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'platform_document_versions'::regclass
          and contype = 'c'
      `;
    } catch (e) {
      checks.availability_check = String(e.message || e);
    }

    const result = {
      ok: true,
      phase: "PRODUCERS-P2-storage-aurora-probe",
      user,
      tables: tables.map((r) => r.table_name),
      columns: cols,
      checks,
      staging: await counts(STAGING),
      tenantA: await counts(TENANT_A),
      prodTwin: await counts(PROD_TWIN),
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
  process.exit(1);
});
