import {
  createId,
  getSharedDatabase,
  industrialEmploymentTypes,
  withTenantTransaction,
} from "@forge/database";
import type {
  AdapterBatchContext,
  AdapterExecutionContext,
  ImportRecordAdapter,
  ImportRecordResult,
  NormalizedImportRecord,
  RollbackClassification,
} from "@forge/imports";
import { and, eq, isNull, sql } from "drizzle-orm";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const error = new Error("DATABASE_URL is required for industrial employment type adapter");
    (error as Error & { failureClass: string }).failureClass = "NON_RETRIABLE_JOB";
    throw error;
  }
  return url;
}

function asOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/** Writes industrial_employment_types via shared DB + tenant transaction. */
export class IndustrialEmploymentTypeAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:ORG:employment_type@1";
  readonly version = "1";

  async validateExecutionContext(context: AdapterExecutionContext): Promise<void> {
    if (!context.tenantId || !context.jobId) {
      const error = new Error("Invalid execution context");
      (error as Error & { failureClass: string }).failureClass = "NON_RETRIABLE_JOB";
      throw error;
    }
  }

  async prepareBatch(context: AdapterBatchContext): Promise<AdapterBatchContext> {
    return context;
  }

  async executeRecord(
    record: NormalizedImportRecord,
    context: AdapterExecutionContext,
  ): Promise<ImportRecordResult> {
    const mapped = record.mapped ?? {};
    const name =
      asOptionalString(mapped.name) ??
      asOptionalString(mapped.employment_type) ??
      asOptionalString(mapped.employmentType);
    if (!name) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "EMPLOYMENT_TYPE_NAME_REQUIRED",
        errorMessage: "name is required",
      };
    }

    const description = asOptionalString(mapped.description);
    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        const existingRows = await tx
          .select()
          .from(industrialEmploymentTypes)
          .where(
            and(
              eq(industrialEmploymentTypes.tenantId, context.tenantId),
              sql`lower(${industrialEmploymentTypes.name}) = ${name.toLowerCase()}`,
              isNull(industrialEmploymentTypes.archivedAt),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        const now = new Date();
        const sourcePayload = {
          ...mapped,
          importJobId: context.jobId,
          description: description ?? null,
        };

        if (existing) {
          const [updated] = await tx
            .update(industrialEmploymentTypes)
            .set({
              description: description ?? existing.description,
              sourceSystem: "FORGE",
              sourcePayload,
              updatedAt: now,
            })
            .where(eq(industrialEmploymentTypes.id, existing.id))
            .returning();
          return {
            outcome: "UPDATED" as const,
            destinationRecordId: updated?.id ?? existing.id,
            operationType: "UPSERT",
            rollbackClassification: "COMPENSATING_ACTION" as RollbackClassification,
            beforeRef: { id: existing.id, name: existing.name },
            afterRef: { id: updated?.id ?? existing.id, name },
          };
        }

        const id = createId();
        const [created] = await tx
          .insert(industrialEmploymentTypes)
          .values({
            id,
            tenantId: context.tenantId,
            name,
            description: description ?? null,
            status: "ACTIVE",
            sourceSystem: "FORGE",
            sourcePayload,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          outcome: "CREATED" as const,
          destinationRecordId: created?.id ?? id,
          operationType: "CREATE",
          rollbackClassification: "FULLY_REVERSIBLE" as RollbackClassification,
          beforeRef: {},
          afterRef: { id: created?.id ?? id, name },
          compensation: { action: "DELETE", destinationRecordId: created?.id ?? id },
        };
      });
    } catch (error) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "EMPLOYMENT_TYPE_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Employment type upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
