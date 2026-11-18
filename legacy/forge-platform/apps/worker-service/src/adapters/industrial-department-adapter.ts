import {
  createId,
  getSharedDatabase,
  industrialDepartments,
  industrialSites,
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
    const error = new Error("DATABASE_URL is required for industrial department adapter");
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

async function resolveSiteId(
  tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  siteIdInput: string | undefined,
  siteKey: string | undefined,
  siteName: string | undefined,
): Promise<string | undefined> {
  if (siteIdInput) return siteIdInput;
  if (siteKey) {
    const byKey = await tx
      .select({ id: industrialSites.id })
      .from(industrialSites)
      .where(
        and(
          eq(industrialSites.tenantId, tenantId),
          sql`lower(${industrialSites.siteKey}) = ${siteKey.toLowerCase()}`,
          isNull(industrialSites.archivedAt),
        ),
      )
      .limit(1);
    if (byKey[0]?.id) return byKey[0].id;
  }
  if (siteName) {
    const byName = await tx
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
    return byName[0]?.id;
  }
  return undefined;
}

/** Writes industrial_departments via shared DB + tenant transaction. */
export class IndustrialDepartmentAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:ORG:department@1";
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
    const name = asOptionalString(mapped.name) ?? asOptionalString(mapped.department);
    if (!name) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "DEPARTMENT_NAME_REQUIRED",
        errorMessage: "name is required",
      };
    }

    const description = asOptionalString(mapped.description);
    const divisionName =
      asOptionalString(mapped.division_name) ?? asOptionalString(mapped.divisionName);
    const contactName =
      asOptionalString(mapped.contact_name) ?? asOptionalString(mapped.contactName);
    const contactEmail =
      asOptionalString(mapped.contact_email) ?? asOptionalString(mapped.contactEmail);
    const siteIdInput = asOptionalString(mapped.site_id) ?? asOptionalString(mapped.siteId);
    const siteKey = asOptionalString(mapped.site_key) ?? asOptionalString(mapped.siteKey);
    const siteName = asOptionalString(mapped.site) ?? asOptionalString(mapped.location);

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        const siteId = await resolveSiteId(tx, context.tenantId, siteIdInput, siteKey, siteName);

        const existingRows = await tx
          .select()
          .from(industrialDepartments)
          .where(
            and(
              eq(industrialDepartments.tenantId, context.tenantId),
              sql`lower(${industrialDepartments.name}) = ${name.toLowerCase()}`,
              siteId
                ? eq(industrialDepartments.siteId, siteId)
                : isNull(industrialDepartments.siteId),
              divisionName
                ? sql`lower(coalesce(${industrialDepartments.divisionName}, '')) = ${divisionName.toLowerCase()}`
                : sql`coalesce(${industrialDepartments.divisionName}, '') = ''`,
              isNull(industrialDepartments.archivedAt),
            ),
          )
          .limit(1);
        const existing = existingRows[0];
        const now = new Date();
        const sourcePayload = {
          ...mapped,
          importJobId: context.jobId,
          description: description ?? null,
          division: divisionName ?? null,
        };

        if (existing) {
          const [updated] = await tx
            .update(industrialDepartments)
            .set({
              siteId: siteId ?? existing.siteId,
              divisionName: divisionName ?? existing.divisionName,
              contactName: contactName ?? existing.contactName,
              contactEmail: contactEmail ?? existing.contactEmail,
              sourceSystem: "FORGE",
              sourcePayload,
              updatedAt: now,
            })
            .where(eq(industrialDepartments.id, existing.id))
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
          .insert(industrialDepartments)
          .values({
            id,
            tenantId: context.tenantId,
            siteId: siteId ?? null,
            name,
            divisionName: divisionName ?? null,
            contactName: contactName ?? null,
            contactEmail: contactEmail ?? null,
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
        errorCode: "DEPARTMENT_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Department upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
