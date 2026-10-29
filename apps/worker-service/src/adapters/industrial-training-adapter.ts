import {
  createId,
  getSharedDatabase,
  industrialDepartments,
  industrialPersonnel,
  industrialSites,
  industrialTrainingRecords,
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
    const error = new Error("DATABASE_URL is required for industrial training adapter");
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

function parseDate(value: unknown): Date | undefined {
  const text = asOptionalString(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function dateKey(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

async function resolveSiteId(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  siteIdInput: string | undefined,
  siteName: string | undefined,
): Promise<string | undefined> {
  if (siteIdInput) return siteIdInput;
  if (!siteName) return undefined;
  const rows = await tx
    .select({ id: industrialSites.id })
    .from(industrialSites)
    .where(
      and(
        eq(industrialSites.tenantId, tenantId),
        sql`lower(${industrialSites.name}) = ${siteName.toLowerCase()}`,
        isNull(industrialSites.archivedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id;
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

/** Writes industrial_training_records via shared DB + tenant transaction. */
export class IndustrialTrainingAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:TRAINING:training_record@1";
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
    const employeeNumber =
      asOptionalString(mapped.employee_number) ?? asOptionalString(mapped.employeeNumber);
    const title =
      asOptionalString(mapped.title) ??
      asOptionalString(mapped.course_name) ??
      asOptionalString(mapped.courseName);
    if (!employeeNumber) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "TRAINING_EMPLOYEE_NUMBER_REQUIRED",
        errorMessage: "employee_number is required",
      };
    }
    if (!title) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "TRAINING_TITLE_REQUIRED",
        errorMessage: "title (or course_name) is required",
      };
    }

    const courseName =
      asOptionalString(mapped.course_name) ?? asOptionalString(mapped.courseName) ?? title;
    const completedAt =
      parseDate(mapped.completed_at) ?? parseDate(mapped.completedAt) ?? new Date();
    const expiresAt = parseDate(mapped.expires_at) ?? parseDate(mapped.expiresAt);
    const courseCode = asOptionalString(mapped.course_code) ?? asOptionalString(mapped.courseCode);
    const instructorName =
      asOptionalString(mapped.instructor_name) ?? asOptionalString(mapped.instructorName);
    const notes = asOptionalString(mapped.notes);
    const siteIdInput = asOptionalString(mapped.site_id) ?? asOptionalString(mapped.siteId);
    const siteName = asOptionalString(mapped.site) ?? asOptionalString(mapped.location);
    const departmentIdInput =
      asOptionalString(mapped.department_id) ?? asOptionalString(mapped.departmentId);
    const departmentName = asOptionalString(mapped.department);

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        const personnelRows = await tx
          .select({
            id: industrialPersonnel.id,
            employeeNumber: industrialPersonnel.employeeNumber,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.tenantId, context.tenantId),
              eq(industrialPersonnel.employeeNumber, employeeNumber),
              isNull(industrialPersonnel.archivedAt),
            ),
          )
          .limit(1);
        const personnel = personnelRows[0];
        if (!personnel) {
          return {
            outcome: "FAILED" as const,
            operationType: "UPSERT",
            rollbackClassification: "NOT_REVERSIBLE" as RollbackClassification,
            failureClass: "NON_RETRIABLE_ROW" as const,
            errorCode: "TRAINING_PERSONNEL_NOT_FOUND",
            errorMessage: `No personnel found for employee_number "${employeeNumber}"`,
          };
        }

        const siteId = await resolveSiteId(tx, context.tenantId, siteIdInput, siteName);
        const departmentId = await resolveDepartmentId(
          tx,
          context.tenantId,
          departmentIdInput,
          departmentName,
        );

        const titleLower = title.toLowerCase();
        const completedKey = dateKey(completedAt);
        const candidates = await tx
          .select()
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.tenantId, context.tenantId),
              eq(industrialTrainingRecords.personnelId, personnel.id),
              isNull(industrialTrainingRecords.archivedAt),
              sql`lower(coalesce(${industrialTrainingRecords.title}, ${industrialTrainingRecords.courseName}, '')) = ${titleLower}`,
            ),
          );

        const existing = candidates.find((row) => dateKey(row.completedAt) === completedKey);
        const now = new Date();
        const sourcePayload = {
          ...mapped,
          importJobId: context.jobId,
          courseCode: courseCode ?? null,
          instructorName: instructorName ?? null,
          notes: notes ?? null,
          personnelId: personnel.id,
          employeeNumber,
        };

        if (existing) {
          const [updated] = await tx
            .update(industrialTrainingRecords)
            .set({
              title,
              courseName,
              completedAt,
              expiresAt: expiresAt ?? existing.expiresAt,
              siteId: siteId ?? existing.siteId,
              departmentId: departmentId ?? existing.departmentId,
              sourceSystem: "FORGE",
              sourcePayload,
              updatedAt: now,
            })
            .where(eq(industrialTrainingRecords.id, existing.id))
            .returning();
          return {
            outcome: "UPDATED" as const,
            destinationRecordId: updated?.id ?? existing.id,
            operationType: "UPSERT",
            rollbackClassification: "COMPENSATING_ACTION" as RollbackClassification,
            beforeRef: { id: existing.id, employeeNumber, title: existing.title },
            afterRef: { id: updated?.id ?? existing.id, employeeNumber, title },
          };
        }

        const id = createId();
        const [created] = await tx
          .insert(industrialTrainingRecords)
          .values({
            id,
            tenantId: context.tenantId,
            personnelId: personnel.id,
            title,
            courseName,
            completedAt,
            expiresAt: expiresAt ?? null,
            siteId: siteId ?? null,
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
          afterRef: { id: created?.id ?? id, employeeNumber, title },
          compensation: { action: "DELETE", destinationRecordId: created?.id ?? id },
        };
      });
    } catch (error) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "TRAINING_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Training upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
