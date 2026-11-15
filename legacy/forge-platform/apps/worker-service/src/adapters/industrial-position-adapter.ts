import {
  createId,
  getSharedDatabase,
  industrialDepartments,
  industrialPositions,
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
    const error = new Error("DATABASE_URL is required for industrial position adapter");
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

async function resolveDepartmentId(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  departmentIdInput: string | undefined,
  departmentName: string | undefined,
): Promise<string | undefined> {
  if (departmentIdInput) return departmentIdInput;
  if (!departmentName) return undefined;
  const rows = await tx
    .select({ id: industrialDepartments.id })
    .from(industrialDepartments)
    .where(
      and(
        eq(industrialDepartments.tenantId, tenantId),
        sql`lower(${industrialDepartments.name}) = ${departmentName.toLowerCase()}`,
        isNull(industrialDepartments.archivedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id;
}

/** Writes industrial_positions via shared DB + tenant transaction. */
export class IndustrialPositionAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:ORG:position@1";
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
      asOptionalString(mapped.position) ??
      asOptionalString(mapped.job_title) ??
      asOptionalString(mapped.jobTitle);
    if (!name) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "POSITION_NAME_REQUIRED",
        errorMessage: "name is required",
      };
    }

    const description = asOptionalString(mapped.description);
    const departmentIdInput =
      asOptionalString(mapped.department_id) ?? asOptionalString(mapped.departmentId);
    const departmentName = asOptionalString(mapped.department);

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        const departmentId = await resolveDepartmentId(
          tx,
          context.tenantId,
          departmentIdInput,
          departmentName,
        );

        const existingRows = await tx
          .select()
          .from(industrialPositions)
          .where(
            and(
              eq(industrialPositions.tenantId, context.tenantId),
              sql`lower(${industrialPositions.name}) = ${name.toLowerCase()}`,
              isNull(industrialPositions.archivedAt),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        const now = new Date();
        const sourcePayload = { ...mapped, importJobId: context.jobId };

        if (existing) {
          const [updated] = await tx
            .update(industrialPositions)
            .set({
              description: description ?? existing.description,
              departmentId: departmentId ?? existing.departmentId,
              sourceSystem: "FORGE",
              sourcePayload,
              updatedAt: now,
            })
            .where(eq(industrialPositions.id, existing.id))
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
          .insert(industrialPositions)
          .values({
            id,
            tenantId: context.tenantId,
            name,
            description: description ?? null,
            departmentId: departmentId ?? null,
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
        errorCode: "POSITION_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Position upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
