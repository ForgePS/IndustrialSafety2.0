import { hostname } from "node:os";
import {
  createId,
  getSharedDatabase,
  importBatches,
  importExecutionJournal,
  importFiles,
  importJobs,
  importRowErrors,
  importRows,
  withTenantTransaction,
} from "@forge/database";
import {
  assertMalwareGate,
  buildExecutionResultSummary,
  computeProgress,
  emptyRollbackSummary,
  finalizeJobStatus,
  ImportAdapterRegistry,
  isLockExpired,
  journalIdempotencyKey,
  nextLockExpiry,
  nextStatusForS5Action,
  ReferenceImportAdapter,
  resolveBatchSize,
  rowOutcomeToCounters,
  validateImportExecuteMessage,
  type FailureClass,
  type ImportExecuteMessage,
  type ImportJobStatus,
  type ImportRecordAdapter,
  type RollbackClassification,
} from "@forge/imports";
import { createLogger } from "@forge/observability";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { IndustrialDepartmentAdapter } from "../adapters/industrial-department-adapter.js";
import { IndustrialEmploymentTypeAdapter } from "../adapters/industrial-employment-type-adapter.js";
import { IndustrialFleetAdapter } from "../adapters/industrial-fleet-adapter.js";
import { IndustrialPersonnelAdapter } from "../adapters/industrial-personnel-adapter.js";
import { IndustrialPositionAdapter } from "../adapters/industrial-position-adapter.js";
import { IndustrialSiteAdapter } from "../adapters/industrial-site-adapter.js";
import { IndustrialTrainingAdapter } from "../adapters/industrial-training-adapter.js";
import { emitEmfMetric } from "../metrics.js";

export type ImportExecuteOutcome = "completed" | "retry" | "rejected";

function workerId(): string {
  return process.env.HOSTNAME || hostname() || `worker-${process.pid}`;
}

function createDefaultRegistry(): ImportAdapterRegistry {
  const registry = new ImportAdapterRegistry();
  registry.register(new ReferenceImportAdapter("reference:generic:record@1"));
  registry.register(new IndustrialPersonnelAdapter());
  registry.register(new IndustrialFleetAdapter());
  registry.register(new IndustrialSiteAdapter());
  registry.register(new IndustrialDepartmentAdapter());
  registry.register(new IndustrialPositionAdapter());
  registry.register(new IndustrialEmploymentTypeAdapter());
  registry.register(new IndustrialTrainingAdapter());
  return registry;
}

