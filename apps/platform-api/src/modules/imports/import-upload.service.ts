import { Inject, Injectable } from "@nestjs/common";
import {
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import {
  ALLOWED_IMPORT_CONTENT_TYPES,
  assertS3Transition,
  assertScannerAllowedForEnvironment,
  completeImportUploadSchema,
  createImportMalwareScanMessage,
  DEFAULT_PART_SIZE_BYTES,
  initImportUploadSchema,
  importUploadPartsSchema,
  MULTIPART_THRESHOLD_BYTES,
  nextStatusForAction,
  nextStatusForS3Action,
  resolveImportMalwareProviderKey,
  type ImportJobStatus,
} from "@forge/imports";
import type { ForgeEnvironment } from "@forge/environment";
import type { ForgePrincipal } from "@forge/tenant-context";
import { DATABASE, APP_ENV } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { ConfigurationService } from "../configuration/configuration.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { ImportQueueService } from "./import-queue.service.js";
import { ImportStorageService } from "./import-storage.service.js";
import { mapImportFile, mapImportJob } from "./imports.mapper.js";
import { ImportsRepository } from "./imports.repository.js";

function inferFormat(fileName: string, contentType: string, declared?: "csv" | "xlsx" | "json") {
  if (declared) return declared;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || contentType.includes("csv")) return "csv";
  if (lower.endsWith(".xlsx") || contentType.includes("spreadsheetml")) return "xlsx";
  if (lower.endsWith(".json") || contentType.includes("json")) return "json";
  return null;
}

