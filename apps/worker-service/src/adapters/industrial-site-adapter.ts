import {
  createId,
  getSharedDatabase,
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
    const error = new Error("DATABASE_URL is required for industrial site adapter");
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

function slugifySiteKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Writes industrial_sites via shared DB + tenant transaction. */
export class IndustrialSiteAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:ORG:site@1";
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
      asOptionalString(mapped.site) ??
      asOptionalString(mapped.location);
    if (!name) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "SITE_NAME_REQUIRED",
        errorMessage: "name is required",
      };
    }

    const siteKeyInput =
      asOptionalString(mapped.site_key) ?? asOptionalString(mapped.siteKey);
    const timezone = asOptionalString(mapped.timezone);
    const notes = asOptionalString(mapped.notes);

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        let existing: typeof industrialSites.$inferSelect | undefined;

        if (siteKeyInput) {
          const byKey = await tx
            .select()
            .from(industrialSites)
            .where(
              and(
                eq(industrialSites.tenantId, context.tenantId),
                sql`lower(${industrialSites.siteKey}) = ${siteKeyInput.toLowerCase()}`,
                isNull(industrialSites.archivedAt),
              ),
            )
            .limit(1);
          existing = byKey[0];
        }

        if (!existing) {
          const byName = await tx
            .select()
            .from(industrialSites)
            .where(
              and(
                eq(industrialSites.tenantId, context.tenantId),
                sql`lower(${industrialSites.name}) = ${name.toLowerCase()}`,
                isNull(industrialSites.archivedAt),
              ),
            )
            .limit(1);
          existing = byName[0];
        }

        const now = new Date();
        const siteKey = siteKeyInput ?? existing?.siteKey ?? (slugifySiteKey(name) || null);
        const sourcePayload = {
          ...mapped,
          importJobId: context.jobId,
          notes: notes ?? null,
        };

        if (existing) {
          const [updated] = await tx
            .update(industrialSites)
            .set({
              name,
              siteKey,
              timezone: timezone ?? existing.timezone,
              sourceSystem: "FORGE",
              sourcePayload,
              updatedAt: now,
            })
            .where(eq(industrialSites.id, existing.id))
            .returning();
          return {
            outcome: "UPDATED" as const,
            destinationRecordId: updated?.id ?? existing.id,
            operationType: "UPSERT",
            rollbackClassification: "COMPENSATING_ACTION" as RollbackClassification,
            beforeRef: { id: existing.id, name: existing.name, siteKey: existing.siteKey },
            afterRef: { id: updated?.id ?? existing.id, name, siteKey },
          };
        }

        const id = createId();
        const [created] = await tx
          .insert(industrialSites)
          .values({
            id,
            tenantId: context.tenantId,
            name,
            siteKey,
            timezone: timezone ?? null,
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
          afterRef: { id: created?.id ?? id, name, siteKey },
          compensation: { action: "DELETE", destinationRecordId: created?.id ?? id },
        };
      });
    } catch (error) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "SITE_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Site upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
