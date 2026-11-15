import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  importFileScanEvents,
  importJobs,
  importRowErrors,
  importSecurityArtifacts,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import {
  assertMalwareGate,
  createImportMalwareScanMessage,
  DEFAULT_MAX_RESCANS,
  defaultImportSensitiveDataMasker,
  downloadArtifactSchema,
  PRESIGN_EXPIRES_SECONDS,
  rescanImportFileSchema,
  retentionDeleteAt,
  DEFAULT_RETENTION_POLICY,
  type ImportJobStatus,
} from "@forge/imports";
import { hasPermission, type ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { ImportQueueService } from "./import-queue.service.js";
import { ImportsRepository } from "./imports.repository.js";

@Injectable()
export class ImportSecurityService {
  private readonly s3: S3Client;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly repo: ImportsRepository,
    private readonly queue: ImportQueueService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {
    this.s3 = new S3Client({ region: this.env.AWS_REGION });
  }

  private requireTenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) {
      throw new ForgeError("IMPORT_TENANT_CONTEXT_REQUIRED", "Tenant context is required.");
    }
    return principal.tenantId;
  }

  async listScanEvents(principal: ForgePrincipal, jobId: string, fileId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileById(tx, tenantId, fileId);
        if (!file || file.jobId !== jobId) {
          throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
        }
        const events = await tx.query.importFileScanEvents.findMany({
          where: and(
            eq(importFileScanEvents.tenantId, tenantId),
            eq(importFileScanEvents.importFileId, fileId),
          ),
          orderBy: [desc(importFileScanEvents.attemptNumber)],
        });
        return {
          jobId,
          fileId,
          malwareVerdict: file.malwareVerdict,
          quarantineStatus: file.quarantineStatus,
          events: events.map((e) => ({
            id: e.id,
            attemptNumber: e.attemptNumber,
            providerKey: e.providerKey,
            providerVersion: e.providerVersion,
            providerScanReference: e.providerScanReference,
            status: e.status,
            verdict: e.verdict,
            submittedAt: e.submittedAt.toISOString(),
            completedAt: e.completedAt?.toISOString() ?? null,
            timedOutAt: e.timedOutAt?.toISOString() ?? null,
            fileSha256: e.fileSha256,
            malwareFamily: e.malwareFamily,
            failureCode: e.failureCode,
            failureMessageSanitized: e.failureMessageSanitized,
            isCurrent: e.isCurrent,
            correlationId: e.correlationId,
          })),
        };
      },
      principal.userId,
    );
  }

  async requestRescan(
    principal: ForgePrincipal,
    jobId: string,
    fileId: string,
    body: unknown,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const input = rescanImportFileSchema.parse(body ?? {});
    const result = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileById(tx, tenantId, fileId);
        if (!file || file.jobId !== jobId) {
          throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
        }

        const status = job.status as ImportJobStatus;
        if (status !== "SCAN_FAILED" && status !== "QUARANTINED") {
          throw new ForgeError(
            "IMPORT_INVALID_STATE_TRANSITION",
            `Rescan is not allowed from status '${status}'.`,
          );
        }
        if ((file.scanAttemptCount ?? 0) >= DEFAULT_MAX_RESCANS) {
          throw new ForgeError(
            "IMPORT_SCAN_FAILED",
            `Maximum rescan attempts (${DEFAULT_MAX_RESCANS}) exceeded.`,
          );
        }
        if (
          (file.malwareVerdict === "INFECTED" ||
            file.malwareVerdict === "SUSPICIOUS" ||
            file.quarantineStatus === "QUARANTINED") &&
          !(input.reason && input.reason.trim().length >= 8)
        ) {
          throw new ForgeError(
            "IMPORT_SCAN_FAILED",
            "Justification is required to rescan quarantined or infected files.",
          );
        }

        if (input.idempotencyKey) {
          const existing = await tx.query.importFileScanEvents.findFirst({
            where: and(
              eq(importFileScanEvents.tenantId, tenantId),
              eq(importFileScanEvents.idempotencyKey, input.idempotencyKey),
            ),
          });
          if (existing) {
            return {
              duplicate: true as const,
              jobId,
              fileId,
              attempt: existing.attemptNumber,
              message: null as ReturnType<typeof createImportMalwareScanMessage> | null,
            };
          }
        }

        await this.repo.updateFile(
          tx,
          file,
          {
            rescanRequired: true,
            scanStatus: "RESCAN_REQUIRED",
            malwareVerdict: "RESCAN_REQUIRED",
          },
          principal.userId,
        );

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_file",
          aggregateId: fileId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_SCAN_RESCAN_REQUESTED,
          correlationId,
          actorUserId: principal.userId,
          payload: {
            jobId,
            fileId,
            reasonPresent: Boolean(input.reason),
            priorVerdict: file.malwareVerdict,
          },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportScanRescanRequested",
          resourceType: "import_file",
          resourceId: fileId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId,
          requestId: principal.requestId,
          after: {
            jobId,
            priorVerdict: file.malwareVerdict,
            justificationLength: input.reason?.length ?? 0,
          },
        });

        const message = createImportMalwareScanMessage({
          tenantId,
          jobId,
          fileId,
          correlationId,
          requestedBy: principal.userId,
          attempt: (file.scanAttemptCount ?? 0) + 1,
        });
        return { duplicate: false as const, jobId, fileId, attempt: message.attempt, message };
      },
      principal.userId,
    );

    if (!result.duplicate && result.message) {
      await this.queue.enqueueMalwareScan(result.message);
    }
    return {
      jobId: result.jobId,
      fileId: result.fileId,
      attempt: result.attempt,
      status: "RESCAN_QUEUED",
      duplicate: result.duplicate,
    };
  }

  async createProtectedDownload(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const input = downloadArtifactSchema.parse(body ?? {});
    const allowUnmask = Boolean(input.privileged) && hasPermission(principal, "import.sensitive");

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileForJob(tx, tenantId, jobId);

        if (file?.quarantineStatus === "QUARANTINED" && input.artifactType !== "security-report") {
          throw new ForgeError(
            "IMPORT_FILE_QUARANTINED",
            "Quarantined files cannot generate download URLs.",
          );
        }

        if (input.privileged && !hasPermission(principal, "import.sensitive")) {
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportSensitiveAccessDenied",
            resourceType: "import_job",
            resourceId: jobId,
            result: "DENIED",
            riskLevel: "HIGH",
            correlationId,
            requestId: principal.requestId,
            after: { artifactType: input.artifactType },
          });
          throw new ForgeError(
            "IMPORT_SENSITIVE_ACCESS_DENIED",
            "import.sensitive permission is required for privileged artifacts.",
          );
        }

        if (file && input.artifactType !== "security-report") {
          const gate = assertMalwareGate({
            verdict: file.malwareVerdict,
            securityHold: file.securityHold || job.securityHold,
            contentHash: file.contentHash,
            verdictHash: file.verdictHash,
            quarantineStatus: file.quarantineStatus,
          });
          if (!gate.ok) {
            throw new ForgeError(
              gate.code as
                | "IMPORT_SCAN_REQUIRED"
                | "IMPORT_SCAN_PENDING"
                | "IMPORT_SCAN_FAILED"
                | "IMPORT_SCAN_TIMEOUT"
                | "IMPORT_SCAN_INFECTED"
                | "IMPORT_SCAN_SUSPICIOUS"
                | "IMPORT_SCAN_HASH_MISMATCH"
                | "IMPORT_SCAN_STALE_VERDICT"
                | "IMPORT_FILE_QUARANTINED"
                | "IMPORT_SECURITY_HOLD",
              gate.message,
            );
          }
        }

        const payload = await this.buildArtifactPayload(tx, tenantId, jobId, input.artifactType, {
          allowUnmask,
        });
        const classification = allowUnmask ? "PRIVILEGED" : "MASKED";
        const artifactId = createId();
        const objectKey = `tenants/${tenantId}/imports/${jobId}/artifacts/${input.artifactType}-${classification.toLowerCase()}-${artifactId}.json`;
        const bodyBytes = Buffer.from(JSON.stringify(payload), "utf8");

        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.env.S3_IMPORT_BUCKET,
            Key: objectKey,
            Body: bodyBytes,
            ContentType: "application/json",
            ServerSideEncryption: "aws:kms",
            CacheControl: "no-store",
            ContentDisposition: `attachment; filename="${input.artifactType}-${jobId}.json"`,
          }),
        );

        const expiresAt = new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000);
        await tx.insert(importSecurityArtifacts).values({
          id: artifactId,
          tenantId,
          jobId,
          artifactType: input.artifactType,
          classification,
          s3Bucket: this.env.S3_IMPORT_BUCKET,
          s3Key: objectKey,
          contentHash: null,
          byteSize: bodyBytes.length,
          expiresAt,
          retentionDeleteAt: retentionDeleteAt(
            new Date(),
            allowUnmask
              ? DEFAULT_RETENTION_POLICY.privilegedArtifactDays
              : DEFAULT_RETENTION_POLICY.maskedArtifactDays,
          ),
          securityHold: false,
          correlationId,
          createdBy: principal.userId,
        });

        const command = new GetObjectCommand({
          Bucket: this.env.S3_IMPORT_BUCKET,
          Key: objectKey,
          ResponseContentDisposition: `attachment; filename="${input.artifactType}-${jobId}.json"`,
          ResponseCacheControl: "no-store",
        });
        const downloadUrl = await getSignedUrl(this.s3, command, {
          expiresIn: PRESIGN_EXPIRES_SECONDS,
        });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_job",
          aggregateId: jobId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_SENSITIVE_DOWNLOAD_REQUESTED,
          correlationId,
          actorUserId: principal.userId,
          payload: {
            jobId,
            artifactType: input.artifactType,
            classification,
            privileged: allowUnmask,
          },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: allowUnmask ? "ImportSensitiveViewed" : "ImportSensitiveDownloadRequested",
          resourceType: "import_job",
          resourceId: jobId,
          result: "SUCCESS",
          riskLevel: allowUnmask ? "HIGH" : "MEDIUM",
          correlationId,
          requestId: principal.requestId,
          after: {
            artifactType: input.artifactType,
            classification,
            expiresAt: expiresAt.toISOString(),
          },
        });

        return {
          artifactId,
          artifactType: input.artifactType,
          classification,
          downloadUrl,
          expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
          expiresAt: expiresAt.toISOString(),
          contentType: "application/json",
        };
      },
      principal.userId,
    );
  }

  private async buildArtifactPayload(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    jobId: string,
    artifactType: "results" | "errors" | "security-report",
    policy: { allowUnmask: boolean },
  ) {
    const masker = defaultImportSensitiveDataMasker;
    if (artifactType === "security-report") {
      const events = await tx.query.importFileScanEvents.findMany({
        where: and(
          eq(importFileScanEvents.tenantId, tenantId),
          eq(importFileScanEvents.importJobId, jobId),
        ),
        orderBy: [desc(importFileScanEvents.attemptNumber)],
      });
      const job = await tx.query.importJobs.findFirst({
        where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)),
      });
      return {
        jobId,
        status: job?.status ?? null,
        securityHold: job?.securityHold ?? false,
        scanEvents: events.map((e) => ({
          attemptNumber: e.attemptNumber,
          verdict: e.verdict,
          providerKey: e.providerKey,
          providerVersion: e.providerVersion,
          fileSha256: e.fileSha256,
          malwareFamily: e.malwareFamily,
          failureCode: e.failureCode,
          completedAt: e.completedAt?.toISOString() ?? null,
        })),
      };
    }

    if (artifactType === "errors") {
      const errors = await tx.query.importRowErrors.findMany({
        where: and(eq(importRowErrors.tenantId, tenantId), eq(importRowErrors.jobId, jobId)),
        limit: 500,
      });
      return {
        jobId,
        errors: errors.map((err) =>
          masker.sanitizeObject(
            {
              id: err.id,
              ruleCode: err.ruleCode,
              message: err.message,
              fieldPath: err.fieldPath,
              details: err.detailsJson,
            },
            { policy: { allowUnmask: policy.allowUnmask } },
          ),
        ),
      };
    }

    const job = await tx.query.importJobs.findFirst({
      where: and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)),
    });
    return masker.sanitizeObject(
      {
        jobId,
        status: job?.status ?? null,
        progressPercent: job?.progressPercent ?? null,
        rowCounts: job?.rowCountsJson ?? null,
        resultSummary: job?.resultSummaryJson ?? null,
      },
      { policy: { allowUnmask: policy.allowUnmask } },
    );
  }
}
