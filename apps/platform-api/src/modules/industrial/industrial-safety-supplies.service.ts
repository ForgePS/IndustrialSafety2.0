import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  createId,
  industrialDepartments,
  industrialPersonnel,
  industrialSupplyAuditLog,
  industrialSupplyCategories,
  industrialSupplyCountItems,
  industrialSupplyCounts,
  industrialSupplyEmployeeAssignments,
  industrialSupplyInspections,
  industrialSupplyItemVariants,
  industrialSupplyItems,
  industrialSupplyKitItems,
  industrialSupplyKits,
  industrialSupplyLocationInventory,
  industrialSupplyLocations,
  industrialSupplyLots,
  industrialSupplyPurchaseOrderItems,
  industrialSupplyPurchaseOrders,
  industrialSupplyReceipts,
  industrialSupplyReorderRules,
  industrialSupplyRequestEvents,
  industrialSupplyRequestItems,
  industrialSupplyRequests,
  industrialSupplySerials,
  industrialSupplySettings,
  industrialSupplyTransactions,
  industrialSupplyTransferItems,
  industrialSupplyTransfers,
  industrialSupplyVendors,
  reportDefinitions,
  reportRecipients,
  reportSchedules,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { computeNextCronRun } from "../reporting/reporting-cron.js";
import { canDeleteSupplyItems, canManageSupplyLocations } from "./form-signatory.js";
import { SAFETY_DIRECTOR_RECIPIENT_MARKER } from "./safety-director-recipients.js";

const DEFAULT_EXPIRATION_WARNING_DAYS = [180, 90, 60, 30, 14, 7] as const;

const MONTHLY_DEPT_REPORT_SOURCE_KEY = "supplies.issued_transferred_by_department";
const MONTHLY_DEPT_SCHEDULE_NAME = "Monthly Safety Supplies by Department";
const MONTHLY_DEPT_SCHEDULE_CRON = "0 13 1 * *";
const MONTHLY_DEPT_SCHEDULE_TZ = "America/Chicago";

const DEFAULT_SYSTEM_CATEGORIES: ReadonlyArray<{
  code: string;
  name: string;
  sortOrder: number;
}> = [
  { code: "PPE", name: "Personal Protective Equipment", sortOrder: 10 },
  { code: "RESPIRATORY", name: "Respiratory Protection", sortOrder: 20 },
  { code: "FALL_PROTECTION", name: "Fall Protection", sortOrder: 30 },
  { code: "FIRST_AID", name: "First Aid", sortOrder: 40 },
  { code: "EMERGENCY_RESPONSE", name: "Emergency Response", sortOrder: 50 },
  { code: "LOTO", name: "Lockout/Tagout", sortOrder: 60 },
  { code: "CONFINED_SPACE", name: "Confined Space", sortOrder: 70 },
  { code: "WELDING_HOT_WORK", name: "Welding / Hot Work", sortOrder: 80 },
  { code: "TRAFFIC_WORK_ZONE", name: "Traffic / Work Zone", sortOrder: 90 },
  { code: "GENERAL_SAFETY", name: "General Safety", sortOrder: 100 },
  { code: "CUSTOM", name: "Custom", sortOrder: 110 },
];

