/**
 * Phase 4 R3 — forge_app RLS isolation (self-contained for /tmp on ECS).
 * Uses task DATABASE_URL (forge_app). Do NOT inject DATABASE_SECRET_ARN.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const STAGING = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const TWIN = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";
const TENANT_A = "019faa15-e558-70b6-adcd-a510c3c995f4";
const TABLES = [
  "industrial_sites",
  "industrial_equipment",
  "industrial_personnel",
  "industrial_loto_procedures",
  "qr_links",
  "platform_documents",
];

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

function createId() {
  return randomUUID();
}

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) throw new Error("DATABASE_URL or DATABASE_SECRET_ARN required");
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "us-east-1" });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!res.SecretString) throw new Error("Database secret empty");
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  if (!host || !dbname || !raw.username || !raw.password) {
    throw new Error("Database secret missing fields");
  }
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function withTenant(sql, tenantId, fn) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

async function main() {
  const databaseUrl = await resolveDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 1 });
  const out = {
    ok: false,
    phase: "PRODUCERS-P4-R3-rls",
    at: new Date().toISOString(),
    staging: STAGING,
    twin: TWIN,
    tenantA: TENANT_A,
    secretArnHint: (process.env.DATABASE_SECRET_ARN || "").includes("database-app")
      ? "database-app"
      : (process.env.DATABASE_SECRET_ARN || "").includes("database")
        ? "database(?)"
        : "url-or-unset",
  };

  try {
    const who = await sql`select current_user as u, session_user as s`;
    out.currentUser = who[0]?.u ?? null;
    out.sessionUser = who[0]?.s ?? null;

    const rlsRows = await sql`
      select c.relname as t, c.relrowsecurity as rs, c.relforcerowsecurity as fr
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any(${TABLES})
      order by 1
    `;
    out.relForce = Object.fromEntries(
      rlsRows.map((r) => [r.t, { rowSecurity: !!r.rs, forceRls: !!r.fr }]),
    );

    async function countsFor(tenantId) {
      return withTenant(sql, tenantId, async (tx) => {
        const sites = await tx`select count(*)::int as c from industrial_sites`;
        const equipment = await tx`select count(*)::int as c from industrial_equipment`;
        const personnel = await tx`select count(*)::int as c from industrial_personnel`;
        const loto = await tx`select count(*)::int as c from industrial_loto_procedures`;
        const qr = await tx`select count(*)::int as c from qr_links`;
        const docs = await tx`select count(*)::int as c from platform_documents`;
        return {
          industrial_sites: sites[0]?.c ?? 0,
          industrial_equipment: equipment[0]?.c ?? 0,
          industrial_personnel: personnel[0]?.c ?? 0,
          industrial_loto_procedures: loto[0]?.c ?? 0,
          qr_links: qr[0]?.c ?? 0,
          platform_documents: docs[0]?.c ?? 0,
        };
      });
    }

    out.counts = {
      staging: await countsFor(STAGING),
      twin: await countsFor(TWIN),
      tenantA: await countsFor(TENANT_A),
    };

    const stagingEquipIds = await withTenant(sql, STAGING, async (tx) =>
      (
        await tx`
          select id::text as id from industrial_equipment
          order by created_at desc nulls last
          limit 200
        `
      ).map((r) => r.id),
    );
    out.stagingEquipmentSample = stagingEquipIds.length;

    const leakedToTwin = await withTenant(sql, TWIN, async (tx) => {
      if (!stagingEquipIds.length) return [];
      const all = (await tx`select id::text as id from industrial_equipment`).map((r) => r.id);
      return all.filter((id) => stagingEquipIds.includes(id));
    });
    out.twinSeesStagingEquipmentIds = leakedToTwin;

    const leakedToA = await withTenant(sql, TENANT_A, async (tx) => {
      if (!stagingEquipIds.length) return [];
      const all = (await tx`select id::text as id from industrial_equipment`).map((r) => r.id);
      return all.filter((id) => stagingEquipIds.includes(id));
    });
    out.tenantASeesStagingEquipmentIds = leakedToA;

    let writeBlocked = false;
    let writeErr = null;
    try {
      await withTenant(sql, TWIN, async (tx) => {
        const id = createId();
        await tx`
          insert into industrial_sites (
            id, tenant_id, name, status,
            source_system, source_project, source_collection, source_document_id, source_path
          ) values (
            ${id}::uuid, ${STAGING}::uuid, 'p4-rls-probe', 'ACTIVE',
            'rls-probe', 'forge-industrial-safety', 'sites', ${`probe-${id}`}, ${`probe/${id}`}
          )
        `;
      });
    } catch (e) {
      writeBlocked = true;
      writeErr = e instanceof Error ? e.message : String(e);
    }
    out.crossTenantInsertBlocked = writeBlocked;
    out.crossTenantInsertError = writeErr?.slice?.(0, 300) ?? writeErr;

    if (!writeBlocked) {
      await withTenant(sql, STAGING, async (tx) => {
        await tx`delete from industrial_sites where name = 'p4-rls-probe'`;
      });
      out.unexpectedInsert = true;
    }

    const rlsEnabled = TABLES.every((t) => out.relForce?.[t]?.rowSecurity === true);
    const forceOk = TABLES.every((t) => out.relForce?.[t]?.forceRls === true);
    const stagingLoaded =
      (out.counts.staging.industrial_equipment ?? 0) >= 2400 &&
      (out.counts.staging.industrial_personnel ?? 0) >= 1000 &&
      (out.counts.staging.qr_links ?? 0) >= 2400 &&
      (out.counts.staging.platform_documents ?? 0) >= 9000;
    const twinSparse = (out.counts.twin.industrial_equipment ?? 0) < 50;
    const noLeak = leakedToTwin.length === 0 && leakedToA.length === 0;

    out.checks = {
      forgeApp: out.currentUser === "forge_app",
      rlsEnabled,
      forceRlsAll: forceOk,
      stagingLoaded,
      twinSparse,
      noCrossTenantLeak: noLeak,
      crossTenantInsertBlocked: writeBlocked,
    };

    out.ok =
      out.checks.forgeApp &&
      out.checks.rlsEnabled &&
      out.checks.stagingLoaded &&
      out.checks.twinSparse &&
      out.checks.noCrossTenantLeak &&
      out.checks.crossTenantInsertBlocked &&
      !out.unexpectedInsert;

    console.log(JSON.stringify(out));
    process.exit(out.ok ? 0 : 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, phase: "PRODUCERS-P4-R3-rls", error: String(e) }));
  process.exit(1);
});
