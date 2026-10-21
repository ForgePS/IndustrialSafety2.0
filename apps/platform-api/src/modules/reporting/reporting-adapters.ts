import type { ReportRunInput } from "@forge/contracts";
import {
  industrialIncidents,
  industrialInspections,
  industrialObservations,
  industrialJsas,
  industrialCorrectiveActions,
  industrialFleetVehicles,
  industrialPersonnel,
  industrialTrainingAssignments,
  industrialTrainingRecords,
  industrialSupplyItems,
  industrialSupplyLocationInventory,
  industrialSupplyTransactions,
  industrialDepartments,
  industrialEquipment,
  industrialWorkersCompCases,
  industrialWorkersCompWorkStatusPeriods,
  industrialWorkersCompRestrictions,
  industrialWorkersCompMedicalEncounters,
  industrialLotoProcedures,
  industrialLotoRecords,
  industrialLotoEnergySources,
  industrialSanitationCleaningTasks,
  industrialSanitationDustMeasurements,
  industrialSanitationFindings,
  industrialSanitationInspections,
  industrialSanitationLocations,
  industrialSanitationMasterSchedule,
  industrialSanitationPestFindings,
  industrialSanitationSpills,
  industrialSites,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { builtinByKey } from "./reporting-catalog.js";
import {
  canViewWorkersCompMedical,
  WC_WEEKLY_STATUS_REPORT_KEY,
  workersCompSeverityLabel,
} from "../industrial/workers-comp-helpers.js";

const SUPPLY_ISSUED_TRANSFERRED_TYPES = [
  "ISSUE",
  "PPE_ISSUE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
] as const;

/** Prior calendar month in UTC when the run input has no explicit date bounds. */
function priorCalendarMonthBounds(now = new Date()): { from: Date; to: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, unknown>;

export type ReportRunResult = {
  columns: ReportColumn[];
  rows: ReportRow[];
  reportKey: string;
  reportName: string;
};

function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateBounds(input: ReportRunInput): { from?: Date; to?: Date } {
  if (input.year) {
    return {
      from: new Date(Date.UTC(input.year, 0, 1)),
      to: new Date(Date.UTC(input.year, 11, 31, 23, 59, 59, 999)),
    };
  }
  const from = parseDate(input.dateFrom);
  const to = parseDate(input.dateTo);
  const bounds: { from?: Date; to?: Date } = {};
  if (from) bounds.from = from;
  if (to) bounds.to = to;
  return bounds;
}

/** Resolve relativeDateRange into absolute UTC bounds (mutates a copy). */
export function resolveRelativeDateRange(
  input: ReportRunInput,
  now = new Date(),
): ReportRunInput {
  const range = input.relativeDateRange;
  if (!range) return input;
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  let start: Date;
  switch (range) {
    case "last_7_days":
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "last_30_days":
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "this_month":
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      break;
    case "prior_month": {
      const prior = priorCalendarMonthBounds(now);
      return {
        ...input,
        dateFrom: prior.from.toISOString(),
        dateTo: prior.to.toISOString(),
        relativeDateRange: undefined,
      };
    }
    default:
      return input;
  }
  return {
    ...input,
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
    relativeDateRange: undefined,
  };
}

export function projectReportFields(
  columns: ReportColumn[],
  rows: ReportRow[],
  fields: string[] | undefined,
): { columns: ReportColumn[]; rows: ReportRow[] } {
  if (!fields?.length) return { columns, rows };
  const wanted = new Set(fields);
  const nextColumns = columns.filter((c) => wanted.has(c.key));
  if (!nextColumns.length) return { columns, rows };
  return {
    columns: nextColumns,
    rows: rows.map((row) => {
      const next: ReportRow = {};
      for (const col of nextColumns) next[col.key] = row[col.key];
      return next;
    }),
  };
}

export function aggregateReportRows(
  columns: ReportColumn[],
  rows: ReportRow[],
  groupBy: string | null | undefined,
  aggregate: "count" | null | undefined,
): { columns: ReportColumn[]; rows: ReportRow[] } {
  if (!groupBy || aggregate !== "count") return { columns, rows };
  if (!columns.some((c) => c.key === groupBy)) return { columns, rows };
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    columns: [
      { key: groupBy, label: columns.find((c) => c.key === groupBy)?.label ?? groupBy },
      { key: "count", label: "Count" },
    ],
    rows: [...counts.entries()].map(([value, count]) => ({ [groupBy]: value, count })),
  };
}

function claimText(summary: unknown, key: string): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const value = (summary as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

/** Read a text key from LOTO jsonb that may be stored as an object or a JSON string. */
function lotoPayloadText(column: typeof industrialLotoProcedures.sourcePayload, key: string) {
  return sql<string>`nullif(btrim(coalesce(
    case
      when jsonb_typeof(${column}) = 'string'
        then ((${column} #>> '{}')::jsonb ->> ${key})
      else ${column} ->> ${key}
    end,
    ''
  )), '')`;
}

function isOpenLotoLockoutStatus(status: string): boolean {
  const key = status.trim().toUpperCase();
  return (
    key === "ISSUED" ||
    key === "VERIFIED" ||
    key === "OPEN" ||
    key === "ACTIVE" ||
    key === "COMPLIANT"
  );
}

function isReviewLotoStatus(status: string): boolean {
  const key = status.trim().toUpperCase();
  return key === "IN_REVIEW" || key === "PENDING_APPROVAL" || key === "REVIEW_DUE";
}

function isOpenWcStatus(status: string): boolean {
  const s = status.trim().toUpperCase();
  return s === "OPEN" || s === "ACTIVE" || s === "RESTRICTED" || s === "LOST_TIME" || s === "DRAFT";
}

function limitOf(input: ReportRunInput): number {
  return Math.min(input.limit ?? 1000, 5000);
}

function stripSensitive(
  rows: ReportRow[],
  columns: ReportColumn[],
  sensitive: string[] | undefined,
  allowSensitive: boolean,
): { rows: ReportRow[]; columns: ReportColumn[] } {
  if (allowSensitive || !sensitive?.length) return { rows, columns };
  const blocked = new Set(sensitive);
  return {
    columns: columns.filter((c) => !blocked.has(c.key)),
    rows: rows.map((row) => {
      const next = { ...row };
      for (const key of blocked) delete next[key];
      return next;
    }),
  };
}

function emptyPayload(): { columns: ReportColumn[]; rows: ReportRow[] } {
  return { columns: [], rows: [] };
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Report data that lives in other modules' services (cannot be queried inline here). */
export type ReportAdapterSources = {
  workersCompWeeklyStatus?: () => Promise<{ columns: ReportColumn[]; rows: ReportRow[] }>;
};

export async function runBuiltinAdapter(
  db: Database,
  principal: ForgePrincipal,
  reportKey: string,
  input: ReportRunInput,
  allowSensitive: boolean,
  sources: ReportAdapterSources = {},
): Promise<ReportRunResult> {
  const meta = builtinByKey(reportKey);
  if (!meta) {
    return {
      reportKey,
      reportName: reportKey,
      columns: [],
      rows: [],
    };
  }
  const { from, to } = dateBounds(input);
  const limit = limitOf(input);
  const tenantId = principal.tenantId;

  const result =
    reportKey === WC_WEEKLY_STATUS_REPORT_KEY
      ? ((await sources.workersCompWeeklyStatus?.()) ?? emptyPayload())
      : await withTenantTransaction(db, tenantId, async (tx) => {
    switch (reportKey) {
      case "incidents.summary":
      case "incidents.by_location":
      case "incidents.near_miss":
      case "compliance.osha_300":
      case "compliance.osha_300a": {
        const conditions: SQL[] = [
          eq(industrialIncidents.tenantId, tenantId),
          isNull(industrialIncidents.archivedAt),
        ];
        if (from) conditions.push(gte(industrialIncidents.createdAt, from));
        if (to) conditions.push(lte(industrialIncidents.createdAt, to));
        if (input.locationId) conditions.push(eq(industrialIncidents.siteId, input.locationId));
        if (reportKey === "incidents.near_miss") {
          conditions.push(
            or(
              ilike(industrialIncidents.title, "%near miss%"),
              ilike(industrialIncidents.status, "%near%"),
            )!,
          );
        }
        const rows = await tx
          .select({
            id: industrialIncidents.id,
            title: industrialIncidents.title,
            status: industrialIncidents.status,
            siteId: industrialIncidents.siteId,
            createdAt: industrialIncidents.createdAt,
          })
          .from(industrialIncidents)
          .where(and(...conditions))
          .orderBy(desc(industrialIncidents.createdAt))
          .limit(limit);

        if (reportKey === "incidents.summary" || reportKey === "compliance.osha_300a") {
          const byStatus = new Map<string, number>();
          for (const row of rows) {
            const key = row.status || "UNKNOWN";
            byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
          }
          return {
            columns: [
              { key: "status", label: "Status" },
              { key: "count", label: "Count" },
            ],
            rows: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
          };
        }
        if (reportKey === "incidents.by_location") {
          const bySite = new Map<string, number>();
          for (const row of rows) {
            const key = row.siteId ?? "unassigned";
            bySite.set(key, (bySite.get(key) ?? 0) + 1);
          }
          return {
            columns: [
              { key: "siteId", label: "Site" },
              { key: "count", label: "Count" },
            ],
            rows: [...bySite.entries()].map(([siteId, count]) => ({ siteId, count })),
          };
        }
        return {
          columns: [
            { key: "id", label: "ID" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "siteId", label: "Site" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            siteId: r.siteId,
            createdAt: iso(r.createdAt),
          })),
        };
      }
      case "inspections.open_findings":
      case "inspections.completion": {
        const conditions: SQL[] = [
          eq(industrialInspections.tenantId, tenantId),
          isNull(industrialInspections.archivedAt),
        ];
        if (reportKey === "inspections.open_findings") {
          conditions.push(
            or(
              eq(industrialInspections.status, "OPEN"),
              eq(industrialInspections.status, "ACTIVE"),
              eq(industrialInspections.status, "IN_PROGRESS"),
            )!,
          );
        } else {
          conditions.push(sql`${industrialInspections.completedAt} IS NOT NULL`);
          if (from) conditions.push(gte(industrialInspections.completedAt, from));
          if (to) conditions.push(lte(industrialInspections.completedAt, to));
        }
        if (input.locationId) conditions.push(eq(industrialInspections.siteId, input.locationId));
        if (input.departmentId) {
          conditions.push(eq(industrialInspections.departmentId, input.departmentId));
        }
        const rows = await tx
          .select({
            id: industrialInspections.id,
            title: industrialInspections.title,
            status: industrialInspections.status,
            inspectionType: industrialInspections.inspectionType,
            siteId: industrialInspections.siteId,
            completedAt: industrialInspections.completedAt,
            createdAt: industrialInspections.createdAt,
          })
          .from(industrialInspections)
          .where(and(...conditions))
          .orderBy(desc(industrialInspections.createdAt))
          .limit(limit);
        return {
          columns: [
            { key: "id", label: "ID" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "inspectionType", label: "Type" },
            { key: "siteId", label: "Site" },
            { key: "completedAt", label: "Completed" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            inspectionType: r.inspectionType,
            siteId: r.siteId,
            completedAt: iso(r.completedAt),
            createdAt: iso(r.createdAt),
          })),
        };
      }
      case "fleet.assets":
      case "fleet.dvir_summary":
      case "dot.driver_qualification":
      case "dot.medical_card": {
        const conditions: SQL[] = [
          eq(industrialFleetVehicles.tenantId, tenantId),
          isNull(industrialFleetVehicles.archivedAt),
        ];
        if (reportKey.startsWith("dot.")) {
          conditions.push(eq(industrialFleetVehicles.dotRegulated, true));
        }
        const rows = await tx
          .select({
            id: industrialFleetVehicles.id,
            assetNumber: industrialFleetVehicles.assetNumber,
            assetType: industrialFleetVehicles.assetType,
            status: industrialFleetVehicles.status,
            vin: industrialFleetVehicles.vin,
            licensePlate: industrialFleetVehicles.licensePlate,
            make: industrialFleetVehicles.make,
            model: industrialFleetVehicles.model,
            year: industrialFleetVehicles.year,
            assignedDriverName: industrialFleetVehicles.assignedDriverName,
            locationName: industrialFleetVehicles.locationName,
            renewalDate: industrialFleetVehicles.renewalDate,
            dotRegulated: industrialFleetVehicles.dotRegulated,
          })
          .from(industrialFleetVehicles)
          .where(and(...conditions))
          .orderBy(desc(industrialFleetVehicles.updatedAt))
          .limit(limit);
        return {
          columns: [
            { key: "assetNumber", label: "Asset #" },
            { key: "assetType", label: "Type" },
            { key: "status", label: "Status" },
            { key: "year", label: "Year" },
            { key: "make", label: "Make" },
            { key: "model", label: "Model" },
            { key: "vin", label: "VIN" },
            { key: "licensePlate", label: "Plate" },
            { key: "assignedDriverName", label: "Driver" },
            { key: "locationName", label: "Location" },
            { key: "renewalDate", label: "Renewal" },
            { key: "dotRegulated", label: "DOT" },
          ],
          rows: rows.map((r) => ({
            ...r,
            renewalDate: r.renewalDate ?? null,
          })),
        };
      }
      case "personnel.roster": {
        const rows = await tx
          .select({
            id: industrialPersonnel.id,
            displayName: industrialPersonnel.displayName,
            status: industrialPersonnel.status,
            email: industrialPersonnel.email,
            phone: industrialPersonnel.phone,
            departmentName: industrialPersonnel.departmentName,
            jobTitle: industrialPersonnel.jobTitle,
            employeeNumber: industrialPersonnel.employeeNumber,
            siteId: industrialPersonnel.siteId,
          })
          .from(industrialPersonnel)
          .where(
            and(eq(industrialPersonnel.tenantId, tenantId), isNull(industrialPersonnel.archivedAt)),
          )
          .orderBy(industrialPersonnel.displayName)
          .limit(limit);
        return {
          columns: [
            { key: "displayName", label: "Name" },
            { key: "status", label: "Status" },
            { key: "jobTitle", label: "Title" },
            { key: "departmentName", label: "Department" },
            { key: "employeeNumber", label: "Employee #" },
            { key: "siteId", label: "Site" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
          ],
          rows,
        };
      }
      case "training.completion": {
        const rows = await tx
          .select({
            id: industrialTrainingAssignments.id,
            title: industrialTrainingAssignments.title,
            status: industrialTrainingAssignments.status,
            dueAt: industrialTrainingAssignments.dueAt,
          })
          .from(industrialTrainingAssignments)
          .where(
            and(
              eq(industrialTrainingAssignments.tenantId, tenantId),
              isNull(industrialTrainingAssignments.archivedAt),
            ),
          )
          .orderBy(desc(industrialTrainingAssignments.updatedAt))
          .limit(limit);
        return {
          columns: [
            { key: "title", label: "Assignment" },
            { key: "status", label: "Status" },
            { key: "dueAt", label: "Due" },
          ],
          rows: rows.map((r) => ({
            title: r.title,
            status: r.status,
            dueAt: iso(r.dueAt),
          })),
        };
      }
      case "training.expiring": {
        // No dedicated certifications table with expiresAt; use training records.
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 90);
        const rows = await tx
          .select({
            id: industrialTrainingRecords.id,
            title: industrialTrainingRecords.title,
            courseName: industrialTrainingRecords.courseName,
            personnelId: industrialTrainingRecords.personnelId,
            status: industrialTrainingRecords.status,
            expiresAt: industrialTrainingRecords.expiresAt,
          })
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
              sql`${industrialTrainingRecords.expiresAt} IS NOT NULL`,
              lte(industrialTrainingRecords.expiresAt, horizon),
            ),
          )
          .orderBy(industrialTrainingRecords.expiresAt)
          .limit(limit);
        return {
          columns: [
            { key: "title", label: "Title" },
            { key: "courseName", label: "Course" },
            { key: "personnelId", label: "Person" },
            { key: "status", label: "Status" },
            { key: "expiresAt", label: "Expires" },
          ],
          rows: rows.map((r) => ({
            title: r.title,
            courseName: r.courseName,
            personnelId: r.personnelId,
            status: r.status,
            expiresAt: iso(r.expiresAt),
          })),
        };
      }
      case "supplies.on_hand": {
        const qty = sql<string>`coalesce(sum(${industrialSupplyLocationInventory.quantityOnHand}), 0)`;
        const rows = await tx
          .select({
            id: industrialSupplyItems.id,
            name: industrialSupplyItems.name,
            sku: industrialSupplyItems.sku,
            unitOfMeasure: industrialSupplyItems.unitOfMeasure,
            status: industrialSupplyItems.status,
            quantityOnHand: qty,
          })
          .from(industrialSupplyItems)
          .leftJoin(
            industrialSupplyLocationInventory,
            and(
              eq(industrialSupplyLocationInventory.itemId, industrialSupplyItems.id),
              eq(industrialSupplyLocationInventory.tenantId, tenantId),
            ),
          )
          .where(
            and(
              eq(industrialSupplyItems.tenantId, tenantId),
              isNull(industrialSupplyItems.archivedAt),
            ),
          )
          .groupBy(
            industrialSupplyItems.id,
            industrialSupplyItems.name,
            industrialSupplyItems.sku,
            industrialSupplyItems.unitOfMeasure,
            industrialSupplyItems.status,
          )
          .orderBy(industrialSupplyItems.name)
          .limit(limit);
        return {
          columns: [
            { key: "name", label: "Item" },
            { key: "sku", label: "SKU" },
            { key: "quantityOnHand", label: "On hand" },
            { key: "unitOfMeasure", label: "Unit" },
            { key: "status", label: "Status" },
          ],
          rows: rows.map((r) => ({
            name: r.name,
            sku: r.sku,
            quantityOnHand: r.quantityOnHand,
            unitOfMeasure: r.unitOfMeasure,
            status: r.status,
          })),
        };
      }
      case "supplies.issued_transferred_by_department": {
        const range =
          from || to
            ? { from: from ?? new Date(0), to: to ?? new Date() }
            : priorCalendarMonthBounds();
        const qtyAbs = sql<string>`coalesce(sum(abs(${industrialSupplyTransactions.quantity}::numeric)), 0)`;
        const rows = await tx
          .select({
            departmentId: industrialSupplyTransactions.departmentId,
            departmentName: industrialDepartments.name,
            itemId: industrialSupplyItems.id,
            itemName: industrialSupplyItems.name,
            itemNumber: industrialSupplyItems.itemNumber,
            sku: industrialSupplyItems.sku,
            unitOfMeasure: industrialSupplyItems.unitOfMeasure,
            transactionType: industrialSupplyTransactions.transactionType,
            quantity: qtyAbs,
          })
          .from(industrialSupplyTransactions)
          .innerJoin(
            industrialSupplyItems,
            and(
              eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
              eq(industrialSupplyItems.tenantId, tenantId),
            ),
          )
          .leftJoin(
            industrialDepartments,
            and(
              eq(industrialDepartments.id, industrialSupplyTransactions.departmentId),
              eq(industrialDepartments.tenantId, tenantId),
            ),
          )
          .where(
            and(
              eq(industrialSupplyTransactions.tenantId, tenantId),
              inArray(
                industrialSupplyTransactions.transactionType,
                [...SUPPLY_ISSUED_TRANSFERRED_TYPES],
              ),
              gte(industrialSupplyTransactions.createdAt, range.from),
              lte(industrialSupplyTransactions.createdAt, range.to),
            ),
          )
          .groupBy(
            industrialSupplyTransactions.departmentId,
            industrialDepartments.name,
            industrialSupplyItems.id,
            industrialSupplyItems.name,
            industrialSupplyItems.itemNumber,
            industrialSupplyItems.sku,
            industrialSupplyItems.unitOfMeasure,
            industrialSupplyTransactions.transactionType,
          )
          .orderBy(
            sql`coalesce(${industrialDepartments.name}, 'Unassigned')`,
            industrialSupplyItems.name,
            industrialSupplyTransactions.transactionType,
          )
          .limit(limit);
        return {
          columns: [
            { key: "department", label: "Department" },
            { key: "item", label: "Item" },
            { key: "itemNumber", label: "SKU/Item #" },
            { key: "type", label: "Type" },
            { key: "quantity", label: "Quantity" },
            { key: "unit", label: "Unit" },
          ],
          rows: rows.map((r) => ({
            department: r.departmentName?.trim() || "Unassigned",
            item: r.itemName,
            itemNumber: r.sku?.trim() || r.itemNumber,
            type: r.transactionType,
            quantity: r.quantity,
            unit: r.unitOfMeasure,
          })),
        };
      }
      case "observations.summary": {
        const rows = await tx
          .select({
            id: industrialObservations.id,
            title: industrialObservations.title,
            status: industrialObservations.status,
            createdAt: industrialObservations.createdAt,
          })
          .from(industrialObservations)
          .where(
            and(
              eq(industrialObservations.tenantId, tenantId),
              isNull(industrialObservations.archivedAt),
            ),
          )
          .orderBy(desc(industrialObservations.createdAt))
          .limit(limit);
        return {
          columns: [
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            title: r.title,
            status: r.status,
            createdAt: iso(r.createdAt),
          })),
        };
      }
      case "jsa.status": {
        const rows = await tx
          .select({
            id: industrialJsas.id,
            title: industrialJsas.title,
            status: industrialJsas.status,
            createdAt: industrialJsas.createdAt,
          })
          .from(industrialJsas)
          .where(and(eq(industrialJsas.tenantId, tenantId), isNull(industrialJsas.archivedAt)))
          .orderBy(desc(industrialJsas.createdAt))
          .limit(limit);
        return {
          columns: [
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            title: r.title,
            status: r.status,
            createdAt: iso(r.createdAt),
          })),
        };
      }
      case "capa.open":
      case "capa.overdue": {
        const conditions: SQL[] = [
          eq(industrialCorrectiveActions.tenantId, tenantId),
          isNull(industrialCorrectiveActions.archivedAt),
        ];
        if (reportKey === "capa.open") {
          conditions.push(
            or(
              eq(industrialCorrectiveActions.status, "OPEN"),
              eq(industrialCorrectiveActions.status, "ACTIVE"),
              eq(industrialCorrectiveActions.status, "IN_PROGRESS"),
            )!,
          );
        } else {
          conditions.push(sql`${industrialCorrectiveActions.dueDate} < CURRENT_DATE`);
          conditions.push(
            or(
              eq(industrialCorrectiveActions.status, "OPEN"),
              eq(industrialCorrectiveActions.status, "ACTIVE"),
              eq(industrialCorrectiveActions.status, "IN_PROGRESS"),
            )!,
          );
        }
        const rows = await tx
          .select({
            id: industrialCorrectiveActions.id,
            title: industrialCorrectiveActions.title,
            status: industrialCorrectiveActions.status,
            dueDate: industrialCorrectiveActions.dueDate,
            createdAt: industrialCorrectiveActions.createdAt,
          })
          .from(industrialCorrectiveActions)
          .where(and(...conditions))
          .orderBy(desc(industrialCorrectiveActions.createdAt))
          .limit(limit);
        return {
          columns: [
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "dueDate", label: "Due" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            title: r.title,
            status: r.status,
            dueDate: r.dueDate ?? null,
            createdAt: iso(r.createdAt),
          })),
        };
      }
      case "equipment.status": {
        const rows = await tx
          .select({
            id: industrialEquipment.id,
            name: industrialEquipment.name,
            status: industrialEquipment.status,
            equipmentNumber: industrialEquipment.equipmentNumber,
            equipmentType: industrialEquipment.equipmentType,
            siteId: industrialEquipment.siteId,
          })
          .from(industrialEquipment)
          .where(
            and(eq(industrialEquipment.tenantId, tenantId), isNull(industrialEquipment.archivedAt)),
          )
          .orderBy(industrialEquipment.name)
          .limit(limit);
        return {
          columns: [
            { key: "name", label: "Name" },
            { key: "equipmentNumber", label: "Number" },
            { key: "equipmentType", label: "Type" },
            { key: "status", label: "Status" },
            { key: "siteId", label: "Site" },
          ],
          rows,
        };
      }
      case "safety.monthly_stats": {
        const incidentCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.tenantId, tenantId),
              isNull(industrialIncidents.archivedAt),
              ...(from ? [gte(industrialIncidents.createdAt, from)] : []),
              ...(to ? [lte(industrialIncidents.createdAt, to)] : []),
            ),
          );
        const inspectionCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialInspections)
          .where(
            and(
              eq(industrialInspections.tenantId, tenantId),
              isNull(industrialInspections.archivedAt),
              ...(from ? [gte(industrialInspections.createdAt, from)] : []),
              ...(to ? [lte(industrialInspections.createdAt, to)] : []),
            ),
          );
        const activeLotoCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialLotoProcedures)
          .where(
            and(
              eq(industrialLotoProcedures.tenantId, tenantId),
              isNull(industrialLotoProcedures.archivedAt),
              eq(industrialLotoProcedures.status, "ACTIVE"),
            ),
          );
        const openLockoutCount = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialLotoRecords)
          .where(
            and(
              eq(industrialLotoRecords.tenantId, tenantId),
              isNull(industrialLotoRecords.archivedAt),
              inArray(industrialLotoRecords.status, ["ISSUED", "VERIFIED", "OPEN", "ACTIVE", "COMPLIANT"]),
            ),
          );
        return {
          columns: [
            { key: "metric", label: "Metric" },
            { key: "value", label: "Value" },
          ],
          rows: [
            { metric: "Incidents", value: incidentCount[0]?.count ?? 0 },
            { metric: "Inspections", value: inspectionCount[0]?.count ?? 0 },
            { metric: "Active LOTO procedures", value: activeLotoCount[0]?.count ?? 0 },
            { metric: "Open lockouts", value: openLockoutCount[0]?.count ?? 0 },
          ],
        };
      }
      case "workers_comp.open_cases":
      case "workers_comp.lost_time":
      case "workers_comp.claims_summary": {
        const conditions: SQL[] = [
          eq(industrialWorkersCompCases.tenantId, tenantId),
          isNull(industrialWorkersCompCases.archivedAt),
        ];
        if (from) conditions.push(gte(industrialWorkersCompCases.updatedAt, from));
        if (to) conditions.push(lte(industrialWorkersCompCases.updatedAt, to));
        if (input.locationId) {
          conditions.push(eq(industrialWorkersCompCases.siteId, input.locationId));
        }
        if (input.departmentId) {
          conditions.push(eq(industrialWorkersCompCases.departmentId, input.departmentId));
        }
        const rows = await tx
          .select({
            id: industrialWorkersCompCases.id,
            caseNumber: industrialWorkersCompCases.caseNumber,
            status: industrialWorkersCompCases.status,
            workflowStage: industrialWorkersCompCases.workflowStage,
            severity: industrialWorkersCompCases.severity,
            daysAway: industrialWorkersCompCases.daysAway,
            restrictedDays: industrialWorkersCompCases.restrictedDays,
            reportedAt: industrialWorkersCompCases.reportedAt,
            claimSummary: industrialWorkersCompCases.claimSummary,
            workerName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(and(...conditions))
          .orderBy(desc(industrialWorkersCompCases.updatedAt))
          .limit(limit);

        const mapped = rows
          .map((row) => {
            const status = String(row.status ?? "");
            if (reportKey === "workers_comp.open_cases" && !isOpenWcStatus(status)) return null;
            if (
              reportKey === "workers_comp.lost_time" &&
              !(
                status.toUpperCase() === "LOST_TIME" ||
                String(row.severity ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") ===
                  "lost_time" ||
                (row.daysAway ?? 0) > 0
              )
            ) {
              return null;
            }
            return {
              caseNumber: row.caseNumber || claimText(row.claimSummary, "claimNumber") || row.id,
              workerName: row.workerName || "",
              status,
              workflowStage: row.workflowStage || "",
              severity: workersCompSeverityLabel(row.severity),
              dateOfInjury: claimText(row.claimSummary, "dateOfInjury"),
              daysAway: row.daysAway ?? 0,
              restrictedDays: row.restrictedDays ?? 0,
              carrierName: claimText(row.claimSummary, "carrierName"),
              adjuster: claimText(row.claimSummary, "adjuster"),
              bodyParts: claimText(row.claimSummary, "bodyParts"),
              claimNotes: claimText(row.claimSummary, "notes"),
              reportedAt: iso(row.reportedAt),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row != null);

        if (reportKey === "workers_comp.claims_summary") {
          return {
            columns: [
              { key: "caseNumber", label: "Claim #" },
              { key: "workerName", label: "Employee" },
              { key: "carrierName", label: "Carrier" },
              { key: "adjuster", label: "Adjuster" },
              { key: "bodyParts", label: "Body parts" },
              { key: "dateOfInjury", label: "Date of injury" },
              { key: "claimNotes", label: "Claim notes" },
              { key: "status", label: "Status" },
            ],
            rows: mapped,
          };
        }
        return {
          columns: [
            { key: "caseNumber", label: "Claim #" },
            { key: "workerName", label: "Employee" },
            { key: "status", label: "Status" },
            { key: "workflowStage", label: "Stage" },
            { key: "severity", label: "Severity" },
            { key: "dateOfInjury", label: "Date of injury" },
            { key: "daysAway", label: "Days away" },
            { key: "restrictedDays", label: "Restricted days" },
            { key: "carrierName", label: "Carrier" },
          ],
          rows: mapped,
        };
      }
      case "workers_comp.by_status": {
        const conditions: SQL[] = [
          eq(industrialWorkersCompCases.tenantId, tenantId),
          isNull(industrialWorkersCompCases.archivedAt),
        ];
        if (from) conditions.push(gte(industrialWorkersCompCases.updatedAt, from));
        if (to) conditions.push(lte(industrialWorkersCompCases.updatedAt, to));
        const rows = await tx
          .select({
            status: industrialWorkersCompCases.status,
            count: sql<number>`count(*)::int`,
          })
          .from(industrialWorkersCompCases)
          .where(and(...conditions))
          .groupBy(industrialWorkersCompCases.status)
          .orderBy(industrialWorkersCompCases.status);
        return {
          columns: [
            { key: "status", label: "Status" },
            { key: "count", label: "Count" },
          ],
          rows: rows.map((r) => ({ status: r.status, count: r.count })),
        };
      }
      case "workers_comp.restricted_duty": {
        const conditions: SQL[] = [
          eq(industrialWorkersCompCases.tenantId, tenantId),
          isNull(industrialWorkersCompCases.archivedAt),
          or(
            eq(industrialWorkersCompCases.status, "RESTRICTED"),
            gte(industrialWorkersCompCases.restrictedDays, 1),
          )!,
        ];
        if (from) conditions.push(gte(industrialWorkersCompCases.updatedAt, from));
        if (to) conditions.push(lte(industrialWorkersCompCases.updatedAt, to));
        const cases = await tx
          .select({
            id: industrialWorkersCompCases.id,
            caseNumber: industrialWorkersCompCases.caseNumber,
            status: industrialWorkersCompCases.status,
            restrictedDays: industrialWorkersCompCases.restrictedDays,
            claimSummary: industrialWorkersCompCases.claimSummary,
            workerName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompCases)
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(and(...conditions))
          .orderBy(desc(industrialWorkersCompCases.updatedAt))
          .limit(limit);

        const caseIds = cases.map((c) => c.id);
        const restrictionRows =
          caseIds.length === 0
            ? []
            : await tx
                .select({
                  caseId: industrialWorkersCompRestrictions.caseId,
                  description: industrialWorkersCompRestrictions.description,
                  status: industrialWorkersCompRestrictions.status,
                })
                .from(industrialWorkersCompRestrictions)
                .where(
                  and(
                    eq(industrialWorkersCompRestrictions.tenantId, tenantId),
                    isNull(industrialWorkersCompRestrictions.archivedAt),
                    inArray(industrialWorkersCompRestrictions.caseId, caseIds),
                    eq(industrialWorkersCompRestrictions.status, "ACTIVE"),
                  ),
                );
        const byCase = new Map<string, string[]>();
        for (const r of restrictionRows) {
          const list = byCase.get(r.caseId) ?? [];
          if (r.description) list.push(r.description);
          byCase.set(r.caseId, list);
        }
        return {
          columns: [
            { key: "caseNumber", label: "Claim #" },
            { key: "workerName", label: "Employee" },
            { key: "status", label: "Status" },
            { key: "restrictedDays", label: "Restricted days" },
            { key: "activeRestrictions", label: "Active restrictions" },
            { key: "bodyParts", label: "Body parts" },
          ],
          rows: cases.map((c) => ({
            caseNumber: c.caseNumber || claimText(c.claimSummary, "claimNumber") || c.id,
            workerName: c.workerName || "",
            status: c.status,
            restrictedDays: c.restrictedDays ?? 0,
            activeRestrictions: (byCase.get(c.id) ?? []).join("; "),
            bodyParts: claimText(c.claimSummary, "bodyParts"),
          })),
        };
      }
      case "workers_comp.work_status_history": {
        const conditions: SQL[] = [
          eq(industrialWorkersCompWorkStatusPeriods.tenantId, tenantId),
          isNull(industrialWorkersCompWorkStatusPeriods.archivedAt),
        ];
        if (from) {
          conditions.push(gte(industrialWorkersCompWorkStatusPeriods.updatedAt, from));
        }
        if (to) conditions.push(lte(industrialWorkersCompWorkStatusPeriods.updatedAt, to));
        const rows = await tx
          .select({
            status: industrialWorkersCompWorkStatusPeriods.status,
            startDate: industrialWorkersCompWorkStatusPeriods.startDate,
            endDate: industrialWorkersCompWorkStatusPeriods.endDate,
            notes: industrialWorkersCompWorkStatusPeriods.notes,
            caseNumber: industrialWorkersCompCases.caseNumber,
            caseStatus: industrialWorkersCompCases.status,
            claimSummary: industrialWorkersCompCases.claimSummary,
            workerName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompWorkStatusPeriods)
          .innerJoin(
            industrialWorkersCompCases,
            eq(industrialWorkersCompCases.id, industrialWorkersCompWorkStatusPeriods.caseId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(and(...conditions, isNull(industrialWorkersCompCases.archivedAt)))
          .orderBy(desc(industrialWorkersCompWorkStatusPeriods.updatedAt))
          .limit(limit);
        return {
          columns: [
            { key: "caseNumber", label: "Claim #" },
            { key: "workerName", label: "Employee" },
            { key: "caseStatus", label: "Case status" },
            { key: "workStatus", label: "Work status" },
            { key: "startDate", label: "Start" },
            { key: "endDate", label: "End" },
            { key: "notes", label: "Notes" },
          ],
          rows: rows.map((r) => ({
            caseNumber: r.caseNumber || claimText(r.claimSummary, "claimNumber") || "",
            workerName: r.workerName || "",
            caseStatus: r.caseStatus,
            workStatus: r.status,
            startDate: r.startDate,
            endDate: r.endDate,
            notes: r.notes || "",
          })),
        };
      }
      case "workers_comp.medical_encounters": {
        const canMedical = canViewWorkersCompMedical({
          isPlatformAdmin: principal.isPlatformAdmin,
          permissions: principal.permissions,
        });
        if (!canMedical) {
          return {
            columns: [
              { key: "message", label: "Message" },
            ],
            rows: [
              {
                message:
                  "Medical reporting requires industrial.workers_comp.medical.view permission.",
              },
            ],
          };
        }
        await tx.execute(sql`select set_config('app.industrial_wc_medical_access', 'on', true)`);
        const conditions: SQL[] = [
          eq(industrialWorkersCompMedicalEncounters.tenantId, tenantId),
          isNull(industrialWorkersCompMedicalEncounters.archivedAt),
        ];
        if (from) {
          conditions.push(gte(industrialWorkersCompMedicalEncounters.createdAt, from));
        }
        if (to) conditions.push(lte(industrialWorkersCompMedicalEncounters.createdAt, to));
        const rows = await tx
          .select({
            appointmentDate: industrialWorkersCompMedicalEncounters.appointmentDate,
            provider: industrialWorkersCompMedicalEncounters.provider,
            providerSpecialty: industrialWorkersCompMedicalEncounters.providerSpecialty,
            diagnosis: industrialWorkersCompMedicalEncounters.diagnosis,
            treatment: industrialWorkersCompMedicalEncounters.treatment,
            medication: industrialWorkersCompMedicalEncounters.medication,
            symptoms: industrialWorkersCompMedicalEncounters.symptoms,
            examFindings: industrialWorkersCompMedicalEncounters.examFindings,
            assessment: industrialWorkersCompMedicalEncounters.assessment,
            notes: industrialWorkersCompMedicalEncounters.notes,
            caseNumber: industrialWorkersCompCases.caseNumber,
            claimSummary: industrialWorkersCompCases.claimSummary,
            workerName: industrialPersonnel.displayName,
          })
          .from(industrialWorkersCompMedicalEncounters)
          .innerJoin(
            industrialWorkersCompCases,
            eq(industrialWorkersCompCases.id, industrialWorkersCompMedicalEncounters.caseId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialWorkersCompCases.personnelId),
          )
          .where(and(...conditions, isNull(industrialWorkersCompCases.archivedAt)))
          .orderBy(desc(industrialWorkersCompMedicalEncounters.createdAt))
          .limit(limit);
        return {
          columns: [
            { key: "caseNumber", label: "Claim #" },
            { key: "workerName", label: "Employee" },
            { key: "appointmentDate", label: "Date" },
            { key: "provider", label: "Provider" },
            { key: "providerSpecialty", label: "Specialty" },
            { key: "diagnosis", label: "Diagnosis" },
            { key: "treatment", label: "Treatment" },
            { key: "medication", label: "Medication" },
            { key: "symptoms", label: "Symptoms" },
            { key: "examFindings", label: "Exam findings" },
            { key: "assessment", label: "Assessment" },
            { key: "notes", label: "Notes" },
          ],
          rows: rows.map((r) => ({
            caseNumber: r.caseNumber || claimText(r.claimSummary, "claimNumber") || "",
            workerName: r.workerName || "",
            appointmentDate: r.appointmentDate,
            provider: r.provider || "",
            providerSpecialty: r.providerSpecialty || "",
            diagnosis: r.diagnosis || "",
            treatment: r.treatment || "",
            medication: r.medication || "",
            symptoms: r.symptoms || "",
            examFindings: r.examFindings || "",
            assessment: r.assessment || "",
            notes: r.notes || "",
          })),
        };
      }
      case "loto.procedures_inventory":
      case "loto.procedures_by_status":
      case "loto.procedures_by_location":
      case "loto.procedure_review_due": {
        const conditions: SQL[] = [
          eq(industrialLotoProcedures.tenantId, tenantId),
          isNull(industrialLotoProcedures.archivedAt),
        ];
        if (from) conditions.push(gte(industrialLotoProcedures.updatedAt, from));
        if (to) conditions.push(lte(industrialLotoProcedures.updatedAt, to));
        if (input.locationId) {
          conditions.push(eq(industrialLotoProcedures.siteId, input.locationId));
        }
        const departmentId = (input.departmentId ?? "").trim();
        if (departmentId) {
          conditions.push(sql`${lotoPayloadText(industrialLotoProcedures.sourcePayload, "departmentId")} = ${departmentId}`);
        }

        const rows = await tx
          .select({
            id: industrialLotoProcedures.id,
            title: industrialLotoProcedures.title,
            status: industrialLotoProcedures.status,
            procedureNumber: industrialLotoProcedures.procedureNumber,
            revision: industrialLotoProcedures.revision,
            siteId: industrialLotoProcedures.siteId,
            siteName: industrialSites.name,
            sourcePayload: industrialLotoProcedures.sourcePayload,
            updatedAt: industrialLotoProcedures.updatedAt,
            equipmentName: industrialEquipment.name,
          })
          .from(industrialLotoProcedures)
          .leftJoin(industrialSites, eq(industrialSites.id, industrialLotoProcedures.siteId))
          .leftJoin(industrialEquipment, eq(industrialEquipment.id, industrialLotoProcedures.equipmentId))
          .where(and(...conditions))
          .orderBy(desc(industrialLotoProcedures.updatedAt))
          .limit(limit);

        const mapped = rows.map((row) => {
          const payload =
            row.sourcePayload && typeof row.sourcePayload === "object" && !Array.isArray(row.sourcePayload)
              ? (row.sourcePayload as Record<string, unknown>)
              : {};
          const payloadText = (key: string) => {
            const value = payload[key];
            return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
          };
          const siteName =
            (row.siteName ?? "").trim() ||
            payloadText("siteName") ||
            payloadText("siteNameSnapshot") ||
            payloadText("site") ||
            "";
          const departmentName =
            payloadText("departmentName") ||
            payloadText("departmentNameSnapshot") ||
            payloadText("department") ||
            "";
          const areaName =
            payloadText("areaName") || payloadText("areaNameSnapshot") || payloadText("area") || "";
          const equipmentName =
            (row.equipmentName ?? "").trim() ||
            payloadText("equipmentName") ||
            payloadText("equipment") ||
            "";
          const reviewDueAt = payloadText("reviewDueAt") || payloadText("review_due_at") || "";
          return {
            procedureNumber: row.procedureNumber || "",
            title: row.title,
            status: row.status,
            siteName,
            departmentName,
            areaName,
            equipmentName,
            revision: row.revision || payloadText("revision") || "",
            reviewDueAt,
            updatedAt: iso(row.updatedAt),
          };
        });

        if (reportKey === "loto.procedures_by_status") {
          const counts = new Map<string, number>();
          for (const row of mapped) {
            const status = row.status || "UNKNOWN";
            counts.set(status, (counts.get(status) ?? 0) + 1);
          }
          return {
            columns: [
              { key: "status", label: "Status" },
              { key: "count", label: "Count" },
            ],
            rows: [...counts.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([status, count]) => ({ status, count })),
          };
        }

        if (reportKey === "loto.procedures_by_location") {
          const counts = new Map<string, { siteName: string; departmentName: string; count: number }>();
          for (const row of mapped) {
            const siteName = row.siteName || "Unassigned";
            const departmentName = row.departmentName || "Unassigned";
            const key = `${siteName.toLowerCase()}|${departmentName.toLowerCase()}`;
            const existing = counts.get(key);
            if (existing) existing.count += 1;
            else counts.set(key, { siteName, departmentName, count: 1 });
          }
          return {
            columns: [
              { key: "siteName", label: "Location" },
              { key: "departmentName", label: "Department" },
              { key: "count", label: "Count" },
            ],
            rows: [...counts.values()].sort(
              (a, b) => a.siteName.localeCompare(b.siteName) || a.departmentName.localeCompare(b.departmentName),
            ),
          };
        }

        if (reportKey === "loto.procedure_review_due") {
          const now = Date.now();
          const reviewRows = mapped
            .map((row) => {
              const dueMs = row.reviewDueAt ? Date.parse(row.reviewDueAt) : Number.NaN;
              const overdue =
                !Number.isNaN(dueMs) && dueMs < now
                  ? Math.floor((now - dueMs) / (24 * 60 * 60 * 1000))
                  : 0;
              const dueSoon =
                !Number.isNaN(dueMs) && dueMs >= now && dueMs - now <= 30 * 24 * 60 * 60 * 1000;
              if (!isReviewLotoStatus(row.status) && overdue <= 0 && !dueSoon) return null;
              return {
                ...row,
                daysOverdue: overdue > 0 ? overdue : 0,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.daysOverdue - a.daysOverdue || a.title.localeCompare(b.title));
          return {
            columns: [
              { key: "procedureNumber", label: "Procedure #" },
              { key: "title", label: "Title" },
              { key: "status", label: "Status" },
              { key: "siteName", label: "Location" },
              { key: "departmentName", label: "Department" },
              { key: "reviewDueAt", label: "Review due" },
              { key: "daysOverdue", label: "Days overdue" },
              { key: "updatedAt", label: "Updated" },
            ],
            rows: reviewRows,
          };
        }

        return {
          columns: [
            { key: "procedureNumber", label: "Procedure #" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "siteName", label: "Location" },
            { key: "departmentName", label: "Department" },
            { key: "areaName", label: "Area" },
            { key: "equipmentName", label: "Equipment" },
            { key: "revision", label: "Revision" },
            { key: "reviewDueAt", label: "Review due" },
            { key: "updatedAt", label: "Updated" },
          ],
          rows: mapped,
        };
      }
      case "loto.open_lockouts":
      case "loto.lockout_history": {
        const conditions: SQL[] = [
          eq(industrialLotoRecords.tenantId, tenantId),
          isNull(industrialLotoRecords.archivedAt),
        ];
        if (from) conditions.push(gte(industrialLotoRecords.updatedAt, from));
        if (to) conditions.push(lte(industrialLotoRecords.updatedAt, to));
        if (input.locationId) {
          conditions.push(eq(industrialLotoRecords.siteId, input.locationId));
        }

        const rows = await tx
          .select({
            id: industrialLotoRecords.id,
            title: industrialLotoRecords.title,
            status: industrialLotoRecords.status,
            dueDate: industrialLotoRecords.dueDate,
            siteId: industrialLotoRecords.siteId,
            siteName: industrialSites.name,
            procedureNumber: industrialLotoProcedures.procedureNumber,
            procedureTitle: industrialLotoProcedures.title,
            sourcePayload: industrialLotoRecords.sourcePayload,
            createdAt: industrialLotoRecords.createdAt,
            updatedAt: industrialLotoRecords.updatedAt,
          })
          .from(industrialLotoRecords)
          .leftJoin(industrialSites, eq(industrialSites.id, industrialLotoRecords.siteId))
          .leftJoin(
            industrialLotoProcedures,
            eq(industrialLotoProcedures.id, industrialLotoRecords.procedureId),
          )
          .where(and(...conditions))
          .orderBy(desc(industrialLotoRecords.updatedAt))
          .limit(limit);

        const mapped = rows
          .map((row) => {
            const payload =
              row.sourcePayload && typeof row.sourcePayload === "object" && !Array.isArray(row.sourcePayload)
                ? (row.sourcePayload as Record<string, unknown>)
                : {};
            const payloadText = (key: string) => {
              const value = payload[key];
              return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
            };
            const status = String(row.status ?? "");
            if (reportKey === "loto.open_lockouts" && !isOpenLotoLockoutStatus(status)) return null;
            return {
              title: row.title || row.procedureTitle || row.id,
              status,
              procedureNumber: row.procedureNumber || payloadText("procedureNumber") || "",
              equipmentName: payloadText("equipmentName") || payloadText("equipment") || "",
              authorizedEmployee:
                payloadText("authorizedEmployee") || payloadText("authorizedEmployeeName") || "",
              siteName: (row.siteName ?? "").trim() || payloadText("siteName") || "",
              issuedAt: payloadText("issuedAt") || iso(row.createdAt) || "",
              verifiedAt: payloadText("verifiedAt") || "",
              closedAt: payloadText("closedAt") || "",
              dueDate: row.dueDate ?? payloadText("dueDate") ?? "",
            };
          })
          .filter((row): row is NonNullable<typeof row> => row != null);

        if (reportKey === "loto.open_lockouts") {
          return {
            columns: [
              { key: "title", label: "Lockout" },
              { key: "status", label: "Status" },
              { key: "procedureNumber", label: "Procedure #" },
              { key: "equipmentName", label: "Equipment" },
              { key: "authorizedEmployee", label: "Authorized employee" },
              { key: "siteName", label: "Location" },
              { key: "issuedAt", label: "Issued" },
              { key: "dueDate", label: "Due" },
            ],
            rows: mapped,
          };
        }
        return {
          columns: [
            { key: "title", label: "Lockout" },
            { key: "status", label: "Status" },
            { key: "procedureNumber", label: "Procedure #" },
            { key: "equipmentName", label: "Equipment" },
            { key: "authorizedEmployee", label: "Authorized employee" },
            { key: "siteName", label: "Location" },
            { key: "issuedAt", label: "Issued" },
            { key: "verifiedAt", label: "Verified" },
            { key: "closedAt", label: "Closed" },
            { key: "dueDate", label: "Due" },
          ],
          rows: mapped,
        };
      }
      case "loto.energy_type_coverage": {
        const rows = await tx
          .select({
            energyType: industrialLotoEnergySources.energyType,
            sourceCount: sql<number>`count(*)::int`,
            procedureCount: sql<number>`count(distinct ${industrialLotoEnergySources.procedureId})::int`,
          })
          .from(industrialLotoEnergySources)
          .innerJoin(
            industrialLotoProcedures,
            and(
              eq(industrialLotoProcedures.id, industrialLotoEnergySources.procedureId),
              eq(industrialLotoProcedures.tenantId, tenantId),
              isNull(industrialLotoProcedures.archivedAt),
            ),
          )
          .where(
            and(
              eq(industrialLotoEnergySources.tenantId, tenantId),
              isNull(industrialLotoEnergySources.archivedAt),
            ),
          )
          .groupBy(industrialLotoEnergySources.energyType)
          .orderBy(industrialLotoEnergySources.energyType);

        const uncovered = await tx
          .select({
            procedureId: industrialLotoProcedures.id,
            energyId: industrialLotoEnergySources.id,
          })
          .from(industrialLotoProcedures)
          .leftJoin(
            industrialLotoEnergySources,
            and(
              eq(industrialLotoEnergySources.procedureId, industrialLotoProcedures.id),
              eq(industrialLotoEnergySources.tenantId, tenantId),
              isNull(industrialLotoEnergySources.archivedAt),
            ),
          )
          .where(
            and(
              eq(industrialLotoProcedures.tenantId, tenantId),
              isNull(industrialLotoProcedures.archivedAt),
            ),
          );

        const uncoveredCount = new Set(
          uncovered.filter((row) => !row.energyId).map((row) => row.procedureId),
        ).size;
        const resultRows = rows.map((row) => ({
          energyType: row.energyType || "Unknown",
          sourceCount: Number(row.sourceCount ?? 0),
          procedureCount: Number(row.procedureCount ?? 0),
        }));
        if (uncoveredCount > 0) {
          resultRows.push({
            energyType: "No energy sources recorded",
            sourceCount: 0,
            procedureCount: uncoveredCount,
          });
        }

        return {
          columns: [
            { key: "energyType", label: "Energy type" },
            { key: "sourceCount", label: "Sources" },
            { key: "procedureCount", label: "Procedures" },
          ],
          rows: resultRows,
        };
      }
      case "sanitation.inspections": {
        const { from, to } = dateBounds(input);
        const rows = await tx
          .select({
            inspectionNumber: industrialSanitationInspections.inspectionNumber,
            title: industrialSanitationInspections.title,
            inspectionType: industrialSanitationInspections.inspectionType,
            status: industrialSanitationInspections.status,
            complianceStatus: industrialSanitationInspections.complianceStatus,
            scorePercent: industrialSanitationInspections.scorePercent,
            completedAt: industrialSanitationInspections.completedAt,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationInspections)
          .leftJoin(
            industrialSites,
            eq(industrialSites.id, industrialSanitationInspections.siteId),
          )
          .where(
            and(
              eq(industrialSanitationInspections.tenantId, tenantId),
              isNull(industrialSanitationInspections.archivedAt),
              from ? gte(industrialSanitationInspections.completedAt, from) : undefined,
              to ? lte(industrialSanitationInspections.completedAt, to) : undefined,
            ),
          )
          .orderBy(desc(industrialSanitationInspections.completedAt))
          .limit(2000);
        return {
          columns: [
            { key: "inspectionNumber", label: "Inspection #" },
            { key: "title", label: "Title" },
            { key: "inspectionType", label: "Type" },
            { key: "status", label: "Status" },
            { key: "complianceStatus", label: "Compliance" },
            { key: "scorePercent", label: "Score" },
            { key: "siteName", label: "Site" },
            { key: "completedAt", label: "Completed" },
          ],
          rows: rows.map((r) => ({
            ...r,
            completedAt: r.completedAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.findings_open": {
        const rows = await tx
          .select({
            findingNumber: industrialSanitationFindings.findingNumber,
            title: industrialSanitationFindings.title,
            severity: industrialSanitationFindings.severity,
            category: industrialSanitationFindings.category,
            status: industrialSanitationFindings.status,
            isRecurring: industrialSanitationFindings.isRecurring,
            createdAt: industrialSanitationFindings.createdAt,
            locationName: industrialSanitationLocations.name,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationFindings)
          .leftJoin(
            industrialSanitationLocations,
            eq(industrialSanitationLocations.id, industrialSanitationFindings.locationId),
          )
          .leftJoin(industrialSites, eq(industrialSites.id, industrialSanitationFindings.siteId))
          .where(
            and(
              eq(industrialSanitationFindings.tenantId, tenantId),
              isNull(industrialSanitationFindings.archivedAt),
              eq(industrialSanitationFindings.status, "OPEN"),
            ),
          )
          .orderBy(desc(industrialSanitationFindings.createdAt))
          .limit(2000);
        return {
          columns: [
            { key: "findingNumber", label: "Finding #" },
            { key: "title", label: "Title" },
            { key: "severity", label: "Severity" },
            { key: "category", label: "Category" },
            { key: "status", label: "Status" },
            { key: "locationName", label: "Location" },
            { key: "siteName", label: "Site" },
            { key: "isRecurring", label: "Recurring" },
            { key: "createdAt", label: "Created" },
          ],
          rows: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.dust_alerts": {
        const { from, to } = dateBounds(input);
        const rows = await tx
          .select({
            measurementNumber: industrialSanitationDustMeasurements.measurementNumber,
            dustDepthInches: industrialSanitationDustMeasurements.dustDepthInches,
            actionThresholdInches: industrialSanitationDustMeasurements.actionThresholdInches,
            isPriorityArea: industrialSanitationDustMeasurements.isPriorityArea,
            measuredAt: industrialSanitationDustMeasurements.measuredAt,
            locationName: industrialSanitationLocations.name,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationDustMeasurements)
          .leftJoin(
            industrialSanitationLocations,
            eq(industrialSanitationLocations.id, industrialSanitationDustMeasurements.locationId),
          )
          .leftJoin(
            industrialSites,
            eq(industrialSites.id, industrialSanitationDustMeasurements.siteId),
          )
          .where(
            and(
              eq(industrialSanitationDustMeasurements.tenantId, tenantId),
              isNull(industrialSanitationDustMeasurements.archivedAt),
              eq(industrialSanitationDustMeasurements.exceedsActionLevel, true),
              from ? gte(industrialSanitationDustMeasurements.measuredAt, from) : undefined,
              to ? lte(industrialSanitationDustMeasurements.measuredAt, to) : undefined,
            ),
          )
          .orderBy(desc(industrialSanitationDustMeasurements.measuredAt))
          .limit(2000);
        return {
          columns: [
            { key: "measurementNumber", label: "Measurement #" },
            { key: "dustDepthInches", label: "Depth (in)" },
            { key: "actionThresholdInches", label: "Threshold" },
            { key: "isPriorityArea", label: "Priority area" },
            { key: "locationName", label: "Location" },
            { key: "siteName", label: "Site" },
            { key: "measuredAt", label: "Measured" },
          ],
          rows: rows.map((r) => ({
            ...r,
            measuredAt: r.measuredAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.mss_completion": {
        const rows = await tx
          .select({
            title: industrialSanitationMasterSchedule.title,
            cleaningTask: industrialSanitationMasterSchedule.cleaningTask,
            frequency: industrialSanitationMasterSchedule.frequency,
            nextDueAt: industrialSanitationMasterSchedule.nextDueAt,
            lastCompletedAt: industrialSanitationMasterSchedule.lastCompletedAt,
            status: industrialSanitationMasterSchedule.status,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationMasterSchedule)
          .leftJoin(
            industrialSites,
            eq(industrialSites.id, industrialSanitationMasterSchedule.siteId),
          )
          .where(
            and(
              eq(industrialSanitationMasterSchedule.tenantId, tenantId),
              isNull(industrialSanitationMasterSchedule.archivedAt),
            ),
          )
          .orderBy(industrialSanitationMasterSchedule.title)
          .limit(2000);
        return {
          columns: [
            { key: "title", label: "Title" },
            { key: "cleaningTask", label: "Task" },
            { key: "frequency", label: "Frequency" },
            { key: "nextDueAt", label: "Next due" },
            { key: "lastCompletedAt", label: "Last completed" },
            { key: "status", label: "Status" },
            { key: "siteName", label: "Site" },
          ],
          rows: rows.map((r) => ({
            ...r,
            nextDueAt: r.nextDueAt?.toISOString() ?? null,
            lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.cleaning_overdue": {
        const now = new Date();
        const rows = await tx
          .select({
            taskNumber: industrialSanitationCleaningTasks.taskNumber,
            title: industrialSanitationCleaningTasks.title,
            status: industrialSanitationCleaningTasks.status,
            dueAt: industrialSanitationCleaningTasks.dueAt,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationCleaningTasks)
          .leftJoin(
            industrialSites,
            eq(industrialSites.id, industrialSanitationCleaningTasks.siteId),
          )
          .where(
            and(
              eq(industrialSanitationCleaningTasks.tenantId, tenantId),
              isNull(industrialSanitationCleaningTasks.archivedAt),
              inArray(industrialSanitationCleaningTasks.status, [
                "SCHEDULED",
                "ASSIGNED",
                "IN_PROGRESS",
                "OVERDUE",
                "RECLEAN_REQUIRED",
                "AWAITING_VERIFICATION",
              ]),
              lte(industrialSanitationCleaningTasks.dueAt, now),
            ),
          )
          .orderBy(industrialSanitationCleaningTasks.dueAt)
          .limit(2000);
        return {
          columns: [
            { key: "taskNumber", label: "Task #" },
            { key: "title", label: "Title" },
            { key: "status", label: "Status" },
            { key: "dueAt", label: "Due" },
            { key: "siteName", label: "Site" },
          ],
          rows: rows.map((r) => ({
            ...r,
            dueAt: r.dueAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.pest_activity": {
        const { from, to } = dateBounds(input);
        const rows = await tx
          .select({
            pestCategory: industrialSanitationPestFindings.pestCategory,
            pestSpecies: industrialSanitationPestFindings.pestSpecies,
            activityLevel: industrialSanitationPestFindings.activityLevel,
            status: industrialSanitationPestFindings.status,
            observedAt: industrialSanitationPestFindings.observedAt,
            locationName: industrialSanitationLocations.name,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationPestFindings)
          .leftJoin(
            industrialSanitationLocations,
            eq(industrialSanitationLocations.id, industrialSanitationPestFindings.locationId),
          )
          .leftJoin(
            industrialSites,
            eq(industrialSites.id, industrialSanitationPestFindings.siteId),
          )
          .where(
            and(
              eq(industrialSanitationPestFindings.tenantId, tenantId),
              isNull(industrialSanitationPestFindings.archivedAt),
              from ? gte(industrialSanitationPestFindings.observedAt, from) : undefined,
              to ? lte(industrialSanitationPestFindings.observedAt, to) : undefined,
            ),
          )
          .orderBy(desc(industrialSanitationPestFindings.observedAt))
          .limit(2000);
        return {
          columns: [
            { key: "pestCategory", label: "Category" },
            { key: "pestSpecies", label: "Species" },
            { key: "activityLevel", label: "Activity" },
            { key: "status", label: "Status" },
            { key: "locationName", label: "Location" },
            { key: "siteName", label: "Site" },
            { key: "observedAt", label: "Observed" },
          ],
          rows: rows.map((r) => ({
            ...r,
            observedAt: r.observedAt?.toISOString() ?? null,
          })),
        };
      }
      case "sanitation.spills": {
        const { from, to } = dateBounds(input);
        const rows = await tx
          .select({
            spillNumber: industrialSanitationSpills.spillNumber,
            product: industrialSanitationSpills.product,
            status: industrialSanitationSpills.status,
            slipFallHazard: industrialSanitationSpills.slipFallHazard,
            dustHazard: industrialSanitationSpills.dustHazard,
            reportedAt: industrialSanitationSpills.reportedAt,
            siteName: industrialSites.name,
          })
          .from(industrialSanitationSpills)
          .leftJoin(industrialSites, eq(industrialSites.id, industrialSanitationSpills.siteId))
          .where(
            and(
              eq(industrialSanitationSpills.tenantId, tenantId),
              isNull(industrialSanitationSpills.archivedAt),
              from ? gte(industrialSanitationSpills.reportedAt, from) : undefined,
              to ? lte(industrialSanitationSpills.reportedAt, to) : undefined,
            ),
          )
          .orderBy(desc(industrialSanitationSpills.reportedAt))
          .limit(2000);
        return {
          columns: [
            { key: "spillNumber", label: "Spill #" },
            { key: "product", label: "Product" },
            { key: "status", label: "Status" },
            { key: "slipFallHazard", label: "Slip/fall" },
            { key: "dustHazard", label: "Dust hazard" },
            { key: "siteName", label: "Site" },
            { key: "reportedAt", label: "Reported" },
          ],
          rows: rows.map((r) => ({
            ...r,
            reportedAt: r.reportedAt?.toISOString() ?? null,
          })),
        };
      }
      default:
        return emptyPayload();
    }
  }, principal.userId);

  let scrubbed = stripSensitive(
    result.rows,
    result.columns,
    meta.sensitiveColumns,
    allowSensitive,
  );
  // Medical encounters also require reporting.view_sensitive for clinical columns.
  if (reportKey === "workers_comp.medical_encounters" && !allowSensitive) {
    scrubbed = stripSensitive(scrubbed.rows, scrubbed.columns, meta.sensitiveColumns, false);
  }
  const projected = projectReportFields(scrubbed.columns, scrubbed.rows, input.fields);
  const aggregated = aggregateReportRows(
    projected.columns,
    projected.rows,
    input.groupBy,
    input.aggregate,
  );
  return {
    reportKey,
    reportName: meta.name,
    columns: aggregated.columns,
    rows: aggregated.rows,
  };
}