type ListQuery = Record<string, string | undefined>;

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function asInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function asOptionalNumber(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asOptionalString(value: unknown): string | null {
  const s = asString(value);
  return s || null;
}

const MAX_RECIPIENT_SIGNATURE_DATA_URL = 200_000;

/** Printed name + digital signature when the recipient takes custody of issued items. */
function parseRecipientAcknowledgment(body: Record<string, unknown>): {
  recipientPrintedName: string;
  recipientSignatureDataUrl: string;
  recipientSignedAt: Date;
} {
  const recipientPrintedName =
    asOptionalString(body.recipientPrintedName) ?? asOptionalString(body.recipientName);
  const recipientSignatureDataUrl = asOptionalString(body.recipientSignatureDataUrl);
  if (!recipientPrintedName) {
    throw new ForgeError("VALIDATION_FAILED", "Recipient printed name is required");
  }
  if (!recipientSignatureDataUrl) {
    throw new ForgeError("VALIDATION_FAILED", "Recipient signature is required");
  }
  if (
    !recipientSignatureDataUrl.startsWith("data:image/") ||
    recipientSignatureDataUrl.length > MAX_RECIPIENT_SIGNATURE_DATA_URL
  ) {
    throw new ForgeError(
      "VALIDATION_FAILED",
      "Recipient signature must be a small image (draw on the signature pad).",
    );
  }
  return {
    recipientPrintedName,
    recipientSignatureDataUrl,
    recipientSignedAt: new Date(),
  };
}

function asOptionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function asQtyString(value: unknown, fallback = "0"): string {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(4);
}

function pageParams(query: ListQuery) {
  const page = Math.max(1, asInt(query.page, 1));
  const pageSize = Math.min(200, Math.max(1, asInt(query.pageSize, 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function reportPageParams(query: ListQuery) {
  const page = Math.max(1, asInt(query.page, 1));
  const pageSize = Math.min(2000, Math.max(1, asInt(query.pageSize, 500)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function asIdList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseReportDateStart(value: unknown): Date | null {
  const s = asOptionalDate(value);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseReportDateEnd(value: unknown): Date | null {
  const s = asOptionalDate(value);
  if (!s) return null;
  const d = new Date(`${s}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function serializeSettings(row: typeof industrialSupplySettings.$inferSelect) {
  return {
    id: row.id,
    allowNegativeInventory: row.allowNegativeInventory,
    requireAdjustmentApproval: row.requireAdjustmentApproval,
    requireBlindInventoryCount: row.requireBlindInventoryCount,
    enableInventoryCosting: row.enableInventoryCosting,
    defaultLowStockThreshold: row.defaultLowStockThreshold,
    requireEmployeeAcknowledgment: row.requireEmployeeAcknowledgment,
    requireReturnCondition: row.requireReturnCondition,
    allowPpeIssueOverride: row.allowPpeIssueOverride,
    requireTrainingVerification: row.requireTrainingVerification,
    enablePurchaseRequests: row.enablePurchaseRequests,
    enablePurchaseOrders: row.enablePurchaseOrders,
    requirePoApproval: row.requirePoApproval,
    purchaseApprovalThreshold: row.purchaseApprovalThreshold,
    defaultLabelType: row.defaultLabelType,
    defaultPrinter: row.defaultPrinter,
    autoCreateQrOnItemCreate: row.autoCreateQrOnItemCreate,
    expirationWarningDays: Array.isArray(row.expirationWarningDays)
      ? row.expirationWarningDays
      : [...DEFAULT_EXPIRATION_WARNING_DAYS],
    notificationSettings:
      typeof row.notificationSettings === "object" && row.notificationSettings
        ? row.notificationSettings
        : {},
    settings: typeof row.settings === "object" && row.settings ? row.settings : {},
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function serializeItem(row: typeof industrialSupplyItems.$inferSelect) {
  return {
    id: row.id,
    itemNumber: row.itemNumber,
    sku: row.sku,
    internalItemNumber: row.internalItemNumber,
    name: row.name,
    shortName: row.shortName,
    description: row.description,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    manufacturer: row.manufacturer,
    manufacturerPartNumber: row.manufacturerPartNumber,
    brand: row.brand,
    model: row.model,
    inventoryType: row.inventoryType,
    unitOfMeasure: row.unitOfMeasure,
    packageQuantity: row.packageQuantity,
    status: row.status,
    minimumQuantity: row.minimumQuantity,
    maximumQuantity: row.maximumQuantity,
    reorderPoint: row.reorderPoint,
    reorderQuantity: row.reorderQuantity,
    safetyStock: row.safetyStock,
    leadTimeDays: row.leadTimeDays,
    primaryLocationId: row.primaryLocationId,
    primaryVendorId: row.primaryVendorId,
    lastPurchaseCost: row.lastPurchaseCost,
    averageUnitCost: row.averageUnitCost,
    standardCost: row.standardCost,
    packageCost: row.packageCost,
    oshaRelevant: row.oshaRelevant,
    ppeCategory: row.ppeCategory,
    inspectionRequired: row.inspectionRequired,
    inspectionFrequencyDays: row.inspectionFrequencyDays,
    expirationTrackingRequired: row.expirationTrackingRequired,
    shelfLifeDays: row.shelfLifeDays,
    lotTrackingRequired: row.lotTrackingRequired,
    serialTrackingRequired: row.serialTrackingRequired,
    employeeAssignmentRequired: row.employeeAssignmentRequired,
    trainingRequiredBeforeIssue: row.trainingRequiredBeforeIssue,
    barcode: row.barcode,
    upc: row.upc,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

@Injectable()
export class IndustrialSafetySuppliesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  private async notifyRequestEvent(input: {
    tenantId: string;
    requestId: string;
    requestNumber: string;
    type: string;
    title: string;
    body: string;
    userIds: string[];
    priority?: "NORMAL" | "HIGH";
  }) {
    if (!this.notifications || input.userIds.length === 0) return;
    const href = `/modules/safety-supplies?tab=requests&id=${encodeURIComponent(input.requestId)}`;
    for (const userId of input.userIds) {
      try {
        await this.notifications.create(
          input.tenantId,
          {
            userId,
            type: input.type,
            title: input.title,
            body: input.body,
            priority: input.priority ?? "NORMAL",
            destination: "IN_APP",
            href,
            metadataJson: {
              requestId: input.requestId,
              requestNumber: input.requestNumber,
            },
          },
          {
            userId: null,
            tenantId: input.tenantId,
            isPlatformAdmin: true,
            permissions: new Set(),
            activeProducts: new Set(),
          } as unknown as ForgePrincipal,
        );
      } catch {
        /* best-effort */
      }
    }
  }

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private num(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private async nextNumber(
    tx: DatabaseTransaction,
    tenantId: string,
    prefix: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: { tenantId: any },
  ): Promise<string> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      .where(eq(table.tenantId, tenantId));
    const n = (row?.count ?? 0) + 1;
    return `${prefix}-${String(n).padStart(6, "0")}`;
  }

  private async nextSupplyRequestNumber(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SSR-${year}-`;
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(industrialSupplyRequests)
      .where(
        and(
          eq(industrialSupplyRequests.tenantId, tenantId),
          sql`${industrialSupplyRequests.requestNumber} like ${`${prefix}%`}`,
        ),
      );
    return `${prefix}${String((row?.count ?? 0) + 1).padStart(5, "0")}`;
  }

  private async writeRequestEvent(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      requestId: string;
      eventType: string;
      previousStatus?: string | null;
      newStatus?: string | null;
      userId?: string | null;
      personnelId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.insert(industrialSupplyRequestEvents).values({
      id: createId(),
      tenantId: input.tenantId,
      requestId: input.requestId,
      eventType: input.eventType,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      userId: input.userId ?? null,
      personnelId: input.personnelId ?? null,
      metadataJson: input.metadata ?? {},
      createdAt: new Date(),
    });
  }

  private async loadSettingsRow(tx: DatabaseTransaction, tenantId: string) {
    const [row] = await tx
      .select()
      .from(industrialSupplySettings)
      .where(eq(industrialSupplySettings.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  }

  private async getOrCreateInventoryRow(
    tx: DatabaseTransaction,
    tenantId: string,
    itemId: string,
    locationId: string,
    variantId?: string | null,
  ) {
    const variantFilter = variantId
      ? eq(industrialSupplyLocationInventory.variantId, variantId)
      : isNull(industrialSupplyLocationInventory.variantId);
    const where = and(
      eq(industrialSupplyLocationInventory.tenantId, tenantId),
      eq(industrialSupplyLocationInventory.itemId, itemId),
      eq(industrialSupplyLocationInventory.locationId, locationId),
      variantFilter,
    );

    let rows = await tx
      .select()
      .from(industrialSupplyLocationInventory)
      .where(where)
      .for("update")
      .limit(1);

    if (rows[0]) return rows[0];

    const now = new Date();
    await tx.insert(industrialSupplyLocationInventory).values({
      id: createId(),
      tenantId,
      itemId,
      variantId: variantId ?? null,
      locationId,
      quantityOnHand: "0",
      quantityReserved: "0",
      quantityAvailable: "0",
      quantityOnOrder: "0",
      createdAt: now,
      updatedAt: now,
    });

    rows = await tx
      .select()
      .from(industrialSupplyLocationInventory)
      .where(where)
      .for("update")
      .limit(1);
    if (!rows[0]) {
      throw new ForgeError("INTERNAL_ERROR", "Unable to create inventory row");
    }
    return rows[0];
  }

  private async applyQtyChange(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      itemId: string;
      variantId?: string | null;
      locationId: string;
      delta: number;
      transactionType: string;
      principal: ForgePrincipal;
      lotId?: string | null;
      serialId?: string | null;
      personnelId?: string | null;
      departmentId?: string | null;
      unitCost?: string | null;
      reason?: string | null;
      sourceLocationId?: string | null;
      destinationLocationId?: string | null;
      relatedPoId?: string | null;
      relatedTransferId?: string | null;
      relatedCountId?: string | null;
      relatedRequestId?: string | null;
      reservedDelta?: number;
      recipientPrintedName?: string | null;
      recipientSignatureDataUrl?: string | null;
      recipientSignedAt?: Date | null;
    },
  ) {
    const settings = await this.loadSettingsRow(tx, input.tenantId);
    const allowNegative = settings?.allowNegativeInventory ?? false;
    const inv = await this.getOrCreateInventoryRow(
      tx,
      input.tenantId,
      input.itemId,
      input.locationId,
      input.variantId,
    );

    const previousOnHand = this.num(inv.quantityOnHand);
    const previousReserved = this.num(inv.quantityReserved);
    const newOnHand = previousOnHand + input.delta;
    const reservedDelta = input.reservedDelta ?? 0;
    const newReserved = Math.max(0, previousReserved + reservedDelta);
    const newAvailable = newOnHand - newReserved;

    if (!allowNegative && input.delta < 0 && newOnHand < 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Insufficient stock. Available quantity is ${Math.max(0, previousOnHand - previousReserved).toFixed(4)}.`,
      );
    }
    if (!allowNegative && input.delta < 0 && previousOnHand - previousReserved + input.delta < 0) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Insufficient stock. Available quantity is ${Math.max(0, previousOnHand - previousReserved).toFixed(4)}.`,
      );
    }

    const now = new Date();
    await tx
      .update(industrialSupplyLocationInventory)
      .set({
        quantityOnHand: asQtyString(newOnHand),
        quantityReserved: asQtyString(newReserved),
        quantityAvailable: asQtyString(newAvailable),
        lastTransactionAt: now,
        updatedAt: now,
        ...(input.unitCost != null ? { averageUnitCost: input.unitCost } : {}),
      })
      .where(eq(industrialSupplyLocationInventory.id, inv.id));

    const [txn] = await tx
      .insert(industrialSupplyTransactions)
      .values({
        id: createId(),
        tenantId: input.tenantId,
        itemId: input.itemId,
        variantId: input.variantId ?? null,
        lotId: input.lotId ?? null,
        serialId: input.serialId ?? null,
        transactionType: input.transactionType,
        quantity: asQtyString(input.delta),
        previousQuantity: asQtyString(previousOnHand),
        newQuantity: asQtyString(newOnHand),
        sourceLocationId: input.sourceLocationId ?? (input.delta < 0 ? input.locationId : null),
        destinationLocationId:
          input.destinationLocationId ?? (input.delta > 0 ? input.locationId : null),
        personnelId: input.personnelId ?? null,
        departmentId: input.departmentId ?? null,
        relatedPoId: input.relatedPoId ?? null,
        relatedTransferId: input.relatedTransferId ?? null,
        relatedCountId: input.relatedCountId ?? null,
        relatedRequestId: input.relatedRequestId ?? null,
        unitCost: input.unitCost ?? null,
        reason: input.reason ?? null,
        performedBy: input.principal.userId ?? null,
        recipientPrintedName: input.recipientPrintedName ?? null,
        recipientSignatureDataUrl: input.recipientSignatureDataUrl ?? null,
        recipientSignedAt: input.recipientSignedAt ?? null,
        createdAt: now,
      })
      .returning();

    return {
      inventoryId: inv.id,
      previousQuantity: previousOnHand,
      newQuantity: newOnHand,
      transaction: txn!,
    };
  }

  private async writeDomainAudit(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      actorUserId?: string | null;
      action: string;
      resourceType: string;
      resourceId?: string | null;
      previousValue?: Record<string, unknown> | null;
      newValue?: Record<string, unknown> | null;
      reason?: string | null;
    },
  ) {
    await tx.insert(industrialSupplyAuditLog).values({
      id: createId(),
      tenantId: input.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      previousValue: input.previousValue ?? null,
      newValue: input.newValue ?? null,
      reason: input.reason ?? null,
      sessionMetadata: {},
    });
  }

  private async ensureDefaultCategories(
    tx: DatabaseTransaction,
    tenantId: string,
    actorUserId?: string,
  ) {
    const existing = await tx
      .select({ id: industrialSupplyCategories.id })
      .from(industrialSupplyCategories)
      .where(
        and(
          eq(industrialSupplyCategories.tenantId, tenantId),
          isNull(industrialSupplyCategories.archivedAt),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    const now = new Date();
    await tx.insert(industrialSupplyCategories).values(
      DEFAULT_SYSTEM_CATEGORIES.map((cat) => ({
        id: createId(),
        tenantId,
        code: cat.code,
        name: cat.name,
        sortOrder: cat.sortOrder,
        isSystem: true,
        status: "ACTIVE",
        createdBy: actorUserId ?? null,
        updatedBy: actorUserId ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  private async requireItem(tx: DatabaseTransaction, tenantId: string, itemId: string) {
    const [item] = await tx
      .select()
      .from(industrialSupplyItems)
      .where(
        and(
          eq(industrialSupplyItems.id, itemId),
          eq(industrialSupplyItems.tenantId, tenantId),
          isNull(industrialSupplyItems.archivedAt),
        ),
      )
      .limit(1);
    if (!item) throw new ForgeError("NOT_FOUND", "Supply item not found");
    return item;
  }

  private async requireLocation(tx: DatabaseTransaction, tenantId: string, locationId: string) {
    const [loc] = await tx
      .select()
      .from(industrialSupplyLocations)
      .where(
        and(
          eq(industrialSupplyLocations.id, locationId),
          eq(industrialSupplyLocations.tenantId, tenantId),
          isNull(industrialSupplyLocations.archivedAt),
        ),
      )
      .limit(1);
    if (!loc) throw new ForgeError("NOT_FOUND", "Supply location not found");
    return loc;
  }

  async getSettings(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.ensureDefaultCategories(tx, tenantId, principal.userId);
      const [row] = await tx
        .select()
        .from(industrialSupplySettings)
        .where(eq(industrialSupplySettings.tenantId, tenantId))
        .limit(1);
      if (!row) {
        return {
          id: null,
          allowNegativeInventory: false,
          requireAdjustmentApproval: false,
          requireBlindInventoryCount: false,
          enableInventoryCosting: true,
          defaultLowStockThreshold: 0,
          requireEmployeeAcknowledgment: true,
          requireReturnCondition: true,
          allowPpeIssueOverride: false,
          requireTrainingVerification: true,
          enablePurchaseRequests: true,
          enablePurchaseOrders: true,
          requirePoApproval: true,
          purchaseApprovalThreshold: null,
          defaultLabelType: "SMALL_INVENTORY",
          defaultPrinter: null,
          autoCreateQrOnItemCreate: true,
          expirationWarningDays: [...DEFAULT_EXPIRATION_WARNING_DAYS],
          notificationSettings: {},
          settings: {},
          updatedAt: null,
        };
      }
      return serializeSettings(row);
    });
  }

  async patchSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [existing] = await tx
        .select()
        .from(industrialSupplySettings)
        .where(eq(industrialSupplySettings.tenantId, tenantId))
        .limit(1);

      const prev = existing ? serializeSettings(existing) : null;
      const prevSettings =
        existing && typeof existing.settings === "object" && existing.settings
          ? (existing.settings as Record<string, unknown>)
          : {};
      const prevNotifications =
        existing &&
        typeof existing.notificationSettings === "object" &&
        existing.notificationSettings
          ? (existing.notificationSettings as Record<string, unknown>)
          : {};

      const nextSettings = {
        ...prevSettings,
        ...(typeof body.settings === "object" && body.settings
          ? (body.settings as Record<string, unknown>)
          : {}),
      };
      const nextNotifications = {
        ...prevNotifications,
        ...(typeof body.notificationSettings === "object" && body.notificationSettings
          ? (body.notificationSettings as Record<string, unknown>)
          : {}),
      };

      const expirationWarningDays = Array.isArray(body.expirationWarningDays)
        ? body.expirationWarningDays
            .map((d) => asInt(d, NaN))
            .filter((d) => Number.isFinite(d) && d > 0)
        : existing && Array.isArray(existing.expirationWarningDays)
          ? (existing.expirationWarningDays as number[])
          : [...DEFAULT_EXPIRATION_WARNING_DAYS];

      const values = {
        allowNegativeInventory: asBool(
          body.allowNegativeInventory,
          existing?.allowNegativeInventory ?? false,
        ),
        requireAdjustmentApproval: asBool(
          body.requireAdjustmentApproval,
          existing?.requireAdjustmentApproval ?? false,
        ),
        requireBlindInventoryCount: asBool(
          body.requireBlindInventoryCount,
          existing?.requireBlindInventoryCount ?? false,
        ),
        enableInventoryCosting: asBool(
          body.enableInventoryCosting,
          existing?.enableInventoryCosting ?? true,
        ),
        defaultLowStockThreshold: asInt(
          body.defaultLowStockThreshold,
          existing?.defaultLowStockThreshold ?? 0,
        ),
        requireEmployeeAcknowledgment: asBool(
          body.requireEmployeeAcknowledgment,
          existing?.requireEmployeeAcknowledgment ?? true,
        ),
        requireReturnCondition: asBool(
          body.requireReturnCondition,
          existing?.requireReturnCondition ?? true,
        ),
        allowPpeIssueOverride: asBool(
          body.allowPpeIssueOverride,
          existing?.allowPpeIssueOverride ?? false,
        ),
        requireTrainingVerification: asBool(
          body.requireTrainingVerification,
          existing?.requireTrainingVerification ?? true,
        ),
        enablePurchaseRequests: asBool(
          body.enablePurchaseRequests,
          existing?.enablePurchaseRequests ?? true,
        ),
        enablePurchaseOrders: asBool(
          body.enablePurchaseOrders,
          existing?.enablePurchaseOrders ?? true,
        ),
        requirePoApproval: asBool(body.requirePoApproval, existing?.requirePoApproval ?? true),
        purchaseApprovalThreshold:
          body.purchaseApprovalThreshold !== undefined
            ? asOptionalNumber(body.purchaseApprovalThreshold)
            : (existing?.purchaseApprovalThreshold ?? null),
        defaultLabelType:
          asString(body.defaultLabelType, existing?.defaultLabelType ?? "SMALL_INVENTORY").slice(
            0,
            64,
          ) || "SMALL_INVENTORY",
        defaultPrinter:
          body.defaultPrinter !== undefined
            ? asString(body.defaultPrinter) || null
            : (existing?.defaultPrinter ?? null),
        autoCreateQrOnItemCreate: asBool(
          body.autoCreateQrOnItemCreate,
          existing?.autoCreateQrOnItemCreate ?? true,
        ),
        expirationWarningDays,
        notificationSettings: nextNotifications,
        settings: nextSettings,
        updatedAt: now,
      };

      let row: typeof industrialSupplySettings.$inferSelect;
      if (!existing) {
        const [inserted] = await tx
          .insert(industrialSupplySettings)
          .values({
            id: createId(),
            tenantId,
            ...values,
            createdAt: now,
          })
          .returning();
        row = inserted!;
      } else {
        const [updated] = await tx
          .update(industrialSupplySettings)
          .set(values)
          .where(eq(industrialSupplySettings.id, existing.id))
          .returning();
        row = updated!;
      }

      const next = serializeSettings(row);
      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: existing ? "UPDATE" : "CREATE",
        resourceType: "supply_settings",
        resourceId: row.id,
        previousValue: prev,
        newValue: next,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: existing
          ? "industrial.supplies.settings.update"
          : "industrial.supplies.settings.create",
        resourceType: "industrial_supply_settings",
        resourceId: row.id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        before: prev ?? undefined,
        after: next,
        metadata: { module: "SAFETY_SUPPLIES" },
      });

      const synced = await this.syncMonthlyDepartmentUsageSchedule(tx, {
        tenantId,
        principal,
        settings: (next.settings ?? {}) as Record<string, unknown>,
        now,
      });
      if (synced.changed) {
        const [updated] = await tx
          .update(industrialSupplySettings)
          .set({ settings: synced.settings, updatedAt: new Date() })
          .where(eq(industrialSupplySettings.id, row.id))
          .returning();
        return serializeSettings(updated!);
      }

      return next;
    });
  }

  private async syncMonthlyDepartmentUsageSchedule(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      principal: ForgePrincipal;
      settings: Record<string, unknown>;
      now: Date;
    },
  ): Promise<{ changed: boolean; settings: Record<string, unknown> }> {
    const enabled = Boolean(input.settings.monthlyDepartmentUsageEmailToSafetyDirectors);
    const existingScheduleId = String(input.settings.monthlyDepartmentUsageScheduleId ?? "").trim();
    const settings = { ...input.settings };

    if (!enabled) {
      if (existingScheduleId) {
        await tx
          .update(reportSchedules)
          .set({ enabled: false, updatedAt: input.now })
          .where(
            and(
              eq(reportSchedules.id, existingScheduleId),
              eq(reportSchedules.tenantId, input.tenantId),
              isNull(reportSchedules.deletedAt),
            ),
          );
        return { changed: true, settings };
      }
      return { changed: false, settings };
    }

    let definitionId = String(input.settings.monthlyDepartmentUsageDefinitionId ?? "").trim();
    if (definitionId) {
      const [def] = await tx
        .select({ id: reportDefinitions.id })
        .from(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.id, definitionId),
            eq(reportDefinitions.tenantId, input.tenantId),
            isNull(reportDefinitions.deletedAt),
          ),
        )
        .limit(1);
      if (!def) definitionId = "";
    }

    if (!definitionId) {
      const [existingDef] = await tx
        .select({ id: reportDefinitions.id })
        .from(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.tenantId, input.tenantId),
            eq(reportDefinitions.sourceKey, MONTHLY_DEPT_REPORT_SOURCE_KEY),
            eq(reportDefinitions.origin, "saved"),
            isNull(reportDefinitions.deletedAt),
          ),
        )
        .limit(1);
      if (existingDef) {
        definitionId = existingDef.id;
      } else {
        definitionId = createId();
        await tx.insert(reportDefinitions).values({
          id: definitionId,
          tenantId: input.tenantId,
          reportKey: null,
          name: MONTHLY_DEPT_SCHEDULE_NAME,
          description:
            "Prior-month ISSUE, PPE_ISSUE, TRANSFER_OUT, and TRANSFER_IN quantities by department.",
          origin: "saved",
          category: "Inventory",
          moduleCode: "Safety Supplies",
          reportType: "operational",
          sourceKey: MONTHLY_DEPT_REPORT_SOURCE_KEY,
          payloadJson: {},
          status: "ACTIVE",
          createdByUserId: input.principal.userId,
          updatedByUserId: input.principal.userId,
        });
      }
      settings.monthlyDepartmentUsageDefinitionId = definitionId;
    }

    const nextRunAt = computeNextCronRun(MONTHLY_DEPT_SCHEDULE_CRON) ?? null;
    let scheduleId = existingScheduleId;
    if (scheduleId) {
      const [existingSchedule] = await tx
        .select({ id: reportSchedules.id })
        .from(reportSchedules)
        .where(
          and(
            eq(reportSchedules.id, scheduleId),
            eq(reportSchedules.tenantId, input.tenantId),
            isNull(reportSchedules.deletedAt),
          ),
        )
        .limit(1);
      if (!existingSchedule) scheduleId = "";
    }

    if (scheduleId) {
      await tx
        .update(reportSchedules)
        .set({
          reportDefinitionId: definitionId,
          name: MONTHLY_DEPT_SCHEDULE_NAME,
          cronExpression: MONTHLY_DEPT_SCHEDULE_CRON,
          timezone: MONTHLY_DEPT_SCHEDULE_TZ,
          format: "csv",
          enabled: true,
          nextRunAt,
          updatedAt: input.now,
        })
        .where(eq(reportSchedules.id, scheduleId));
      await tx.delete(reportRecipients).where(eq(reportRecipients.scheduleId, scheduleId));
    } else {
      scheduleId = createId();
      await tx.insert(reportSchedules).values({
        id: scheduleId,
        tenantId: input.tenantId,
        reportDefinitionId: definitionId,
        name: MONTHLY_DEPT_SCHEDULE_NAME,
        cronExpression: MONTHLY_DEPT_SCHEDULE_CRON,
        timezone: MONTHLY_DEPT_SCHEDULE_TZ,
        format: "csv",
        enabled: true,
        runInputJson: {},
        nextRunAt,
        createdByUserId: input.principal.userId,
      });
      settings.monthlyDepartmentUsageScheduleId = scheduleId;
    }

    await tx.insert(reportRecipients).values({
      id: createId(),
      tenantId: input.tenantId,
      scheduleId,
      email: SAFETY_DIRECTOR_RECIPIENT_MARKER,
      name: "Safety Directors",
    });

    settings.monthlyDepartmentUsageScheduleId = scheduleId;
    settings.monthlyDepartmentUsageDefinitionId = definitionId;
    settings.monthlyDepartmentUsageEmailToSafetyDirectors = true;

    return { changed: true, settings };
  }

  async listCategories(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.ensureDefaultCategories(tx, tenantId, principal.userId);
      const rows = await tx
        .select()
        .from(industrialSupplyCategories)
        .where(
          and(
            eq(industrialSupplyCategories.tenantId, tenantId),
            isNull(industrialSupplyCategories.archivedAt),
          ),
        )
        .orderBy(asc(industrialSupplyCategories.sortOrder), asc(industrialSupplyCategories.name));
      return {
        items: rows.map((r) => ({
          id: r.id,
          parentId: r.parentId,
          code: r.code,
          name: r.name,
          description: r.description,
          sortOrder: r.sortOrder,
          isSystem: r.isSystem,
          status: r.status,
          createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
          updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
        })),
      };
    });
  }

  async createCategory(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    const code = asString(body.code || name)
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Category name is required");
    if (!code) throw new ForgeError("VALIDATION_FAILED", "Category code is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyCategories)
        .values({
          id: createId(),
          tenantId,
          parentId: body.parentId ? asString(body.parentId) : null,
          code,
          name,
          description: body.description ? asString(body.description) : null,
          sortOrder: asInt(body.sortOrder, 200),
          isSystem: false,
          status: asString(body.status, "ACTIVE") || "ACTIVE",
          createdBy: principal.userId,
          updatedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const mapped = {
        id: row!.id,
        parentId: row!.parentId,
        code: row!.code,
        name: row!.name,
        description: row!.description,
        sortOrder: row!.sortOrder,
        isSystem: row!.isSystem,
        status: row!.status,
      };

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_category",
        resourceId: row!.id,
        newValue: mapped,
      });

      return mapped;
    });
  }

  async dashboard(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.ensureDefaultCategories(tx, tenantId, principal.userId);
      const settings = await this.loadSettingsRow(tx, tenantId);
      const warningDays = Array.isArray(settings?.expirationWarningDays)
        ? (settings!.expirationWarningDays as number[])
        : [...DEFAULT_EXPIRATION_WARNING_DAYS];
      const soonDays = Math.max(...warningDays, 30);
      const today = todayIso();
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + soonDays);
      const soonIso = soonDate.toISOString().slice(0, 10);
      const monthStart = monthStartIso();

      const [categoryCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyCategories)
        .where(
          and(
            eq(industrialSupplyCategories.tenantId, tenantId),
            isNull(industrialSupplyCategories.archivedAt),
          ),
        );

      const [valueRow] = await tx
        .select({
          totalValue: sql<string>`coalesce(sum(${industrialSupplyLocationInventory.quantityOnHand} * coalesce(${industrialSupplyLocationInventory.averageUnitCost}, ${industrialSupplyItems.averageUnitCost}, 0)), 0)`,
          itemCount: sql<number>`count(distinct ${industrialSupplyLocationInventory.itemId})::int`,
        })
        .from(industrialSupplyLocationInventory)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
        )
        .where(
          and(
            eq(industrialSupplyLocationInventory.tenantId, tenantId),
            isNull(industrialSupplyItems.archivedAt),
          ),
        );

      const [lowStock] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLocationInventory)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
        )
        .where(
          and(
            eq(industrialSupplyLocationInventory.tenantId, tenantId),
            isNull(industrialSupplyItems.archivedAt),
            sql`${industrialSupplyLocationInventory.quantityAvailable} <= coalesce(${industrialSupplyLocationInventory.reorderPoint}, ${industrialSupplyItems.reorderPoint}, 0)`,
          ),
        );

      const [outOfStock] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLocationInventory)
        .where(
          and(
            eq(industrialSupplyLocationInventory.tenantId, tenantId),
            sql`${industrialSupplyLocationInventory.quantityAvailable} <= 0`,
          ),
        );

      const [expiringSoon] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLots)
        .where(
          and(
            eq(industrialSupplyLots.tenantId, tenantId),
            isNull(industrialSupplyLots.archivedAt),
            eq(industrialSupplyLots.status, "CURRENT"),
            sql`${industrialSupplyLots.expirationDate} is not null`,
            gte(industrialSupplyLots.expirationDate, today),
            lte(industrialSupplyLots.expirationDate, soonIso),
          ),
        );

      const [expiredItems] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLots)
        .where(
          and(
            eq(industrialSupplyLots.tenantId, tenantId),
            isNull(industrialSupplyLots.archivedAt),
            or(
              eq(industrialSupplyLots.status, "EXPIRED"),
              and(
                sql`${industrialSupplyLots.expirationDate} is not null`,
                lte(industrialSupplyLots.expirationDate, today),
              ),
            ),
          ),
        );

      const [pendingRequests] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
            inArray(industrialSupplyRequests.status, ["SUBMITTED", "APPROVED", "PENDING"]),
          ),
        );

      const [openPos] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyPurchaseOrders)
        .where(
          and(
            eq(industrialSupplyPurchaseOrders.tenantId, tenantId),
            isNull(industrialSupplyPurchaseOrders.archivedAt),
            inArray(industrialSupplyPurchaseOrders.status, [
              "DRAFT",
              "PENDING_APPROVAL",
              "APPROVED",
              "ORDERED",
              "PARTIAL",
            ]),
          ),
        );

      const [receivedMonth] = await tx
        .select({
          qty: sql<string>`coalesce(sum(abs(${industrialSupplyTransactions.quantity})), 0)`,
        })
        .from(industrialSupplyTransactions)
        .where(
          and(
            eq(industrialSupplyTransactions.tenantId, tenantId),
            eq(industrialSupplyTransactions.transactionType, "RECEIVE"),
            gte(industrialSupplyTransactions.createdAt, new Date(`${monthStart}T00:00:00.000Z`)),
          ),
        );

      const [issuedMonth] = await tx
        .select({
          qty: sql<string>`coalesce(sum(abs(${industrialSupplyTransactions.quantity})), 0)`,
        })
        .from(industrialSupplyTransactions)
        .where(
          and(
            eq(industrialSupplyTransactions.tenantId, tenantId),
            inArray(industrialSupplyTransactions.transactionType, ["ISSUE", "PPE_ISSUE"]),
            gte(industrialSupplyTransactions.createdAt, new Date(`${monthStart}T00:00:00.000Z`)),
          ),
        );

      const [adjustments] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyTransactions)
        .where(
          and(
            eq(industrialSupplyTransactions.tenantId, tenantId),
            eq(industrialSupplyTransactions.transactionType, "ADJUST"),
            gte(industrialSupplyTransactions.createdAt, new Date(`${monthStart}T00:00:00.000Z`)),
          ),
        );

      const [damaged] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplySerials)
        .where(
          and(
            eq(industrialSupplySerials.tenantId, tenantId),
            isNull(industrialSupplySerials.archivedAt),
            or(
              eq(industrialSupplySerials.condition, "DAMAGED"),
              eq(industrialSupplySerials.status, "OUT_OF_SERVICE"),
            ),
          ),
        );

      const [awaitingInspection] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplySerials)
        .where(
          and(
            eq(industrialSupplySerials.tenantId, tenantId),
            isNull(industrialSupplySerials.archivedAt),
            or(
              eq(industrialSupplySerials.inspectionStatus, "DUE"),
              eq(industrialSupplySerials.inspectionStatus, "OVERDUE"),
              and(
                sql`${industrialSupplySerials.nextInspectionAt} is not null`,
                lte(industrialSupplySerials.nextInspectionAt, new Date()),
              ),
            ),
          ),
        );

      const [ppeActive] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyEmployeeAssignments)
        .where(
          and(
            eq(industrialSupplyEmployeeAssignments.tenantId, tenantId),
            eq(industrialSupplyEmployeeAssignments.status, "ASSIGNED"),
          ),
        );

      return {
        totalInventoryValue: this.num(valueRow?.totalValue),
        totalInventoryItems: valueRow?.itemCount ?? 0,
        lowStockItems: lowStock?.count ?? 0,
        outOfStockItems: outOfStock?.count ?? 0,
        expiringSoon: expiringSoon?.count ?? 0,
        expiredItems: expiredItems?.count ?? 0,
        pendingRequests: pendingRequests?.count ?? 0,
        openPurchaseOrders: openPos?.count ?? 0,
        suppliesReceivedThisMonth: this.num(receivedMonth?.qty),
        suppliesIssuedThisMonth: this.num(issuedMonth?.qty),
        inventoryAdjustments: adjustments?.count ?? 0,
        damagedEquipment: damaged?.count ?? 0,
        equipmentAwaitingInspection: awaitingInspection?.count ?? 0,
        employeePpeAssignments: ppeActive?.count ?? 0,
        categoryCount: categoryCount?.count ?? 0,
        moduleStatus: "ACTIVE",
      };
    });
  }

  async listAudit(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyAuditLog)
        .where(eq(industrialSupplyAuditLog.tenantId, tenantId));
      const total = countRow?.count ?? 0;
      const rows = await tx
        .select()
        .from(industrialSupplyAuditLog)
        .where(eq(industrialSupplyAuditLog.tenantId, tenantId))
        .orderBy(desc(industrialSupplyAuditLog.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          resourceType: r.resourceType,
          resourceId: r.resourceId,
          actorUserId: r.actorUserId,
          previousValue: r.previousValue,
          newValue: r.newValue,
          reason: r.reason,
          createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
        })),
        page,
        pageSize,
        total,
      };
    });
  }

  // ---------- Items ----------

  async listItems(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const q = asString(query.q);
    const categoryId = asOptionalString(query.categoryId);
    const status = asOptionalString(query.status);
    const inventoryType = asOptionalString(query.inventoryType);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyItems.tenantId, tenantId),
        isNull(industrialSupplyItems.archivedAt),
      ];
      if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
      if (status) filters.push(eq(industrialSupplyItems.status, status));
      if (inventoryType) filters.push(eq(industrialSupplyItems.inventoryType, inventoryType));
      if (q) {
        const like = `%${q}%`;
        filters.push(
          or(
            ilike(industrialSupplyItems.name, like),
            ilike(industrialSupplyItems.sku, like),
            ilike(industrialSupplyItems.itemNumber, like),
            ilike(industrialSupplyItems.barcode, like),
          )!,
        );
      }
      const where = and(...filters);

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyItems)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyItems)
        .where(where)
        .orderBy(asc(industrialSupplyItems.name))
        .limit(pageSize)
        .offset(offset);

      return {
        items: rows.map(serializeItem),
        page,
        pageSize,
        total: countRow?.count ?? 0,
      };
    });
  }

  async getItem(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const item = await this.requireItem(tx, tenantId, id);
      const variants = await tx
        .select()
        .from(industrialSupplyItemVariants)
        .where(
          and(
            eq(industrialSupplyItemVariants.tenantId, tenantId),
            eq(industrialSupplyItemVariants.itemId, id),
            isNull(industrialSupplyItemVariants.archivedAt),
          ),
        )
        .orderBy(asc(industrialSupplyItemVariants.sortOrder));
      const inventory = await tx
        .select()
        .from(industrialSupplyLocationInventory)
        .where(
          and(
            eq(industrialSupplyLocationInventory.tenantId, tenantId),
            eq(industrialSupplyLocationInventory.itemId, id),
          ),
        );
      return {
        ...serializeItem(item),
        variants,
        inventory,
      };
    });
  }

  async createItem(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Item name is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const itemNumber =
        asOptionalString(body.itemNumber) ??
        (await this.nextNumber(tx, tenantId, "SSI", industrialSupplyItems));

      const [row] = await tx
        .insert(industrialSupplyItems)
        .values({
          id: createId(),
          tenantId,
          itemNumber,
          sku: asOptionalString(body.sku),
          internalItemNumber: asOptionalString(body.internalItemNumber),
          name,
          shortName: asOptionalString(body.shortName),
          description: asOptionalString(body.description),
          categoryId: asOptionalString(body.categoryId),
          subcategoryId: asOptionalString(body.subcategoryId),
          manufacturer: asOptionalString(body.manufacturer),
          manufacturerPartNumber: asOptionalString(body.manufacturerPartNumber),
          brand: asOptionalString(body.brand),
          model: asOptionalString(body.model),
          inventoryType: asString(body.inventoryType, "CONSUMABLE") || "CONSUMABLE",
          unitOfMeasure: asString(body.unitOfMeasure, "EA") || "EA",
          packageQuantity: asQtyString(body.packageQuantity, "1"),
          status: asString(body.status, "ACTIVE") || "ACTIVE",
          minimumQuantity: asQtyString(body.minimumQuantity, "0"),
          maximumQuantity: body.maximumQuantity != null ? asQtyString(body.maximumQuantity) : null,
          reorderPoint: asQtyString(body.reorderPoint, "0"),
          reorderQuantity: asQtyString(body.reorderQuantity, "0"),
          safetyStock: asQtyString(body.safetyStock, "0"),
          leadTimeDays: asInt(body.leadTimeDays, 0),
          primaryLocationId: asOptionalString(body.primaryLocationId),
          primaryVendorId: asOptionalString(body.primaryVendorId),
          lastPurchaseCost:
            body.lastPurchaseCost != null ? asQtyString(body.lastPurchaseCost) : null,
          averageUnitCost: body.averageUnitCost != null ? asQtyString(body.averageUnitCost) : null,
          standardCost: body.standardCost != null ? asQtyString(body.standardCost) : null,
          packageCost: body.packageCost != null ? asQtyString(body.packageCost) : null,
          glAccount: asOptionalString(body.glAccount),
          costCenter: asOptionalString(body.costCenter),
          oshaRelevant: asBool(body.oshaRelevant, false),
          ppeCategory: asOptionalString(body.ppeCategory),
          ansiStandard: asOptionalString(body.ansiStandard),
          astmStandard: asOptionalString(body.astmStandard),
          nioshApproval: asOptionalString(body.nioshApproval),
          nfpaStandard: asOptionalString(body.nfpaStandard),
          manufacturerCertification: asOptionalString(body.manufacturerCertification),
          inspectionRequired: asBool(body.inspectionRequired, false),
          inspectionFrequencyDays:
            body.inspectionFrequencyDays != null ? asInt(body.inspectionFrequencyDays, 0) : null,
          expirationTrackingRequired: asBool(body.expirationTrackingRequired, false),
          shelfLifeDays: body.shelfLifeDays != null ? asInt(body.shelfLifeDays, 0) : null,
          lotTrackingRequired: asBool(body.lotTrackingRequired, false),
          serialTrackingRequired: asBool(body.serialTrackingRequired, false),
          employeeAssignmentRequired: asBool(body.employeeAssignmentRequired, false),
          trainingRequiredBeforeIssue: asBool(body.trainingRequiredBeforeIssue, false),
          requiredTrainingCodes: Array.isArray(body.requiredTrainingCodes)
            ? body.requiredTrainingCodes
            : [],
          barcode: asOptionalString(body.barcode),
          upc: asOptionalString(body.upc),
          createdBy: principal.userId,
          updatedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const mapped = serializeItem(row!);
      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_item",
        resourceId: row!.id,
        newValue: mapped,
      });
      return mapped;
    });
  }

  async updateItem(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.requireItem(tx, tenantId, id);
      const now = new Date();
      const patch: Record<string, unknown> = { updatedAt: now, updatedBy: principal.userId };

      const strFields = [
        "sku",
        "internalItemNumber",
        "name",
        "shortName",
        "description",
        "categoryId",
        "subcategoryId",
        "manufacturer",
        "manufacturerPartNumber",
        "brand",
        "model",
        "inventoryType",
        "unitOfMeasure",
        "status",
        "primaryLocationId",
        "primaryVendorId",
        "glAccount",
        "costCenter",
        "ppeCategory",
        "ansiStandard",
        "astmStandard",
        "nioshApproval",
        "nfpaStandard",
        "manufacturerCertification",
        "barcode",
        "upc",
      ] as const;
      for (const key of strFields) {
        if (body[key] !== undefined) {
          patch[key] = body[key] === null ? null : asString(body[key]) || null;
        }
      }
      if (body.name !== undefined && !asString(body.name)) {
        throw new ForgeError("VALIDATION_FAILED", "Item name is required");
      }
      if (body.name !== undefined) patch.name = asString(body.name);

      const qtyFields = [
        "packageQuantity",
        "minimumQuantity",
        "maximumQuantity",
        "reorderPoint",
        "reorderQuantity",
        "safetyStock",
        "lastPurchaseCost",
        "averageUnitCost",
        "standardCost",
        "packageCost",
      ] as const;
      for (const key of qtyFields) {
        if (body[key] !== undefined) {
          patch[key] = body[key] === null || body[key] === "" ? null : asQtyString(body[key]);
        }
      }

      const boolFields = [
        "oshaRelevant",
        "inspectionRequired",
        "expirationTrackingRequired",
        "lotTrackingRequired",
        "serialTrackingRequired",
        "employeeAssignmentRequired",
        "trainingRequiredBeforeIssue",
      ] as const;
      for (const key of boolFields) {
        if (body[key] !== undefined) patch[key] = asBool(body[key], false);
      }
      if (body.leadTimeDays !== undefined) patch.leadTimeDays = asInt(body.leadTimeDays, 0);
      if (body.inspectionFrequencyDays !== undefined) {
        patch.inspectionFrequencyDays =
          body.inspectionFrequencyDays === null ? null : asInt(body.inspectionFrequencyDays, 0);
      }
      if (body.shelfLifeDays !== undefined) {
        patch.shelfLifeDays = body.shelfLifeDays === null ? null : asInt(body.shelfLifeDays, 0);
      }
      if (body.archived === true) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Use the delete endpoint to archive safety supply items.",
        );
      }

      const [row] = await tx
        .update(industrialSupplyItems)
        .set(patch)
        .where(eq(industrialSupplyItems.id, id))
        .returning();

      const mapped = serializeItem(row!);
      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "UPDATE",
        resourceType: "supply_item",
        resourceId: id,
        previousValue: serializeItem(existing),
        newValue: mapped,
      });
      return mapped;
    });
  }

  /**
   * Soft-delete a supply item. Restricted to Tenant Admin and Forge Creator.
   */
  async archiveItem(principal: ForgePrincipal, id: string) {
    if (
      !canDeleteSupplyItems({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      throw new ForgeError(
        "FORBIDDEN",
        "Only an Admin or Creator can delete safety supply items.",
      );
    }

    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.requireItem(tx, tenantId, id);
      const now = new Date();
      const [row] = await tx
        .update(industrialSupplyItems)
        .set({
          archivedAt: now,
          status: "INACTIVE",
          updatedAt: now,
          updatedBy: principal.userId ?? null,
        })
        .where(eq(industrialSupplyItems.id, id))
        .returning();

      const mapped = serializeItem(row!);
      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "DELETE",
        resourceType: "supply_item",
        resourceId: id,
        previousValue: serializeItem(existing),
        newValue: mapped,
        reason: "Archived by Admin or Creator",
      });
      return mapped;
    });
  }

  // ---------- Locations ----------

  async listLocations(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const q = asString(query.q);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyLocations.tenantId, tenantId),
        isNull(industrialSupplyLocations.archivedAt),
      ];
      if (status) filters.push(eq(industrialSupplyLocations.status, status));
      if (q) {
        const like = `%${q}%`;
        filters.push(
          or(
            ilike(industrialSupplyLocations.name, like),
            ilike(industrialSupplyLocations.code, like),
          )!,
        );
      }
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLocations)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyLocations)
        .where(where)
        .orderBy(asc(industrialSupplyLocations.name))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async createLocation(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    const code = asString(body.code || name)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Location name is required");
    if (!code) throw new ForgeError("VALIDATION_FAILED", "Location code is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyLocations)
        .values({
          id: createId(),
          tenantId,
          parentId: asOptionalString(body.parentId),
          siteId: asOptionalString(body.siteId),
          locationType: asString(body.locationType, "SUPPLY_ROOM") || "SUPPLY_ROOM",
          code,
          name,
          description: asOptionalString(body.description),
          custodianPersonnelId: asOptionalString(body.custodianPersonnelId),
          status: asString(body.status, "ACTIVE") || "ACTIVE",
          path: asOptionalString(body.path),
          createdBy: principal.userId,
          updatedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_location",
        resourceId: row!.id,
        newValue: { id: row!.id, code: row!.code, name: row!.name },
      });
      return row!;
    });
  }

  /**
   * Update a supply location. Restricted to Tenant Admin and Forge Creator.
   */
  async updateLocation(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    if (
      !canManageSupplyLocations({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      throw new ForgeError(
        "FORBIDDEN",
        "Only an Admin or Creator can edit safety supply locations.",
      );
    }

    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.requireLocation(tx, tenantId, id);
      const now = new Date();
      const patch: Record<string, unknown> = {
        updatedAt: now,
        updatedBy: principal.userId ?? null,
      };

      if (body.name !== undefined) {
        const name = asString(body.name);
        if (!name) throw new ForgeError("VALIDATION_FAILED", "Location name is required");
        patch.name = name;
      }
      if (body.code !== undefined) {
        const code = asString(body.code)
          .toUpperCase()
          .replace(/[^A-Z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64);
        if (!code) throw new ForgeError("VALIDATION_FAILED", "Location code is required");
        patch.code = code;
      }
      if (body.locationType !== undefined) {
        patch.locationType =
          asString(body.locationType, existing.locationType) || existing.locationType;
      }
      if (body.status !== undefined) {
        patch.status = asString(body.status, existing.status) || existing.status;
      }
      if (body.description !== undefined) {
        patch.description = body.description === null ? null : asOptionalString(body.description);
      }
      if (body.siteId !== undefined) {
        patch.siteId =
          body.siteId === null || body.siteId === "" ? null : asOptionalString(body.siteId);
      }
      if (body.parentId !== undefined) {
        patch.parentId =
          body.parentId === null || body.parentId === "" ? null : asOptionalString(body.parentId);
      }
      if (body.custodianPersonnelId !== undefined) {
        patch.custodianPersonnelId =
          body.custodianPersonnelId === null || body.custodianPersonnelId === ""
            ? null
            : asOptionalString(body.custodianPersonnelId);
      }
      if (body.path !== undefined) {
        patch.path = body.path === null ? null : asOptionalString(body.path);
      }

      const [row] = await tx
        .update(industrialSupplyLocations)
        .set(patch)
        .where(
          and(
            eq(industrialSupplyLocations.id, id),
            eq(industrialSupplyLocations.tenantId, tenantId),
            isNull(industrialSupplyLocations.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Supply location not found");

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "UPDATE",
        resourceType: "supply_location",
        resourceId: id,
        previousValue: {
          id: existing.id,
          code: existing.code,
          name: existing.name,
          locationType: existing.locationType,
          siteId: existing.siteId,
          status: existing.status,
        },
        newValue: {
          id: row.id,
          code: row.code,
          name: row.name,
          locationType: row.locationType,
          siteId: row.siteId,
          status: row.status,
        },
      });
      return row;
    });
  }

  /**
   * Soft-delete a supply location. Restricted to Tenant Admin and Forge Creator.
   */
  async archiveLocation(principal: ForgePrincipal, id: string) {
    if (
      !canManageSupplyLocations({
        isPlatformAdmin: principal.isPlatformAdmin,
        activeProducts: principal.activeProducts,
        permissions: principal.permissions,
      })
    ) {
      throw new ForgeError(
        "FORBIDDEN",
        "Only an Admin or Creator can delete safety supply locations.",
      );
    }

    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.requireLocation(tx, tenantId, id);
      const now = new Date();
      const [row] = await tx
        .update(industrialSupplyLocations)
        .set({
          archivedAt: now,
          status: "INACTIVE",
          updatedAt: now,
          updatedBy: principal.userId ?? null,
        })
        .where(
          and(
            eq(industrialSupplyLocations.id, id),
            eq(industrialSupplyLocations.tenantId, tenantId),
            isNull(industrialSupplyLocations.archivedAt),
          ),
        )
        .returning();
      if (!row) throw new ForgeError("NOT_FOUND", "Supply location not found");

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "DELETE",
        resourceType: "supply_location",
        resourceId: id,
        previousValue: {
          id: existing.id,
          code: existing.code,
          name: existing.name,
          status: existing.status,
        },
        newValue: {
          id: row.id,
          code: row.code,
          name: row.name,
          status: row.status,
          archivedAt: row.archivedAt,
        },
        reason: "Archived by Admin or Creator",
      });
      return row;
    });
  }

  async listInventory(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const itemId = asOptionalString(query.itemId);
    const locationId = asOptionalString(query.locationId);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [eq(industrialSupplyLocationInventory.tenantId, tenantId)];
      if (itemId) filters.push(eq(industrialSupplyLocationInventory.itemId, itemId));
      if (locationId) filters.push(eq(industrialSupplyLocationInventory.locationId, locationId));
      const where = and(...filters);

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLocationInventory)
        .where(where);
      const rows = await tx
        .select({
          inventory: industrialSupplyLocationInventory,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
          locationName: industrialSupplyLocations.name,
          locationCode: industrialSupplyLocations.code,
        })
        .from(industrialSupplyLocationInventory)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
        )
        .innerJoin(
          industrialSupplyLocations,
          eq(industrialSupplyLocations.id, industrialSupplyLocationInventory.locationId),
        )
        .where(where)
        .orderBy(asc(industrialSupplyItems.name))
        .limit(pageSize)
        .offset(offset);

      return {
        items: rows.map((r) => ({
          ...r.inventory,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
          locationName: r.locationName,
          locationCode: r.locationCode,
        })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
      };
    });
  }

  async listVariants(principal: ForgePrincipal, itemId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      const rows = await tx
        .select()
        .from(industrialSupplyItemVariants)
        .where(
          and(
            eq(industrialSupplyItemVariants.tenantId, tenantId),
            eq(industrialSupplyItemVariants.itemId, itemId),
            isNull(industrialSupplyItemVariants.archivedAt),
          ),
        )
        .orderBy(asc(industrialSupplyItemVariants.sortOrder));
      return { items: rows };
    });
  }

  async createVariant(principal: ForgePrincipal, itemId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    const variantCode = asString(body.variantCode || body.sizeLabel || name)
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "-")
      .slice(0, 64);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Variant name is required");
    if (!variantCode) throw new ForgeError("VALIDATION_FAILED", "Variant code is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyItemVariants)
        .values({
          id: createId(),
          tenantId,
          itemId,
          variantCode,
          name,
          sizeLabel: asOptionalString(body.sizeLabel),
          sku: asOptionalString(body.sku),
          barcode: asOptionalString(body.barcode),
          status: asString(body.status, "ACTIVE") || "ACTIVE",
          sortOrder: asInt(body.sortOrder, 0),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row!;
    });
  }

  // ---------- Inventory ops ----------

  async receive(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    const quantity = this.num(body.quantity);
    if (!itemId || !locationId) {
      throw new ForgeError("VALIDATION_FAILED", "Item and location are required");
    }
    if (!(quantity > 0)) {
      throw new ForgeError("VALIDATION_FAILED", "Receive quantity must be greater than zero");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const item = await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, locationId);
      const variantId = asOptionalString(body.variantId);
      const unitCost =
        body.unitCost != null ? asQtyString(body.unitCost) : (item.averageUnitCost ?? null);
      const now = new Date();
      let lotId: string | null = null;
      let serialId: string | null = null;

      const lotNumber = asOptionalString(body.lotNumber);
      if (lotNumber) {
        const [lot] = await tx
          .insert(industrialSupplyLots)
          .values({
            id: createId(),
            tenantId,
            itemId,
            variantId,
            locationId,
            lotNumber,
            manufacturerLot: asOptionalString(body.manufacturerLot),
            quantity: asQtyString(quantity),
            dateReceived: todayIso(),
            expirationDate: asOptionalDate(body.expirationDate),
            purchaseOrderId: asOptionalString(body.purchaseOrderId),
            status: "CURRENT",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        lotId = lot!.id;
      }

      const mfrSerial = asOptionalString(body.manufacturerSerialNumber);
      if (mfrSerial || item.serialTrackingRequired) {
        const assetNumber = await this.nextNumber(tx, tenantId, "FAS", industrialSupplySerials);
        const [serial] = await tx
          .insert(industrialSupplySerials)
          .values({
            id: createId(),
            tenantId,
            itemId,
            variantId,
            locationId,
            forgeAssetNumber: assetNumber,
            manufacturerSerialNumber: mfrSerial,
            purchaseDate: todayIso(),
            cost: unitCost,
            condition: "GOOD",
            inspectionStatus: "CURRENT",
            status: "AVAILABLE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        serialId = serial!.id;
      }

      const result = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId,
        delta: quantity,
        transactionType: "RECEIVE",
        principal,
        lotId,
        serialId,
        unitCost,
        reason: asOptionalString(body.reason) ?? asOptionalString(body.source),
        relatedPoId: asOptionalString(body.purchaseOrderId),
      });

      const purchaseOrderId = asOptionalString(body.purchaseOrderId);
      if (purchaseOrderId) {
        const poItems = await tx
          .select()
          .from(industrialSupplyPurchaseOrderItems)
          .where(
            and(
              eq(industrialSupplyPurchaseOrderItems.tenantId, tenantId),
              eq(industrialSupplyPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
              eq(industrialSupplyPurchaseOrderItems.itemId, itemId),
            ),
          )
          .limit(1);
        if (poItems[0]) {
          const received = this.num(poItems[0].quantityReceived) + quantity;
          await tx
            .update(industrialSupplyPurchaseOrderItems)
            .set({
              quantityReceived: asQtyString(received),
              updatedAt: now,
            })
            .where(eq(industrialSupplyPurchaseOrderItems.id, poItems[0].id));

          const allLines = await tx
            .select()
            .from(industrialSupplyPurchaseOrderItems)
            .where(
              and(
                eq(industrialSupplyPurchaseOrderItems.tenantId, tenantId),
                eq(industrialSupplyPurchaseOrderItems.purchaseOrderId, purchaseOrderId),
              ),
            );
          const allReceived = allLines.every(
            (l) => this.num(l.quantityReceived) >= this.num(l.quantityOrdered),
          );
          const anyReceived = allLines.some((l) => this.num(l.quantityReceived) > 0);
          await tx
            .update(industrialSupplyPurchaseOrders)
            .set({
              status: allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : "ORDERED",
              updatedAt: now,
            })
            .where(eq(industrialSupplyPurchaseOrders.id, purchaseOrderId));
        }

        await tx.insert(industrialSupplyReceipts).values({
          id: createId(),
          tenantId,
          receiptNumber: await this.nextNumber(tx, tenantId, "RCT", industrialSupplyReceipts),
          purchaseOrderId,
          locationId,
          receivedBy: principal.userId,
          source: asOptionalString(body.source),
          notes: asOptionalString(body.reason),
          createdAt: now,
        });
      }

      if (unitCost != null) {
        await tx
          .update(industrialSupplyItems)
          .set({
            lastPurchaseCost: unitCost,
            averageUnitCost: unitCost,
            updatedAt: now,
          })
          .where(eq(industrialSupplyItems.id, itemId));
      }

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "RECEIVE",
        resourceType: "supply_item",
        resourceId: itemId,
        newValue: {
          quantity,
          locationId,
          lotId,
          serialId,
          transactionId: result.transaction.id,
        },
      });

      return {
        transactionId: result.transaction.id,
        lotId,
        serialId,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
      };
    });
  }

  async issue(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    const quantity = this.num(body.quantity);
    const acknowledgment = parseRecipientAcknowledgment(body);
    if (!itemId || !locationId) {
      throw new ForgeError("VALIDATION_FAILED", "Item and location are required");
    }
    if (!(quantity > 0)) {
      throw new ForgeError("VALIDATION_FAILED", "Issue quantity must be greater than zero");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const item = await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, locationId);
      const variantId = asOptionalString(body.variantId);
      const now = new Date();
      let lotId = asOptionalString(body.lotId);
      const serialId = asOptionalString(body.serialId);

      if (serialId) {
        const [serial] = await tx
          .select()
          .from(industrialSupplySerials)
          .where(
            and(
              eq(industrialSupplySerials.id, serialId),
              eq(industrialSupplySerials.tenantId, tenantId),
              isNull(industrialSupplySerials.archivedAt),
            ),
          )
          .limit(1);
        if (!serial) throw new ForgeError("NOT_FOUND", "Serial not found");
        if (!["AVAILABLE", "IN_STOCK"].includes(serial.status)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `This serial cannot be issued because its status is ${serial.status}.`,
          );
        }
        await tx
          .update(industrialSupplySerials)
          .set({
            status: "ISSUED",
            assignedPersonnelId: asOptionalString(body.personnelId),
            locationId: null,
            updatedAt: now,
          })
          .where(eq(industrialSupplySerials.id, serialId));
      }

      if (!lotId && item.expirationTrackingRequired) {
        const today = todayIso();
        const [fefo] = await tx
          .select()
          .from(industrialSupplyLots)
          .where(
            and(
              eq(industrialSupplyLots.tenantId, tenantId),
              eq(industrialSupplyLots.itemId, itemId),
              eq(industrialSupplyLots.locationId, locationId),
              eq(industrialSupplyLots.status, "CURRENT"),
              isNull(industrialSupplyLots.archivedAt),
              sql`${industrialSupplyLots.quantity} > 0`,
              or(
                isNull(industrialSupplyLots.expirationDate),
                gte(industrialSupplyLots.expirationDate, today),
              ),
              variantId
                ? eq(industrialSupplyLots.variantId, variantId)
                : isNull(industrialSupplyLots.variantId),
            ),
          )
          .orderBy(asc(industrialSupplyLots.expirationDate))
          .limit(1);
        if (fefo) lotId = fefo.id;
      }

      if (lotId) {
        const [lot] = await tx
          .select()
          .from(industrialSupplyLots)
          .where(
            and(
              eq(industrialSupplyLots.id, lotId),
              eq(industrialSupplyLots.tenantId, tenantId),
              isNull(industrialSupplyLots.archivedAt),
            ),
          )
          .for("update")
          .limit(1);
        if (!lot) throw new ForgeError("NOT_FOUND", "Lot not found");
        if (lot.status === "EXPIRED" || lot.status === "QUARANTINED") {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `This lot cannot be issued because its status is ${lot.status}.`,
          );
        }
        if (lot.expirationDate && lot.expirationDate < todayIso()) {
          throw new ForgeError("VALIDATION_FAILED", "This lot is expired and cannot be issued.");
        }
        const lotQty = this.num(lot.quantity);
        if (lotQty < quantity) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `Insufficient stock in lot. Available quantity is ${lotQty.toFixed(4)}.`,
          );
        }
        const remaining = lotQty - quantity;
        await tx
          .update(industrialSupplyLots)
          .set({
            quantity: asQtyString(remaining),
            status: remaining <= 0 ? "DEPLETED" : lot.status,
            updatedAt: now,
          })
          .where(eq(industrialSupplyLots.id, lotId));
      }

      const result = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId,
        delta: -quantity,
        transactionType: "ISSUE",
        principal,
        lotId,
        serialId,
        personnelId: asOptionalString(body.personnelId),
        departmentId: asOptionalString(body.departmentId),
        reason: asOptionalString(body.reason),
        recipientPrintedName: acknowledgment.recipientPrintedName,
        recipientSignatureDataUrl: acknowledgment.recipientSignatureDataUrl,
        recipientSignedAt: acknowledgment.recipientSignedAt,
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "ISSUE",
        resourceType: "supply_item",
        resourceId: itemId,
        newValue: {
          quantity,
          locationId,
          lotId,
          serialId,
          transactionId: result.transaction.id,
          recipientPrintedName: acknowledgment.recipientPrintedName,
        },
        reason: asOptionalString(body.reason),
      });

      return {
        transactionId: result.transaction.id,
        lotId,
        serialId,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
      };
    });
  }

  async returnSupply(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    const quantity = this.num(body.quantity);
    if (!itemId || !locationId) {
      throw new ForgeError("VALIDATION_FAILED", "Item and location are required");
    }
    if (!(quantity > 0)) {
      throw new ForgeError("VALIDATION_FAILED", "Return quantity must be greater than zero");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, locationId);
      const variantId = asOptionalString(body.variantId);
      const serialId = asOptionalString(body.serialId);
      const lotId = asOptionalString(body.lotId);
      const now = new Date();

      if (serialId) {
        await tx
          .update(industrialSupplySerials)
          .set({
            status: "AVAILABLE",
            condition: asString(body.condition, "GOOD") || "GOOD",
            assignedPersonnelId: null,
            locationId,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialSupplySerials.id, serialId),
              eq(industrialSupplySerials.tenantId, tenantId),
            ),
          );
      }

      if (lotId) {
        const [lot] = await tx
          .select()
          .from(industrialSupplyLots)
          .where(
            and(eq(industrialSupplyLots.id, lotId), eq(industrialSupplyLots.tenantId, tenantId)),
          )
          .for("update")
          .limit(1);
        if (lot) {
          await tx
            .update(industrialSupplyLots)
            .set({
              quantity: asQtyString(this.num(lot.quantity) + quantity),
              status: "CURRENT",
              locationId,
              updatedAt: now,
            })
            .where(eq(industrialSupplyLots.id, lotId));
        }
      }

      const result = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId,
        delta: quantity,
        transactionType: "RETURN",
        principal,
        lotId,
        serialId,
        personnelId: asOptionalString(body.personnelId),
        reason: asOptionalString(body.reason),
      });

      return {
        transactionId: result.transaction.id,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
      };
    });
  }

  async transfer(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const sourceLocationId = asString(body.sourceLocationId);
    const destinationLocationId = asString(body.destinationLocationId);
    const itemId = asString(body.itemId);
    const quantity = this.num(body.quantity);
    if (!sourceLocationId || !destinationLocationId || !itemId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Source location, destination location, and item are required",
      );
    }
    if (sourceLocationId === destinationLocationId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Source and destination locations must be different",
      );
    }
    if (!(quantity > 0)) {
      throw new ForgeError("VALIDATION_FAILED", "Transfer quantity must be greater than zero");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, sourceLocationId);
      await this.requireLocation(tx, tenantId, destinationLocationId);
      const variantId = asOptionalString(body.variantId);
      const lotId = asOptionalString(body.lotId);
      const serialId = asOptionalString(body.serialId);
      const departmentId = asOptionalString(body.departmentId);
      const now = new Date();

      const transferNumber = await this.nextNumber(tx, tenantId, "TRF", industrialSupplyTransfers);
      const [transferRow] = await tx
        .insert(industrialSupplyTransfers)
        .values({
          id: createId(),
          tenantId,
          transferNumber,
          sourceLocationId,
          destinationLocationId,
          status: "COMPLETED",
          notes: asOptionalString(body.notes),
          createdBy: principal.userId,
          receivedBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(industrialSupplyTransferItems).values({
        id: createId(),
        tenantId,
        transferId: transferRow!.id,
        itemId,
        variantId,
        lotId,
        serialId,
        quantity: asQtyString(quantity),
        createdAt: now,
      });

      if (lotId) {
        await tx
          .update(industrialSupplyLots)
          .set({ locationId: destinationLocationId, updatedAt: now })
          .where(and(eq(industrialSupplyLots.id, lotId), eq(industrialSupplyLots.tenantId, tenantId)));
      }
      if (serialId) {
        await tx
          .update(industrialSupplySerials)
          .set({ locationId: destinationLocationId, updatedAt: now })
          .where(
            and(
              eq(industrialSupplySerials.id, serialId),
              eq(industrialSupplySerials.tenantId, tenantId),
            ),
          );
      }

      const outTxn = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId: sourceLocationId,
        delta: -quantity,
        transactionType: "TRANSFER_OUT",
        principal,
        lotId,
        serialId,
        departmentId,
        sourceLocationId,
        destinationLocationId,
        relatedTransferId: transferRow!.id,
        reason: asOptionalString(body.notes),
      });

      const inTxn = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId: destinationLocationId,
        delta: quantity,
        transactionType: "TRANSFER_IN",
        principal,
        lotId,
        serialId,
        departmentId,
        sourceLocationId,
        destinationLocationId,
        relatedTransferId: transferRow!.id,
        reason: asOptionalString(body.notes),
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "TRANSFER",
        resourceType: "supply_transfer",
        resourceId: transferRow!.id,
        newValue: {
          transferNumber,
          itemId,
          quantity,
          sourceLocationId,
          destinationLocationId,
        },
      });

      return {
        transfer: transferRow!,
        outTransactionId: outTxn.transaction.id,
        inTransactionId: inTxn.transaction.id,
      };
    });
  }

  async adjust(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    const reason = asString(body.reason);
    if (!itemId || !locationId) {
      throw new ForgeError("VALIDATION_FAILED", "Item and location are required");
    }
    if (!reason) throw new ForgeError("VALIDATION_FAILED", "Adjustment reason is required");
    if (body.newQuantity === undefined || body.newQuantity === null) {
      throw new ForgeError("VALIDATION_FAILED", "New quantity is required");
    }
    const newQuantity = this.num(body.newQuantity);
    if (newQuantity < 0) {
      throw new ForgeError("VALIDATION_FAILED", "New quantity cannot be negative");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, locationId);
      const variantId = asOptionalString(body.variantId);
      const inv = await this.getOrCreateInventoryRow(
        tx,
        tenantId,
        itemId,
        locationId,
        variantId,
      );
      const delta = newQuantity - this.num(inv.quantityOnHand);

      const result = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId,
        delta,
        transactionType: "ADJUST",
        principal,
        reason,
        relatedCountId: asOptionalString(body.countId),
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "ADJUST",
        resourceType: "supply_item",
        resourceId: itemId,
        previousValue: { quantityOnHand: result.previousQuantity },
        newValue: { quantityOnHand: result.newQuantity },
        reason,
      });

      return {
        transactionId: result.transaction.id,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        delta,
      };
    });
  }

  // ---------- PPE ----------

  async listAssignments(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const personnelId = asOptionalString(query.personnelId);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [eq(industrialSupplyEmployeeAssignments.tenantId, tenantId)];
      if (personnelId) {
        filters.push(eq(industrialSupplyEmployeeAssignments.personnelId, personnelId));
      }
      if (status) filters.push(eq(industrialSupplyEmployeeAssignments.status, status));
      const where = and(...filters);

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyEmployeeAssignments)
        .where(where);
      const rows = await tx
        .select({
          assignment: industrialSupplyEmployeeAssignments,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
        })
        .from(industrialSupplyEmployeeAssignments)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyEmployeeAssignments.itemId),
        )
        .where(where)
        .orderBy(desc(industrialSupplyEmployeeAssignments.issueDate))
        .limit(pageSize)
        .offset(offset);

      return {
        items: rows.map((r) => ({ ...r.assignment, itemName: r.itemName, itemNumber: r.itemNumber })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
      };
    });
  }

  async issuePpe(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const personnelId = asString(body.personnelId);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    const quantity = this.num(body.quantity || 1);
    const acknowledgment = parseRecipientAcknowledgment(body);
    if (!personnelId || !itemId || !locationId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Personnel, item, and location are required to issue PPE",
      );
    }
    if (!(quantity > 0)) {
      throw new ForgeError("VALIDATION_FAILED", "Issue quantity must be greater than zero");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      await this.requireLocation(tx, tenantId, locationId);
      const variantId = asOptionalString(body.variantId);
      const serialId = asOptionalString(body.serialId);
      const lotId = asOptionalString(body.lotId);
      const now = new Date();

      const issueResult = await this.applyQtyChange(tx, {
        tenantId,
        itemId,
        variantId,
        locationId,
        delta: -quantity,
        transactionType: "PPE_ISSUE",
        principal,
        lotId,
        serialId,
        personnelId,
        departmentId: asOptionalString(body.departmentId),
        reason: asOptionalString(body.notes),
        recipientPrintedName: acknowledgment.recipientPrintedName,
        recipientSignatureDataUrl: acknowledgment.recipientSignatureDataUrl,
        recipientSignedAt: acknowledgment.recipientSignedAt,
      });

      if (serialId) {
        await tx
          .update(industrialSupplySerials)
          .set({
            status: "ASSIGNED",
            assignedPersonnelId: personnelId,
            locationId: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialSupplySerials.id, serialId),
              eq(industrialSupplySerials.tenantId, tenantId),
            ),
          );
      }

      const [assignment] = await tx
        .insert(industrialSupplyEmployeeAssignments)
        .values({
          id: createId(),
          tenantId,
          personnelId,
          itemId,
          variantId,
          serialId,
          lotId,
          quantity: asQtyString(quantity),
          sizeLabel: asOptionalString(body.sizeLabel),
          issueDate: todayIso(),
          issuedBy: principal.userId,
          condition: asString(body.condition, "GOOD") || "GOOD",
          replacementDueDate: asOptionalDate(body.replacementDueDate),
          expectedReturnDate: asOptionalDate(body.expectedReturnDate),
          notes: asOptionalString(body.notes),
          employeeAcknowledgedAt: acknowledgment.recipientSignedAt,
          status: "ASSIGNED",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "PPE_ISSUE",
        resourceType: "ppe_assignment",
        resourceId: assignment!.id,
        newValue: {
          personnelId,
          itemId,
          quantity,
          serialId,
          recipientPrintedName: acknowledgment.recipientPrintedName,
        },
      });

      return { assignment: assignment!, transactionId: issueResult.transaction.id };
    });
  }

  async returnPpe(
    principal: ForgePrincipal,
    assignmentId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const condition = asString(body.condition);
    const disposition = asString(body.disposition, "RETURN_TO_STOCK") || "RETURN_TO_STOCK";
    if (!condition) {
      throw new ForgeError("VALIDATION_FAILED", "Return condition is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialSupplyEmployeeAssignments)
        .where(
          and(
            eq(industrialSupplyEmployeeAssignments.id, assignmentId),
            eq(industrialSupplyEmployeeAssignments.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "PPE assignment not found");
      if (assignment.status !== "ASSIGNED") {
        throw new ForgeError("VALIDATION_FAILED", "This PPE assignment is not active");
      }

      const now = new Date();
      const locationId =
        asOptionalString(body.locationId) ??
        (
          await tx
            .select({ id: industrialSupplyItems.primaryLocationId })
            .from(industrialSupplyItems)
            .where(eq(industrialSupplyItems.id, assignment.itemId))
            .limit(1)
        )[0]?.id;

      let transactionId: string | null = null;
      if (disposition === "RETURN_TO_STOCK" && locationId) {
        const result = await this.applyQtyChange(tx, {
          tenantId,
          itemId: assignment.itemId,
          variantId: assignment.variantId,
          locationId,
          delta: this.num(assignment.quantity),
          transactionType: "PPE_RETURN",
          principal,
          lotId: assignment.lotId,
          serialId: assignment.serialId,
          personnelId: assignment.personnelId,
          reason: `PPE return: ${condition}`,
        });
        transactionId = result.transaction.id;
      }

      if (assignment.serialId) {
        const serialStatus =
          disposition === "SCRAP" || condition === "DAMAGED" || condition === "UNSAFE"
            ? "OUT_OF_SERVICE"
            : "AVAILABLE";
        await tx
          .update(industrialSupplySerials)
          .set({
            status: serialStatus,
            condition,
            assignedPersonnelId: null,
            locationId: disposition === "RETURN_TO_STOCK" ? locationId : null,
            updatedAt: now,
          })
          .where(eq(industrialSupplySerials.id, assignment.serialId));
      }

      const [updated] = await tx
        .update(industrialSupplyEmployeeAssignments)
        .set({
          status: "RETURNED",
          returnedAt: now,
          returnCondition: condition,
          returnDisposition: disposition,
          updatedAt: now,
        })
        .where(eq(industrialSupplyEmployeeAssignments.id, assignmentId))
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "PPE_RETURN",
        resourceType: "ppe_assignment",
        resourceId: assignmentId,
        newValue: { condition, disposition },
      });

      return { assignment: updated!, transactionId };
    });
  }

  // ---------- Counts ----------

  async listCounts(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyCounts.tenantId, tenantId),
        isNull(industrialSupplyCounts.archivedAt),
      ];
      if (status) filters.push(eq(industrialSupplyCounts.status, status));
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyCounts)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyCounts)
        .where(where)
        .orderBy(desc(industrialSupplyCounts.createdAt))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async createCount(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const settings = await this.loadSettingsRow(tx, tenantId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyCounts)
        .values({
          id: createId(),
          tenantId,
          countNumber: await this.nextNumber(tx, tenantId, "CNT", industrialSupplyCounts),
          countType: asString(body.countType, "CYCLE") || "CYCLE",
          locationId: asOptionalString(body.locationId),
          categoryId: asOptionalString(body.categoryId),
          blind: asBool(body.blind, settings?.requireBlindInventoryCount ?? false),
          status: "DRAFT",
          notes: asOptionalString(body.notes),
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row!;
    });
  }

  async recordCountItem(principal: ForgePrincipal, countId: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    const locationId = asString(body.locationId);
    if (!itemId || !locationId) {
      throw new ForgeError("VALIDATION_FAILED", "Item and location are required");
    }
    if (body.actualQuantity === undefined || body.actualQuantity === null) {
      throw new ForgeError("VALIDATION_FAILED", "Actual quantity is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [count] = await tx
        .select()
        .from(industrialSupplyCounts)
        .where(
          and(
            eq(industrialSupplyCounts.id, countId),
            eq(industrialSupplyCounts.tenantId, tenantId),
            isNull(industrialSupplyCounts.archivedAt),
          ),
        )
        .limit(1);
      if (!count) throw new ForgeError("NOT_FOUND", "Inventory count not found");
      if (!["DRAFT", "IN_PROGRESS"].includes(count.status)) {
        throw new ForgeError("VALIDATION_FAILED", "This count is no longer open for recording");
      }

      const variantId = asOptionalString(body.variantId);
      const inv = await this.getOrCreateInventoryRow(
        tx,
        tenantId,
        itemId,
        locationId,
        variantId,
      );
      const expected = this.num(inv.quantityOnHand);
      const actual = this.num(body.actualQuantity);
      const variance = actual - expected;
      const now = new Date();

      const existing = await tx
        .select()
        .from(industrialSupplyCountItems)
        .where(
          and(
            eq(industrialSupplyCountItems.tenantId, tenantId),
            eq(industrialSupplyCountItems.countId, countId),
            eq(industrialSupplyCountItems.itemId, itemId),
            eq(industrialSupplyCountItems.locationId, locationId),
            variantId
              ? eq(industrialSupplyCountItems.variantId, variantId)
              : isNull(industrialSupplyCountItems.variantId),
          ),
        )
        .limit(1);

      let row;
      if (existing[0]) {
        [row] = await tx
          .update(industrialSupplyCountItems)
          .set({
            expectedQuantity: asQtyString(expected),
            actualQuantity: asQtyString(actual),
            variance: asQtyString(variance),
            notes: asOptionalString(body.notes),
            updatedAt: now,
          })
          .where(eq(industrialSupplyCountItems.id, existing[0].id))
          .returning();
      } else {
        [row] = await tx
          .insert(industrialSupplyCountItems)
          .values({
            id: createId(),
            tenantId,
            countId,
            itemId,
            variantId,
            locationId,
            expectedQuantity: asQtyString(expected),
            actualQuantity: asQtyString(actual),
            variance: asQtyString(variance),
            notes: asOptionalString(body.notes),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
      }

      if (count.status === "DRAFT") {
        await tx
          .update(industrialSupplyCounts)
          .set({ status: "IN_PROGRESS", updatedAt: now })
          .where(eq(industrialSupplyCounts.id, countId));
      }

      return row!;
    });
  }

  async submitCount(principal: ForgePrincipal, countId: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [count] = await tx
        .select()
        .from(industrialSupplyCounts)
        .where(
          and(
            eq(industrialSupplyCounts.id, countId),
            eq(industrialSupplyCounts.tenantId, tenantId),
            isNull(industrialSupplyCounts.archivedAt),
          ),
        )
        .limit(1);
      if (!count) throw new ForgeError("NOT_FOUND", "Inventory count not found");

      const settings = await this.loadSettingsRow(tx, tenantId);
      const approved = asBool(body.approved, !settings?.requireAdjustmentApproval);
      const now = new Date();

      const lines = await tx
        .select()
        .from(industrialSupplyCountItems)
        .where(
          and(
            eq(industrialSupplyCountItems.tenantId, tenantId),
            eq(industrialSupplyCountItems.countId, countId),
          ),
        );

      if (approved) {
        for (const line of lines) {
          if (line.actualQuantity == null) continue;
          const actual = this.num(line.actualQuantity);
          const expected = this.num(line.expectedQuantity);
          if (actual === expected) continue;
          await this.applyQtyChange(tx, {
            tenantId,
            itemId: line.itemId,
            variantId: line.variantId,
            locationId: line.locationId,
            delta: actual - expected,
            transactionType: "ADJUST",
            principal,
            reason: `Inventory count ${count.countNumber}`,
            relatedCountId: countId,
          });
        }
      }

      const [updated] = await tx
        .update(industrialSupplyCounts)
        .set({
          status: approved ? "COMPLETED" : "PENDING_APPROVAL",
          submittedBy: principal.userId,
          submittedAt: now,
          approvedBy: approved ? principal.userId : null,
          approvedAt: approved ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialSupplyCounts.id, countId))
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: approved ? "COUNT_COMPLETE" : "COUNT_SUBMIT",
        resourceType: "supply_count",
        resourceId: countId,
        newValue: { status: updated!.status, lineCount: lines.length },
      });

      return updated!;
    });
  }

  // ---------- Lots / expiry ----------

  async listLots(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const itemId = asOptionalString(query.itemId);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyLots.tenantId, tenantId),
        isNull(industrialSupplyLots.archivedAt),
      ];
      if (itemId) filters.push(eq(industrialSupplyLots.itemId, itemId));
      if (status) filters.push(eq(industrialSupplyLots.status, status));
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLots)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyLots)
        .where(where)
        .orderBy(asc(industrialSupplyLots.expirationDate))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async listExpiring(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const days = Math.max(1, asInt(query.days, 30));
    const { page, pageSize, offset } = pageParams(query);
    const today = todayIso();
    const end = new Date();
    end.setDate(end.getDate() + days);
    const endIso = end.toISOString().slice(0, 10);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const where = and(
        eq(industrialSupplyLots.tenantId, tenantId),
        isNull(industrialSupplyLots.archivedAt),
        eq(industrialSupplyLots.status, "CURRENT"),
        sql`${industrialSupplyLots.expirationDate} is not null`,
        gte(industrialSupplyLots.expirationDate, today),
        lte(industrialSupplyLots.expirationDate, endIso),
      );
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyLots)
        .where(where);
      const rows = await tx
        .select({
          lot: industrialSupplyLots,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
        })
        .from(industrialSupplyLots)
        .innerJoin(industrialSupplyItems, eq(industrialSupplyItems.id, industrialSupplyLots.itemId))
        .where(where)
        .orderBy(asc(industrialSupplyLots.expirationDate))
        .limit(pageSize)
        .offset(offset);
      return {
        items: rows.map((r) => ({
          ...r.lot,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
        })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
        days,
      };
    });
  }

  // ---------- Inspections ----------

  async createInspection(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const itemId = asString(body.itemId);
    if (!itemId) throw new ForgeError("VALIDATION_FAILED", "Item is required");
    const result = asString(body.result, "PASS") || "PASS";

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireItem(tx, tenantId, itemId);
      const serialId = asOptionalString(body.serialId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyInspections)
        .values({
          id: createId(),
          tenantId,
          serialId,
          itemId,
          inspectionType: asString(body.inspectionType, "PERIODIC") || "PERIODIC",
          inspectorUserId: principal.userId,
          inspectorPersonnelId: asOptionalString(body.inspectorPersonnelId),
          inspectionDate: asOptionalDate(body.inspectionDate) ?? todayIso(),
          condition: asOptionalString(body.condition),
          result,
          deficiencies: asOptionalString(body.deficiencies),
          correctiveAction: asOptionalString(body.correctiveAction),
          nextInspectionDate: asOptionalDate(body.nextInspectionDate),
          photosJson: Array.isArray(body.photosJson) ? body.photosJson : [],
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (serialId) {
        const serialPatch: Record<string, unknown> = {
          lastInspectionAt: now,
          inspectionStatus: result === "FAIL" ? "FAILED" : "CURRENT",
          condition: asOptionalString(body.condition) ?? undefined,
          updatedAt: now,
        };
        if (result === "FAIL") serialPatch.status = "OUT_OF_SERVICE";
        if (body.nextInspectionDate) {
          const next = asOptionalDate(body.nextInspectionDate);
          if (next) serialPatch.nextInspectionAt = new Date(`${next}T12:00:00.000Z`);
        }
        await tx
          .update(industrialSupplySerials)
          .set(serialPatch)
          .where(
            and(
              eq(industrialSupplySerials.id, serialId),
              eq(industrialSupplySerials.tenantId, tenantId),
            ),
          );
      }

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "INSPECT",
        resourceType: "supply_inspection",
        resourceId: row!.id,
        newValue: { itemId, serialId, result },
      });

      return row!;
    });
  }

  // ---------- Requests ----------

  async listRequests(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyRequests.tenantId, tenantId),
        isNull(industrialSupplyRequests.archivedAt),
      ];
      if (status) filters.push(eq(industrialSupplyRequests.status, status));
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyRequests)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(where)
        .orderBy(desc(industrialSupplyRequests.createdAt))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async createRequest(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "At least one request line is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [req] = await tx
        .insert(industrialSupplyRequests)
        .values({
          id: createId(),
          tenantId,
          requestNumber: await this.nextSupplyRequestNumber(tx, tenantId),
          siteId: asOptionalString(body.siteId),
          source: asString(body.source, "ADMIN_CREATED") || "ADMIN_CREATED",
          priority: asString(body.priority, "ROUTINE") || "ROUTINE",
          personnelId: asOptionalString(body.personnelId),
          departmentId: asOptionalString(body.departmentId),
          locationId: asOptionalString(body.locationId),
          neededBy: asOptionalDate(body.neededBy),
          reason: asOptionalString(body.reason),
          notes: asOptionalString(body.notes),
          status: "SUBMITTED",
          submittedAt: now,
          createdBy: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const raw of items) {
        const line = (raw ?? {}) as Record<string, unknown>;
        const itemId = asString(line.itemId);
        const qty = this.num(line.quantity ?? line.quantityRequested);
        if (!itemId || !(qty > 0)) continue;
        await this.requireItem(tx, tenantId, itemId);
        await tx.insert(industrialSupplyRequestItems).values({
          id: createId(),
          tenantId,
          requestId: req!.id,
          itemId,
          variantId: asOptionalString(line.variantId),
          quantityRequested: asQtyString(qty),
          quantityApproved: "0",
          quantityReserved: "0",
          quantityIssued: "0",
          createdAt: now,
        });
      }

      await this.writeRequestEvent(tx, {
        tenantId,
        requestId: req!.id,
        eventType: "REQUEST_CREATED",
        newStatus: "SUBMITTED",
        userId: principal.userId,
        personnelId: req!.personnelId,
        metadata: {
          source: req!.source,
          siteId: req!.siteId,
          priority: req!.priority,
        },
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_request",
        resourceId: req!.id,
        newValue: { requestNumber: req!.requestNumber },
      });

      return req!;
    }, principal.userId).then(async (req) => {
      if (principal.userId) {
        await this.notifyRequestEvent({
          tenantId,
          requestId: req.id,
          requestNumber: req.requestNumber,
          type:
            req.priority === "URGENT"
              ? "industrial.supplies.request_urgent"
              : "industrial.supplies.request_submitted",
          title:
            req.priority === "URGENT"
              ? "URGENT Safety Supply Request"
              : "New Safety Supply Request",
          body: `${req.requestNumber} was submitted.`,
          userIds: [principal.userId],
          priority: req.priority === "URGENT" ? "HIGH" : "NORMAL",
        });
      }
      return req;
    });
  }

  async getRequest(principal: ForgePrincipal, requestId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");

      const items = await tx
        .select({
          id: industrialSupplyRequestItems.id,
          requestId: industrialSupplyRequestItems.requestId,
          itemId: industrialSupplyRequestItems.itemId,
          itemName: industrialSupplyItems.name,
          variantId: industrialSupplyRequestItems.variantId,
          quantityRequested: industrialSupplyRequestItems.quantityRequested,
          quantityApproved: industrialSupplyRequestItems.quantityApproved,
          quantityReserved: industrialSupplyRequestItems.quantityReserved,
          quantityIssued: industrialSupplyRequestItems.quantityIssued,
          quantityBackordered: industrialSupplyRequestItems.quantityBackordered,
          status: industrialSupplyRequestItems.status,
          customItem: industrialSupplyRequestItems.customItem,
          customItemName: industrialSupplyRequestItems.customItemName,
          customItemDescription: industrialSupplyRequestItems.customItemDescription,
          denialReason: industrialSupplyRequestItems.denialReason,
          notes: industrialSupplyRequestItems.notes,
          backorderReason: industrialSupplyRequestItems.backorderReason,
          expectedAvailabilityDate: industrialSupplyRequestItems.expectedAvailabilityDate,
          createdAt: industrialSupplyRequestItems.createdAt,
          updatedAt: industrialSupplyRequestItems.updatedAt,
        })
        .from(industrialSupplyRequestItems)
        .leftJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyRequestItems.itemId),
        )
        .where(
          and(
            eq(industrialSupplyRequestItems.tenantId, tenantId),
            eq(industrialSupplyRequestItems.requestId, requestId),
          ),
        )
        .orderBy(asc(industrialSupplyRequestItems.createdAt));
      const events = await tx
        .select()
        .from(industrialSupplyRequestEvents)
        .where(
          and(
            eq(industrialSupplyRequestEvents.tenantId, tenantId),
            eq(industrialSupplyRequestEvents.requestId, requestId),
          ),
        )
        .orderBy(asc(industrialSupplyRequestEvents.createdAt));
      return { ...request, items, events };
    }, principal.userId);
  }

  async beginReview(principal: ForgePrincipal, requestId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      if (!["SUBMITTED", "PENDING"].includes(request.status)) {
        throw new ForgeError("VALIDATION_FAILED", "Only submitted requests can begin review");
      }
      const now = new Date();
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({ status: "UNDER_REVIEW", reviewStartedAt: now, updatedAt: now })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REVIEW_STARTED",
        previousStatus: request.status,
        newStatus: "UNDER_REVIEW",
        userId: principal.userId,
      });
      return updated!;
    }, principal.userId);
  }

  async denyRequest(
    principal: ForgePrincipal,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const denialReason = asOptionalString(body.denialReason ?? body.reason);
    if (!denialReason) throw new ForgeError("VALIDATION_FAILED", "Denial reason is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      const now = new Date();
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({ status: "DENIED", denialReason, deniedAt: now, updatedAt: now })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_DENIED",
        previousStatus: request.status,
        newStatus: "DENIED",
        userId: principal.userId,
        metadata: { denialReason },
      });
      return updated!;
    }, principal.userId).then(async (updated) => {
      await this.notifyRequestEvent({
        tenantId,
        requestId: updated.id,
        requestNumber: updated.requestNumber,
        type: "industrial.supplies.request_denied",
        title: "Safety supply request denied",
        body: `${updated.requestNumber} was denied.`,
        userIds: [updated.assignedUserId, principal.userId].filter(
          (id): id is string => Boolean(id),
        ),
      });
      return updated;
    });
  }

  async assignRequest(
    principal: ForgePrincipal,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const assignedUserId = asOptionalString(body.assignedUserId ?? body.userId);
    if (!assignedUserId) {
      throw new ForgeError("VALIDATION_FAILED", "Assigned user is required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({ assignedUserId, updatedAt: new Date() })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_ASSIGNED",
        previousStatus: request.status,
        newStatus: request.status,
        userId: principal.userId,
        metadata: { assignedUserId, previousAssignedUserId: request.assignedUserId },
      });
      return updated!;
    }, principal.userId).then(async (updated) => {
      await this.notifyRequestEvent({
        tenantId,
        requestId: updated.id,
        requestNumber: updated.requestNumber,
        type: "industrial.supplies.request_assigned",
        title: "Safety supply request assigned",
        body: `${updated.requestNumber} was assigned to you.`,
        userIds: [assignedUserId],
      });
      return updated;
    });
  }

  async backorderRequest(
    principal: ForgePrincipal,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      const now = new Date();
      const lineUpdates = Array.isArray(body.items) ? body.items : [];
      for (const raw of lineUpdates) {
        const line = (raw ?? {}) as Record<string, unknown>;
        const lineId = asString(line.id ?? line.requestItemId);
        if (!lineId) continue;
        const quantityBackordered = this.num(line.quantityBackordered ?? line.quantity);
        await tx
          .update(industrialSupplyRequestItems)
          .set({
            quantityBackordered: asQtyString(quantityBackordered),
            status: "BACKORDERED",
            backorderReason: asOptionalString(line.backorderReason ?? line.reason),
            expectedAvailabilityDate: asOptionalDate(line.expectedAvailabilityDate),
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialSupplyRequestItems.id, lineId),
              eq(industrialSupplyRequestItems.tenantId, tenantId),
              eq(industrialSupplyRequestItems.requestId, requestId),
            ),
          );
      }
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({
          status: "BACKORDERED",
          internalNotes:
            body.internalNotes === undefined
              ? request.internalNotes
              : asOptionalString(body.internalNotes),
          employeeMessage:
            body.employeeMessage === undefined
              ? request.employeeMessage
              : asOptionalString(body.employeeMessage),
          updatedAt: now,
        })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_BACKORDERED",
        previousStatus: request.status,
        newStatus: "BACKORDERED",
        userId: principal.userId,
        metadata: { lineCount: lineUpdates.length },
      });
      return updated!;
    }, principal.userId);
  }

  async markReady(principal: ForgePrincipal, requestId: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      if (!["APPROVED", "PARTIALLY_APPROVED"].includes(request.status)) {
        throw new ForgeError("VALIDATION_FAILED", "Only approved requests can be marked ready");
      }
      const now = new Date();
      const employeeMessage = asOptionalString(body.employeeMessage);
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({
          status: "READY_FOR_PICKUP",
          readyAt: now,
          updatedAt: now,
          ...(employeeMessage != null ? { employeeMessage } : {}),
        })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_READY",
        previousStatus: request.status,
        newStatus: "READY_FOR_PICKUP",
        userId: principal.userId,
      });
      return updated!;
    }, principal.userId).then(async (updated) => {
      const recipients = [updated.assignedUserId, principal.userId].filter(
        (id): id is string => Boolean(id),
      );
      await this.notifyRequestEvent({
        tenantId,
        requestId: updated.id,
        requestNumber: updated.requestNumber,
        type: "industrial.supplies.request_ready",
        title: "Safety supplies ready for pickup",
        body: `${updated.requestNumber} is ready for pickup.`,
        userIds: [...new Set(recipients)],
      });
      return updated;
    });
  }

  async cancelRequest(
    principal: ForgePrincipal,
    requestId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const reason = asOptionalString(body.reason ?? body.cancellationReason);
    if (!reason) throw new ForgeError("VALIDATION_FAILED", "Cancellation reason is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [request] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!request) throw new ForgeError("NOT_FOUND", "Supply request not found");
      const now = new Date();
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({
          status: "CANCELLED",
          cancelledAt: now,
          internalNotes: request.internalNotes
            ? `${request.internalNotes}\nCancellation: ${reason}`
            : `Cancellation: ${reason}`,
          updatedAt: now,
        })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();
      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_CANCELLED",
        previousStatus: request.status,
        newStatus: "CANCELLED",
        userId: principal.userId,
        metadata: { reason },
      });
      return updated!;
    }, principal.userId);
  }

  async approveRequest(principal: ForgePrincipal, requestId: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [req] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!req) throw new ForgeError("NOT_FOUND", "Supply request not found");
      if (!["SUBMITTED", "PENDING", "UNDER_REVIEW"].includes(req.status)) {
        throw new ForgeError("VALIDATION_FAILED", "Only submitted requests can be approved");
      }

      const locationId = asOptionalString(body.locationId) ?? req.locationId;
      if (!locationId) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "A fulfill-from location is required to reserve stock",
        );
      }
      await this.requireLocation(tx, tenantId, locationId);

      const lines = await tx
        .select()
        .from(industrialSupplyRequestItems)
        .where(
          and(
            eq(industrialSupplyRequestItems.tenantId, tenantId),
            eq(industrialSupplyRequestItems.requestId, requestId),
          ),
        );

      const now = new Date();
      const requestedLineUpdates = Array.isArray(body.items)
        ? (body.items as Array<Record<string, unknown>>)
        : [];
      for (const line of lines) {
        const requestedUpdate = requestedLineUpdates.find((candidate) => {
          const candidateId = asString(candidate.id ?? candidate.requestItemId);
          const candidateItemId = asString(candidate.itemId);
          return candidateId === line.id || (!!candidateItemId && candidateItemId === line.itemId);
        });
        const qty = requestedUpdate
          ? this.num(requestedUpdate.quantityApproved ?? requestedUpdate.quantity)
          : this.num(line.quantityRequested);
        if (qty < 0 || qty > this.num(line.quantityRequested)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Approved quantity must be between zero and the requested quantity",
          );
        }
        if (!line.itemId) {
          await tx
            .update(industrialSupplyRequestItems)
            .set({
              quantityApproved: asQtyString(qty),
              status: qty > 0 ? "APPROVED" : "DENIED",
              updatedAt: now,
            })
            .where(eq(industrialSupplyRequestItems.id, line.id));
          continue;
        }
        if (!(qty > 0)) {
          await tx
            .update(industrialSupplyRequestItems)
            .set({ quantityApproved: "0", status: "DENIED", updatedAt: now })
            .where(eq(industrialSupplyRequestItems.id, line.id));
          continue;
        }
        const inv = await this.getOrCreateInventoryRow(
          tx,
          tenantId,
          line.itemId,
          locationId,
          line.variantId,
        );
        const available = this.num(inv.quantityAvailable);
        if (available < qty) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `Insufficient stock to reserve. Available quantity is ${available.toFixed(4)}.`,
          );
        }
        const newReserved = this.num(inv.quantityReserved) + qty;
        const newAvailable = this.num(inv.quantityOnHand) - newReserved;
        await tx
          .update(industrialSupplyLocationInventory)
          .set({
            quantityReserved: asQtyString(newReserved),
            quantityAvailable: asQtyString(newAvailable),
            updatedAt: now,
          })
          .where(eq(industrialSupplyLocationInventory.id, inv.id));

        await tx.insert(industrialSupplyTransactions).values({
          id: createId(),
          tenantId,
          itemId: line.itemId,
          variantId: line.variantId,
          transactionType: "RESERVE",
          quantity: asQtyString(qty),
          previousQuantity: asQtyString(inv.quantityOnHand),
          newQuantity: asQtyString(inv.quantityOnHand),
          sourceLocationId: locationId,
          relatedRequestId: requestId,
          reason: `Reserve for request ${req.requestNumber}`,
          performedBy: principal.userId,
          createdAt: now,
        });

        await tx
          .update(industrialSupplyRequestItems)
          .set({
            quantityApproved: asQtyString(qty),
            quantityReserved: asQtyString(qty),
            status: "APPROVED",
            updatedAt: now,
          })
          .where(eq(industrialSupplyRequestItems.id, line.id));
      }

      const newStatus = asBool(body.partial, false) ? "PARTIALLY_APPROVED" : "APPROVED";
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({
          status: newStatus,
          locationId,
          approvedBy: principal.userId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();

      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_APPROVED",
        previousStatus: req.status,
        newStatus,
        userId: principal.userId,
        metadata: { partial: newStatus === "PARTIALLY_APPROVED" },
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "APPROVE",
        resourceType: "supply_request",
        resourceId: requestId,
      });

      return updated!;
    }, principal.userId).then(async (updated) => {
      await this.notifyRequestEvent({
        tenantId,
        requestId: updated.id,
        requestNumber: updated.requestNumber,
        type: "industrial.supplies.request_approved",
        title: "Safety supply request approved",
        body: `${updated.requestNumber} was approved.`,
        userIds: [updated.assignedUserId, principal.userId].filter(
          (id): id is string => Boolean(id),
        ),
      });
      return updated;
    });
  }

  async fulfillRequest(principal: ForgePrincipal, requestId: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [req] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.id, requestId),
            eq(industrialSupplyRequests.tenantId, tenantId),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!req) throw new ForgeError("NOT_FOUND", "Supply request not found");
      if (!["APPROVED", "PARTIALLY_APPROVED", "READY_FOR_PICKUP"].includes(req.status)) {
        throw new ForgeError("VALIDATION_FAILED", "Only approved requests can be fulfilled");
      }
      const locationId = asOptionalString(body.locationId) ?? req.locationId;
      if (!locationId) {
        throw new ForgeError("VALIDATION_FAILED", "A location is required to fulfill the request");
      }

      const lines = await tx
        .select()
        .from(industrialSupplyRequestItems)
        .where(
          and(
            eq(industrialSupplyRequestItems.tenantId, tenantId),
            eq(industrialSupplyRequestItems.requestId, requestId),
          ),
        );

      const now = new Date();
      const requestedLineUpdates = Array.isArray(body.items)
        ? (body.items as Array<Record<string, unknown>>)
        : [];
      for (const line of lines) {
        const requestedUpdate = requestedLineUpdates.find((candidate) => {
          const candidateId = asString(candidate.id ?? candidate.requestItemId);
          const candidateItemId = asString(candidate.itemId);
          return candidateId === line.id || (!!candidateItemId && candidateItemId === line.itemId);
        });
        const reserved = this.num(line.quantityReserved);
        const qty = requestedUpdate
          ? this.num(requestedUpdate.quantityIssued ?? requestedUpdate.quantity)
          : reserved || this.num(line.quantityApproved) || this.num(line.quantityRequested);
        if (!(qty > 0)) continue;
        if (!line.itemId) {
          await tx
            .update(industrialSupplyRequestItems)
            .set({
              quantityIssued: asQtyString(qty),
              status: "FULFILLED",
              updatedAt: now,
            })
            .where(eq(industrialSupplyRequestItems.id, line.id));
          continue;
        }
        if (reserved > 0 && qty > reserved) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Issued quantity cannot exceed the reserved quantity",
          );
        }
        await this.applyQtyChange(tx, {
          tenantId,
          itemId: line.itemId,
          variantId: line.variantId,
          locationId,
          delta: -qty,
          reservedDelta: -Math.min(reserved, qty),
          transactionType: "ISSUE",
          principal,
          personnelId: req.personnelId,
          relatedRequestId: requestId,
          reason: `Fulfill request ${req.requestNumber} [SAFETY_SUPPLY_REQUEST_ISSUE]`,
        });
        await tx
          .update(industrialSupplyRequestItems)
          .set({
            quantityIssued: asQtyString(this.num(line.quantityIssued) + qty),
            quantityReserved: asQtyString(Math.max(0, reserved - qty)),
            status: asBool(body.partial, false) ? "PARTIALLY_FULFILLED" : "FULFILLED",
            updatedAt: now,
          })
          .where(eq(industrialSupplyRequestItems.id, line.id));
      }

      const newStatus = asBool(body.partial, false) ? "PARTIALLY_FULFILLED" : "FULFILLED";
      const [updated] = await tx
        .update(industrialSupplyRequests)
        .set({ status: newStatus, fulfilledAt: now, updatedAt: now })
        .where(eq(industrialSupplyRequests.id, requestId))
        .returning();

      await this.writeRequestEvent(tx, {
        tenantId,
        requestId,
        eventType: "REQUEST_FULFILLED",
        previousStatus: req.status,
        newStatus,
        userId: principal.userId,
        metadata: { partial: newStatus === "PARTIALLY_FULFILLED" },
      });

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "FULFILL",
        resourceType: "supply_request",
        resourceId: requestId,
      });

      return updated!;
    }, principal.userId).then(async (updated) => {
      await this.notifyRequestEvent({
        tenantId,
        requestId: updated.id,
        requestNumber: updated.requestNumber,
        type: "industrial.supplies.request_fulfilled",
        title: "Safety supply request fulfilled",
        body: `${updated.requestNumber} was fulfilled.`,
        userIds: [updated.assignedUserId, principal.userId].filter(
          (id): id is string => Boolean(id),
        ),
      });
      return updated;
    });
  }

  // ---------- Vendors / PO ----------

  async listVendors(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const q = asString(query.q);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyVendors.tenantId, tenantId),
        isNull(industrialSupplyVendors.archivedAt),
      ];
      if (q) {
        const like = `%${q}%`;
        filters.push(
          or(ilike(industrialSupplyVendors.name, like), ilike(industrialSupplyVendors.vendorNumber, like))!,
        );
      }
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyVendors)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyVendors)
        .where(where)
        .orderBy(asc(industrialSupplyVendors.name))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async createVendor(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Vendor name is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialSupplyVendors)
        .values({
          id: createId(),
          tenantId,
          vendorNumber:
            asOptionalString(body.vendorNumber) ??
            (await this.nextNumber(tx, tenantId, "VEN", industrialSupplyVendors)),
          name,
          accountNumber: asOptionalString(body.accountNumber),
          address: asOptionalString(body.address),
          salesRepName: asOptionalString(body.salesRepName),
          phone: asOptionalString(body.phone),
          email: asOptionalString(body.email),
          website: asOptionalString(body.website),
          paymentTerms: asOptionalString(body.paymentTerms),
          shippingTerms: asOptionalString(body.shippingTerms),
          notes: asOptionalString(body.notes),
          status: asString(body.status, "ACTIVE") || "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_vendor",
        resourceId: row!.id,
        newValue: { name: row!.name, vendorNumber: row!.vendorNumber },
      });
      return row!;
    });
  }

  async listPurchaseOrders(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const status = asOptionalString(query.status);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [
        eq(industrialSupplyPurchaseOrders.tenantId, tenantId),
        isNull(industrialSupplyPurchaseOrders.archivedAt),
      ];
      if (status) filters.push(eq(industrialSupplyPurchaseOrders.status, status));
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyPurchaseOrders)
        .where(where);
      const rows = await tx
        .select({
          po: industrialSupplyPurchaseOrders,
          vendorName: industrialSupplyVendors.name,
        })
        .from(industrialSupplyPurchaseOrders)
        .innerJoin(
          industrialSupplyVendors,
          eq(industrialSupplyVendors.id, industrialSupplyPurchaseOrders.vendorId),
        )
        .where(where)
        .orderBy(desc(industrialSupplyPurchaseOrders.createdAt))
        .limit(pageSize)
        .offset(offset);
      return {
        items: rows.map((r) => ({ ...r.po, vendorName: r.vendorName })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
      };
    });
  }

  async createPurchaseOrder(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const vendorId = asString(body.vendorId);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!vendorId) throw new ForgeError("VALIDATION_FAILED", "Vendor is required");
    if (items.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "At least one purchase order line is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [vendor] = await tx
        .select()
        .from(industrialSupplyVendors)
        .where(
          and(
            eq(industrialSupplyVendors.id, vendorId),
            eq(industrialSupplyVendors.tenantId, tenantId),
            isNull(industrialSupplyVendors.archivedAt),
          ),
        )
        .limit(1);
      if (!vendor) throw new ForgeError("NOT_FOUND", "Vendor not found");

      const now = new Date();
      let subtotal = 0;
      const lineValues: Array<{
        itemId: string;
        variantId: string | null;
        quantityOrdered: string;
        unitPrice: string;
        lineTotal: string;
      }> = [];

      for (const raw of items) {
        const line = (raw ?? {}) as Record<string, unknown>;
        const itemId = asString(line.itemId);
        const qty = this.num(line.quantity ?? line.quantityOrdered);
        const unitPrice = this.num(line.unitPrice);
        if (!itemId || !(qty > 0)) continue;
        await this.requireItem(tx, tenantId, itemId);
        const lineTotal = qty * unitPrice;
        subtotal += lineTotal;
        lineValues.push({
          itemId,
          variantId: asOptionalString(line.variantId),
          quantityOrdered: asQtyString(qty),
          unitPrice: asQtyString(unitPrice),
          lineTotal: asOptionalNumber(lineTotal) ?? "0.00",
        });
      }
      if (lineValues.length === 0) {
        throw new ForgeError("VALIDATION_FAILED", "At least one valid purchase order line is required");
      }

      const taxAmount = this.num(body.taxAmount);
      const shippingAmount = this.num(body.shippingAmount);
      const total = subtotal + taxAmount + shippingAmount;

      const [po] = await tx
        .insert(industrialSupplyPurchaseOrders)
        .values({
          id: createId(),
          tenantId,
          poNumber: await this.nextNumber(tx, tenantId, "PO", industrialSupplyPurchaseOrders),
          vendorId,
          orderDate: asOptionalDate(body.orderDate) ?? todayIso(),
          requestedBy: principal.userId,
          siteId: asOptionalString(body.siteId),
          shipToLocationId: asOptionalString(body.shipToLocationId),
          subtotal: asOptionalNumber(subtotal) ?? "0.00",
          taxAmount: asOptionalNumber(taxAmount) ?? "0.00",
          shippingAmount: asOptionalNumber(shippingAmount) ?? "0.00",
          total: asOptionalNumber(total) ?? "0.00",
          expectedDelivery: asOptionalDate(body.expectedDelivery),
          notes: asOptionalString(body.notes),
          status: asString(body.status, "DRAFT") || "DRAFT",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const line of lineValues) {
        await tx.insert(industrialSupplyPurchaseOrderItems).values({
          id: createId(),
          tenantId,
          purchaseOrderId: po!.id,
          itemId: line.itemId,
          variantId: line.variantId,
          quantityOrdered: line.quantityOrdered,
          quantityReceived: "0",
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          createdAt: now,
          updatedAt: now,
        });
      }

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE",
        resourceType: "supply_po",
        resourceId: po!.id,
        newValue: { poNumber: po!.poNumber, total: po!.total },
      });

      return po!;
    });
  }

  async updatePurchaseOrderStatus(
    principal: ForgePrincipal,
    poId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const status = asString(body.status);
    if (!status) throw new ForgeError("VALIDATION_FAILED", "Status is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialSupplyPurchaseOrders)
        .where(
          and(
            eq(industrialSupplyPurchaseOrders.id, poId),
            eq(industrialSupplyPurchaseOrders.tenantId, tenantId),
            isNull(industrialSupplyPurchaseOrders.archivedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Purchase order not found");

      const now = new Date();
      const patch: Record<string, unknown> = { status, updatedAt: now };
      if (status === "APPROVED") {
        patch.approvedBy = principal.userId;
      }

      const [updated] = await tx
        .update(industrialSupplyPurchaseOrders)
        .set(patch)
        .where(eq(industrialSupplyPurchaseOrders.id, poId))
        .returning();

      await this.writeDomainAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "STATUS_CHANGE",
        resourceType: "supply_po",
        resourceId: poId,
        previousValue: { status: existing.status },
        newValue: { status },
      });

      return updated!;
    });
  }

  // ---------- Reorder ----------

  async listReorder(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          inventory: industrialSupplyLocationInventory,
          item: industrialSupplyItems,
          location: industrialSupplyLocations,
          rule: industrialSupplyReorderRules,
        })
        .from(industrialSupplyLocationInventory)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
        )
        .innerJoin(
          industrialSupplyLocations,
          eq(industrialSupplyLocations.id, industrialSupplyLocationInventory.locationId),
        )
        .leftJoin(
          industrialSupplyReorderRules,
          and(
            eq(industrialSupplyReorderRules.tenantId, tenantId),
            eq(industrialSupplyReorderRules.itemId, industrialSupplyLocationInventory.itemId),
            or(
              eq(
                industrialSupplyReorderRules.locationId,
                industrialSupplyLocationInventory.locationId,
              ),
              isNull(industrialSupplyReorderRules.locationId),
            ),
            eq(industrialSupplyReorderRules.active, true),
          ),
        )
        .where(
          and(
            eq(industrialSupplyLocationInventory.tenantId, tenantId),
            isNull(industrialSupplyItems.archivedAt),
            sql`${industrialSupplyLocationInventory.quantityAvailable} <= coalesce(${industrialSupplyLocationInventory.reorderPoint}, ${industrialSupplyReorderRules.reorderPoint}, ${industrialSupplyItems.reorderPoint}, 0)`,
          ),
        )
        .orderBy(asc(industrialSupplyItems.name));

      return {
        items: rows.map((r) => {
          const available = this.num(r.inventory.quantityAvailable);
          const reorderPoint = this.num(
            r.inventory.reorderPoint ?? r.rule?.reorderPoint ?? r.item.reorderPoint,
          );
          const reorderQty = this.num(r.rule?.reorderQuantity ?? r.item.reorderQuantity);
          const maxQty = this.num(
            r.inventory.maximumQuantity ?? r.rule?.maximumQuantity ?? r.item.maximumQuantity,
          );
          const suggested =
            reorderQty > 0
              ? reorderQty
              : maxQty > available
                ? maxQty - available
                : Math.max(reorderPoint - available, 0);
          return {
            itemId: r.item.id,
            itemNumber: r.item.itemNumber,
            itemName: r.item.name,
            locationId: r.location.id,
            locationCode: r.location.code,
            locationName: r.location.name,
            quantityAvailable: available,
            reorderPoint,
            suggestedOrderQuantity: suggested,
            preferredVendorId: r.rule?.preferredVendorId ?? r.item.primaryVendorId,
          };
        }),
      };
    });
  }

  // ---------- Kits ----------

  async listKits(principal: ForgePrincipal, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const where = and(
        eq(industrialSupplyKits.tenantId, tenantId),
        isNull(industrialSupplyKits.archivedAt),
      );
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyKits)
        .where(where);
      const rows = await tx
        .select()
        .from(industrialSupplyKits)
        .where(where)
        .orderBy(asc(industrialSupplyKits.name))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: countRow?.count ?? 0 };
    });
  }

  async createKit(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Kit name is required");
    const kitItems = Array.isArray(body.items) ? body.items : [];

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [kit] = await tx
        .insert(industrialSupplyKits)
        .values({
          id: createId(),
          tenantId,
          kitNumber:
            asOptionalString(body.kitNumber) ??
            (await this.nextNumber(tx, tenantId, "KIT", industrialSupplyKits)),
          name,
          kitType: asString(body.kitType, "FIRST_AID") || "FIRST_AID",
          locationId: asOptionalString(body.locationId),
          status: asString(body.status, "READY") || "READY",
          notes: asOptionalString(body.notes),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      for (const raw of kitItems) {
        const line = (raw ?? {}) as Record<string, unknown>;
        const itemId = asString(line.itemId);
        if (!itemId) continue;
        await this.requireItem(tx, tenantId, itemId);
        await tx.insert(industrialSupplyKitItems).values({
          id: createId(),
          tenantId,
          kitId: kit!.id,
          itemId,
          variantId: asOptionalString(line.variantId),
          expectedQuantity: asQtyString(line.expectedQuantity ?? line.quantity ?? 1, "1"),
          createdAt: now,
        });
      }

      return kit!;
    });
  }

  async getKit(principal: ForgePrincipal, kitId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [kit] = await tx
        .select()
        .from(industrialSupplyKits)
        .where(
          and(
            eq(industrialSupplyKits.id, kitId),
            eq(industrialSupplyKits.tenantId, tenantId),
            isNull(industrialSupplyKits.archivedAt),
          ),
        )
        .limit(1);
      if (!kit) throw new ForgeError("NOT_FOUND", "Kit not found");
      const items = await tx
        .select({
          kitItem: industrialSupplyKitItems,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
        })
        .from(industrialSupplyKitItems)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyKitItems.itemId),
        )
        .where(
          and(
            eq(industrialSupplyKitItems.tenantId, tenantId),
            eq(industrialSupplyKitItems.kitId, kitId),
          ),
        );
      return {
        ...kit,
        items: items.map((r) => ({
          ...r.kitItem,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
        })),
      };
    });
  }

  // ---------- Transactions ----------

  async listTransactions(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const itemId = asOptionalString(query.itemId);
    const transactionType = asOptionalString(query.transactionType);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const filters: SQL[] = [eq(industrialSupplyTransactions.tenantId, tenantId)];
      if (itemId) filters.push(eq(industrialSupplyTransactions.itemId, itemId));
      if (transactionType) {
        filters.push(eq(industrialSupplyTransactions.transactionType, transactionType));
      }
      const where = and(...filters);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyTransactions)
        .where(where);
      const rows = await tx
        .select({
          txn: industrialSupplyTransactions,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
        })
        .from(industrialSupplyTransactions)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
        )
        .where(where)
        .orderBy(desc(industrialSupplyTransactions.createdAt))
        .limit(pageSize)
        .offset(offset);
      return {
        items: rows.map((r) => ({
          ...r.txn,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
        })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
      };
    });
  }

  // ---------- Reports ----------

  async usageReport(principal: ForgePrincipal, query: ListQuery = {}) {
    const custom = await this.customReport(principal, {
      ...query,
      reportType: "usage",
      page: query.page ?? "1",
      pageSize: query.pageSize ?? "25",
    });
    const items = Array.isArray(custom.items) ? custom.items : [];
    const dateFrom = asOptionalDate(query.dateFrom);
    const dateTo = asOptionalDate(query.dateTo);
    // Preserve legacy shape when no custom date range is supplied.
    if (!dateFrom && !dateTo) {
      const now = new Date();
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 30);
      const d90 = new Date(now);
      d90.setDate(d90.getDate() - 90);
      const [last30, last90] = await Promise.all([
        this.customReport(principal, {
          ...query,
          reportType: "usage",
          dateFrom: d30.toISOString().slice(0, 10),
          dateTo: now.toISOString().slice(0, 10),
          page: "1",
          pageSize: "25",
        }),
        this.customReport(principal, {
          ...query,
          reportType: "usage",
          dateFrom: d90.toISOString().slice(0, 10),
          dateTo: now.toISOString().slice(0, 10),
          page: "1",
          pageSize: "25",
        }),
      ]);
      return {
        last30Days: last30.items,
        last90Days: last90.items,
        items,
        appliedFilters: custom.appliedFilters,
      };
    }
    return {
      last30Days: items,
      last90Days: items,
      items,
      appliedFilters: custom.appliedFilters,
    };
  }

  async customReport(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const reportType = (asOptionalString(query.reportType) ?? "transactions").toLowerCase();
    const { page, pageSize, offset } = reportPageParams(query);

    const dateFrom = parseReportDateStart(query.dateFrom);
    const dateTo = parseReportDateEnd(query.dateTo);
    const itemIds = asIdList(query.itemIds ?? query.itemId);
    const locationIds = asIdList(query.locationIds ?? query.locationId);
    const categoryId = asOptionalString(query.categoryId);
    const departmentId = asOptionalString(query.departmentId);
    const divisionName = asOptionalString(query.divisionName ?? query.division);
    const transactionType = asOptionalString(query.transactionType);
    const inventoryType = asOptionalString(query.inventoryType);
    const siteId = asOptionalString(query.siteId);
    const personnelId = asOptionalString(query.personnelId);
    const status = asOptionalString(query.status);
    const sourceLocationId = asOptionalString(query.sourceLocationId);
    const destinationLocationId = asOptionalString(query.destinationLocationId);
    const q = asOptionalString(query.q);
    const days = Math.max(1, asInt(query.days, 90));

    const appliedFilters = {
      reportType,
      dateFrom: asOptionalDate(query.dateFrom),
      dateTo: asOptionalDate(query.dateTo),
      itemIds,
      locationIds,
      categoryId,
      departmentId,
      divisionName,
      transactionType,
      inventoryType,
      siteId,
      personnelId,
      status,
      sourceLocationId,
      destinationLocationId,
      q,
      days: reportType === "expiring" ? days : undefined,
    };

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (reportType === "inventory") {
        const filters: SQL[] = [eq(industrialSupplyLocationInventory.tenantId, tenantId)];
        if (itemIds.length === 1) {
          filters.push(eq(industrialSupplyLocationInventory.itemId, itemIds[0]!));
        } else if (itemIds.length > 1) {
          filters.push(inArray(industrialSupplyLocationInventory.itemId, itemIds));
        }
        if (locationIds.length === 1) {
          filters.push(eq(industrialSupplyLocationInventory.locationId, locationIds[0]!));
        } else if (locationIds.length > 1) {
          filters.push(inArray(industrialSupplyLocationInventory.locationId, locationIds));
        }
        if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
        if (inventoryType) filters.push(eq(industrialSupplyItems.inventoryType, inventoryType));
        if (siteId) filters.push(eq(industrialSupplyLocations.siteId, siteId));
        if (q) {
          filters.push(
            or(
              ilike(industrialSupplyItems.name, `%${q}%`),
              ilike(industrialSupplyItems.itemNumber, `%${q}%`),
              ilike(industrialSupplyLocations.name, `%${q}%`),
              ilike(industrialSupplyLocations.code, `%${q}%`),
            )!,
          );
        }
        const where = and(...filters);
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyLocationInventory)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
          )
          .innerJoin(
            industrialSupplyLocations,
            eq(industrialSupplyLocations.id, industrialSupplyLocationInventory.locationId),
          )
          .where(where);
        const rows = await tx
          .select({
            inventory: industrialSupplyLocationInventory,
            itemName: industrialSupplyItems.name,
            itemNumber: industrialSupplyItems.itemNumber,
            inventoryType: industrialSupplyItems.inventoryType,
            categoryId: industrialSupplyItems.categoryId,
            categoryName: industrialSupplyCategories.name,
            locationName: industrialSupplyLocations.name,
            locationCode: industrialSupplyLocations.code,
            siteId: industrialSupplyLocations.siteId,
          })
          .from(industrialSupplyLocationInventory)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyLocationInventory.itemId),
          )
          .innerJoin(
            industrialSupplyLocations,
            eq(industrialSupplyLocations.id, industrialSupplyLocationInventory.locationId),
          )
          .leftJoin(
            industrialSupplyCategories,
            eq(industrialSupplyCategories.id, industrialSupplyItems.categoryId),
          )
          .where(where)
          .orderBy(asc(industrialSupplyItems.name), asc(industrialSupplyLocations.name))
          .limit(pageSize)
          .offset(offset);
        return {
          reportType: "inventory" as const,
          items: rows.map((r) => ({
            id: r.inventory.id,
            itemId: r.inventory.itemId,
            itemName: r.itemName,
            itemNumber: r.itemNumber,
            inventoryType: r.inventoryType,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
            locationId: r.inventory.locationId,
            locationName: r.locationName,
            locationCode: r.locationCode,
            siteId: r.siteId,
            quantityOnHand: r.inventory.quantityOnHand,
            quantityAvailable: r.inventory.quantityAvailable,
            quantityReserved: r.inventory.quantityReserved,
            reorderPoint: r.inventory.reorderPoint,
            minimumQuantity: r.inventory.minimumQuantity,
            averageUnitCost: r.inventory.averageUnitCost,
            lastTransactionAt: r.inventory.lastTransactionAt,
          })),
          page,
          pageSize,
          total: countRow?.count ?? 0,
          appliedFilters,
        };
      }

      if (reportType === "ppe") {
        const filters: SQL[] = [eq(industrialSupplyEmployeeAssignments.tenantId, tenantId)];
        if (itemIds.length === 1) {
          filters.push(eq(industrialSupplyEmployeeAssignments.itemId, itemIds[0]!));
        } else if (itemIds.length > 1) {
          filters.push(inArray(industrialSupplyEmployeeAssignments.itemId, itemIds));
        }
        if (personnelId) {
          filters.push(eq(industrialSupplyEmployeeAssignments.personnelId, personnelId));
        }
        if (status) filters.push(eq(industrialSupplyEmployeeAssignments.status, status));
        if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
        if (inventoryType) filters.push(eq(industrialSupplyItems.inventoryType, inventoryType));
        if (departmentId) filters.push(eq(industrialPersonnel.departmentId, departmentId));
        if (divisionName) {
          filters.push(
            or(
              ilike(industrialPersonnel.divisionName, divisionName),
              ilike(industrialDepartments.divisionName, divisionName),
            )!,
          );
        }
        if (dateFrom) {
          filters.push(gte(industrialSupplyEmployeeAssignments.issueDate, dateFrom.toISOString().slice(0, 10)));
        }
        if (dateTo) {
          filters.push(lte(industrialSupplyEmployeeAssignments.issueDate, dateTo.toISOString().slice(0, 10)));
        }
        if (q) {
          filters.push(
            or(
              ilike(industrialSupplyItems.name, `%${q}%`),
              ilike(industrialSupplyItems.itemNumber, `%${q}%`),
              ilike(industrialPersonnel.displayName, `%${q}%`),
            )!,
          );
        }
        const where = and(...filters);
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyEmployeeAssignments)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyEmployeeAssignments.itemId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialSupplyEmployeeAssignments.personnelId),
          )
          .leftJoin(
            industrialDepartments,
            eq(industrialDepartments.id, industrialPersonnel.departmentId),
          )
          .where(where);
        const rows = await tx
          .select({
            assignment: industrialSupplyEmployeeAssignments,
            itemName: industrialSupplyItems.name,
            itemNumber: industrialSupplyItems.itemNumber,
            categoryName: industrialSupplyCategories.name,
            personnelName: industrialPersonnel.displayName,
            employeeNumber: industrialPersonnel.employeeNumber,
            departmentId: industrialPersonnel.departmentId,
            departmentName: industrialDepartments.name,
            divisionName: sql<string | null>`coalesce(${industrialPersonnel.divisionName}, ${industrialDepartments.divisionName})`,
          })
          .from(industrialSupplyEmployeeAssignments)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyEmployeeAssignments.itemId),
          )
          .leftJoin(
            industrialSupplyCategories,
            eq(industrialSupplyCategories.id, industrialSupplyItems.categoryId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialSupplyEmployeeAssignments.personnelId),
          )
          .leftJoin(
            industrialDepartments,
            eq(industrialDepartments.id, industrialPersonnel.departmentId),
          )
          .where(where)
          .orderBy(desc(industrialSupplyEmployeeAssignments.issueDate))
          .limit(pageSize)
          .offset(offset);
        return {
          reportType: "ppe" as const,
          items: rows.map((r) => ({
            id: r.assignment.id,
            personnelId: r.assignment.personnelId,
            personnelName: r.personnelName,
            employeeNumber: r.employeeNumber,
            departmentId: r.departmentId,
            departmentName: r.departmentName,
            divisionName: r.divisionName,
            itemId: r.assignment.itemId,
            itemName: r.itemName,
            itemNumber: r.itemNumber,
            categoryName: r.categoryName,
            quantity: r.assignment.quantity,
            sizeLabel: r.assignment.sizeLabel,
            issueDate: r.assignment.issueDate,
            condition: r.assignment.condition,
            status: r.assignment.status,
            replacementDueDate: r.assignment.replacementDueDate,
            expectedReturnDate: r.assignment.expectedReturnDate,
            returnedAt: r.assignment.returnedAt,
            returnCondition: r.assignment.returnCondition,
            notes: r.assignment.notes,
          })),
          page,
          pageSize,
          total: countRow?.count ?? 0,
          appliedFilters,
        };
      }

      if (reportType === "expiring") {
        const today = todayIso();
        const end = new Date();
        end.setDate(end.getDate() + days);
        const endIso = end.toISOString().slice(0, 10);
        const filters: SQL[] = [
          eq(industrialSupplyLots.tenantId, tenantId),
          isNull(industrialSupplyLots.archivedAt),
          sql`${industrialSupplyLots.expirationDate} is not null`,
          gte(industrialSupplyLots.expirationDate, today),
          lte(industrialSupplyLots.expirationDate, endIso),
        ];
        if (status) filters.push(eq(industrialSupplyLots.status, status));
        else filters.push(eq(industrialSupplyLots.status, "CURRENT"));
        if (itemIds.length === 1) filters.push(eq(industrialSupplyLots.itemId, itemIds[0]!));
        else if (itemIds.length > 1) filters.push(inArray(industrialSupplyLots.itemId, itemIds));
        if (locationIds.length === 1) {
          filters.push(eq(industrialSupplyLots.locationId, locationIds[0]!));
        } else if (locationIds.length > 1) {
          filters.push(inArray(industrialSupplyLots.locationId, locationIds));
        }
        if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
        if (inventoryType) filters.push(eq(industrialSupplyItems.inventoryType, inventoryType));
        if (q) {
          filters.push(
            or(
              ilike(industrialSupplyItems.name, `%${q}%`),
              ilike(industrialSupplyItems.itemNumber, `%${q}%`),
              ilike(industrialSupplyLots.lotNumber, `%${q}%`),
            )!,
          );
        }
        const where = and(...filters);
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyLots)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyLots.itemId),
          )
          .where(where);
        const rows = await tx
          .select({
            lot: industrialSupplyLots,
            itemName: industrialSupplyItems.name,
            itemNumber: industrialSupplyItems.itemNumber,
            categoryName: industrialSupplyCategories.name,
            locationName: industrialSupplyLocations.name,
            locationCode: industrialSupplyLocations.code,
          })
          .from(industrialSupplyLots)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyLots.itemId),
          )
          .leftJoin(
            industrialSupplyCategories,
            eq(industrialSupplyCategories.id, industrialSupplyItems.categoryId),
          )
          .leftJoin(
            industrialSupplyLocations,
            eq(industrialSupplyLocations.id, industrialSupplyLots.locationId),
          )
          .where(where)
          .orderBy(asc(industrialSupplyLots.expirationDate))
          .limit(pageSize)
          .offset(offset);
        return {
          reportType: "expiring" as const,
          items: rows.map((r) => ({
            id: r.lot.id,
            itemId: r.lot.itemId,
            itemName: r.itemName,
            itemNumber: r.itemNumber,
            categoryName: r.categoryName,
            lotNumber: r.lot.lotNumber,
            quantity: r.lot.quantity,
            expirationDate: r.lot.expirationDate,
            dateReceived: r.lot.dateReceived,
            locationId: r.lot.locationId,
            locationName: r.locationName,
            locationCode: r.locationCode,
            status: r.lot.status,
          })),
          page,
          pageSize,
          total: countRow?.count ?? 0,
          appliedFilters,
        };
      }

      // usage + transactions share the transaction ledger
      const sourceLoc = alias(industrialSupplyLocations, "supply_txn_source_loc");
      const destLoc = alias(industrialSupplyLocations, "supply_txn_dest_loc");

      const filters: SQL[] = [eq(industrialSupplyTransactions.tenantId, tenantId)];
      if (reportType === "usage") {
        filters.push(
          inArray(industrialSupplyTransactions.transactionType, ["ISSUE", "PPE_ISSUE"]),
        );
      } else if (transactionType) {
        filters.push(eq(industrialSupplyTransactions.transactionType, transactionType));
      }
      if (itemIds.length === 1) {
        filters.push(eq(industrialSupplyTransactions.itemId, itemIds[0]!));
      } else if (itemIds.length > 1) {
        filters.push(inArray(industrialSupplyTransactions.itemId, itemIds));
      }
      if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
      if (inventoryType) filters.push(eq(industrialSupplyItems.inventoryType, inventoryType));
      if (personnelId) filters.push(eq(industrialSupplyTransactions.personnelId, personnelId));
      if (departmentId) filters.push(eq(industrialSupplyTransactions.departmentId, departmentId));
      if (sourceLocationId) {
        filters.push(eq(industrialSupplyTransactions.sourceLocationId, sourceLocationId));
      }
      if (destinationLocationId) {
        filters.push(eq(industrialSupplyTransactions.destinationLocationId, destinationLocationId));
      }
      if (locationIds.length > 0) {
        filters.push(
          or(
            inArray(industrialSupplyTransactions.sourceLocationId, locationIds),
            inArray(industrialSupplyTransactions.destinationLocationId, locationIds),
          )!,
        );
      }
      if (siteId) {
        filters.push(or(eq(sourceLoc.siteId, siteId), eq(destLoc.siteId, siteId))!);
      }
      if (divisionName) {
        filters.push(
          or(
            ilike(industrialDepartments.divisionName, divisionName),
            ilike(industrialPersonnel.divisionName, divisionName),
          )!,
        );
      }
      if (dateFrom) filters.push(gte(industrialSupplyTransactions.createdAt, dateFrom));
      if (dateTo) filters.push(lte(industrialSupplyTransactions.createdAt, dateTo));
      if (q) {
        filters.push(
          or(
            ilike(industrialSupplyItems.name, `%${q}%`),
            ilike(industrialSupplyItems.itemNumber, `%${q}%`),
            ilike(industrialSupplyTransactions.reason, `%${q}%`),
            ilike(industrialPersonnel.displayName, `%${q}%`),
          )!,
        );
      }
      const where = and(...filters);

      if (reportType === "usage") {
        const grouped = await tx
          .select({
            itemId: industrialSupplyTransactions.itemId,
            itemName: industrialSupplyItems.name,
            itemNumber: industrialSupplyItems.itemNumber,
            categoryId: industrialSupplyItems.categoryId,
            categoryName: industrialSupplyCategories.name,
            inventoryType: industrialSupplyItems.inventoryType,
            totalIssued: sql<string>`coalesce(sum(abs(${industrialSupplyTransactions.quantity})), 0)`,
            txnCount: sql<number>`count(*)::int`,
          })
          .from(industrialSupplyTransactions)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
          )
          .leftJoin(
            industrialSupplyCategories,
            eq(industrialSupplyCategories.id, industrialSupplyItems.categoryId),
          )
          .leftJoin(sourceLoc, eq(sourceLoc.id, industrialSupplyTransactions.sourceLocationId))
          .leftJoin(destLoc, eq(destLoc.id, industrialSupplyTransactions.destinationLocationId))
          .leftJoin(
            industrialDepartments,
            eq(industrialDepartments.id, industrialSupplyTransactions.departmentId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialSupplyTransactions.personnelId),
          )
          .where(where)
          .groupBy(
            industrialSupplyTransactions.itemId,
            industrialSupplyItems.name,
            industrialSupplyItems.itemNumber,
            industrialSupplyItems.categoryId,
            industrialSupplyCategories.name,
            industrialSupplyItems.inventoryType,
          )
          .orderBy(sql`sum(abs(${industrialSupplyTransactions.quantity})) desc`)
          .limit(pageSize)
          .offset(offset);

        const [countRow] = await tx
          .select({
            count: sql<number>`count(distinct ${industrialSupplyTransactions.itemId})::int`,
          })
          .from(industrialSupplyTransactions)
          .innerJoin(
            industrialSupplyItems,
            eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
          )
          .leftJoin(sourceLoc, eq(sourceLoc.id, industrialSupplyTransactions.sourceLocationId))
          .leftJoin(destLoc, eq(destLoc.id, industrialSupplyTransactions.destinationLocationId))
          .leftJoin(
            industrialDepartments,
            eq(industrialDepartments.id, industrialSupplyTransactions.departmentId),
          )
          .leftJoin(
            industrialPersonnel,
            eq(industrialPersonnel.id, industrialSupplyTransactions.personnelId),
          )
          .where(where);

        return {
          reportType: "usage" as const,
          items: grouped.map((r) => ({
            itemId: r.itemId,
            itemName: r.itemName,
            itemNumber: r.itemNumber,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
            inventoryType: r.inventoryType,
            totalIssued: this.num(r.totalIssued),
            transactionCount: r.txnCount,
          })),
          page,
          pageSize,
          total: countRow?.count ?? grouped.length,
          appliedFilters,
        };
      }

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialSupplyTransactions)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
        )
        .leftJoin(sourceLoc, eq(sourceLoc.id, industrialSupplyTransactions.sourceLocationId))
        .leftJoin(destLoc, eq(destLoc.id, industrialSupplyTransactions.destinationLocationId))
        .leftJoin(
          industrialDepartments,
          eq(industrialDepartments.id, industrialSupplyTransactions.departmentId),
        )
        .leftJoin(
          industrialPersonnel,
          eq(industrialPersonnel.id, industrialSupplyTransactions.personnelId),
        )
        .where(where);

      const rows = await tx
        .select({
          txn: industrialSupplyTransactions,
          itemName: industrialSupplyItems.name,
          itemNumber: industrialSupplyItems.itemNumber,
          inventoryType: industrialSupplyItems.inventoryType,
          categoryId: industrialSupplyItems.categoryId,
          categoryName: industrialSupplyCategories.name,
          sourceLocationName: sourceLoc.name,
          sourceLocationCode: sourceLoc.code,
          destinationLocationName: destLoc.name,
          destinationLocationCode: destLoc.code,
          departmentName: industrialDepartments.name,
          divisionName: sql<string | null>`coalesce(${industrialDepartments.divisionName}, ${industrialPersonnel.divisionName})`,
          personnelName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
        })
        .from(industrialSupplyTransactions)
        .innerJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyTransactions.itemId),
        )
        .leftJoin(
          industrialSupplyCategories,
          eq(industrialSupplyCategories.id, industrialSupplyItems.categoryId),
        )
        .leftJoin(sourceLoc, eq(sourceLoc.id, industrialSupplyTransactions.sourceLocationId))
        .leftJoin(destLoc, eq(destLoc.id, industrialSupplyTransactions.destinationLocationId))
        .leftJoin(
          industrialDepartments,
          eq(industrialDepartments.id, industrialSupplyTransactions.departmentId),
        )
        .leftJoin(
          industrialPersonnel,
          eq(industrialPersonnel.id, industrialSupplyTransactions.personnelId),
        )
        .where(where)
        .orderBy(desc(industrialSupplyTransactions.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        reportType: "transactions" as const,
        items: rows.map((r) => ({
          id: r.txn.id,
          createdAt: r.txn.createdAt,
          transactionType: r.txn.transactionType,
          quantity: r.txn.quantity,
          previousQuantity: r.txn.previousQuantity,
          newQuantity: r.txn.newQuantity,
          unitCost: r.txn.unitCost,
          reason: r.txn.reason,
          itemId: r.txn.itemId,
          itemName: r.itemName,
          itemNumber: r.itemNumber,
          inventoryType: r.inventoryType,
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          sourceLocationId: r.txn.sourceLocationId,
          sourceLocationName: r.sourceLocationName,
          sourceLocationCode: r.sourceLocationCode,
          destinationLocationId: r.txn.destinationLocationId,
          destinationLocationName: r.destinationLocationName,
          destinationLocationCode: r.destinationLocationCode,
          personnelId: r.txn.personnelId,
          personnelName: r.personnelName,
          employeeNumber: r.employeeNumber,
          departmentId: r.txn.departmentId,
          departmentName: r.departmentName,
          divisionName: r.divisionName,
        })),
        page,
        pageSize,
        total: countRow?.count ?? 0,
        appliedFilters,
      };
    });
  }

  // ---------- Scan resolve ----------

  async resolveScan(principal: ForgePrincipal, code: string) {
    const tenantId = this.tenant(principal);
    const value = asString(code);
    if (!value) throw new ForgeError("VALIDATION_FAILED", "Scan code is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [item] = await tx
        .select()
        .from(industrialSupplyItems)
        .where(
          and(
            eq(industrialSupplyItems.tenantId, tenantId),
            isNull(industrialSupplyItems.archivedAt),
            or(
              eq(industrialSupplyItems.barcode, value),
              eq(industrialSupplyItems.itemNumber, value),
              eq(industrialSupplyItems.sku, value),
              eq(industrialSupplyItems.upc, value),
            ),
          ),
        )
        .limit(1);
      if (item) return { type: "item" as const, record: serializeItem(item) };

      const [variant] = await tx
        .select()
        .from(industrialSupplyItemVariants)
        .where(
          and(
            eq(industrialSupplyItemVariants.tenantId, tenantId),
            isNull(industrialSupplyItemVariants.archivedAt),
            or(
              eq(industrialSupplyItemVariants.barcode, value),
              eq(industrialSupplyItemVariants.sku, value),
              eq(industrialSupplyItemVariants.variantCode, value),
            ),
          ),
        )
        .limit(1);
      if (variant) return { type: "variant" as const, record: variant };

      const [serial] = await tx
        .select()
        .from(industrialSupplySerials)
        .where(
          and(
            eq(industrialSupplySerials.tenantId, tenantId),
            isNull(industrialSupplySerials.archivedAt),
            or(
              eq(industrialSupplySerials.forgeAssetNumber, value),
              eq(industrialSupplySerials.manufacturerSerialNumber, value),
            ),
          ),
        )
        .limit(1);
      if (serial) return { type: "serial" as const, record: serial };

      const [location] = await tx
        .select()
        .from(industrialSupplyLocations)
        .where(
          and(
            eq(industrialSupplyLocations.tenantId, tenantId),
            isNull(industrialSupplyLocations.archivedAt),
            or(
              eq(industrialSupplyLocations.code, value),
              eq(industrialSupplyLocations.name, value),
            ),
          ),
        )
        .limit(1);
      if (location) return { type: "location" as const, record: location };

      const [kit] = await tx
        .select()
        .from(industrialSupplyKits)
        .where(
          and(
            eq(industrialSupplyKits.tenantId, tenantId),
            isNull(industrialSupplyKits.archivedAt),
            or(eq(industrialSupplyKits.kitNumber, value), eq(industrialSupplyKits.name, value)),
          ),
        )
        .limit(1);
      if (kit) return { type: "kit" as const, record: kit };

      const [lot] = await tx
        .select()
        .from(industrialSupplyLots)
        .where(
          and(
            eq(industrialSupplyLots.tenantId, tenantId),
            isNull(industrialSupplyLots.archivedAt),
            eq(industrialSupplyLots.lotNumber, value),
          ),
        )
        .limit(1);
      if (lot) return { type: "lot" as const, record: lot };

      throw new ForgeError("NOT_FOUND", `No supply record matched scan code "${value}"`);
    });
  }
}
