import {
  createId,
  getSharedDatabase,
  industrialFleetVehicles,
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
import { and, eq, isNull } from "drizzle-orm";

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const error = new Error("DATABASE_URL is required for industrial fleet adapter");
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

function asOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return undefined;
}

/** Writes industrial_fleet_vehicles via shared DB + tenant transaction. */
export class IndustrialFleetAdapter implements ImportRecordAdapter {
  readonly key = "FORGE_INDUSTRIAL:FLEET:fleet_vehicle@1";
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
    const vin = asOptionalString(mapped.vin);
    const year = asOptionalNumber(mapped.year);
    const make = asOptionalString(mapped.make);
    const model = asOptionalString(mapped.model);
    const color = asOptionalString(mapped.color);
    const licensePlate =
      asOptionalString(mapped.license_plate) ?? asOptionalString(mapped.licensePlate);
    const renewalDate =
      asOptionalString(mapped.renewal_date) ?? asOptionalString(mapped.renewalDate);
    const locationName =
      asOptionalString(mapped.location) ?? asOptionalString(mapped.location_name);
    const countyAssessed =
      asOptionalString(mapped.county_assessed) ?? asOptionalString(mapped.countyAssessed);
    const insured = asOptionalBoolean(mapped.insured);
    const mileage = asOptionalNumber(mapped.mileage);
    const notes = asOptionalString(mapped.notes);
    const vehicleFringe =
      asOptionalBoolean(mapped.vehicle_fringe) ?? asOptionalBoolean(mapped.vehicleFringe);
    const assignedDriverName =
      asOptionalString(mapped.assigned_driver) ??
      asOptionalString(mapped.assigned_driver_name) ??
      asOptionalString(mapped.assignedDriverName);
    const assetType =
      asOptionalString(mapped.asset_type) ?? asOptionalString(mapped.assetType) ?? "FLEET_VEHICLE";
    const form2290Status =
      asOptionalString(mapped.form_2290) ?? asOptionalString(mapped.form2290Status);
    const irpStatus = asOptionalString(mapped.irp) ?? asOptionalString(mapped.irpStatus);
    const commuteUseStatus =
      asOptionalString(mapped.commute_use) ?? asOptionalString(mapped.commuteUseStatus);
    const registrationRenewalMonth = asOptionalNumber(
      mapped.registration_renewal_month ?? mapped.registrationRenewalMonth,
    );

    if (!vin && !make && !model && !licensePlate) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "FLEET_VEHICLE_IDENTITY_REQUIRED",
        errorMessage: "At least one of vin, make/model, or license_plate is required",
      };
    }

    const db = getSharedDatabase(requireDatabaseUrl());

    try {
      return await withTenantTransaction(db, context.tenantId, async (tx) => {
        let existing: typeof industrialFleetVehicles.$inferSelect | undefined;
        if (vin) {
          const rows = await tx
            .select()
            .from(industrialFleetVehicles)
            .where(
              and(
                eq(industrialFleetVehicles.tenantId, context.tenantId),
                eq(industrialFleetVehicles.vin, vin),
                isNull(industrialFleetVehicles.archivedAt),
              ),
            )
            .limit(1);
          existing = rows[0];
        } else if (licensePlate) {
          const rows = await tx
            .select()
            .from(industrialFleetVehicles)
            .where(
              and(
                eq(industrialFleetVehicles.tenantId, context.tenantId),
                eq(industrialFleetVehicles.licensePlate, licensePlate),
                isNull(industrialFleetVehicles.archivedAt),
              ),
            )
            .limit(1);
          existing = rows[0];
        }

        const now = new Date();
        if (existing) {
          const [updated] = await tx
            .update(industrialFleetVehicles)
            .set({
              year,
              make,
              model,
              color,
              vin,
              licensePlate,
              renewalDate,
              locationName,
              countyAssessed,
              insured,
              mileage,
              notes,
              vehicleFringe,
              assignedDriverName,
              assetType,
              form2290Status,
              irpStatus,
              commuteUseStatus,
              registrationRenewalMonth,
              sourceSystem: "FORGE",
              sourcePayload: { ...mapped, importJobId: context.jobId },
              updatedAt: now,
            })
            .where(eq(industrialFleetVehicles.id, existing.id))
            .returning();
          return {
            outcome: "UPDATED" as const,
            destinationRecordId: updated?.id ?? existing.id,
            operationType: "UPSERT",
            rollbackClassification: "COMPENSATING_ACTION" as RollbackClassification,
            beforeRef: { id: existing.id, vin: existing.vin },
            afterRef: { id: updated?.id ?? existing.id, vin },
          };
        }

        const id = createId();
        const [created] = await tx
          .insert(industrialFleetVehicles)
          .values({
            id,
            tenantId: context.tenantId,
            year,
            make,
            model,
            color,
            vin,
            licensePlate,
            renewalDate,
            locationName,
            countyAssessed,
            insured,
            mileage,
            notes,
            vehicleFringe,
            assignedDriverName,
            assetType,
            form2290Status,
            irpStatus,
            commuteUseStatus,
            registrationRenewalMonth,
            status: "ACTIVE",
            sourceSystem: "FORGE",
            sourcePayload: { ...mapped, importJobId: context.jobId },
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
          afterRef: { id: created?.id ?? id, vin },
          compensation: { action: "DELETE", destinationRecordId: created?.id ?? id },
        };
      });
    } catch (error) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "FLEET_ADAPTER_ERROR",
        errorMessage: error instanceof Error ? error.message : "Fleet upsert failed",
      };
    }
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }
}
