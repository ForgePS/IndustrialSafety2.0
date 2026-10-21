import {
  createId,
  getSharedDatabase,
  industrialDepartments,
  industrialEmploymentTypes,
  industrialPersonnel,
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
    const error = new Error("DATABASE_URL is required for industrial personnel adapter");
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

async function resolveLookupId(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  table: "department" | "position" | "employment_type",
  idValue: string | undefined,
  nameValue: string | undefined,
): Promise<string | undefined> {
  if (idValue) return idValue;
  if (!nameValue) return undefined;
  const lowered = nameValue.toLowerCase();
  if (table === "department") {
    const rows = await tx
      .select({ id: industrialDepartments.id })
      .from(industrialDepartments)
      .where(
        and(
          eq(industrialDepartments.tenantId, tenantId),
          sql`lower(${industrialDepartments.name}) = ${lowered}`,
          isNull(industrialDepartments.archivedAt),
        ),
      )
      .limit(1);
    return rows[0]?.id;
  }
  if (table === "position") {
    const rows = await tx
      .select({ id: industrialPositions.id })
      .from(industrialPositions)
      .where(
        and(
          eq(industrialPositions.tenantId, tenantId),
          sql`lower(${industrialPositions.name}) = ${lowered}`,
          isNull(industrialPositions.archivedAt),
        ),
      )
      .limit(1);
    return rows[0]?.id;
  }
  const rows = await tx
    .select({ id: industrialEmploymentTypes.id })
    .from(industrialEmploymentTypes)
    .where(
      and(
        eq(industrialEmploymentTypes.tenantId, tenantId),
        sql`lower(${industrialEmploymentTypes.name}) = ${lowered}`,
        isNull(industrialEmploymentTypes.archivedAt),
      ),
    )
    .limit(1);
  return rows[0]?.id;
}

/** Writes industrial_personnel via shared DB + tenant transaction. */
export class IndustrialPersonnelAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:PERSONNEL:personnel@1";
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
    const displayName =
      asOptionalString(mapped.display_name) ??
      asOptionalString(mapped.displayName) ??
      [asOptionalString(mapped.first_name), asOptionalString(mapped.last_name)]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (!displayName) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "PERSONNEL_DISPLAY_NAME_REQUIRED",
        errorMessage: "display_name is required",
      };
    }

    const employeeNumber =
      asOptionalString(mapped.employee_number) ?? asOptionalString(mapped.employeeNumber);
    const email = asOptionalString(mapped.email);
    const phone = asOptionalString(mapped.phone);
    const firstNameRaw =
      asOptionalString(mapped.first_name) ?? asOptionalString(mapped.firstName);
    const lastNameRaw = asOptionalString(mapped.last_name) ?? asOptionalString(mapped.lastName);
    let firstName = firstNameRaw;
    let lastName = lastNameRaw;
    if (!firstName && !lastName && displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    }
    const hireDate = asOptionalString(mapped.hire_date) ?? asOptionalString(mapped.hireDate);
    const supervisorName =
      asOptionalString(mapped.supervisor) ?? asOptionalString(mapped.supervisor_name);
    const locationName =
      asOptionalString(mapped.location) ?? asOptionalString(mapped.location_name);
    const departmentIdInput =
      asOptionalString(mapped.department_id) ?? asOptionalString(mapped.departmentId);
    const positionIdInput =
      asOptionalString(mapped.position_id) ?? asOptionalString(mapped.positionId);
    const employmentTypeIdInput =
      asOptionalString(mapped.employment_type_id) ??
      asOptionalString(mapped.employmentTypeId);
    const departmentName = asOptionalString(mapped.department);
    const positionName = asOptionalString(mapped.position);
    const employmentTypeName =
      asOptionalString(mapped.employment_type) ?? asOptionalString(mapped.employmentType);

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        const departmentId = await resolveLookupId(
          tx,
          context.tenantId,
          "department",
          departmentIdInput,
          departmentName,
        );
        const positionId = await resolveLookupId(
          tx,
          context.tenantId,
          "position",
          positionIdInput,
          positionName,
        );
        const employmentTypeId = await resolveLookupId(
          tx,
          context.tenantId,
          "employment_type",
          employmentTypeIdInput,
          employmentTypeName,
        );

        let existing: typeof industrialPersonnel.$inferSelect | undefined;
        if (employeeNumber) {
          const rows = await tx
            .select()
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.tenantId, context.tenantId),
                eq(industrialPersonnel.employeeNumber, employeeNumber),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
            .limit(1);
          existing = rows[0];
        }

        const now = new Date();
        if (existing) {
          const [updated] = await tx
            .update(industrialPersonnel)
            .set({
              displayName,
              firstName,
              lastName,
              email,
              phone,
              hireDate,
              supervisorName,
              departmentId,
              positionId,
              employmentTypeId,
              sourceSystem: "FORGE",
              sourcePayload: {
              ...mapped,
              importJobId: context.jobId,
              ...(locationName ? { location: locationName } : {}),
            },
              updatedAt: now,
            })
            .where(eq(industrialPersonnel.id, existing.id))
            .returning();
          return {
            outcome: "UPDATED" as const,
            destinationRecordId: updated?.id ?? existing.id,
            operationType: "UPSERT",
            rollbackClassification: "COMPENSATING_ACTION" as RollbackClassification,
            beforeRef: { id: existing.id, employeeNumber: existing.employeeNumber },
            afterRef: { id: updated?.id ?? existing.id, employeeNumber },
          };
        }

        const id = createId();
        const [created] = await tx
          .insert(industrialPersonnel)
          .values({
            id,
            tenantId: context.tenantId,
            employeeNumber,
            displayName,
            firstName,
            lastName,
            email,
            phone,
            hireDate,
            supervisorName,
            departmentId,
            positionId,
            employmentTypeId,
            status: "ACTIVE",
            sourceSystem: "FORGE",
            sourcePayload: {
              ...mapped,
              importJobId: context.jobId,
              ...(locationName ? { location: locationName } : {}),
            },
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
          afterRef: { id: created?.id ?? id, employeeNumber },
          compensation: { action: "DELETE", destinationRecordId: created?.id ?? id },
        };
      });
    } catch (error) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "PERSONNEL_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Personnel upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