@Injectable()
export class ImportUploadService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly repo: ImportsRepository,
    private readonly storage: ImportStorageService,
    private readonly queue: ImportQueueService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly configuration: ConfigurationService,
  ) {}

  private assertScannerAllowed(): void {
    const gate = assertScannerAllowedForEnvironment({
      appEnv: this.env.APP_ENV,
      providerKey: resolveImportMalwareProviderKey(this.env.IMPORT_MALWARE_PROVIDER_KEY),
    });
    if (!gate.ok) {
      throw new ForgeError(gate.code, gate.message);
    }
  }

  private requireTenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) {
      throw new ForgeError("IMPORT_TENANT_CONTEXT_REQUIRED", "Tenant context is required.");
    }
    return principal.tenantId;
  }

  private mapStateError(error: unknown): never {
    const code = (error as { code?: string } | null)?.code;
    if (code === "IMPORT_INVALID_STATE_TRANSITION") {
      throw new ForgeError(
        "IMPORT_INVALID_STATE_TRANSITION",
        error instanceof Error ? error.message : "Invalid import state transition",
      );
    }
    if (code === "IMPORT_ENTITLEMENT_REQUIRED") {
      throw new ForgeError(
        "IMPORT_ENTITLEMENT_REQUIRED",
        "Active product/module entitlement is required for this import.",
      );
    }
    throw error;
  }

  private async resolveProfileSnapshot(
    principal: ForgePrincipal,
    tenantId: string,
    profile: {
      snapshotJson: Record<string, unknown>;
      configNamespace: string;
      configObjectKey: string | null;
      profileKey: string;
    } | null,
  ): Promise<Record<string, unknown>> {
    if (!profile) return {};
    const base = { ...(profile.snapshotJson ?? {}) };
    if (!profile.configObjectKey) {
      return { ...base, profileKey: profile.profileKey, source: "import_profile" };
    }
    try {
      const effective = await this.configuration.effective(
        tenantId,
        profile.configNamespace || "import_config",
        profile.configObjectKey,
        undefined,
        principal,
      );
      return {
        ...base,
        profileKey: profile.profileKey,
        configNamespace: profile.configNamespace,
        configObjectKey: profile.configObjectKey,
        configSource: effective.source,
        configPayload: effective.payload as Record<string, unknown>,
        configVersionId:
          effective.version && typeof effective.version === "object" && "id" in effective.version
            ? (effective.version as { id: string }).id
            : null,
        source: "configuration_platform",
      };
    } catch {
      return {
        ...base,
        profileKey: profile.profileKey,
        configNamespace: profile.configNamespace,
        configObjectKey: profile.configObjectKey,
        source: "import_profile_fallback",
      };
    }
  }

  async initializeUpload(
    principal: ForgePrincipal,
    body: unknown,
    correlationId: string,
    idempotencyKey?: string,
  ) {
    this.assertScannerAllowed();
    const tenantId = this.requireTenant(principal);
    const data = initImportUploadSchema.parse(body);
    if (!ALLOWED_IMPORT_CONTENT_TYPES.has(data.contentType)) {
      throw new ForgeError(
        "IMPORT_UPLOAD_INVALID",
        `Content type not allowed for import upload: ${data.contentType}`,
      );
    }
    const format = inferFormat(data.fileName, data.contentType, data.format);
    if (!format) {
      throw new ForgeError(
        "IMPORT_FORMAT_UNSUPPORTED",
        "Only csv, xlsx, and json uploads are supported in Sprint S3",
      );
    }

    const useMultipart =
      data.uploadMode === "MULTIPART" ||
      (data.uploadMode !== "SINGLE" && data.byteSize >= MULTIPART_THRESHOLD_BYTES);
    const partSize = data.partSizeBytes ?? DEFAULT_PART_SIZE_BYTES;
    const partCount = useMultipart ? Math.ceil(data.byteSize / partSize) : 0;

    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await this.repo.assertProductModuleEntitlement(
            tx,
            tenantId,
            data.productKey,
            data.moduleKey,
          );
          let profile = null;
          if (data.profileId) {
            profile = await this.repo.getProfile(tx, tenantId, data.profileId);
            if (!profile || profile.archivedAt) {
              throw new ForgeError("IMPORT_PROFILE_NOT_FOUND", "The import profile was not found.");
            }
          }
          const profileSnapshot = await this.resolveProfileSnapshot(
            principal,
            tenantId,
            profile
              ? {
                  snapshotJson: profile.snapshotJson,
                  configNamespace: profile.configNamespace,
                  configObjectKey: profile.configObjectKey,
                  profileKey: profile.profileKey,
                }
              : null,
          );

          const job = await this.repo.insertUploadJob(tx, {
            tenantId,
            userId: principal.userId,
            correlationId,
            idempotencyKey: idempotencyKey ?? null,
            data,
            profile,
            profileSnapshot,
            format,
          });

          const storedFileName = this.storage.buildStoredFilename(data.fileName);
          const s3Key = this.storage.buildObjectKey(tenantId, job.id, storedFileName);
          let multipartUploadId: string | null = null;
          if (useMultipart) {
            multipartUploadId = await this.storage.createMultipartUpload({
              objectKey: s3Key,
              contentType: data.contentType,
            });
          }

          const file = await this.repo.insertFile(tx, {
            tenantId,
            userId: principal.userId,
            jobId: job.id,
            correlationId,
            idempotencyKey: idempotencyKey ? `${idempotencyKey}:file` : null,
            fileName: data.fileName,
            storedFileName,
            contentType: data.contentType,
            format,
            byteSize: data.byteSize,
            clientChecksumSha256: data.checksumSha256 ?? null,
            s3Bucket: this.storage.bucketName,
            s3Key,
            multipartUploadId,
          });

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: job.id,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_UPLOAD_INITIALIZED,
            correlationId,
            actorUserId: principal.userId,
            payload: {
              jobId: job.id,
              fileId: file.id,
              format,
              uploadMode: useMultipart ? "MULTIPART" : "SINGLE",
              byteSize: data.byteSize,
            },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportUploadInitialized",
            resourceType: "import_job",
            resourceId: job.id,
            result: "SUCCESS",
            riskLevel: "LOW",
            correlationId,
            requestId: principal.requestId,
            after: {
              fileId: file.id,
              format,
              uploadMode: useMultipart ? "MULTIPART" : "SINGLE",
              malwareScanStatus: "NOT_SUBMITTED",
            },
          });

          if (useMultipart && multipartUploadId) {
            const initialParts = Math.min(partCount, 20);
            const parts = [];
            for (let partNumber = 1; partNumber <= initialParts; partNumber += 1) {
              parts.push(
                await this.storage.createPresignedPartUrl({
                  objectKey: s3Key,
                  uploadId: multipartUploadId,
                  partNumber,
                }),
              );
            }
            return {
              job: mapImportJob(job),
              file: mapImportFile(file),
              upload: {
                mode: "S3_MULTIPART" as const,
                multipartUploadId,
                partSizeBytes: partSize,
                partCount,
                expiresInSeconds: parts[0]?.expiresInSeconds ?? 900,
                parts,
              },
            };
          }

          const presign = await this.storage.createPresignedUploadUrl({
            objectKey: s3Key,
            contentType: data.contentType,
            contentLength: data.byteSize,
            ...(data.checksumSha256 ? { checksumSha256: data.checksumSha256 } : {}),
          });
          return {
            job: mapImportJob(job),
            file: mapImportFile(file),
            upload: {
              mode: "S3_PRESIGNED" as const,
              uploadUrl: presign.uploadUrl,
              expiresInSeconds: presign.expiresInSeconds,
            },
          };
        },
        principal.userId,
      );
    } catch (error) {
      this.mapStateError(error);
    }
  }

  async getPartUrls(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
  ) {
    const tenantId = this.requireTenant(principal);
    const data = importUploadPartsSchema.parse(body);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileForJob(tx, tenantId, jobId);
        if (!file || !file.multipartUploadId) {
          throw new ForgeError("IMPORT_UPLOAD_NOT_FOUND", "Multipart upload was not initialized.");
        }
        if (!["INITIALIZED", "UPLOADING"].includes(file.uploadStatus)) {
          throw new ForgeError("IMPORT_UPLOAD_INVALID", "Upload is not accepting parts.");
        }
        await this.repo.updateFile(
          tx,
          file,
          { uploadStatus: "UPLOADING" },
          principal.userId,
        );
        const parts = [];
        for (const partNumber of data.partNumbers) {
          parts.push(
            await this.storage.createPresignedPartUrl({
              objectKey: file.s3Key,
              uploadId: file.multipartUploadId,
              partNumber,
            }),
          );
        }
        return { jobId, fileId: file.id, parts };
      },
      principal.userId,
    );
  }

  async completeUpload(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
    correlationId: string,
  ) {
    this.assertScannerAllowed();
    const tenantId = this.requireTenant(principal);
    const data = completeImportUploadSchema.parse(body ?? {});
    try {
      const result = await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          assertS3Transition("upload_complete", job.status as ImportJobStatus);
          const file = await this.repo.getFileForJob(tx, tenantId, jobId);
          if (!file) throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
          if (file.uploadStatus === "COMPLETED") {
            return { job: mapImportJob(job), file: mapImportFile(file), enqueued: false };
          }
          if (!["INITIALIZED", "UPLOADING"].includes(file.uploadStatus)) {
            throw new ForgeError("IMPORT_UPLOAD_INVALID", `Upload status '${file.uploadStatus}' cannot be completed.`);
          }

          if (file.multipartUploadId) {
            if (!data.parts || data.parts.length < 1) {
              throw new ForgeError(
                "IMPORT_UPLOAD_INVALID",
                "Multipart completion requires parts with etags.",
              );
            }
            await this.storage.completeMultipartUpload({
              objectKey: file.s3Key,
              uploadId: file.multipartUploadId,
              parts: data.parts,
            });
          }

          let head;
          try {
            head = await this.storage.headObject(file.s3Key);
          } catch {
            throw new ForgeError(
              "IMPORT_OBJECT_MISSING",
              "Uploaded object was not found in the imports bucket.",
            );
          }
          if (head.contentLength != null && file.byteSize != null && head.contentLength !== file.byteSize) {
            throw new ForgeError(
              "IMPORT_UPLOAD_INVALID",
              `Uploaded object size ${head.contentLength} does not match declared ${file.byteSize}.`,
            );
          }

          const checksum = data.checksumSha256 ?? file.clientChecksumSha256 ?? null;
          if (
            data.checksumSha256 &&
            file.clientChecksumSha256 &&
            data.checksumSha256.toLowerCase() !== file.clientChecksumSha256.toLowerCase()
          ) {
            throw new ForgeError("IMPORT_CHECKSUM_MISMATCH", "Checksum does not match initialized upload.");
          }
          if (checksum) {
            const duplicate = await this.repo.findCompletedByContentHash(tx, tenantId, checksum.toLowerCase());
            if (duplicate && duplicate.id !== file.id) {
              throw new ForgeError(
                "IMPORT_DUPLICATE_CONTENT",
                "An active import file with the same content hash already exists for this tenant.",
              );
            }
          }

          const updatedFile = await this.repo.updateFile(
            tx,
            file,
            {
              uploadStatus: "COMPLETED",
              uploadProgressPercent: 100,
              completedAt: new Date(),
              contentHash: checksum ? checksum.toLowerCase() : null,
              clientChecksumSha256: checksum ? checksum.toLowerCase() : file.clientChecksumSha256,
              scanStatus: "SUBMITTED",
              malwareVerdict: "SUBMITTED",
              malwareVerdictAt: new Date(),
              scanDetail: null,
              validationStatus: "PENDING",
            },
            principal.userId,
          );

          const updatedJob = await this.repo.updateJobStatus(
            tx,
            job,
            nextStatusForS3Action("upload_complete", job.status as ImportJobStatus),
            principal.userId,
            {
              currentStage: "UPLOAD_COMPLETE",
              progressPercent: 20,
              sourceHash: checksum ? checksum.toLowerCase() : job.sourceHash,
            },
          );

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: job.id,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_UPLOAD_COMPLETED,
            correlationId,
            actorUserId: principal.userId,
            payload: {
              jobId: job.id,
              fileId: file.id,
              byteSize: updatedFile.byteSize,
              contentHashPresent: Boolean(updatedFile.contentHash),
            },
          });
          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_file",
            aggregateId: file.id,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_SCAN_SUBMITTED,
            correlationId,
            actorUserId: principal.userId,
            payload: {
              jobId: job.id,
              fileId: file.id,
              attempt: 1,
            },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportUploadCompleted",
            resourceType: "import_job",
            resourceId: job.id,
            result: "SUCCESS",
            riskLevel: "LOW",
            correlationId,
            requestId: principal.requestId,
            after: {
              fileId: file.id,
              uploadStatus: "COMPLETED",
              scanStatus: "SUBMITTED",
            },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportScanSubmitted",
            resourceType: "import_file",
            resourceId: file.id,
            result: "SUCCESS",
            riskLevel: "MEDIUM",
            correlationId,
            requestId: principal.requestId,
            after: { jobId: job.id, attempt: 1 },
          });

          return {
            job: mapImportJob(updatedJob),
            file: mapImportFile(updatedFile),
            enqueued: true,
            malwareScanMessage: createImportMalwareScanMessage({
              tenantId,
              jobId: job.id,
              fileId: file.id,
              correlationId,
              requestedBy: principal.userId,
              attempt: 1,
            }),
          };
        },
        principal.userId,
      );

      if (result.enqueued && "malwareScanMessage" in result && result.malwareScanMessage) {
        await this.queue.enqueueMalwareScan(result.malwareScanMessage);
      }
      const { malwareScanMessage: _omit, ...response } = result as typeof result & {
        malwareScanMessage?: unknown;
      };
      return response;
    } catch (error) {
      this.mapStateError(error);
    }
  }

  async abortUpload(
    principal: ForgePrincipal,
    jobId: string,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          const file = await this.repo.getFileForJob(tx, tenantId, jobId);
          if (!file) throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
          if (file.multipartUploadId && ["INITIALIZED", "UPLOADING"].includes(file.uploadStatus)) {
            try {
              await this.storage.abortMultipartUpload({
                objectKey: file.s3Key,
                uploadId: file.multipartUploadId,
              });
            } catch {
              // Best-effort abort; continue cancelling job state.
            }
          }
          const next = nextStatusForS3Action(
            "cancel_upload",
            job.status as ImportJobStatus,
          );
          const updatedFile = await this.repo.updateFile(
            tx,
            file,
            { uploadStatus: "ABORTED", uploadProgressPercent: 0 },
            principal.userId,
          );
          const updatedJob = await this.repo.updateJobStatus(
            tx,
            job,
            next,
            principal.userId,
            { currentStage: "CANCELLED", errorSummary: "Upload aborted" },
          );
          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: job.id,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_UPLOAD_CANCELLED,
            correlationId,
            actorUserId: principal.userId,
            payload: { jobId, fileId: file.id, reason: "abort" },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportUploadAborted",
            resourceType: "import_job",
            resourceId: job.id,
            result: "SUCCESS",
            riskLevel: "LOW",
            correlationId,
            requestId: principal.requestId,
          });
          return { job: mapImportJob(updatedJob), file: mapImportFile(updatedFile) };
        },
        principal.userId,
      );
    } catch (error) {
      this.mapStateError(error);
    }
  }

  async getStatus(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileForJob(tx, tenantId, jobId);
        return {
          jobId: job.id,
          status: job.status,
          currentStage: job.currentStage,
          progressPercent: job.progressPercent,
          errorSummary: job.errorSummary,
          file: file
            ? {
                fileId: file.id,
                uploadStatus: file.uploadStatus,
                scanStatus: file.scanStatus,
                validationStatus: file.validationStatus,
                uploadProgressPercent: file.uploadProgressPercent,
                format: file.format,
              }
            : null,
        };
      },
      principal.userId,
    );
  }

  async getFileMetadata(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileForJob(tx, tenantId, jobId);
        if (!file) throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
        if (file.scanStatus !== "CLEAN" || file.quarantineStatus === "QUARANTINED") {
          return {
            ...mapImportFile(file),
            bytesAvailable: false,
            bytesDeniedReason:
              file.quarantineStatus === "QUARANTINED"
                ? "IMPORT_FILE_QUARANTINED"
                : "IMPORT_SCAN_REQUIRED",
            note: "Raw file bytes are denied until malware scan status is CLEAN.",
          };
        }
        return {
          ...mapImportFile(file),
          bytesAvailable: true,
        };
      },
      principal.userId,
    );
  }

  async getJobDetail(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const job = await this.repo.getJob(tx, tenantId, jobId);
        if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
        const file = await this.repo.getFileForJob(tx, tenantId, jobId);
        return {
          ...mapImportJob(job),
          file: file ? mapImportFile(file) : null,
          profileSnapshotPresent: Object.keys(job.profileSnapshotJson ?? {}).length > 0,
        };
      },
      principal.userId,
    );
  }

  /** Extends job cancel to cover upload-stage statuses. */
  async cancelIncludingUpload(
    principal: ForgePrincipal,
    jobId: string,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          const file = await this.repo.getFileForJob(tx, tenantId, jobId);
          if (
            file &&
            file.multipartUploadId &&
            ["INITIALIZED", "UPLOADING"].includes(file.uploadStatus)
          ) {
            try {
              await this.storage.abortMultipartUpload({
                objectKey: file.s3Key,
                uploadId: file.multipartUploadId,
              });
            } catch {
              // best effort
            }
          }
          if (file && ["INITIALIZED", "UPLOADING", "COMPLETED"].includes(file.uploadStatus)) {
            await this.repo.updateFile(
              tx,
              file,
              { uploadStatus: "CANCELLED" },
              principal.userId,
            );
          }
          const next = nextStatusForAction("cancel", job.status as ImportJobStatus);
          const updated = await this.repo.updateJobStatus(tx, job, next, principal.userId, {
            currentStage: "CANCELLED",
          });
          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: jobId,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_JOB_CANCELLED,
            correlationId,
            actorUserId: principal.userId,
            payload: { jobId, fromStatus: job.status, toStatus: updated.status },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportJobCancelled",
            resourceType: "import_job",
            resourceId: jobId,
            result: "SUCCESS",
            riskLevel: "LOW",
            correlationId,
            requestId: principal.requestId,
            after: { status: updated.status },
          });
          return mapImportJob(updated);
        },
        principal.userId,
      );
    } catch (error) {
      this.mapStateError(error);
    }
  }
}
