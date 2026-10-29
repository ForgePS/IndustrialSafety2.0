import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  importBatches,
  importColumnMappings,
  importExecutionJournal,
  importJobs,
  importRollbackEvents,
  importRowErrors,
  importRows,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import {
  assertMalwareGate,
  cancelExecutionSchema,
  computeProgress,
  createImportExecuteMessage,
  executeImportJobSchema,
  nextStatusForS5Action,
  resolveBatchSize,
  resolveImportAdapterKey,
  rollbackRequestSchema,
  retryRowErrorSchema,
  sanitizeObject,
  type ImportJobStatus,
} from "@forge/imports";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { mapImportJob } from "./imports.mapper.js";
import { ImportQueueService } from "./import-queue.service.js";
import { ImportsRepository } from "./imports.repository.js";

@Injectable()
export class ImportExecutionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repo: ImportsRepository,
    private readonly queue: ImportQueueService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  private requireTenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) {
      throw new ForgeError("IMPORT_TENANT_CONTEXT_REQUIRED", "Tenant context is required.");
    }
    return principal.tenantId;
  }

  private mapStateError(error: unknown): never {
    if (error instanceof ForgeError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "IMPORT_INVALID_STATE_TRANSITION") {
      throw new ForgeError(
        "IMPORT_INVALID_STATE_TRANSITION",
        (error as Error).message || "Invalid import job state transition.",
      );
    }
    throw error;
  }

  async execute(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
    correlationId: string,
    headerIdempotencyKey?: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const input = executeImportJobSchema.parse(body ?? {});
    const idempotencyKey =
      input.idempotencyKey ?? headerIdempotencyKey ?? `exec:${jobId}:${correlationId}`;

    try {
      const queued = await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) {
            throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          }

          if (
            (job.status === "QUEUED" ||
              job.status === "PROCESSING" ||
              job.status === "COMPLETED" ||
              job.status === "COMPLETED_WITH_ERRORS") &&
            job.executionIdempotencyKey === idempotencyKey
          ) {
            return {
              duplicate: true as const,
              job,
              message: null as ReturnType<typeof createImportExecuteMessage> | null,
            };
          }

          const file = await this.repo.getFileForJob(tx, tenantId, jobId);
          if (!file) {
            throw new ForgeError("IMPORT_FILE_NOT_FOUND", "The import file was not found.");
          }
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

          const next = nextStatusForS5Action("execute", job.status as ImportJobStatus);
          const mappings = await tx.query.importColumnMappings.findMany({
            where: and(
              eq(importColumnMappings.tenantId, tenantId),
              eq(importColumnMappings.jobId, jobId),
            ),
            orderBy: [asc(importColumnMappings.ordinal)],
          });
          // Prefer an explicit adapterKey; otherwise select authorized Industrial
          // product adapters from the job's product/module/record (S9 enablement).
          // Unknown products still fall back to the neutral reference adapter.
          const adapterKey = resolveImportAdapterKey({
            adapterKey: input.adapterKey,
            productKey: job.productCode,
            moduleKey: job.moduleCode,
            recordType: job.recordType,
          });
          const batchSize = resolveBatchSize(input.batchSize);
          const [rowCount] = await tx
            .select({ value: count() })
            .from(importRows)
            .where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId)));

          const [updated] = await tx
            .update(importJobs)
            .set({
              status: next,
              currentStage: "EXECUTION_QUEUED",
              executionIdempotencyKey: idempotencyKey,
              adapterKey,
              adapterVersion: "1",
              executionAttempt: (job.executionAttempt ?? 0) + 1,
              mappingSnapshotJson: mappings.map((m) => ({
                sourceColumn: m.sourceColumn,
                targetField: m.targetField,
                transform: m.transformJson,
                required: m.isRequired,
                sensitive: m.isSensitive,
              })),
              rowCountsJson: {
                ...(job.rowCountsJson ?? {}),
                total: Number(rowCount?.value ?? 0),
                batchSize,
              },
              progressPercent: 0,
              cancellationRequested: false,
              cancellationRequestedAt: null,
              cancellationRequestedBy: null,
              executedAt: new Date(),
              version: job.version + 1,
              updatedAt: new Date(),
              updatedBy: principal.userId,
            })
            .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
            .returning();

          const message = createImportExecuteMessage({
            jobId,
            tenantId,
            requestedBy: principal.userId,
            correlationId,
            idempotencyKey,
            attempt: updated!.executionAttempt,
          });

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: jobId,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_EXECUTION_QUEUED,
            correlationId,
            actorUserId: principal.userId,
            payload: {
              jobId,
              fromStatus: job.status,
              toStatus: next,
              adapterKey,
              attempt: updated!.executionAttempt,
            },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportExecutionQueued",
            resourceType: "import_job",
            resourceId: jobId,
            result: "SUCCESS",
            riskLevel: "MEDIUM",
            correlationId,
            requestId: principal.requestId,
            after: { status: next, adapterKey },
          });

          return { duplicate: false as const, job: updated!, message };
        },
        principal.userId,
      );

      if (!queued.duplicate && queued.message) {
        await this.queue.enqueueExecute(queued.message);
      }

      return {
        accepted: true,
        duplicate: queued.duplicate,
        job: mapImportJob(queued.job),
        execution: {
          status: queued.job.status,
          idempotencyKey: queued.job.executionIdempotencyKey,
          adapterKey: queued.job.adapterKey,
          attempt: queued.job.executionAttempt,
        },
      };
    } catch (error) {
      this.mapStateError(error);
    }
  }

  async cancelExecution(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const input = cancelExecutionSchema.parse(body ?? {});
    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) {
            throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          }

          if (job.status === "CANCELLED") {
            return mapImportJob(job);
          }

          if (job.status === "QUEUED") {
            const next = nextStatusForS5Action("cancel_queued", "QUEUED");
            const [updated] = await tx
              .update(importJobs)
              .set({
                status: next,
                currentStage: "CANCELLED",
                cancellationRequested: true,
                cancellationRequestedAt: new Date(),
                cancellationRequestedBy: principal.userId,
                errorSummary: input.reason ?? job.errorSummary,
                completedAt: new Date(),
                progressPercent: job.progressPercent,
                version: job.version + 1,
                updatedAt: new Date(),
                updatedBy: principal.userId,
              })
              .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
              .returning();
            await this.outbox.write(tx, {
              tenantId,
              aggregateType: "import_job",
              aggregateId: jobId,
              eventType: DOMAIN_EVENT_TYPES.IMPORT_EXECUTION_CANCELLED,
              correlationId,
              actorUserId: principal.userId,
              payload: { jobId, fromStatus: job.status, toStatus: next },
            });
            await this.audit.writeInTransaction(tx, {
              tenantId,
              actorUserId: principal.userId,
              actorPersonId: principal.personId,
              actorType: "USER",
              action: "ImportExecutionCancelled",
              resourceType: "import_job",
              resourceId: jobId,
              result: "SUCCESS",
              riskLevel: "MEDIUM",
              correlationId,
              requestId: principal.requestId,
              after: { status: next },
            });
            return mapImportJob(updated!);
          }

          if (job.status === "PROCESSING") {
            const [updated] = await tx
              .update(importJobs)
              .set({
                cancellationRequested: true,
                cancellationRequestedAt: new Date(),
                cancellationRequestedBy: principal.userId,
                errorSummary: input.reason ?? job.errorSummary,
                version: job.version + 1,
                updatedAt: new Date(),
                updatedBy: principal.userId,
              })
              .where(and(eq(importJobs.id, jobId), eq(importJobs.tenantId, tenantId)))
              .returning();
            await this.outbox.write(tx, {
              tenantId,
              aggregateType: "import_job",
              aggregateId: jobId,
              eventType: DOMAIN_EVENT_TYPES.IMPORT_EXECUTION_CANCEL_REQUESTED,
              correlationId,
              actorUserId: principal.userId,
              payload: { jobId, fromStatus: job.status },
            });
            await this.audit.writeInTransaction(tx, {
              tenantId,
              actorUserId: principal.userId,
              actorPersonId: principal.personId,
              actorType: "USER",
              action: "ImportExecutionCancelRequested",
              resourceType: "import_job",
              resourceId: jobId,
              result: "SUCCESS",
              riskLevel: "MEDIUM",
              correlationId,
              requestId: principal.requestId,
              after: { cancellationRequested: true },
            });
            return mapImportJob(updated!);
          }

          throw new ForgeError(
            "IMPORT_INVALID_STATE_TRANSITION",
            `Import job status '${job.status}' does not allow action 'cancel_execution'`,
          );
        },
        principal.userId,
      );
    } catch (error) {
      this.mapStateError(error);
    }
  }

  async getStatus(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const job = await this.repo.getJob(tx, tenantId, jobId);
      if (!job) {
        throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
      }
      const counts = (job.rowCountsJson ?? {}) as Record<string, number>;
      const progress = computeProgress({
        totalRows: Number(counts.total ?? 0),
        processedRows: Number(counts.processed ?? 0),
        successfulRows: Number(counts.successful ?? 0),
        failedRows: Number(counts.failed ?? 0),
        skippedRows: Number(counts.skipped ?? 0),
        duplicateRows: Number(counts.duplicate ?? 0),
        cancelledRows: Number(counts.cancelled ?? 0),
        currentBatch: Number(counts.currentBatch ?? 0),
        totalBatches: Number(counts.totalBatches ?? 0),
        finalized: ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"].includes(
          job.status,
        ),
      });
      return {
        job: mapImportJob(job),
        progress,
        workerId: job.workerId,
        executionAttempt: job.executionAttempt,
        cancellationRequested: job.cancellationRequested,
        adapterKey: job.adapterKey,
        adapterVersion: job.adapterVersion,
        executionStartedAt: job.executionStartedAt?.toISOString() ?? null,
        lastProgressAt: job.lastProgressAt?.toISOString() ?? null,
        estimatedCompletionAt: job.estimatedCompletionAt?.toISOString() ?? null,
      };
    });
  }

  async getResults(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    const canSensitive = principal.permissions.has("import.sensitive");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const job = await this.repo.getJob(tx, tenantId, jobId);
      if (!job) {
        throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
      }
      const summary = { ...(job.resultSummaryJson ?? {}) };
      if (!canSensitive) {
        delete summary.sampleMappedFields;
      }
      return {
        jobId: job.id,
        tenantId: job.tenantId,
        status: job.status,
        result: summary,
        rollbackClassificationSummary: job.rollbackClassificationSummaryJson ?? {},
      };
    });
  }

  async listBatches(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const job = await this.repo.getJob(tx, tenantId, jobId);
      if (!job) {
        throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
      }
      const rows = await tx.query.importBatches.findMany({
        where: and(eq(importBatches.tenantId, tenantId), eq(importBatches.jobId, jobId)),
        orderBy: [asc(importBatches.batchNumber)],
      });
      return rows.map(mapBatch);
    });
  }

  async getBatch(principal: ForgePrincipal, jobId: string, batchId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const batch = await tx.query.importBatches.findFirst({
        where: and(
          eq(importBatches.tenantId, tenantId),
          eq(importBatches.jobId, jobId),
          eq(importBatches.id, batchId),
        ),
      });
      if (!batch) {
        throw new ForgeError("IMPORT_BATCH_NOT_FOUND", "The import batch was not found.");
      }
      return mapBatch(batch);
    });
  }

  async listErrors(principal: ForgePrincipal, jobId: string) {
    const tenantId = this.requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const job = await this.repo.getJob(tx, tenantId, jobId);
      if (!job) {
        throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
      }
      const rows = await tx.query.importRowErrors.findMany({
        where: and(eq(importRowErrors.tenantId, tenantId), eq(importRowErrors.jobId, jobId)),
        orderBy: [desc(importRowErrors.createdAt)],
        limit: 500,
      });
      return rows.map((row) =>
        sanitizeObject(
          {
            id: row.id,
            jobId: row.jobId,
            rowId: row.rowId,
            severity: row.severity,
            ruleCode: row.ruleCode,
            fieldPath: row.fieldPath,
            message: row.message,
            failureClass: row.failureClass,
            disposition: row.disposition,
            retryCount: row.retryCount,
            createdAt: row.createdAt.toISOString(),
          },
          { policy: { allowUnmask: false } },
        ),
      );
    });
  }

  async retryError(
    principal: ForgePrincipal,
    jobId: string,
    errorId: string,
    body: unknown,
    correlationId: string,
  ) {
    const tenantId = this.requireTenant(principal);
    retryRowErrorSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const err = await tx.query.importRowErrors.findFirst({
          where: and(
            eq(importRowErrors.tenantId, tenantId),
            eq(importRowErrors.jobId, jobId),
            eq(importRowErrors.id, errorId),
          ),
        });
        if (!err) {
          throw new ForgeError("IMPORT_ROW_ERROR_NOT_FOUND", "The import row error was not found.");
        }
        if (err.failureClass === "SECURITY_FAILURE" || err.failureClass === "NON_RETRIABLE_JOB") {
          throw new ForgeError(
            "IMPORT_INVALID_STATE_TRANSITION",
            "This error class cannot be retried.",
          );
        }
        await tx
          .update(importRows)
          .set({
            status: "STAGED",
            completedAt: null,
            version: 1,
            updatedAt: new Date(),
            updatedBy: principal.userId,
          })
          .where(and(eq(importRows.id, err.rowId), eq(importRows.tenantId, tenantId)));
        const [updated] = await tx
          .update(importRowErrors)
          .set({
            disposition: "RETRY_REQUESTED",
            retryCount: (err.retryCount ?? 0) + 1,
            lastRetryAt: new Date(),
            updatedAt: new Date(),
            updatedBy: principal.userId,
          })
          .where(eq(importRowErrors.id, errorId))
          .returning();
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "import_job",
          aggregateId: jobId,
          eventType: DOMAIN_EVENT_TYPES.IMPORT_ROW_RETRIED,
          correlationId,
          actorUserId: principal.userId,
          payload: { jobId, errorId, rowId: err.rowId },
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "ImportRowRetried",
          resourceType: "import_row_error",
          resourceId: errorId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId,
          requestId: principal.requestId,
        });
        return {
          id: updated!.id,
          disposition: updated!.disposition,
          retryCount: updated!.retryCount,
        };
      },
      principal.userId,
    );
  }

  async requestRollback(
    principal: ForgePrincipal,
    jobId: string,
    body: unknown,
    correlationId: string,
    headerIdempotencyKey?: string,
  ) {
    const tenantId = this.requireTenant(principal);
    const input = rollbackRequestSchema.parse(body ?? {});
    const idempotencyKey =
      input.idempotencyKey ?? headerIdempotencyKey ?? `rb:${jobId}:${correlationId}`;

    try {
      return await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const job = await this.repo.getJob(tx, tenantId, jobId);
          if (!job) {
            throw new ForgeError("IMPORT_JOB_NOT_FOUND", "The import job was not found.");
          }

          const journal = await tx.query.importExecutionJournal.findMany({
            where: and(
              eq(importExecutionJournal.tenantId, tenantId),
              eq(importExecutionJournal.jobId, jobId),
            ),
            limit: 5000,
          });

          const classification =
            (job.rollbackClassificationSummaryJson as { jobClassification?: string } | null)
              ?.jobClassification ?? "MANUAL_REVIEW_REQUIRED";

          if (classification === "NOT_REVERSIBLE") {
            if (job.status !== "COMPLETED" && job.status !== "COMPLETED_WITH_ERRORS") {
              throw new ForgeError(
                "IMPORT_INVALID_STATE_TRANSITION",
                `Import job status '${job.status}' does not allow action 'request_rollback'`,
              );
            }
            await tx
              .update(importJobs)
              .set({
                status: "ROLLBACK_REFUSED",
                currentStage: "ROLLBACK_REFUSED",
                version: job.version + 1,
                updatedAt: new Date(),
                updatedBy: principal.userId,
              })
              .where(eq(importJobs.id, jobId));
            const eventId = createId();
            await tx.insert(importRollbackEvents).values({
              id: eventId,
              tenantId,
              jobId,
              status: "REFUSED",
              safetyClass: "UNSAFE",
              classification: "NOT_REVERSIBLE",
              reason: input.reason,
              entitiesJson: [],
              journalJson: [],
              idempotencyKey,
              correlationId,
              version: 1,
              createdAt: new Date(),
              createdBy: principal.userId,
              updatedAt: new Date(),
              updatedBy: principal.userId,
            });
            await this.outbox.write(tx, {
              tenantId,
              aggregateType: "import_job",
              aggregateId: jobId,
              eventType: DOMAIN_EVENT_TYPES.IMPORT_ROLLBACK_REFUSED,
              correlationId,
              actorUserId: principal.userId,
              payload: { jobId, classification, toStatus: "ROLLBACK_REFUSED" },
            });
            return {
              status: "ROLLBACK_REFUSED",
              classification,
              rollbackEventId: eventId,
            };
          }

          const next = nextStatusForS5Action("request_rollback", job.status as ImportJobStatus);
          await tx
            .update(importJobs)
            .set({
              status: next,
              currentStage: "ROLLBACK_PENDING",
              version: job.version + 1,
              updatedAt: new Date(),
              updatedBy: principal.userId,
            })
            .where(eq(importJobs.id, jobId));

          const eventId = createId();
          await tx.insert(importRollbackEvents).values({
            id: eventId,
            tenantId,
            jobId,
            status: "REQUESTED",
            safetyClass: classification === "FULLY_REVERSIBLE" ? "SAFE" : "CONDITIONAL",
            classification: String(classification),
            reason: input.reason,
            entitiesJson: journal.map((j) => ({
              rowId: j.rowId,
              destinationRecordId: j.destinationRecordId,
              operationType: j.operationType,
            })),
            journalJson: journal.map((j) => ({
              id: j.id,
              rollbackClassification: j.rollbackClassification,
              adapterKey: j.adapterKey,
              adapterVersion: j.adapterVersion,
            })),
            idempotencyKey,
            correlationId,
            version: 1,
            createdAt: new Date(),
            createdBy: principal.userId,
            updatedAt: new Date(),
            updatedBy: principal.userId,
          });

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: jobId,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_ROLLBACK_REQUESTED,
            correlationId,
            actorUserId: principal.userId,
            payload: { jobId, classification, toStatus: next },
          });
          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "import_job",
            aggregateId: jobId,
            eventType: DOMAIN_EVENT_TYPES.IMPORT_ROLLBACK_CLASSIFIED,
            correlationId,
            actorUserId: principal.userId,
            payload: { jobId, classification },
          });
          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: "ImportRollbackRequested",
            resourceType: "import_job",
            resourceId: jobId,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId,
            requestId: principal.requestId,
            after: { status: next, classification },
          });

          return {
            status: next,
            classification,
            rollbackEventId: eventId,
            note: "Rollback preparation only — compensation execution is deferred.",
          };
        },
        principal.userId,
      );
    } catch (error) {
      this.mapStateError(error);
    }
  }
}

function mapBatch(row: typeof importBatches.$inferSelect) {
  return {
    id: row.id,
    jobId: row.jobId,
    batchNumber: row.batchNumber,
    status: row.status,
    rowCount: row.rowCount,
    committedCount: row.committedCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    duplicateCount: row.duplicateCount,
    cancelledCount: row.cancelledCount,
    attemptCount: row.attemptCount,
    retryCount: row.retryCount,
    workerId: row.workerId,
    checkpoint: row.checkpointJson,
    lastProcessedRowId: row.lastProcessedRowId,
    durationMs: row.durationMs,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    version: row.version,
  };
}
