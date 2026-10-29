/**
 * READ-ONLY: diagnose messaging IMAGE attachments for a tenant (DB + S3 head).
 * Runs inside platform-api ECS image.
 *
 *   TENANT_KEY=forge-platform DATABASE_SECRET_ARN=... DOCUMENTS_BUCKET=... node scripts/diag-messaging-image-attachments.mjs
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const { S3Client, HeadObjectCommand } = apiRequire("@aws-sdk/client-s3");
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = (process.env.TENANT_KEY || "forge-platform").trim();
const DOCUMENTS_BUCKET = (
  process.env.DOCUMENTS_BUCKET ||
  process.env.FORGE_DOCUMENTS_BUCKET ||
  ""
).trim();

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

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

  try {
    const [tenant] = await sql`
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const counts = await sql`
      select
        count(*)::int as attachments_total,
        count(*) filter (where attachment_type = 'IMAGE')::int as images_total,
        count(*) filter (where attachment_type = 'IMAGE' and upload_status = 'COMPLETE')::int as images_complete,
        count(*) filter (where attachment_type = 'IMAGE' and upload_status <> 'COMPLETE')::int as images_incomplete
      from industrial_messaging_attachments
      where tenant_id = ${tenant.id}::uuid
    `;

    const rows = await sql`
      select
        a.id::text as attachment_id,
        a.upload_status,
        a.mime_type,
        a.original_filename,
        a.file_size_bytes,
        a.message_id::text as message_id,
        d.id::text as document_id,
        d.object_key,
        d.bucket_name,
        d.mime_type as doc_mime,
        d.upload_status as doc_upload_status,
        d.file_size_bytes as doc_size
      from industrial_messaging_attachments a
      left join forge_documents d on d.id = a.document_id
      where a.tenant_id = ${tenant.id}::uuid
        and a.attachment_type = 'IMAGE'
      order by a.created_at desc
      limit 25
    `;

    const bucketGuess = DOCUMENTS_BUCKET || rows.find((r) => r.bucket_name)?.bucket_name || "";

    const checked = [];
    for (const row of rows) {
      const bucket = row.bucket_name || bucketGuess;
      let s3Status = "skipped";
      let s3ContentType = null;
      let s3ContentLength = null;
      let s3Error = null;
      if (!bucket || !row.object_key) {
        s3Status = "missing_key_or_bucket";
      } else {
        try {
          const head = await s3.send(
            new HeadObjectCommand({ Bucket: bucket, Key: row.object_key }),
          );
          s3Status = "ok";
          s3ContentType = head.ContentType ?? null;
          s3ContentLength = head.ContentLength ?? null;
        } catch (e) {
          s3Status = "error";
          s3Error = e?.name || e?.Code || String(e?.message || e);
        }
      }
      checked.push({
        attachmentId: row.attachment_id,
        uploadStatus: row.upload_status,
        mimeType: row.mime_type,
        filename: row.original_filename,
        fileSizeBytes: row.file_size_bytes,
        messageId: row.message_id,
        documentId: row.document_id,
        objectKey: row.object_key,
        bucket,
        docMime: row.doc_mime,
        docUploadStatus: row.doc_upload_status,
        s3Status,
        s3ContentType,
        s3ContentLength,
        s3Error,
      });
    }

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          counts: counts[0],
          sampleSize: checked.length,
          missingObjects: checked.filter((c) => c.s3Status !== "ok").length,
          contentTypeMismatches: checked.filter(
            (c) =>
              c.s3Status === "ok" &&
              c.mimeType &&
              c.s3ContentType &&
              c.mimeType !== c.s3ContentType,
          ).length,
          samples: checked,
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
  console.error(e);
  process.exit(1);
});
