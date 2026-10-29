#!/usr/bin/env node
/**
 * Producers P2 Phase 3 N1/N2 — upsert platform document metadata for staging S3 objects.
 *
 * Runs inside platform-api ECS (DATABASE_SECRET_ARN = forge_admin).
 *
 * Env:
 *   FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED=true
 *   FORGE_P2_STORAGE_AURORA_METADATA_MODE=dry-run|apply  (default dry-run)
 *   FORGE_P2_DOC_MAP_S3_URI=s3://bucket/key   (s3-map-staging JSON)
 *   FORGE_P2_DOC_TENANT_ID=0882c865-59c2-49a6-ab88-ce6ca89be30c
 *   FORGE_P2_DOC_BATCH=100
 *   FORGE_P2_DOC_LIMIT=N   (optional cap)
 *   FORGE_P2_DOC_OFFSET=0
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { S3Client, GetObjectCommand } = apiRequire("@aws-sdk/client-s3");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const DEFAULT_TENANT = "0882c865-59c2-49a6-ab88-ce6ca89be30c";
const DEST_BUCKET = "forge-development-documents-511343547817-us-east-1";
const BUSINESS_ID = "business-1782553339499";
const AV_NOTE =
  "AV Option B time-boxed waiver (av-approach-decision.md) expires 2026-09-05; sample re-scan committed";

function fail(msg) {
  console.error(JSON.stringify({ ok: false, error: msg }));
  process.exit(2);
}

async function resolveDatabaseUrl() {
  const arn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!arn) fail("DATABASE_SECRET_ARN required");
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || "us-east-1",
  });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = JSON.parse(res.SecretString);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${raw.host ?? raw.hostname}:${Number(raw.port ?? 5432)}/${raw.dbname ?? raw.database}`;
}

async function loadMap(uri) {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) fail(`Invalid FORGE_P2_DOC_MAP_S3_URI: ${uri}`);
  const client = new S3Client({});
  const res = await client.send(new GetObjectCommand({ Bucket: m[1], Key: m[2] }));
  return JSON.parse(await res.Body.transformToString("utf8"));
}

function categoryLabel(raw) {
  const c = String(raw || "other").toLowerCase();
  if (c.includes("loto")) return "LOTO";
  if (c.includes("equipment")) return "EQUIPMENT";
  if (c.includes("cert")) return "CERTIFICATE";
  if (c.includes("dot")) return "DOT";
  if (c.includes("module")) return "MODULE_ATTACHMENT";
  return "INDUSTRIAL";
}

async function main() {
  if (process.env.FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED?.trim() !== "true") {
    fail("Refused: set FORGE_P2_STORAGE_AURORA_METADATA_AUTHORIZED=true after signing approval");
  }
  const mode = (process.env.FORGE_P2_STORAGE_AURORA_METADATA_MODE || "dry-run").trim();
  if (!["dry-run", "apply"].includes(mode)) fail(`Bad mode ${mode}`);
  const mapUri = process.env.FORGE_P2_DOC_MAP_S3_URI?.trim();
  if (!mapUri) fail("FORGE_P2_DOC_MAP_S3_URI required");
  const tenantId = (process.env.FORGE_P2_DOC_TENANT_ID || DEFAULT_TENANT).trim();
  if (tenantId !== DEFAULT_TENANT) {
    fail(`Refused: this authorization is staging-only (${DEFAULT_TENANT}), got ${tenantId}`);
  }
  const batchSize = Math.max(1, Math.min(500, Number(process.env.FORGE_P2_DOC_BATCH || 200)));
  const offset = Math.max(0, Number(process.env.FORGE_P2_DOC_OFFSET || 0));
  const limitEnv = process.env.FORGE_P2_DOC_LIMIT?.trim();
  const limit = limitEnv ? Math.max(0, Number(limitEnv)) : null;

  const map = await loadMap(mapUri);
  if (!map?.ok || !Array.isArray(map.mappings)) fail("Map JSON missing ok/mappings");
  if (map.target?.tenantId && map.target.tenantId !== tenantId) {
    fail(`Map tenant mismatch: ${map.target.tenantId} vs ${tenantId}`);
  }

  let rows = map.mappings;
  if (offset) rows = rows.slice(offset);
  if (limit != null) rows = rows.slice(0, limit);

  const sql = postgres(await resolveDatabaseUrl(), { max: 1 });
  const startedAt = new Date().toISOString();
  const counts = {
    planned: rows.length,
    documentsInserted: 0,
    documentsUpdated: 0,
    versionsInserted: 0,
    versionsUpdated: 0,
    skipped: 0,
    error: 0,
  };
  const errors = [];
  const sample = [];

  try {
    const tenant = await sql`
      select id::text as id, tenant_key, slug from tenants where id = ${tenantId}::uuid limit 1
    `;
    if (!tenant[0]) fail(`Tenant not found: ${tenantId}`);
    if (tenant[0].tenant_key !== "producers-rice-mill-staging") {
      fail(`Tenant key mismatch: ${tenant[0].tenant_key}`);
    }

    console.error(
      JSON.stringify({
        dbUser: (await sql`select current_user as u`)[0]?.u,
        tenant: tenant[0],
        mode,
        planned: rows.length,
      }),
    );

    if (mode === "dry-run") {
      const beforeDocs = Number(
        (
          await sql`select count(*)::int as c from platform_documents where tenant_id = ${tenantId}::uuid`
        )[0]?.c ?? 0,
      );
      const beforeVers = Number(
        (
          await sql`select count(*)::int as c from platform_document_versions where tenant_id = ${tenantId}::uuid`
        )[0]?.c ?? 0,
      );
      const collisionProbe = await sql`
        select count(*)::int as c
        from platform_documents d
        where d.tenant_id = ${tenantId}::uuid
          and d.id = any(${rows.slice(0, 500).map((r) => r.documentId)}::uuid[])
      `;
      const result = {
        ok: true,
        phase: "PRODUCERS-P2-storage-aurora-metadata",
        mode,
        startedAt,
        finishedAt: new Date().toISOString(),
        tenantId,
        mapUri,
        mapCount: map.mappings.length,
        slice: { offset, limit, planned: rows.length },
        before: { platform_documents: beforeDocs, platform_document_versions: beforeVers },
        sampleIdOverlapInFirst500: Number(collisionProbe[0]?.c ?? 0),
        sampleMappings: rows.slice(0, 5).map((r) => ({
          sourcePath: r.sourcePath,
          documentId: r.documentId,
          versionId: r.versionId,
          s3Key: r.s3Key,
          size: r.size,
          contentType: r.contentType,
          category: r.category,
        })),
        note: "Dry-run only — no writes",
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const prepared = rows.map((r) => {
      const filename = String(r.filename || "file").slice(0, 255);
      return {
        documentId: r.documentId,
        versionId: r.versionId,
        name: String(r.filename || r.sourcePath || "file").slice(0, 300),
        filename,
        contentType: String(r.contentType || "application/octet-stream").slice(0, 200),
        category: categoryLabel(r.category),
        contentLength: Number(r.size ?? 0) || 0,
        s3Key: r.s3Key,
        sourcePath: r.sourcePath,
        metadata: {
          firebaseSourcePath: r.sourcePath,
          firebaseBusinessId: BUSINESS_ID,
          firebaseCategory: r.category || null,
          firebaseMd5Base64: r.md5Hash || null,
          firebaseCrc32c: r.crc32c || null,
          firebaseGeneration: r.generation || null,
          avWaiver: AV_NOTE,
          phase: "PRODUCERS-P2-storage-aurora-metadata",
        },
      };
    });

    for (let i = 0; i < prepared.length; i += batchSize) {
      const batch = prepared.slice(i, i + batchSize);
      try {
        await sql.begin(async (tx) => {
          const docIds = batch.map((r) => r.documentId);
          const verIds = batch.map((r) => r.versionId);
          const existingDocs = await tx`
            select id::text as id from platform_documents where id = any(${docIds}::uuid[])
          `;
          const existingVers = await tx`
            select id::text as id from platform_document_versions where id = any(${verIds}::uuid[])
          `;
          const existingDocSet = new Set(existingDocs.map((r) => r.id));
          const existingVerSet = new Set(existingVers.map((r) => r.id));

          const docsInsert = batch.filter((r) => !existingDocSet.has(r.documentId));
          const docsUpdate = batch.filter((r) => existingDocSet.has(r.documentId));
          const versInsert = batch.filter((r) => !existingVerSet.has(r.versionId));
          const versUpdate = batch.filter((r) => existingVerSet.has(r.versionId));

          if (docsInsert.length) {
            await tx`
              insert into platform_documents ${tx(
                docsInsert.map((r) => ({
                  id: r.documentId,
                  tenant_id: tenantId,
                  name: r.name,
                  description: null,
                  category: r.category,
                  status: "ACTIVE",
                  metadata: r.metadata,
                })),
                "id",
                "tenant_id",
                "name",
                "description",
                "category",
                "status",
                "metadata",
              )}
            `;
          }
          for (const r of docsUpdate) {
            await tx`
              update platform_documents set
                name = ${r.name},
                category = ${r.category},
                status = 'ACTIVE',
                metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json(r.metadata)},
                updated_at = now()
              where id = ${r.documentId}::uuid
            `;
          }

          if (versInsert.length) {
            await tx`
              insert into platform_document_versions ${tx(
                versInsert.map((r) => ({
                  id: r.versionId,
                  tenant_id: tenantId,
                  document_id: r.documentId,
                  version_number: 1,
                  filename: r.filename,
                  content_type: r.contentType,
                  content_length: r.contentLength,
                  storage_bucket: DEST_BUCKET,
                  storage_key: r.s3Key,
                  availability_status: "AVAILABLE",
                  scan_status: "CLEAN",
                })),
                "id",
                "tenant_id",
                "document_id",
                "version_number",
                "filename",
                "content_type",
                "content_length",
                "storage_bucket",
                "storage_key",
                "availability_status",
                "scan_status",
              )}
            `;
          }
          for (const r of versUpdate) {
            await tx`
              update platform_document_versions set
                filename = ${r.filename},
                content_type = ${r.contentType},
                content_length = ${r.contentLength},
                storage_bucket = ${DEST_BUCKET},
                storage_key = ${r.s3Key},
                availability_status = 'AVAILABLE',
                scan_status = 'CLEAN'
              where id = ${r.versionId}::uuid
            `;
          }

          await tx`
            update platform_documents d
            set current_version_id = v.version_id, updated_at = now()
            from (
              select * from unnest(
                ${batch.map((r) => r.documentId)}::uuid[],
                ${batch.map((r) => r.versionId)}::uuid[]
              ) as t(document_id, version_id)
            ) v
            where d.id = v.document_id
          `;

          counts.documentsInserted += docsInsert.length;
          counts.documentsUpdated += docsUpdate.length;
          counts.versionsInserted += versInsert.length;
          counts.versionsUpdated += versUpdate.length;
          for (const r of batch) {
            if (sample.length < 8) {
              sample.push({
                sourcePath: r.sourcePath,
                documentId: r.documentId,
                versionId: r.versionId,
                s3Key: r.s3Key,
                contentLength: r.contentLength,
              });
            }
          }
        });
      } catch (e) {
        counts.error += batch.length;
        if (errors.length < 40) {
          errors.push({ batchStart: i, batchSize: batch.length, error: String(e.message || e) });
        }
      }
    }

    const afterDocs = Number(
      (
        await sql`select count(*)::int as c from platform_documents where tenant_id = ${tenantId}::uuid`
      )[0]?.c ?? 0,
    );
    const afterVers = await sql`
      select availability_status, count(*)::int as c
      from platform_document_versions
      where tenant_id = ${tenantId}::uuid
      group by availability_status
      order by availability_status
    `;

    const result = {
      ok:
        counts.error === 0 &&
        afterDocs >= Math.min(rows.length, counts.documentsInserted + counts.documentsUpdated),
      phase: "PRODUCERS-P2-storage-aurora-metadata",
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      tenantId,
      mapUri,
      counts,
      after: { platform_documents: afterDocs, versions_by_status: afterVers },
      sample,
      errors,
      avNote: AV_NOTE,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e), stack: e?.stack }));
  process.exit(1);
});