export async function processImportExecuteJob(input: {
  raw: unknown;
  databaseUrl: string;
  registry?: ImportAdapterRegistry;
}): Promise<ImportExecuteOutcome> {
  const logger = createLogger({
    service: "worker-service",
    environment: process.env.APP_ENV ?? "development",
  });
  const validated = validateImportExecuteMessage(input.raw);
  if (!validated.ok) {
    logger.warn("import execute message rejected", {
      reason: validated.reason,
      code: validated.code,
    });
    return "rejected";
  }
  const message = validated.message;
  const registry = input.registry ?? createDefaultRegistry();
  const db = getSharedDatabase(input.databaseUrl);
  const owner = workerId();

  try {
    const prepared = await withTenantTransaction(db, message.tenantId, async (tx) => {
      const job = await tx.query.importJobs.findFirst({
        where: and(eq(importJobs.tenantId, message.tenantId), eq(importJobs.id, message.jobId)),
      });
      if (!job) {
        logger.warn("import execute missing job", { jobId: message.jobId });
        return { skip: true as const };
      }
      if (job.tenantId !== message.tenantId) {
        logger.error("import execute tenant mismatch", {
          jobId: message.jobId,
          correlationId: message.correlationId,
        });
        return { failSecurity: true as const };
      }
      if (job.status === "CANCELLED") {
        return { skip: true as const };
      }
      if (job.status === "QUEUED" && job.cancellationRequested) {
        await tx
          .update(importJobs)
          .set({
            status: "CANCELLED",
            currentStage: "CANCELLED",
            completedAt: new Date(),
            version: job.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(importJobs.id, job.id));
        return { skip: true as const };
      }
      if (
        job.status === "COMPLETED" ||
        job.status === "COMPLETED_WITH_ERRORS" ||
        job.status === "FAILED"
      ) {
        return { skip: true as const };
      }
      if (job.status !== "QUEUED" && job.status !== "PROCESSING") {
        logger.warn("import execute skipped due to status", { status: job.status });
        return { skip: true as const };
      }

      const file = await tx.query.importFiles.findFirst({
        where: and(
          eq(importFiles.tenantId, message.tenantId),
          eq(importFiles.jobId, message.jobId),
        ),
      });
      if (!file) {
        logger.warn("import execute missing file", { jobId: message.jobId });
        return { failSecurity: true as const };
      }
      const gate = assertMalwareGate({
        verdict: file.malwareVerdict,
        securityHold: file.securityHold || job.securityHold,
        contentHash: file.contentHash,
        verdictHash: file.verdictHash,
        quarantineStatus: file.quarantineStatus,
      });
      if (!gate.ok) {
        logger.warn("import execute blocked by malware gate", {
          jobId: message.jobId,
          code: gate.code,
          correlationId: message.correlationId,
        });
        emitEmfMetric({
          namespace: "ForgePlatform/ImportSecurity",
          dimensions: {
            Environment: process.env.APP_ENV ?? "development",
            Code: gate.code,
          },
          metrics: { ImportSecurityGateDenied: 1 },
        });
        await tx
          .update(importJobs)
          .set({
            status: "FAILED",
            currentStage: "SECURITY_GATE_DENIED",
            errorSummary: gate.message,
            version: job.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(importJobs.id, job.id));
        return { failSecurity: true as const };
      }

      if (
        job.executionLockOwner &&
        job.executionLockOwner !== owner &&
        !isLockExpired(job.executionLockExpiresAt)
      ) {
        return { retry: true as const };
      }

      const processing =
        job.status === "QUEUED"
          ? nextStatusForS5Action("start_processing", "QUEUED")
          : ("PROCESSING" as ImportJobStatus);

      const [locked] = await tx
        .update(importJobs)
        .set({
          status: processing,
          currentStage: "EXECUTION_PROCESSING",
          executionLockOwner: owner,
          executionLockAcquiredAt: new Date(),
          executionLockHeartbeatAt: new Date(),
          executionLockExpiresAt: nextLockExpiry(),
          workerId: owner,
          executionStartedAt: job.executionStartedAt ?? new Date(),
          lastProgressAt: new Date(),
          version: job.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(importJobs.id, job.id), eq(importJobs.tenantId, message.tenantId)))
        .returning();

      return { job: locked!, skip: false as const };
    });

    if ("failSecurity" in prepared && prepared.failSecurity) return "rejected";
    if ("retry" in prepared && prepared.retry) return "retry";
    if ("skip" in prepared && prepared.skip) return "completed";
    if (!("job" in prepared) || !prepared.job) return "completed";

    const job = prepared.job;
    let adapter: ImportRecordAdapter;
    try {
      adapter = registry.resolve(job.adapterKey ?? "reference:generic:record@1");
    } catch {
      await failJob(db, message, job, "IMPORT_ADAPTER_MISSING", "NON_RETRIABLE_JOB");
      return "completed";
    }

    const batchSize = resolveBatchSize(
      Number((job.rowCountsJson as { batchSize?: number } | null)?.batchSize),
    );

    const counts = {
      successful: 0,
      failed: 0,
      skipped: 0,
      duplicate: 0,
      cancelled: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      retried: 0,
    };
    const rollbackSummary = emptyRollbackSummary();
    let totalRows = 0;
    let batchNumber = 0;
    let processed = 0;

    for (;;) {
      const chunk = await withTenantTransaction(db, message.tenantId, async (tx) => {
        const fresh = await tx.query.importJobs.findFirst({
          where: and(eq(importJobs.id, message.jobId), eq(importJobs.tenantId, message.tenantId)),
        });
        if (!fresh) return { done: true as const };
        if (fresh.cancellationRequested) {
          return { cancel: true as const, job: fresh };
        }

        const rows = await tx.query.importRows.findMany({
          where: and(
            eq(importRows.tenantId, message.tenantId),
            eq(importRows.jobId, message.jobId),
            inArray(importRows.status, ["STAGED", "RETRY_REQUESTED", "PENDING"]),
          ),
          orderBy: [asc(importRows.createdAt)],
          limit: batchSize,
        });
        if (rows.length === 0) {
          const [total] = await tx
            .select({ value: sql<number>`count(*)::int` })
            .from(importRows)
            .where(
              and(eq(importRows.tenantId, message.tenantId), eq(importRows.jobId, message.jobId)),
            );
          return { done: true as const, total: Number(total?.value ?? 0), job: fresh };
        }

        batchNumber += 1;
        const batchId = createId();
        const startedAt = new Date();
        await tx.insert(importBatches).values({
          id: batchId,
          tenantId: message.tenantId,
          jobId: message.jobId,
          batchNumber,
          status: "PROCESSING",
          rowCount: rows.length,
          workerId: owner,
          attemptCount: 1,
          idempotencyKey: `batch:${message.jobId}:${batchNumber}:${message.idempotencyKey}`,
          correlationId: message.correlationId,
          startedAt,
          version: 1,
          createdAt: startedAt,
          updatedAt: startedAt,
        });

        await tx
          .update(importJobs)
          .set({
            executionLockHeartbeatAt: new Date(),
            executionLockExpiresAt: nextLockExpiry(),
            lastProgressAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(importJobs.id, message.jobId));

        return { rows, batchId, job: fresh, startedAt };
      });

      if ("cancel" in chunk && chunk.cancel) {
        await finalizeCancelled(db, message, chunk.job, counts, batchNumber);
        return "completed";
      }
      if ("done" in chunk && chunk.done) {
        totalRows = chunk.total ?? processed;
        break;
      }
      if (!("rows" in chunk) || !chunk.rows) break;

      const contextBase = {
        tenantId: message.tenantId,
        jobId: message.jobId,
        batchId: chunk.batchId,
        correlationId: message.correlationId,
        productCode: job.productCode,
        moduleCode: job.moduleCode,
        recordType: job.recordType,
        mappingSnapshot: (job.mappingSnapshotJson as unknown[]) ?? [],
        workerId: owner,
        attempt: message.attempt,
      };

      await adapter.validateExecutionContext(contextBase);
      await adapter.prepareBatch({ ...contextBase, batchNumber });

      let batchCommitted = 0;
      let batchFailed = 0;
      let batchSkipped = 0;
      let batchDuplicate = 0;
      let batchCancelled = 0;
      let lastRowId: string | null = null;

      for (const row of chunk.rows) {
        const cancelCheck = await withTenantTransaction(db, message.tenantId, async (tx) => {
          const fresh = await tx.query.importJobs.findFirst({
            where: eq(importJobs.id, message.jobId),
          });
          return Boolean(fresh?.cancellationRequested);
        });
        if (cancelCheck) {
          await withTenantTransaction(db, message.tenantId, async (tx) => {
            await tx
              .update(importRows)
              .set({
                status: "CANCELLED",
                batchId: chunk.batchId,
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(importRows.id, row.id));
          });
          batchCancelled += 1;
          counts.cancelled += 1;
          processed += 1;
          continue;
        }

        if (row.status === "COMMITTED") {
          counts.successful += 1;
          processed += 1;
          continue;
        }

        const result = await adapter.executeRecord(
          {
            rowId: row.id,
            sourceRowKey: row.sourceRowKey,
            mapped: (row.mappedJson as Record<string, unknown>) ?? {},
            operationKey: row.operationKey,
            sourceHash: row.sourceHash,
          },
          contextBase,
        );

        const delta = rowOutcomeToCounters(result);
        counts.successful += delta.successful;
        counts.failed += delta.failed;
        counts.skipped += delta.skipped;
        counts.duplicate += delta.duplicate;
        counts.created += delta.created;
        counts.updated += delta.updated;
        counts.unchanged += delta.unchanged;
        batchCommitted += delta.successful;
        batchFailed += delta.failed;
        batchSkipped += delta.skipped;
        batchDuplicate += delta.duplicate;
        rollbackSummary[result.rollbackClassification] += 1;
        lastRowId = row.id;
        processed += 1;

        await withTenantTransaction(db, message.tenantId, async (tx) => {
          if (result.outcome === "FAILED") {
            await tx
              .update(importRows)
              .set({
                status: "FAILED",
                batchId: chunk.batchId,
                commitAttempt: (row.commitAttempt ?? 0) + 1,
                adapterKey: adapter.key,
                adapterVersion: adapter.version,
                operationType: result.operationType ?? null,
                rollbackClassification: result.rollbackClassification,
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(importRows.id, row.id));
            await tx.insert(importRowErrors).values({
              id: createId(),
              tenantId: message.tenantId,
              jobId: message.jobId,
              rowId: row.id,
              severity: "ERROR",
              ruleCode: result.errorCode ?? "ADAPTER_FAILED",
              message: result.errorMessage ?? "Row execution failed",
              failureClass: result.failureClass ?? "NON_RETRIABLE_ROW",
              disposition: "OPEN",
              detailsJson: {},
              correlationId: message.correlationId,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            return;
          }

          const destId = result.destinationRecordId ?? null;
          await tx
            .update(importRows)
            .set({
              status:
                result.outcome === "SKIPPED"
                  ? "SKIPPED"
                  : result.outcome === "DUPLICATE"
                    ? "DUPLICATE"
                    : "COMMITTED",
              batchId: chunk.batchId,
              destinationRecordId: destId,
              operationType: result.operationType ?? null,
              rollbackClassification: result.rollbackClassification,
              rollbackJournalJson: {
                beforeRef: result.beforeRef ?? {},
                afterRef: result.afterRef ?? {},
                compensation: result.compensation ?? {},
              },
              commitAttempt: (row.commitAttempt ?? 0) + 1,
              adapterKey: adapter.key,
              adapterVersion: adapter.version,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(importRows.id, row.id));

          if (delta.successful > 0) {
            const idem = journalIdempotencyKey({
              tenantId: message.tenantId,
              jobId: message.jobId,
              rowId: row.id,
              adapterKey: adapter.key,
            });
            const existingJournal = await tx.query.importExecutionJournal.findFirst({
              where: and(
                eq(importExecutionJournal.tenantId, message.tenantId),
                eq(importExecutionJournal.idempotencyKey, idem),
              ),
            });
            if (!existingJournal) {
              await tx.insert(importExecutionJournal).values({
                id: createId(),
                tenantId: message.tenantId,
                jobId: message.jobId,
                batchId: chunk.batchId,
                rowId: row.id,
                adapterKey: adapter.key,
                adapterVersion: adapter.version,
                operationType: result.operationType ?? "UPSERT",
                destinationRecordId: destId,
                rollbackClassification: result.rollbackClassification,
                beforeRefJson: result.beforeRef ?? {},
                afterRefJson: result.afterRef ?? {},
                compensationJson: result.compensation ?? {},
                idempotencyKey: idem,
                correlationId: message.correlationId,
                committedAt: new Date(),
                version: 1,
                createdAt: new Date(),
              });
            }
          }
        });
      }

      await adapter.finalizeBatch?.({ ...contextBase, batchNumber });

      const durationMs = Date.now() - chunk.startedAt.getTime();
      await withTenantTransaction(db, message.tenantId, async (tx) => {
        await tx
          .update(importBatches)
          .set({
            status: "COMPLETED",
            committedCount: batchCommitted,
            failedCount: batchFailed,
            skippedCount: batchSkipped,
            duplicateCount: batchDuplicate,
            cancelledCount: batchCancelled,
            lastProcessedRowId: lastRowId,
            checkpointJson: { lastProcessedRowId: lastRowId, processed },
            durationMs,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(importBatches.id, chunk.batchId));

        const progress = computeProgress({
          totalRows: Math.max(totalRows, processed),
          processedRows: processed,
          successfulRows: counts.successful,
          failedRows: counts.failed,
          skippedRows: counts.skipped,
          duplicateRows: counts.duplicate,
          cancelledRows: counts.cancelled,
          currentBatch: batchNumber,
          totalBatches: batchNumber,
          finalized: false,
        });

        await tx
          .update(importJobs)
          .set({
            progressPercent: progress.percentComplete,
            lastProgressAt: new Date(),
            executionLockHeartbeatAt: new Date(),
            executionLockExpiresAt: nextLockExpiry(),
            rowCountsJson: {
              total: progress.totalRows,
              processed: progress.processedRows,
              successful: counts.successful,
              failed: counts.failed,
              skipped: counts.skipped,
              duplicate: counts.duplicate,
              cancelled: counts.cancelled,
              currentBatch: batchNumber,
              totalBatches: batchNumber,
              batchSize,
            },
            updatedAt: new Date(),
          })
          .where(eq(importJobs.id, message.jobId));
      });
    }

    await finalizeSuccess(
      db,
      message,
      job,
      adapter,
      counts,
      rollbackSummary,
      processed,
      batchNumber,
    );
    return "completed";
  } catch (error) {
    logger.error("import execute failed", {
      error,
      jobId: message.jobId,
      correlationId: message.correlationId,
    });
    const failureClass = ((error as { failureClass?: FailureClass }).failureClass ??
      "RETRIABLE") as FailureClass;
    if (failureClass === "RETRIABLE") return "retry";
    await failJob(
      db,
      message,
      { id: message.jobId, version: 1 } as { id: string; version: number },
      (error as Error).message,
      failureClass,
    );
    return "completed";
  }
}

async function failJob(
  db: ReturnType<typeof getSharedDatabase>,
  message: ImportExecuteMessage,
  job: { id: string; version: number },
  errorSummary: string,
  failureClass: FailureClass,
) {
  await withTenantTransaction(db, message.tenantId, async (tx) => {
    await tx
      .update(importJobs)
      .set({
        status: "FAILED",
        currentStage: "FAILED",
        errorSummary: `${failureClass}: ${errorSummary}`.slice(0, 2000),
        completedAt: new Date(),
        progressPercent: 100,
        executionLockOwner: null,
        executionLockExpiresAt: null,
        version: job.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, message.jobId));
  });
}

async function finalizeCancelled(
  db: ReturnType<typeof getSharedDatabase>,
  message: ImportExecuteMessage,
  job: typeof importJobs.$inferSelect,
  counts: {
    successful: number;
    failed: number;
    skipped: number;
    duplicate: number;
    cancelled: number;
  },
  batchNumber: number,
) {
  const progress = computeProgress({
    totalRows: Number((job.rowCountsJson as { total?: number })?.total ?? 0),
    processedRows:
      counts.successful + counts.failed + counts.skipped + counts.duplicate + counts.cancelled,
    successfulRows: counts.successful,
    failedRows: counts.failed,
    skippedRows: counts.skipped,
    duplicateRows: counts.duplicate,
    cancelledRows: counts.cancelled,
    currentBatch: batchNumber,
    totalBatches: batchNumber,
    finalized: true,
  });
  await withTenantTransaction(db, message.tenantId, async (tx) => {
    await tx
      .update(importJobs)
      .set({
        status: "CANCELLED",
        currentStage: "CANCELLED",
        completedAt: new Date(),
        progressPercent: progress.percentComplete,
        executionLockOwner: null,
        executionLockExpiresAt: null,
        rowCountsJson: {
          ...(job.rowCountsJson ?? {}),
          ...counts,
          processed: progress.processedRows,
          currentBatch: batchNumber,
          totalBatches: batchNumber,
        },
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, message.jobId));
  });
}

async function finalizeSuccess(
  db: ReturnType<typeof getSharedDatabase>,
  message: ImportExecuteMessage,
  job: typeof importJobs.$inferSelect,
  adapter: ImportRecordAdapter,
  counts: {
    successful: number;
    failed: number;
    skipped: number;
    duplicate: number;
    cancelled: number;
    created: number;
    updated: number;
    unchanged: number;
    retried: number;
  },
  rollbackSummary: Record<RollbackClassification, number>,
  processed: number,
  batchNumber: number,
) {
  const total = Math.max(
    processed,
    Number((job.rowCountsJson as { total?: number } | null)?.total ?? 0),
  );
  const status = finalizeJobStatus({
    successful: counts.successful,
    failed: counts.failed,
    cancelled: counts.cancelled,
    total,
  });
  const completedAt = new Date();
  const startedAt = job.executionStartedAt ?? completedAt;
  const summary = buildExecutionResultSummary({
    jobId: message.jobId,
    tenantId: message.tenantId,
    productKey: job.productCode,
    moduleKey: job.moduleCode,
    recordType: job.recordType,
    adapterKey: adapter.key,
    adapterVersion: adapter.version,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalRows: total,
    successfulRows: counts.successful,
    failedRows: counts.failed,
    skippedRows: counts.skipped,
    duplicateRows: counts.duplicate,
    retriedRows: counts.retried,
    cancelledRows: counts.cancelled,
    createdRecords: counts.created,
    updatedRecords: counts.updated,
    unchangedRecords: counts.unchanged,
    rollbackClassificationSummary: rollbackSummary,
    errorReportRef: counts.failed > 0 ? `errors:${message.jobId}` : null,
    correlationId: message.correlationId,
    executionImageVersion: process.env.IMAGE_TAG ?? null,
  });
  const progress = computeProgress({
    totalRows: total,
    processedRows: processed,
    successfulRows: counts.successful,
    failedRows: counts.failed,
    skippedRows: counts.skipped,
    duplicateRows: counts.duplicate,
    cancelledRows: counts.cancelled,
    currentBatch: batchNumber,
    totalBatches: batchNumber,
    finalized: true,
  });

  await withTenantTransaction(db, message.tenantId, async (tx) => {
    await tx
      .update(importJobs)
      .set({
        status,
        currentStage: status,
        completedAt,
        progressPercent: progress.percentComplete,
        resultSummaryJson: summary,
        rollbackClassificationSummaryJson: {
          ...rollbackSummary,
          jobClassification:
            (Object.entries(rollbackSummary).sort((a, b) => b[1] - a[1])[0]?.[0] as string) ??
            "FULLY_REVERSIBLE",
        },
        rowCountsJson: {
          total,
          processed,
          successful: counts.successful,
          failed: counts.failed,
          skipped: counts.skipped,
          duplicate: counts.duplicate,
          cancelled: counts.cancelled,
          currentBatch: batchNumber,
          totalBatches: batchNumber,
        },
        executionLockOwner: null,
        executionLockExpiresAt: null,
        executionLockHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, message.jobId));
  });
}
