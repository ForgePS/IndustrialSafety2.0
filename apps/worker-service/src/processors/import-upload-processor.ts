import { createHash } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSharedDatabase, importFiles, importJobs, withTenantTransaction } from "@forge/database";
import {
  assertMalwareGate,
  detectImportFormat,
  IMPORT_UPLOAD_DETECT_MESSAGE_TYPE,
  nextStatusForS3Action,
  type ImportJobStatus,
  type ImportUploadDetectMessage,
} from "@forge/imports";
import { createLogger } from "@forge/observability";
import { and, eq, isNull } from "drizzle-orm";

export type ImportDetectOutcome = "completed" | "retry";

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (
    typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray ===
    "function"
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function processImportUploadDetectJob(input: {
  job: ImportUploadDetectMessage;
  databaseUrl: string;
  region: string;
}): Promise<ImportDetectOutcome> {
  const logger = createLogger({
    service: "worker-service",
    environment: process.env.APP_ENV ?? "development",
  });
  if (input.job.type !== IMPORT_UPLOAD_DETECT_MESSAGE_TYPE) {
    logger.warn("unknown import message type", { type: (input.job as { type?: string }).type });
    return "completed";
  }

  const db = getSharedDatabase(input.databaseUrl);
  const s3 = new S3Client({ region: input.region });

  try {
    const fileNameHint = await withTenantTransaction(
      db,
      input.job.tenantId,
      async (tx) => {
        const job = await tx.query.importJobs.findFirst({
          where: and(
            eq(importJobs.tenantId, input.job.tenantId),
            eq(importJobs.id, input.job.jobId),
          ),
        });
        const file = await tx.query.importFiles.findFirst({
          where: and(
            eq(importFiles.tenantId, input.job.tenantId),
            eq(importFiles.id, input.job.fileId),
            isNull(importFiles.archivedAt),
          ),
        });
        if (!job || !file) {
          logger.warn("import detect missing job/file", {
            jobId: input.job.jobId,
            fileId: input.job.fileId,
          });
          return { skip: true as const };
        }
        if (job.status === "READY_FOR_MAPPING" || job.status === "VALIDATION_FAILED") {
          return { skip: true as const };
        }
        if (job.status !== "SCANNING") {
          logger.warn("import detect skipped due to status", { status: job.status });
          return { skip: true as const };
        }

        const gate = assertMalwareGate({
          verdict: file.malwareVerdict,
          securityHold: file.securityHold || job.securityHold,
          contentHash: file.contentHash,
          verdictHash: file.verdictHash,
          quarantineStatus: file.quarantineStatus,
        });
        if (!gate.ok) {
          logger.warn("import detect blocked by malware gate", {
            jobId: input.job.jobId,
            code: gate.code,
          });
          return { skip: true as const };
        }

        await tx
          .update(importFiles)
          .set({
            validationStatus: "RUNNING",
            version: file.version + 1,
            updatedAt: new Date(),
            updatedBy: input.job.actorUserId,
          })
          .where(and(eq(importFiles.id, file.id), eq(importFiles.tenantId, file.tenantId)));

        return { skip: false as const, fileName: file.fileName };
      },
      input.job.actorUserId ?? undefined,
    );

    if (!fileNameHint || fileNameHint.skip) {
      return "completed";
    }

    const object = await s3.send(
      new GetObjectCommand({
        Bucket: input.job.s3Bucket,
        Key: input.job.s3Key,
      }),
    );
    const bytes = await streamToBuffer(object.Body);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const detection = detectImportFormat({
      bytes,
      fileName: fileNameHint.fileName || input.job.s3Key.split("/").pop() || "upload",
      ...(object.ContentType ? { contentType: object.ContentType } : {}),
      expectedFormat: input.job.expectedFormat,
    });

    await withTenantTransaction(
      db,
      input.job.tenantId,
      async (tx) => {
        const job = await tx.query.importJobs.findFirst({
          where: and(
            eq(importJobs.tenantId, input.job.tenantId),
            eq(importJobs.id, input.job.jobId),
          ),
        });
        const file = await tx.query.importFiles.findFirst({
          where: and(
            eq(importFiles.tenantId, input.job.tenantId),
            eq(importFiles.id, input.job.fileId),
          ),
        });
        if (!job || !file) return;

        const gate = assertMalwareGate({
          verdict: file.malwareVerdict,
          securityHold: file.securityHold || job.securityHold,
          contentHash: file.contentHash ?? contentHash,
          verdictHash: file.verdictHash,
          quarantineStatus: file.quarantineStatus,
        });
        if (!gate.ok) {
          await tx
            .update(importJobs)
            .set({
              status: "SCAN_FAILED",
              currentStage: "SCAN_FAILED",
              errorSummary: gate.message,
              version: job.version + 1,
              updatedAt: new Date(),
              updatedBy: input.job.actorUserId,
            })
            .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, job.tenantId)));
          return;
        }

        if (!detection.ok) {
          const failed = nextStatusForS3Action("detection_fail", "SCANNING");
          await tx
            .update(importJobs)
            .set({
              status: failed,
              currentStage: "VALIDATION_FAILED",
              progressPercent: 100,
              errorSummary: detection.message,
              version: job.version + 1,
              updatedAt: new Date(),
              updatedBy: input.job.actorUserId,
            })
            .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, job.tenantId)));
          await tx
            .update(importFiles)
            .set({
              validationStatus: "FAILED",
              validationDetail: detection.message,
              contentHash,
              version: file.version + 1,
              updatedAt: new Date(),
              updatedBy: input.job.actorUserId,
            })
            .where(and(eq(importFiles.id, file.id), eq(importFiles.tenantId, file.tenantId)));
          return;
        }

        const passed = nextStatusForS3Action("detection_pass", "SCANNING" as ImportJobStatus);
        await tx
          .update(importJobs)
          .set({
            status: passed,
            format: detection.meta.format,
            currentStage: "READY_FOR_MAPPING",
            progressPercent: 50,
            errorSummary: null,
            sourceHash: contentHash,
            version: job.version + 1,
            updatedAt: new Date(),
            updatedBy: input.job.actorUserId,
          })
          .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, job.tenantId)));
        await tx
          .update(importFiles)
          .set({
            format: detection.meta.format,
            validationStatus: "PASSED",
            validationDetail: null,
            contentHash,
            detectedHeadersJson: detection.meta.headers ?? null,
            detectedSheetsJson: detection.meta.sheets ?? null,
            byteSize: detection.meta.byteSize ?? file.byteSize,
            version: file.version + 1,
            updatedAt: new Date(),
            updatedBy: input.job.actorUserId,
          })
          .where(and(eq(importFiles.id, file.id), eq(importFiles.tenantId, file.tenantId)));
      },
      input.job.actorUserId ?? undefined,
    );

    logger.info("import format detection completed", {
      jobId: input.job.jobId,
      ok: detection.ok,
      format: detection.ok ? detection.meta.format : undefined,
    });
    return "completed";
  } catch (error) {
    logger.error("import format detection failed", { error, jobId: input.job.jobId });
    return "retry";
  }
}
