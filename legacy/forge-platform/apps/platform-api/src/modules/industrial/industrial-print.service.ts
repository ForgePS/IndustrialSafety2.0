import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  BRADY_I4311_DPI,
  BridgeStatus,
  ForgePrintMode,
  PrintJobStatus,
  PrinterConnectionType,
  PrinterTransportType,
  PRINT_MANAGER_PRINTING_STATUSES,
  PRINT_MANAGER_QUEUED_STATUSES,
  PRINT_MANAGER_SUCCESS_STATUSES,
  classifyPrintManagerPrinterHealth,
  bridgeHeartbeatInputSchema,
  bridgePrinterUpsertSchema,
  consumeBridgePairingInputSchema,
  createBridgePairingInputSchema,
  createMediaProfileInputSchema,
  createPrintBatchInputSchema,
  createPrintJobInputSchema,
  createPrinterGroupInputSchema,
  createPrintRoutingRuleInputSchema,
  createLabelTemplateInputSchema,
  createPrintSupplyInputSchema,
  patchPrintSupplyInputSchema,
  replacePrintSupplyInputSchema,
  printAnalyticsQuerySchema,
  previewPrintJobInputSchema,
  patchMediaProfileInputSchema,
  patchPrinterGroupInputSchema,
  patchPrintRoutingRuleInputSchema,
  patchLabelTemplateInputSchema,
  patchLabelTemplateVersionInputSchema,
  previewLabelTemplateInputSchema,
  printJobStatusUpdateSchema,
  registerDirectBluetoothPrinterInputSchema,
  reprintJobInputSchema,
  resolvePrintRouteInputSchema,
  upsertPrinterProfileInputSchema,
  LabelTemplateVersionStatus,
  exportLabelTemplateZplInputSchema,
  PrintSupplyAlertLevel,
  type BridgeHeartbeatInput,
  type BridgePrinterUpsert,
  type ConsumeBridgePairingInput,
  type PrintJobStatusUpdate,
  type PrintLabelLayout,
} from "@forge/contracts";
import {
  createId,
  industrialBridgePairingCodes,
  industrialDepartments,
  industrialLabelTemplateFields,
  industrialLabelTemplateVersions,
  industrialLabelTemplates,
  industrialPrintBatches,
  industrialPrintJobEvents,
  industrialPrintJobs,
  industrialPrintRoutingRules,
  industrialPrintSupplies,
  industrialPrinterBridges,
  industrialPrinterGroupMembers,
  industrialPrinterGroups,
  industrialPrinterMediaProfiles,
  industrialPrinterProfiles,
  industrialPrinters,
  industrialSites,
  type Database,
  type DatabaseTransaction,
  type IndustrialPrintBatchRow,
  type IndustrialPrintJobRow,
  type IndustrialPrinterBridgeRow,
  type IndustrialPrinterMediaProfileRow,
  type IndustrialPrinterProfileRow,
  type IndustrialPrinterRow,
  type IndustrialPrintSupplyRow,
  withTenantTransaction,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import { hashOpaqueSecret } from "@forge/security";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { isDemoTenant } from "../../common/demo-tenant.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  DEFAULT_HEIGHT_IN,
  DEFAULT_WIDTH_IN,
  IndustrialLabelRendererService,
  type FieldLabelRenderOpts,
} from "./industrial-label-renderer.service.js";
import {
  decidePrintRoute,
  orderGroupMembersForStrategy,
  type PrintRoutingRuleMatchInput,
} from "./industrial-print-routing.js";
import {
  assertTemplateVersionMutable,
  extractTemplateVariableKeys,
  layoutKind,
  mergeTemplateFieldValues,
  substituteTemplateVariables,
  validateRequiredTemplateFields,
} from "./industrial-print-templates.js";
import {
  averageMs,
  computePrintFailureRate,
  computePrintRetryRate,
  dayBucketUtc,
  monthBucketUtc,
  parseAnalyticsRange,
} from "./industrial-print-analytics.js";
import {
  applyEstimatedSupplyConsumption,
  computeSupplyAlertLevel,
  supplyPercentRemaining,
} from "./industrial-print-supplies.js";
import { notifyPrintSupplyAlert } from "./notify-print-supply-alert.js";
import {
  defaultElementsLayout,
  elementsToZpl,
  parseLayoutElements,
} from "./industrial-label-elements.js";
const PAIRING_TTL_MS = 10 * 60 * 1000;
const TEST_TEMPLATE_CODE = "TEST_PRINT";
const CLAIMABLE_STATUSES = [
  PrintJobStatus.QUEUED,
  PrintJobStatus.BRIDGE_ASSIGNED,
  PrintJobStatus.DELIVERING,
] as const;

const TERMINAL_NO_REQUEUE = new Set<string>([
  PrintJobStatus.COMPLETED,
  PrintJobStatus.SENT_TO_PRINTER,
]);

const HISTORY_STATUSES = new Set<string>([
  PrintJobStatus.COMPLETED,
  PrintJobStatus.SENT_TO_PRINTER,
  PrintJobStatus.FAILED,
  PrintJobStatus.CANCELLED,
  PrintJobStatus.EXPIRED,
  PrintJobStatus.PRINT_RESULT_UNKNOWN,
]);

const BATCH_TERMINAL_JOB_STATUSES = new Set<string>([
  PrintJobStatus.COMPLETED,
  PrintJobStatus.SENT_TO_PRINTER,
  PrintJobStatus.FAILED,
  PrintJobStatus.CANCELLED,
  PrintJobStatus.EXPIRED,
]);

const DEFAULT_BRADY_MEDIA = [
  { name: "Asset Label 4x4", widthInches: 4, heightInches: 4 },
  { name: "Asset Label 4x2", widthInches: 4, heightInches: 2 },
  { name: "Asset Label 2x1", widthInches: 2, heightInches: 1 },
  { name: "Supply Label 3x2", widthInches: 3, heightInches: 2 },
] as const;

const updateBridgeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  locationId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  autoUpdateEnabled: z.boolean().optional(),
  status: z.enum(["ONLINE", "OFFLINE", "PAIRING", "DISABLED"]).optional(),
});

const updatePrinterSchema = z.object({
  displayName: z.string().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  locationId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  dpi: z.number().int().positive().optional(),
  transportType: z.string().max(64).optional(),
});

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

/** FPB-XXX-XXX using crypto.randomBytes (digits only). */
export function generatePairingCode(): string {
  const bytes = randomBytes(4);
  const n = bytes.readUInt32BE(0) % 1_000_000;
  const left = String(Math.floor(n / 1000)).padStart(3, "0");
  const right = String(n % 1000).padStart(3, "0");
  return `FPB-${left}-${right}`;
}

export function isPairingCodeFormat(code: string): boolean {
  return /^FPB-\d{3}-\d{3}$/.test(
    String(code ?? "")
      .trim()
      .toUpperCase(),
  );
}

export function isTerminalSuccessStatus(status: string): boolean {
  return TERMINAL_NO_REQUEUE.has(String(status ?? "").toUpperCase());
}

export function defaultTransportForConnection(connectionType: string | null | undefined): string {
  const c = String(connectionType ?? "").toUpperCase();
  if (c === "BLUETOOTH_BLE" || c === "BLUETOOTH") {
    return PrinterTransportType.BRADY_WEB_BLUETOOTH;
  }
  if (c === "USB" || c === "ETHERNET" || c === "WIFI") {
    return PrinterTransportType.WINDOWS_SPOOLER;
  }
  return PrinterTransportType.WINDOWS_SPOOLER;
}

/** True when the job should queue for a direct Bluetooth client (no bridge claim). */
export function isDirectBluetoothPrintPath(input: {
  printMode?: string | null | undefined;
  bridgeId?: string | null | undefined;
  transportType?: string | null | undefined;
}): boolean {
  const mode = String(input.printMode ?? "").toUpperCase();
  if (mode === ForgePrintMode.DIRECT_BLUETOOTH) return true;
  // No bridge assignment → client/direct path (including BRADY_WEB_BLUETOOTH printers).
  if (!input.bridgeId) return true;
  return false;
}

/** Bridge-path printers are unavailable when disabled, bridge offline/disabled, or not ready. */
export function isPrimaryPrinterUnavailable(input: {
  enabled: boolean;
  ready: boolean;
  isDirect: boolean;
  bridge?: { enabled: boolean; status: string } | null;
}): boolean {
  if (!input.enabled) return true;
  if (input.isDirect) return false;
  if (!input.bridge || !input.bridge.enabled) return true;
  const status = String(input.bridge.status ?? "").toUpperCase();
  if (status === BridgeStatus.DISABLED || status === BridgeStatus.OFFLINE) return true;
  if (!input.ready) return true;
  return false;
}

/** Decide whether failover may proceed; never silent. */
export function resolveFailoverDecision(input: {
  unavailable: boolean;
  acceptFailover?: boolean | undefined;
  fallbackPrinterId?: string | null | undefined;
  fallbackPrinterName?: string | null | undefined;
}):
  | { action: "use_primary" }
  | { action: "use_fallback"; fallbackPrinterId: string }
  | { action: "prompt_failover"; fallbackPrinterId: string; fallbackPrinterName: string | null }
  | { action: "unavailable" } {
  if (!input.unavailable) return { action: "use_primary" };
  const fallbackId = input.fallbackPrinterId ?? null;
  if (!fallbackId) return { action: "unavailable" };
  if (input.acceptFailover === true) {
    return { action: "use_fallback", fallbackPrinterId: fallbackId };
  }
  return {
    action: "prompt_failover",
    fallbackPrinterId: fallbackId,
    fallbackPrinterName: input.fallbackPrinterName ?? null,
  };
}

/** Shape claimed job payloads so the Windows bridge can resolve the local queue. */
export function buildBridgeClaimJobPayload(input: {
  job: Pick<
    IndustrialPrintJobRow,
    | "id"
    | "tenantId"
    | "bridgeId"
    | "printerId"
    | "templateId"
    | "templateVersion"
    | "widthInches"
    | "heightInches"
    | "dpi"
    | "artifactType"
    | "artifactSha256"
    | "copies"
    | "orientation"
    | "cutMode"
    | "requestedBy"
    | "expiresAt"
  >;
  printer?: Pick<
    IndustrialPrinterRow,
    | "windowsQueueName"
    | "deviceIdentifier"
    | "bluetoothDeviceId"
    | "bluetoothSavedId"
    | "name"
    | "displayName"
  > | null;
  artifactUrl: string;
  status: string;
}) {
  const printer = input.printer ?? null;
  return {
    jobId: input.job.id,
    tenantId: input.job.tenantId,
    bridgeId: input.job.bridgeId,
    printerId: input.job.printerId,
    windowsQueueName: printer?.windowsQueueName ?? null,
    deviceIdentifier: printer?.deviceIdentifier ?? null,
    bluetoothDeviceId: printer?.bluetoothDeviceId ?? null,
    bluetoothSavedId: printer?.bluetoothSavedId ?? null,
    printerName: printer?.displayName || printer?.name || null,
    template: input.job.templateId
      ? { id: input.job.templateId, version: input.job.templateVersion ?? 1 }
      : null,
    media: {
      widthInches: input.job.widthInches ?? DEFAULT_WIDTH_IN,
      heightInches: input.job.heightInches ?? DEFAULT_HEIGHT_IN,
    },
    render: {
      dpi: input.job.dpi ?? BRADY_I4311_DPI,
      artifactType: input.job.artifactType ?? "PDF",
      artifactUrl: input.artifactUrl,
      sha256: input.job.artifactSha256 ?? "",
    },
    settings: {
      copies: input.job.copies,
      orientation: input.job.orientation ?? "AUTO",
      cutMode: input.job.cutMode ?? null,
    },
    requestedBy: input.job.requestedBy,
    expiresAt: toIso(input.job.expiresAt),
    status: input.status,
  };
}

/** Derive batch status from job counters after a terminal job update. */
export function computeBatchStatusFromCounters(input: {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
}): string {
  const done = input.completedJobs + input.failedJobs;
  if (input.totalJobs > 0 && done >= input.totalJobs) {
    if (input.failedJobs <= 0) return "COMPLETED";
    if (input.completedJobs <= 0) return "FAILED";
    return "PARTIAL";
  }
  return "PRINTING";
}

/** Active (non-terminal) job statuses that stopOnFail may cancel. */
export const BATCH_CANCELABLE_JOB_STATUSES = [
  PrintJobStatus.CREATED,
  PrintJobStatus.RENDERING,
  PrintJobStatus.QUEUED,
  PrintJobStatus.BRIDGE_ASSIGNED,
  PrintJobStatus.WAITING_FOR_PRINTER,
  PrintJobStatus.DELIVERING,
  PrintJobStatus.RECEIVED,
  PrintJobStatus.VALIDATING,
  PrintJobStatus.SPOOLING,
  PrintJobStatus.TRANSMITTING,
  PrintJobStatus.PRINTING,
] as const;

/** Capabilities derived from model + connection + transport (spec §7). */
export function resolvePrinterCapabilities(input: {
  model?: string | null;
  connectionType?: string | null;
  transportType?: string | null;
  supportsBitmap?: boolean;
  supportsCut?: boolean;
  supportsFeed?: boolean;
  supportsMultipleCopies?: boolean;
  dpi?: number | null;
  maxPrintWidthInches?: number | null;
}): {
  print: boolean;
  bitmapPrint: boolean;
  multipleCopies: boolean;
  cut: boolean;
  feed: boolean;
  status: boolean;
  mediaDetection: boolean;
  ribbonDetection: boolean;
  batteryStatus: boolean;
  dpi: number[];
  maxPrintWidthInches?: number;
} {
  const transport = String(input.transportType ?? "").toUpperCase();
  const connection = String(input.connectionType ?? "").toUpperCase();
  const isBle =
    transport === "BRADY_WEB_BLUETOOTH" ||
    connection === "BLUETOOTH_BLE" ||
    connection === "BLUETOOTH";
  const model = String(input.model ?? "").toLowerCase();
  const isI4311 = model.includes("i4311");
  const dpi = input.dpi && input.dpi > 0 ? input.dpi : BRADY_I4311_DPI;

  // i4311 BLE via Brady Web SDK: bitmap print yes; cut/feed not exposed on that path.
  const cut = isBle ? false : Boolean(input.supportsCut);
  const feed = isBle ? false : Boolean(input.supportsFeed);

  return {
    print: true,
    bitmapPrint: input.supportsBitmap !== false,
    multipleCopies: input.supportsMultipleCopies !== false,
    cut,
    feed,
    status: true,
    mediaDetection: !isBle,
    ribbonDetection: !isBle,
    batteryStatus: isBle,
    dpi: isI4311 || isBle ? [dpi] : [dpi],
    ...(input.maxPrintWidthInches != null
      ? { maxPrintWidthInches: input.maxPrintWidthInches }
      : {}),
  };
}

function printArtifactObjectKey(tenantId: string, jobId: string, ext = "png"): string {
  return `tenants/${tenantId}/industrial-print/${jobId}/label.${ext}`;
}

function extractTenantId(rows: unknown): string | null {
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const first = list[0] as Record<string, unknown> | undefined;
  const raw = first?.tenant_id ?? first?.tenantId;
  return raw ? String(raw) : null;
}

@Injectable()
export class IndustrialPrintService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly renderer: IndustrialLabelRendererService,
    private readonly storage: DocumentStorageService,
    private readonly featureFlags: FeatureFlagsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Deployment override gate. Missing flag / no override ⇒ enabled.
   * Explicit tenant override false ⇒ forbidden.
   */
  private async assertPrintingFeatureEnabled(
    principal: ForgePrincipal,
    featureKey: string,
    label: string,
  ): Promise<void> {
    if (principal.isPlatformAdmin) return;
    const effective = await this.featureFlags.effective(principal.tenantId, principal);
    const rec = effective.find((f) => f.key === featureKey);
    if (rec?.overridden && rec.value === false) {
      throw new ForgeError("FORBIDDEN", `${label} is disabled for this tenant`);
    }
  }

  private mapBridge(row: IndustrialPrinterBridgeRow) {
    return {
      id: row.id,
      name: row.name,
      deviceId: row.deviceId,
      computerName: row.computerName,
      locationId: row.locationId,
      divisionId: row.divisionId,
      osVersion: row.osVersion,
      bridgeVersion: row.bridgeVersion,
      status: row.status,
      lastSeenAt: toIso(row.lastSeenAt),
      registeredAt: toIso(row.registeredAt),
      remoteIp: row.remoteIp,
      autoUpdateEnabled: row.autoUpdateEnabled,
      enabled: row.enabled,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapPrinter(row: IndustrialPrinterRow) {
    const capabilities = resolvePrinterCapabilities({
      model: row.model,
      connectionType: row.connectionType,
      transportType: row.transportType,
      supportsBitmap: row.supportsBitmap,
      supportsCut: row.supportsCut,
      supportsFeed: row.supportsFeed,
      supportsMultipleCopies: row.supportsMultipleCopies,
      dpi: row.dpi,
      maxPrintWidthInches: row.maxPrintWidthInches,
    });
    return {
      id: row.id,
      bridgeId: row.bridgeId,
      name: row.name,
      displayName: row.displayName,
      manufacturer: row.manufacturer,
      model: row.model,
      serialNumber: row.serialNumber,
      connectionType: row.connectionType,
      transportType: row.transportType,
      windowsQueueName: row.windowsQueueName,
      deviceIdentifier: row.deviceIdentifier,
      bluetoothDeviceId: row.bluetoothDeviceId,
      bluetoothSavedId: row.bluetoothSavedId,
      dpi: row.dpi ?? BRADY_I4311_DPI,
      maxPrintWidthInches: row.maxPrintWidthInches,
      supportsBitmap: capabilities.bitmapPrint,
      supportsCut: capabilities.cut,
      supportsFeed: capabilities.feed,
      supportsMultipleCopies: capabilities.multipleCopies,
      capabilities,
      locationId: row.locationId,
      divisionId: row.divisionId,
      online: row.online,
      connected: row.connected,
      ready: row.ready,
      isDefault: row.isDefault,
      enabled: row.enabled,
      lastSeenAt: toIso(row.lastSeenAt),
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      ribbonOk: row.ribbonOk,
      mediaOk: row.mediaOk,
      batteryPercent: row.batteryPercent,
      supplyName: row.supplyName,
      lastHealthAt: toIso(row.lastHealthAt),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapBatch(row: IndustrialPrintBatchRow) {
    return {
      id: row.id,
      printerId: row.printerId,
      name: row.name,
      stopOnFail: row.stopOnFail,
      printMode: row.printMode,
      mediaProfileId: row.mediaProfileId,
      copiesPerItem: row.copiesPerItem,
      totalJobs: row.totalJobs,
      completedJobs: row.completedJobs,
      failedJobs: row.failedJobs,
      status: row.status,
      requestedBy: row.requestedBy,
      createdAt: toIso(row.createdAt),
      completedAt: toIso(row.completedAt),
    };
  }

  private mapMediaProfile(row: IndustrialPrinterMediaProfileRow) {
    return {
      id: row.id,
      manufacturer: row.manufacturer,
      printerModel: row.printerModel,
      partNumber: row.partNumber,
      name: row.name,
      widthInches: row.widthInches,
      heightInches: row.heightInches,
      continuous: row.continuous,
      dieCut: row.dieCut,
      printableWidth: row.printableWidth,
      printableHeight: row.printableHeight,
      orientation: row.orientation,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapPrinterProfile(row: IndustrialPrinterProfileRow) {
    return {
      id: row.id,
      printerId: row.printerId,
      dpi: row.dpi,
      defaultMediaId: row.defaultMediaId,
      defaultOrientation: row.defaultOrientation,
      defaultCopies: row.defaultCopies,
      defaultCutMode: row.defaultCutMode,
      darkness: row.darkness,
      speed: row.speed,
      xOffset: row.xOffset,
      yOffset: row.yOffset,
      preferredTransport: row.preferredTransport,
      fallbackPrinterId: row.fallbackPrinterId,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private mapJob(row: IndustrialPrintJobRow) {
    return {
      id: row.id,
      printerId: row.printerId,
      bridgeId: row.bridgeId,
      batchId: row.batchId,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      module: row.module,
      recordType: row.recordType,
      recordId: row.recordId,
      requestedBy: row.requestedBy,
      requestedFromDevice: row.requestedFromDevice,
      copies: row.copies,
      widthInches: row.widthInches,
      heightInches: row.heightInches,
      dpi: row.dpi,
      orientation: row.orientation,
      cutMode: row.cutMode,
      artifactType: row.artifactType,
      artifactSha256: row.artifactSha256,
      status: row.status,
      priority: row.priority,
      createdAt: toIso(row.createdAt),
      queuedAt: toIso(row.queuedAt),
      deliveredAt: toIso(row.deliveredAt),
      receivedAt: toIso(row.receivedAt),
      startedAt: toIso(row.startedAt),
      completedAt: toIso(row.completedAt),
      failedAt: toIso(row.failedAt),
      expiresAt: toIso(row.expiresAt),
      retryCount: row.retryCount,
      parentJobId: row.parentJobId,
      reprintReason: row.reprintReason,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
    };
  }

  private async appendJobEvent(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      printJobId: string;
      event: string;
      status?: string | null;
      message?: string | null;
      source?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.insert(industrialPrintJobEvents).values({
      id: createId(),
      printJobId: input.printJobId,
      tenantId: input.tenantId,
      event: input.event,
      status: input.status ?? null,
      message: input.message ?? null,
      metadataJson: input.metadata ?? {},
      source: input.source ?? "platform",
    });
  }

  private async resolveSiteName(
    tx: DatabaseTransaction,
    tenantId: string,
    locationId: string | null | undefined,
  ): Promise<string | null> {
    if (!locationId) return null;
    const [site] = await tx
      .select({ name: industrialSites.name })
      .from(industrialSites)
      .where(and(eq(industrialSites.id, locationId), eq(industrialSites.tenantId, tenantId)))
      .limit(1);
    return site?.name ?? null;
  }

  private async resolveDivisionName(
    tx: DatabaseTransaction,
    tenantId: string,
    divisionId: string | null | undefined,
  ): Promise<string | null> {
    if (!divisionId) return null;
    const [dept] = await tx
      .select({ name: industrialDepartments.name })
      .from(industrialDepartments)
      .where(
        and(eq(industrialDepartments.id, divisionId), eq(industrialDepartments.tenantId, tenantId)),
      )
      .limit(1);
    return dept?.name ?? null;
  }

  private async ensureTestPrintTemplate(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<{ templateId: string; version: number }> {
    const [existing] = await tx
      .select()
      .from(industrialLabelTemplates)
      .where(
        and(
          eq(industrialLabelTemplates.tenantId, tenantId),
          eq(industrialLabelTemplates.code, TEST_TEMPLATE_CODE),
        ),
      )
      .limit(1);
    if (existing) {
      const [ver] = await tx
        .select()
        .from(industrialLabelTemplateVersions)
        .where(
          and(
            eq(industrialLabelTemplateVersions.templateId, existing.id),
            eq(industrialLabelTemplateVersions.tenantId, tenantId),
          ),
        )
        .orderBy(desc(industrialLabelTemplateVersions.version))
        .limit(1);
      return { templateId: existing.id, version: ver?.version ?? 1 };
    }

    const templateId = createId();
    const versionId = createId();
    await tx.insert(industrialLabelTemplates).values({
      id: templateId,
      tenantId,
      code: TEST_TEMPLATE_CODE,
      name: "Test Print",
      category: "System",
      description: "Default Forge Printer Bridge test label",
      enabled: true,
    });
    await tx.insert(industrialLabelTemplateVersions).values({
      id: versionId,
      tenantId,
      templateId,
      version: 1,
      layoutJson: {
        kind: "ELEMENTS",
        elements: [
          {
            id: "title",
            type: "text",
            x: 0.15,
            y: 0.15,
            width: 3.7,
            height: 0.35,
            content: "FORGE PRINTER TEST",
            fontSizePt: 16,
            fontWeight: "bold",
          },
          {
            id: "meta",
            type: "dynamicText",
            x: 0.15,
            y: 0.55,
            width: 2.5,
            height: 1.0,
            content: "{{printerName}}\n{{connection}}\n{{date.current}}",
            fontSizePt: 10,
          },
          {
            id: "qr",
            type: "qr",
            x: 2.8,
            y: 0.5,
            width: 1.0,
            height: 1.0,
            content: "forge-print-test:{{printerId}}",
          },
        ],
      },
      dpi: BRADY_I4311_DPI,
      widthInches: DEFAULT_WIDTH_IN,
      heightInches: DEFAULT_HEIGHT_IN,
      status: "PUBLISHED",
    });
    return { templateId, version: 1 };
  }

  // ─── Authenticated: bridges ─────────────────────────────────────────────

  async createPairingCode(principal: ForgePrincipal, body: unknown) {
    const input = createBridgePairingInputSchema.parse(body ?? {});
    const code = generatePairingCode();
    const codeHash = hashOpaqueSecret(code.toUpperCase());
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    const pairingId = createId();
    const bridgeId = createId();
    const pendingDeviceId = `pending:${pairingId}`;

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        await tx.insert(industrialPrinterBridges).values({
          id: bridgeId,
          tenantId: principal.tenantId,
          name: input.name?.trim() || "Printer Bridge",
          deviceId: pendingDeviceId,
          locationId: input.locationId ?? null,
          divisionId: input.divisionId ?? null,
          status: BridgeStatus.PAIRING,
          registeredBy: principal.userId,
          enabled: true,
          pairingCodeHash: codeHash,
          pairingExpiresAt: expiresAt,
        });

        await tx.insert(industrialBridgePairingCodes).values({
          id: pairingId,
          tenantId: principal.tenantId,
          codeHash,
          codeDisplay: code,
          expiresAt,
          createdBy: principal.userId,
          bridgeId,
        });

        return {
          pairingCode: code,
          expiresAt: expiresAt.toISOString(),
          bridgeId,
          name: input.name?.trim() || "Printer Bridge",
          locationId: input.locationId ?? null,
          divisionId: input.divisionId ?? null,
        };
      },
      principal.userId,
    );
  }

  async listBridges(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(industrialPrinterBridges)
          .where(eq(industrialPrinterBridges.tenantId, principal.tenantId))
          .orderBy(asc(industrialPrinterBridges.name));
        return { items: rows.map((r) => this.mapBridge(r)) };
      },
      principal.userId,
    );
  }

  async getBridge(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(industrialPrinterBridges)
          .where(
            and(
              eq(industrialPrinterBridges.id, id),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Printer bridge not found");
        return this.mapBridge(row);
      },
      principal.userId,
    );
  }

  async updateBridge(principal: ForgePrincipal, id: string, body: unknown) {
    const input = updateBridgeSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrinterBridges)
          .where(
            and(
              eq(industrialPrinterBridges.id, id),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Printer bridge not found");

        const patch: Partial<typeof industrialPrinterBridges.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.locationId !== undefined) patch.locationId = input.locationId;
        if (input.divisionId !== undefined) patch.divisionId = input.divisionId;
        if (input.enabled !== undefined) {
          patch.enabled = input.enabled;
          if (!input.enabled) {
            patch.status = BridgeStatus.DISABLED;
          } else if (
            input.status === undefined &&
            (existing.status === BridgeStatus.DISABLED || !existing.enabled)
          ) {
            // Re-enable leaves the bridge offline until the agent heartbeats.
            patch.status = BridgeStatus.OFFLINE;
          }
        }
        if (input.autoUpdateEnabled !== undefined)
          patch.autoUpdateEnabled = input.autoUpdateEnabled;
        if (input.status !== undefined) patch.status = input.status;

        const [updated] = await tx
          .update(industrialPrinterBridges)
          .set(patch)
          .where(
            and(
              eq(industrialPrinterBridges.id, id),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return this.mapBridge(updated!);
      },
      principal.userId,
    );
  }

  async deleteBridge(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrinterBridges)
          .where(
            and(
              eq(industrialPrinterBridges.id, id),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Printer bridge not found");

        const [updated] = await tx
          .update(industrialPrinterBridges)
          .set({
            enabled: false,
            status: BridgeStatus.DISABLED,
            accessTokenHash: null,
            pairingCodeHash: null,
            pairingExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(industrialPrinterBridges.id, id),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return this.mapBridge(updated!);
      },
      principal.userId,
    );
  }

  // ─── Authenticated: printers ────────────────────────────────────────────

  async listPrinters(principal: ForgePrincipal, query: { bridgeId?: string; enabled?: string }) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const conditions = [eq(industrialPrinters.tenantId, principal.tenantId)];
        if (query.bridgeId) conditions.push(eq(industrialPrinters.bridgeId, query.bridgeId));
        if (query.enabled === "1" || query.enabled === "true") {
          conditions.push(eq(industrialPrinters.enabled, true));
        } else if (query.enabled === "0" || query.enabled === "false") {
          conditions.push(eq(industrialPrinters.enabled, false));
        }
        const rows = await tx
          .select()
          .from(industrialPrinters)
          .where(and(...conditions))
          .orderBy(asc(industrialPrinters.name));
        return { items: rows.map((r) => this.mapPrinter(r)) };
      },
      principal.userId,
    );
  }

  async getPrinter(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Printer not found");
        return this.mapPrinter(row);
      },
      principal.userId,
    );
  }

  async updatePrinter(principal: ForgePrincipal, id: string, body: unknown) {
    const input = updatePrinterSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Printer not found");

        if (input.isDefault === true) {
          await tx
            .update(industrialPrinters)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(
              and(
                eq(industrialPrinters.tenantId, principal.tenantId),
                eq(industrialPrinters.isDefault, true),
              ),
            );
        }

        const patch: Partial<typeof industrialPrinters.$inferInsert> = { updatedAt: new Date() };
        if (input.displayName !== undefined) patch.displayName = input.displayName;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
        if (input.locationId !== undefined) patch.locationId = input.locationId;
        if (input.divisionId !== undefined) patch.divisionId = input.divisionId;
        if (input.dpi !== undefined) patch.dpi = input.dpi;
        if (input.transportType !== undefined) patch.transportType = input.transportType;

        const [updated] = await tx
          .update(industrialPrinters)
          .set(patch)
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .returning();
        return this.mapPrinter(updated!);
      },
      principal.userId,
    );
  }

  /**
   * Request bridge/companion to reconnect a Bluetooth printer (spec §70).
   * Marks printer as reconnecting; bridge polls status and updates via upsert/heartbeat.
   */
  async reconnectPrinter(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");

        const transport = String(printer.transportType ?? "").toUpperCase();
        const connection = String(printer.connectionType ?? "").toUpperCase();
        const isBle =
          transport === "BRADY_WEB_BLUETOOTH" ||
          connection === "BLUETOOTH_BLE" ||
          connection === "BLUETOOTH";
        if (!isBle) {
          throw new ForgeError("BAD_REQUEST", "Reconnect applies to Bluetooth printers only");
        }
        if (!printer.bluetoothSavedId && !printer.bluetoothDeviceId) {
          throw new ForgeError(
            "BAD_REQUEST",
            "Printer has no saved Bluetooth association. Pair again from the Bridge companion.",
          );
        }

        const [updated] = await tx
          .update(industrialPrinters)
          .set({
            ready: false,
            connected: false,
            online: false,
            lastErrorCode: null,
            lastErrorMessage: "Reconnect requested",
            updatedAt: new Date(),
          })
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .returning();

        return {
          ...this.mapPrinter(updated!),
          reconnectRequested: true,
          message:
            "Reconnect requested. Keep the Forge Bluetooth Printer Companion open near the printer.",
        };
      },
      principal.userId,
    );
  }

  /**
   * Forget Bluetooth association (spec §71). Clears SDK device ids; does not remove Windows drivers.
   */
  async forgetBluetoothPrinter(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");

        const [updated] = await tx
          .update(industrialPrinters)
          .set({
            bluetoothDeviceId: null,
            bluetoothSavedId: null,
            connected: false,
            ready: false,
            online: false,
            enabled: false,
            lastErrorCode: null,
            lastErrorMessage: "Bluetooth association forgotten",
            updatedAt: new Date(),
          })
          .where(
            and(eq(industrialPrinters.id, id), eq(industrialPrinters.tenantId, principal.tenantId)),
          )
          .returning();

        return this.mapPrinter(updated!);
      },
      principal.userId,
    );
  }

  async testPrint(principal: ForgePrincipal, printerId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");
        if (!printer.enabled) throw new ForgeError("BAD_REQUEST", "Printer is disabled");
        if (!printer.bridgeId) {
          throw new ForgeError("BAD_REQUEST", "Printer is not assigned to a bridge");
        }

        const [bridge] = await tx
          .select()
          .from(industrialPrinterBridges)
          .where(
            and(
              eq(industrialPrinterBridges.id, printer.bridgeId),
              eq(industrialPrinterBridges.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!bridge || !bridge.enabled || bridge.status === BridgeStatus.DISABLED) {
          throw new ForgeError("BAD_REQUEST", "Printer bridge is not available");
        }

        const template = await this.ensureTestPrintTemplate(tx, principal.tenantId);
        const locationName = await this.resolveSiteName(
          tx,
          principal.tenantId,
          printer.locationId ?? bridge.locationId,
        );
        const divisionName = await this.resolveDivisionName(
          tx,
          principal.tenantId,
          printer.divisionId ?? bridge.divisionId,
        );

        const [ver] = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, template.templateId),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              eq(industrialLabelTemplateVersions.version, template.version),
            ),
          )
          .limit(1);

        const fieldValues: Record<string, string> = {
          title: "FORGE PRINTER TEST",
          printerName: printer.displayName || printer.name,
          connection: printer.connectionType ?? "",
          bridgeName: bridge.name,
          locationName: locationName ?? "",
          divisionName: divisionName ?? "",
          printerId: printer.id,
        };

        const rendered = ver
          ? await this.renderFromTemplateVersion(tx, principal.tenantId, ver, fieldValues, "png")
          : await this.renderer.renderTestLabel({
              printerName: printer.displayName || printer.name,
              connection: printer.connectionType,
              bridgeName: bridge.name,
              locationName,
              divisionName,
              printerId: printer.id,
              dpi: printer.dpi ?? BRADY_I4311_DPI,
            });

        return this.insertQueuedJob(tx, {
          tenantId: principal.tenantId,
          printer,
          bridge,
          templateId: template.templateId,
          templateVersion: template.version,
          module: "printer",
          recordType: "TEST_PRINT",
          requestedBy: principal.userId,
          copies: 1,
          widthInches: rendered.widthInches,
          heightInches: rendered.heightInches,
          dpi: rendered.dpi,
          rendered,
          priority: 100,
        });
      },
      principal.userId,
    );
  }

  // ─── Authenticated: jobs ────────────────────────────────────────────────

  private async loadBridgeForPrinter(
    tx: DatabaseTransaction,
    tenantId: string,
    bridgeId: string | null,
  ): Promise<IndustrialPrinterBridgeRow | null> {
    if (!bridgeId) return null;
    const [bridge] = await tx
      .select()
      .from(industrialPrinterBridges)
      .where(
        and(
          eq(industrialPrinterBridges.id, bridgeId),
          eq(industrialPrinterBridges.tenantId, tenantId),
        ),
      )
      .limit(1);
    return bridge ?? null;
  }

  private async loadPrinterProfile(
    tx: DatabaseTransaction,
    tenantId: string,
    printerId: string,
  ): Promise<IndustrialPrinterProfileRow | null> {
    const [profile] = await tx
      .select()
      .from(industrialPrinterProfiles)
      .where(
        and(
          eq(industrialPrinterProfiles.printerId, printerId),
          eq(industrialPrinterProfiles.tenantId, tenantId),
        ),
      )
      .limit(1);
    return profile ?? null;
  }

  /**
   * Resolve the printer (and optional bridge) for a print request, applying
   * explicit failover only when acceptFailover === true.
   */
  private async resolvePrinterForPrint(
    tx: DatabaseTransaction,
    tenantId: string,
    printerId: string,
    opts: { printMode?: string; acceptFailover?: boolean },
  ): Promise<{
    printer: IndustrialPrinterRow;
    bridge: IndustrialPrinterBridgeRow | null;
    isDirect: boolean;
    failover: {
      originalPrinterId: string;
      replacementPrinterId: string;
      reason: string;
    } | null;
  }> {
    const [primary] = await tx
      .select()
      .from(industrialPrinters)
      .where(and(eq(industrialPrinters.id, printerId), eq(industrialPrinters.tenantId, tenantId)))
      .limit(1);
    if (!primary) throw new ForgeError("NOT_FOUND", "Printer not found");

    let printer = primary;
    let bridge = await this.loadBridgeForPrinter(tx, tenantId, printer.bridgeId);
    let isDirect = isDirectBluetoothPrintPath({
      ...(opts.printMode !== undefined ? { printMode: opts.printMode } : {}),
      bridgeId: printer.bridgeId,
      transportType: printer.transportType,
    });
    let failover: {
      originalPrinterId: string;
      replacementPrinterId: string;
      reason: string;
    } | null = null;

    const profile = await this.loadPrinterProfile(tx, tenantId, primary.id);
    let fallbackName: string | null = null;
    if (profile?.fallbackPrinterId) {
      const [fb] = await tx
        .select({
          id: industrialPrinters.id,
          name: industrialPrinters.name,
          displayName: industrialPrinters.displayName,
        })
        .from(industrialPrinters)
        .where(
          and(
            eq(industrialPrinters.id, profile.fallbackPrinterId),
            eq(industrialPrinters.tenantId, tenantId),
          ),
        )
        .limit(1);
      fallbackName = fb?.displayName || fb?.name || null;
    }

    const unavailable = isPrimaryPrinterUnavailable({
      enabled: printer.enabled,
      ready: printer.ready,
      isDirect,
      bridge,
    });

    const decision = resolveFailoverDecision({
      unavailable,
      ...(opts.acceptFailover !== undefined ? { acceptFailover: opts.acceptFailover } : {}),
      fallbackPrinterId: profile?.fallbackPrinterId ?? null,
      fallbackPrinterName: fallbackName,
    });

    if (decision.action === "prompt_failover") {
      throw new ForgeError(
        "BAD_REQUEST",
        `Primary printer unavailable. Failover to ${decision.fallbackPrinterName ?? decision.fallbackPrinterId} available — set acceptFailover to continue.`,
        {
          details: [
            {
              code: "PRINTER_FAILOVER_AVAILABLE",
              fallbackPrinterId: decision.fallbackPrinterId,
              fallbackPrinterName: decision.fallbackPrinterName,
            },
          ],
        },
      );
    }
    if (decision.action === "unavailable") {
      if (!printer.enabled) throw new ForgeError("BAD_REQUEST", "Printer is disabled");
      if (isDirect) throw new ForgeError("BAD_REQUEST", "Printer is not available");
      if (!printer.bridgeId) {
        throw new ForgeError("BAD_REQUEST", "Printer is not assigned to a bridge");
      }
      throw new ForgeError("BAD_REQUEST", "Printer bridge is not available");
    }
    if (decision.action === "use_fallback") {
      const [fallback] = await tx
        .select()
        .from(industrialPrinters)
        .where(
          and(
            eq(industrialPrinters.id, decision.fallbackPrinterId),
            eq(industrialPrinters.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!fallback) throw new ForgeError("NOT_FOUND", "Fallback printer not found");
      if (!fallback.enabled) throw new ForgeError("BAD_REQUEST", "Fallback printer is disabled");
      failover = {
        originalPrinterId: primary.id,
        replacementPrinterId: fallback.id,
        reason: "Primary printer unavailable; accepted failover",
      };
      printer = fallback;
      bridge = await this.loadBridgeForPrinter(tx, tenantId, printer.bridgeId);
      isDirect = isDirectBluetoothPrintPath({
        ...(opts.printMode !== undefined ? { printMode: opts.printMode } : {}),
        bridgeId: printer.bridgeId,
        transportType: printer.transportType,
      });
      if (
        isPrimaryPrinterUnavailable({
          enabled: printer.enabled,
          ready: printer.ready,
          isDirect,
          bridge,
        })
      ) {
        throw new ForgeError("BAD_REQUEST", "Fallback printer is not available");
      }
    }

    if (!isDirect) {
      if (!printer.bridgeId || !bridge) {
        throw new ForgeError("BAD_REQUEST", "Printer is not assigned to a bridge");
      }
      if (!bridge.enabled || bridge.status === BridgeStatus.DISABLED) {
        throw new ForgeError("BAD_REQUEST", "Printer bridge is not available");
      }
    }

    return { printer, bridge: isDirect ? null : bridge, isDirect, failover };
  }

  private async resolveMediaDimensions(
    tx: DatabaseTransaction,
    tenantId: string,
    mediaProfileId: string | undefined,
    widthInches: number | undefined,
    heightInches: number | undefined,
  ): Promise<{ widthInches: number; heightInches: number }> {
    if (mediaProfileId) {
      const [media] = await tx
        .select()
        .from(industrialPrinterMediaProfiles)
        .where(
          and(
            eq(industrialPrinterMediaProfiles.id, mediaProfileId),
            eq(industrialPrinterMediaProfiles.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!media) throw new ForgeError("NOT_FOUND", "Media profile not found");
      return {
        widthInches: widthInches ?? media.widthInches,
        heightInches: heightInches ?? media.heightInches,
      };
    }
    return {
      widthInches: widthInches ?? DEFAULT_WIDTH_IN,
      heightInches: heightInches ?? DEFAULT_HEIGHT_IN,
    };
  }

  private buildFieldLabelRenderOpts(input: {
    fieldValues: Record<string, string>;
    widthInches: number;
    heightInches: number;
    dpi: number;
    module?: string | null;
    titleOverride?: string | null;
    layout?: PrintLabelLayout | null;
  }): FieldLabelRenderOpts {
    const fieldValues = input.fieldValues ?? {};
    const title =
      input.titleOverride ||
      fieldValues.title ||
      fieldValues.Title ||
      fieldValues.name ||
      (input.module ? `${input.module} label` : "Forge Label");
    const subtitle = fieldValues.subtitle?.trim() || undefined;
    const brand = fieldValues.brand?.trim() || undefined;
    const caption = fieldValues.caption?.trim() || fieldValues.station?.trim() || undefined;
    const specialKeys = new Set([
      "title",
      "Title",
      "name",
      "qr",
      "qrPayload",
      "subtitle",
      "brand",
      "caption",
      "station",
      "instructions",
      "footer",
    ]);
    const lines = Object.entries(fieldValues)
      .filter(([k]) => !specialKeys.has(k))
      .map(([k, v]) => {
        const label = k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return `${label}: ${v}`;
      })
      .slice(0, 12);
    const footerLines = [
      ...(fieldValues.instructions
        ? String(fieldValues.instructions)
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean)
        : []),
      ...(fieldValues.footer ? [String(fieldValues.footer).trim()] : []),
    ].filter(Boolean);
    const qrPayload = fieldValues.qr || fieldValues.qrPayload || undefined;
    const layout = input.layout ?? undefined;
    return {
      widthInches: input.widthInches,
      heightInches: input.heightInches,
      dpi: input.dpi,
      title,
      lines,
      ...(brand ? { brand } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(caption ? { caption } : {}),
      ...(footerLines.length > 0 ? { footerLines } : {}),
      ...(qrPayload ? { qrPayload } : {}),
      ...(layout?.qrScale != null ? { qrScale: layout.qrScale } : {}),
      ...(layout?.textScale != null ? { textScale: layout.textScale } : {}),
    };
  }

  async previewPrintJob(principal: ForgePrincipal, body: unknown) {
    const input = previewPrintJobInputSchema.parse(body ?? {});
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const mediaDims = await this.resolveMediaDimensions(
        tx,
        principal.tenantId,
        input.mediaProfileId,
        input.widthInches,
        input.heightInches,
      );
      const dpi = input.dpi ?? BRADY_I4311_DPI;
      const fieldValues = input.fieldValues ?? {};
      const renderOpts = this.buildFieldLabelRenderOpts({
        fieldValues,
        widthInches: mediaDims.widthInches,
        heightInches: mediaDims.heightInches,
        dpi,
        module: input.module ?? null,
        layout: input.layout ?? null,
      });
      return this.renderer.renderPreviewBase64(renderOpts);
    });
  }

  /**
   * Resolve printer destination from explicit selection, routing rules, groups, or tenant default.
   */
  private async resolvePrintDestination(
    tx: DatabaseTransaction,
    tenantId: string,
    context: {
      printerId?: string | null;
      printerGroupId?: string | null;
      locationId?: string | null;
      divisionId?: string | null;
      module?: string | null;
      recordType?: string | null;
    },
  ): Promise<{
    printerId: string;
    reason: string;
    ruleId?: string | null;
    ruleName?: string | null;
    groupId?: string | null;
    source: string;
  }> {
    const explicitGroupId = String(context.printerGroupId ?? "").trim();
    if (explicitGroupId) {
      const printerId = await this.pickPrinterFromGroup(tx, tenantId, explicitGroupId);
      return {
        printerId,
        reason: "User-selected printer group",
        groupId: explicitGroupId,
        source: "explicit_group",
      };
    }

    const ruleRows = await tx
      .select()
      .from(industrialPrintRoutingRules)
      .where(
        and(
          eq(industrialPrintRoutingRules.tenantId, tenantId),
          eq(industrialPrintRoutingRules.enabled, true),
        ),
      )
      .orderBy(desc(industrialPrintRoutingRules.priority));

    const rules: PrintRoutingRuleMatchInput[] = ruleRows.map((row) => {
      const conditions =
        row.conditionsJson && typeof row.conditionsJson === "object"
          ? (row.conditionsJson as Record<string, unknown>)
          : {};
      const action =
        row.actionJson && typeof row.actionJson === "object"
          ? (row.actionJson as Record<string, unknown>)
          : {};
      return {
        id: row.id,
        name: row.name,
        priority: row.priority,
        enabled: row.enabled,
        conditions: {
          locationId: typeof conditions.locationId === "string" ? conditions.locationId : null,
          divisionId: typeof conditions.divisionId === "string" ? conditions.divisionId : null,
          module: typeof conditions.module === "string" ? conditions.module : null,
          recordType: typeof conditions.recordType === "string" ? conditions.recordType : null,
        },
        action: {
          printerId: typeof action.printerId === "string" ? action.printerId : null,
          printerGroupId: typeof action.printerGroupId === "string" ? action.printerGroupId : null,
        },
      };
    });

    const [defaultPrinter] = await tx
      .select({ id: industrialPrinters.id })
      .from(industrialPrinters)
      .where(
        and(
          eq(industrialPrinters.tenantId, tenantId),
          eq(industrialPrinters.isDefault, true),
          eq(industrialPrinters.enabled, true),
        ),
      )
      .limit(1);

    const decision = decidePrintRoute({
      context: {
        printerId: context.printerId ?? null,
        locationId: context.locationId ?? null,
        divisionId: context.divisionId ?? null,
        module: context.module ?? null,
        recordType: context.recordType ?? null,
      },
      rules,
      tenantDefaultPrinterId: defaultPrinter?.id ?? null,
    });

    if (decision.action === "unresolved") {
      throw new ForgeError("VALIDATION_FAILED", decision.reason);
    }

    if (decision.action === "explicit") {
      return {
        printerId: decision.printerId,
        reason: decision.reason,
        source: "explicit",
      };
    }

    if (decision.action === "tenant_default") {
      return {
        printerId: decision.printerId,
        reason: decision.reason,
        source: "tenant_default",
      };
    }

    if (decision.printerGroupId) {
      const printerId = await this.pickPrinterFromGroup(tx, tenantId, decision.printerGroupId);
      return {
        printerId,
        reason: decision.reason,
        ruleId: decision.ruleId,
        ruleName: decision.ruleName,
        groupId: decision.printerGroupId,
        source: "rule_group",
      };
    }

    if (!decision.printerId) {
      throw new ForgeError("VALIDATION_FAILED", decision.reason);
    }
    return {
      printerId: decision.printerId,
      reason: decision.reason,
      ruleId: decision.ruleId,
      ruleName: decision.ruleName,
      source: "rule",
    };
  }

  private async pickPrinterFromGroup(
    tx: DatabaseTransaction,
    tenantId: string,
    groupId: string,
  ): Promise<string> {
    const [group] = await tx
      .select()
      .from(industrialPrinterGroups)
      .where(
        and(
          eq(industrialPrinterGroups.id, groupId),
          eq(industrialPrinterGroups.tenantId, tenantId),
          eq(industrialPrinterGroups.enabled, true),
        ),
      )
      .limit(1);
    if (!group) throw new ForgeError("NOT_FOUND", "Printer group not found");

    const members = await tx
      .select()
      .from(industrialPrinterGroupMembers)
      .where(
        and(
          eq(industrialPrinterGroupMembers.tenantId, tenantId),
          eq(industrialPrinterGroupMembers.groupId, groupId),
        ),
      )
      .orderBy(asc(industrialPrinterGroupMembers.sortOrder));
    if (members.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "Printer group has no members");
    }

    const orderedIds = orderGroupMembersForStrategy(
      group.strategy,
      members.map((m) => ({
        printerId: m.printerId,
        sortOrder: m.sortOrder,
        isPrimary: m.isPrimary,
      })),
    );

    for (const printerId of orderedIds) {
      const [printer] = await tx
        .select()
        .from(industrialPrinters)
        .where(
          and(
            eq(industrialPrinters.id, printerId),
            eq(industrialPrinters.tenantId, tenantId),
            eq(industrialPrinters.enabled, true),
          ),
        )
        .limit(1);
      if (printer) return printer.id;
    }

    throw new ForgeError("VALIDATION_FAILED", "No enabled printers in printer group");
  }

  async resolvePrintRoutePreview(principal: ForgePrincipal, body: unknown) {
    const input = resolvePrintRouteInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const route = await this.resolvePrintDestination(tx, principal.tenantId, {
          printerId: input.printerId ?? null,
          printerGroupId: input.printerGroupId ?? null,
          locationId: input.locationId ?? null,
          divisionId: input.divisionId ?? null,
          module: input.module ?? null,
          recordType: input.recordType ?? null,
        });
        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, route.printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        return {
          ...route,
          printer: printer ? this.mapPrinter(printer) : null,
        };
      },
      principal.userId,
    );
  }

  async listPrinterGroups(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const groups = await tx
          .select()
          .from(industrialPrinterGroups)
          .where(eq(industrialPrinterGroups.tenantId, principal.tenantId))
          .orderBy(asc(industrialPrinterGroups.name));
        const members = await tx
          .select()
          .from(industrialPrinterGroupMembers)
          .where(eq(industrialPrinterGroupMembers.tenantId, principal.tenantId));
        return {
          items: groups.map((g) => ({
            id: g.id,
            name: g.name,
            strategy: g.strategy,
            locationId: g.locationId,
            divisionId: g.divisionId,
            enabled: g.enabled,
            createdAt: toIso(g.createdAt),
            updatedAt: toIso(g.updatedAt),
            members: members
              .filter((m) => m.groupId === g.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((m) => ({
                id: m.id,
                printerId: m.printerId,
                sortOrder: m.sortOrder,
                isPrimary: m.isPrimary,
              })),
          })),
        };
      },
      principal.userId,
    );
  }

  async createPrinterGroup(principal: ForgePrincipal, body: unknown) {
    const input = createPrinterGroupInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(industrialPrinterGroups)
          .values({
            id,
            tenantId: principal.tenantId,
            name: input.name.trim(),
            strategy: input.strategy,
            locationId: input.locationId ?? null,
            divisionId: input.divisionId ?? null,
            enabled: input.enabled ?? true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        for (const [index, member] of (input.members ?? []).entries()) {
          await tx.insert(industrialPrinterGroupMembers).values({
            id: createId(),
            tenantId: principal.tenantId,
            groupId: id,
            printerId: member.printerId,
            sortOrder: member.sortOrder ?? index,
            isPrimary: member.isPrimary ?? index === 0,
          });
        }
        const members = await tx
          .select()
          .from(industrialPrinterGroupMembers)
          .where(
            and(
              eq(industrialPrinterGroupMembers.tenantId, principal.tenantId),
              eq(industrialPrinterGroupMembers.groupId, id),
            ),
          );
        return {
          id: row!.id,
          name: row!.name,
          strategy: row!.strategy,
          locationId: row!.locationId,
          divisionId: row!.divisionId,
          enabled: row!.enabled,
          createdAt: toIso(row!.createdAt),
          updatedAt: toIso(row!.updatedAt),
          members: members
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => ({
              id: m.id,
              printerId: m.printerId,
              sortOrder: m.sortOrder,
              isPrimary: m.isPrimary,
            })),
        };
      },
      principal.userId,
    );
  }

  async patchPrinterGroup(principal: ForgePrincipal, id: string, body: unknown) {
    const input = patchPrinterGroupInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrinterGroups)
          .where(
            and(
              eq(industrialPrinterGroups.id, id),
              eq(industrialPrinterGroups.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Printer group not found");

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.strategy !== undefined) patch.strategy = input.strategy;
        if (input.locationId !== undefined) patch.locationId = input.locationId;
        if (input.divisionId !== undefined) patch.divisionId = input.divisionId;
        if (input.enabled !== undefined) patch.enabled = input.enabled;

        await tx
          .update(industrialPrinterGroups)
          .set(patch)
          .where(
            and(
              eq(industrialPrinterGroups.id, id),
              eq(industrialPrinterGroups.tenantId, principal.tenantId),
            ),
          );

        if (input.members) {
          await tx
            .delete(industrialPrinterGroupMembers)
            .where(
              and(
                eq(industrialPrinterGroupMembers.groupId, id),
                eq(industrialPrinterGroupMembers.tenantId, principal.tenantId),
              ),
            );
          for (const [index, member] of input.members.entries()) {
            await tx.insert(industrialPrinterGroupMembers).values({
              id: createId(),
              tenantId: principal.tenantId,
              groupId: id,
              printerId: member.printerId,
              sortOrder: member.sortOrder ?? index,
              isPrimary: member.isPrimary ?? index === 0,
            });
          }
        }

        const [row] = await tx
          .select()
          .from(industrialPrinterGroups)
          .where(
            and(
              eq(industrialPrinterGroups.id, id),
              eq(industrialPrinterGroups.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        const members = await tx
          .select()
          .from(industrialPrinterGroupMembers)
          .where(
            and(
              eq(industrialPrinterGroupMembers.tenantId, principal.tenantId),
              eq(industrialPrinterGroupMembers.groupId, id),
            ),
          );
        return {
          id: row!.id,
          name: row!.name,
          strategy: row!.strategy,
          locationId: row!.locationId,
          divisionId: row!.divisionId,
          enabled: row!.enabled,
          createdAt: toIso(row!.createdAt),
          updatedAt: toIso(row!.updatedAt),
          members: members
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => ({
              id: m.id,
              printerId: m.printerId,
              sortOrder: m.sortOrder,
              isPrimary: m.isPrimary,
            })),
        };
      },
      principal.userId,
    );
  }

  async deletePrinterGroup(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const deleted = await tx
          .delete(industrialPrinterGroups)
          .where(
            and(
              eq(industrialPrinterGroups.id, id),
              eq(industrialPrinterGroups.tenantId, principal.tenantId),
            ),
          )
          .returning({ id: industrialPrinterGroups.id });
        if (!deleted.length) throw new ForgeError("NOT_FOUND", "Printer group not found");
        return { id };
      },
      principal.userId,
    );
  }

  async listPrintRoutingRules(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(industrialPrintRoutingRules)
          .where(eq(industrialPrintRoutingRules.tenantId, principal.tenantId))
          .orderBy(
            desc(industrialPrintRoutingRules.priority),
            asc(industrialPrintRoutingRules.name),
          );
        return {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            priority: row.priority,
            enabled: row.enabled,
            conditions: row.conditionsJson ?? {},
            action: row.actionJson ?? {},
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          })),
        };
      },
      principal.userId,
    );
  }

  async createPrintRoutingRule(principal: ForgePrincipal, body: unknown) {
    const input = createPrintRoutingRuleInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const id = createId();
        const now = new Date();
        const [row] = await tx
          .insert(industrialPrintRoutingRules)
          .values({
            id,
            tenantId: principal.tenantId,
            name: input.name.trim(),
            priority: input.priority,
            enabled: input.enabled ?? true,
            conditionsJson: input.conditions ?? {},
            actionJson: input.action,
            createdBy: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return {
          id: row!.id,
          name: row!.name,
          priority: row!.priority,
          enabled: row!.enabled,
          conditions: row!.conditionsJson ?? {},
          action: row!.actionJson ?? {},
          createdAt: toIso(row!.createdAt),
          updatedAt: toIso(row!.updatedAt),
        };
      },
      principal.userId,
    );
  }

  async patchPrintRoutingRule(principal: ForgePrincipal, id: string, body: unknown) {
    const input = patchPrintRoutingRuleInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrintRoutingRules)
          .where(
            and(
              eq(industrialPrintRoutingRules.id, id),
              eq(industrialPrintRoutingRules.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Routing rule not found");
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.conditions !== undefined) patch.conditionsJson = input.conditions;
        if (input.action !== undefined) patch.actionJson = input.action;
        const [row] = await tx
          .update(industrialPrintRoutingRules)
          .set(patch)
          .where(
            and(
              eq(industrialPrintRoutingRules.id, id),
              eq(industrialPrintRoutingRules.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return {
          id: row!.id,
          name: row!.name,
          priority: row!.priority,
          enabled: row!.enabled,
          conditions: row!.conditionsJson ?? {},
          action: row!.actionJson ?? {},
          createdAt: toIso(row!.createdAt),
          updatedAt: toIso(row!.updatedAt),
        };
      },
      principal.userId,
    );
  }

  async deletePrintRoutingRule(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const deleted = await tx
          .delete(industrialPrintRoutingRules)
          .where(
            and(
              eq(industrialPrintRoutingRules.id, id),
              eq(industrialPrintRoutingRules.tenantId, principal.tenantId),
            ),
          )
          .returning({ id: industrialPrintRoutingRules.id });
        if (!deleted.length) throw new ForgeError("NOT_FOUND", "Routing rule not found");
        return { id };
      },
      principal.userId,
    );
  }

  // ─── Label templates (Phase 4) ───────────────────────────────────────────

  private mapLabelTemplate(
    row: typeof industrialLabelTemplates.$inferSelect,
    extras?: {
      versions?: Array<ReturnType<IndustrialPrintService["mapLabelTemplateVersion"]>>;
      publishedVersion?: number | null;
      draftVersion?: number | null;
    },
  ) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      description: row.description,
      enabled: row.enabled,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      publishedVersion: extras?.publishedVersion ?? null,
      draftVersion: extras?.draftVersion ?? null,
      versions: extras?.versions,
    };
  }

  private mapLabelTemplateVersion(
    row: typeof industrialLabelTemplateVersions.$inferSelect,
    fields?: Array<{
      id: string;
      fieldKey: string;
      fieldType: string;
      label: string | null;
      required: boolean;
      defaultValue: string | null;
      metadataJson: unknown;
    }>,
  ) {
    const layout =
      row.layoutJson && typeof row.layoutJson === "object"
        ? (row.layoutJson as Record<string, unknown>)
        : {};
    return {
      id: row.id,
      templateId: row.templateId,
      version: row.version,
      status: row.status,
      dpi: row.dpi,
      widthInches: row.widthInches,
      heightInches: row.heightInches,
      layout,
      variables: extractTemplateVariableKeys(JSON.stringify(layout)),
      fields: fields ?? [],
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private async loadTemplateFields(
    tx: DatabaseTransaction,
    tenantId: string,
    templateVersionId: string,
  ) {
    const rows = await tx
      .select()
      .from(industrialLabelTemplateFields)
      .where(
        and(
          eq(industrialLabelTemplateFields.tenantId, tenantId),
          eq(industrialLabelTemplateFields.templateVersionId, templateVersionId),
        ),
      )
      .orderBy(asc(industrialLabelTemplateFields.fieldKey));
    return rows.map((f) => ({
      id: f.id,
      fieldKey: f.fieldKey,
      fieldType: f.fieldType,
      label: f.label,
      required: f.required,
      defaultValue: f.defaultValue,
      metadataJson: f.metadataJson ?? {},
    }));
  }

  private async replaceTemplateFields(
    tx: DatabaseTransaction,
    tenantId: string,
    templateVersionId: string,
    fields: Array<{
      fieldKey: string;
      fieldType: string;
      label?: string | null;
      required?: boolean;
      defaultValue?: string | null;
      metadataJson?: Record<string, unknown>;
    }>,
  ) {
    await tx
      .delete(industrialLabelTemplateFields)
      .where(
        and(
          eq(industrialLabelTemplateFields.tenantId, tenantId),
          eq(industrialLabelTemplateFields.templateVersionId, templateVersionId),
        ),
      );
    for (const field of fields) {
      await tx.insert(industrialLabelTemplateFields).values({
        id: createId(),
        tenantId,
        templateVersionId,
        fieldKey: field.fieldKey.trim(),
        fieldType: field.fieldType.trim() || "string",
        label: field.label ?? null,
        required: field.required ?? false,
        defaultValue: field.defaultValue ?? null,
        metadataJson: field.metadataJson ?? {},
      });
    }
  }

  private async renderFromTemplateVersion(
    tx: DatabaseTransaction,
    tenantId: string,
    version: typeof industrialLabelTemplateVersions.$inferSelect,
    fieldValues: Record<string, string>,
    output: "png" | "pdf" = "png",
  ) {
    const fields = await this.loadTemplateFields(tx, tenantId, version.id);
    const merged = mergeTemplateFieldValues({
      fields: fields.map((f) => ({
        fieldKey: f.fieldKey,
        required: f.required,
        defaultValue: f.defaultValue,
      })),
      fieldValues,
    });
    const missing = validateRequiredTemplateFields({
      fields: fields.map((f) => ({
        fieldKey: f.fieldKey,
        required: f.required,
        defaultValue: f.defaultValue,
      })),
      values: merged,
    });
    if (missing.length) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Missing required template fields: ${missing.join(", ")}`,
      );
    }

    const layout =
      version.layoutJson && typeof version.layoutJson === "object"
        ? (version.layoutJson as Record<string, unknown>)
        : {};
    const kind = layoutKind(layout);
    const widthInches = version.widthInches;
    const heightInches = version.heightInches;
    const dpi = version.dpi || BRADY_I4311_DPI;

    if (kind === "HTML") {
      const htmlSource = typeof layout.html === "string" ? layout.html : "";
      const html = substituteTemplateVariables(htmlSource, merged);
      return this.renderer.renderHtmlTemplate({
        html,
        widthInches,
        heightInches,
        dpi,
        output,
      });
    }

    if (kind === "ELEMENTS") {
      const elements = parseLayoutElements(layout);
      return this.renderer.renderElementsLabel({
        widthInches,
        heightInches,
        dpi,
        elements,
        fieldValues: merged,
      });
    }

    if (kind === "TEST_PRINT") {
      return this.renderer.renderLabel({
        widthInches,
        heightInches,
        dpi,
        title: "FORGE PRINTER TEST",
        lines: Object.entries(merged)
          .filter(
            ([k]) => !k.startsWith("date.") && !k.startsWith("time.") && !k.startsWith("datetime."),
          )
          .slice(0, 8)
          .map(([k, v]) => `${k}: ${v}`),
        qrPayload: merged.qr || merged.qrPayload || `forge-print-test:${version.templateId}`,
      });
    }

    const brand = substituteTemplateVariables(String(layout.brand ?? merged.brand ?? ""), merged);
    const title = substituteTemplateVariables(
      String(layout.title ?? merged.title ?? "Forge Label"),
      merged,
    );
    const subtitle = substituteTemplateVariables(
      String(layout.subtitle ?? merged.subtitle ?? ""),
      merged,
    );
    const caption = substituteTemplateVariables(
      String(layout.caption ?? merged.caption ?? ""),
      merged,
    );
    const qrPayload = substituteTemplateVariables(
      String(layout.qrPayload ?? merged.qr ?? merged.qrPayload ?? ""),
      merged,
    );
    const layoutLines = Array.isArray(layout.lines)
      ? layout.lines.map((l) => substituteTemplateVariables(String(l), merged))
      : [];
    const footerLines = Array.isArray(layout.footerLines)
      ? layout.footerLines.map((l) => substituteTemplateVariables(String(l), merged))
      : [];
    const lines =
      layoutLines.length > 0
        ? layoutLines.filter(Boolean)
        : Object.entries(merged)
            .filter(
              ([k]) =>
                ![
                  "title",
                  "brand",
                  "subtitle",
                  "caption",
                  "qr",
                  "qrPayload",
                  "footer",
                  "instructions",
                ].includes(k) &&
                !k.startsWith("date.") &&
                !k.startsWith("time.") &&
                !k.startsWith("datetime."),
            )
            .slice(0, 12)
            .map(([k, v]) => `${k}: ${v}`);

    return this.renderer.renderLabel({
      widthInches,
      heightInches,
      dpi,
      title: title || "Forge Label",
      lines,
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      ...(caption.trim() ? { caption: caption.trim() } : {}),
      ...(footerLines.filter(Boolean).length ? { footerLines: footerLines.filter(Boolean) } : {}),
      ...(qrPayload.trim() ? { qrPayload: qrPayload.trim() } : {}),
    });
  }

  async listLabelTemplates(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const templates = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(eq(industrialLabelTemplates.tenantId, principal.tenantId))
          .orderBy(asc(industrialLabelTemplates.category), asc(industrialLabelTemplates.name));
        const versions = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(eq(industrialLabelTemplateVersions.tenantId, principal.tenantId));
        return {
          items: templates.map((t) => {
            const tvs = versions.filter((v) => v.templateId === t.id);
            const published = tvs
              .filter((v) => v.status === LabelTemplateVersionStatus.PUBLISHED)
              .sort((a, b) => b.version - a.version)[0];
            const draft = tvs
              .filter((v) => v.status === LabelTemplateVersionStatus.DRAFT)
              .sort((a, b) => b.version - a.version)[0];
            return this.mapLabelTemplate(t, {
              publishedVersion: published?.version ?? null,
              draftVersion: draft?.version ?? null,
            });
          }),
        };
      },
      principal.userId,
    );
  }

  async getLabelTemplate(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Label template not found");
        const versions = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
            ),
          )
          .orderBy(desc(industrialLabelTemplateVersions.version));
        const mappedVersions = [];
        for (const v of versions) {
          const fields = await this.loadTemplateFields(tx, principal.tenantId, v.id);
          mappedVersions.push(this.mapLabelTemplateVersion(v, fields));
        }
        const published = mappedVersions.find(
          (v) => v.status === LabelTemplateVersionStatus.PUBLISHED,
        );
        const draft = mappedVersions.find((v) => v.status === LabelTemplateVersionStatus.DRAFT);
        return this.mapLabelTemplate(row, {
          versions: mappedVersions,
          publishedVersion: published?.version ?? null,
          draftVersion: draft?.version ?? null,
        });
      },
      principal.userId,
    );
  }

  async createLabelTemplate(principal: ForgePrincipal, body: unknown) {
    const input = createLabelTemplateInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const code = input.code.trim().toUpperCase();
        const [dup] = await tx
          .select({ id: industrialLabelTemplates.id })
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
              eq(industrialLabelTemplates.code, code),
            ),
          )
          .limit(1);
        if (dup) throw new ForgeError("CONFLICT", "Template code already exists");

        const templateId = createId();
        const versionId = createId();
        const now = new Date();
        const layout = input.layout ?? defaultElementsLayout();

        await tx.insert(industrialLabelTemplates).values({
          id: templateId,
          tenantId: principal.tenantId,
          code,
          name: input.name.trim(),
          category: input.category.trim(),
          description: input.description ?? null,
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(industrialLabelTemplateVersions).values({
          id: versionId,
          tenantId: principal.tenantId,
          templateId,
          version: 1,
          layoutJson: layout,
          dpi: input.dpi,
          widthInches: input.widthInches,
          heightInches: input.heightInches,
          status: LabelTemplateVersionStatus.DRAFT,
          createdAt: now,
          updatedAt: now,
        });
        const defaultFields =
          input.fields ??
          ([
            { fieldKey: "title", fieldType: "string", label: "Title", required: true },
            { fieldKey: "body", fieldType: "string", label: "Body", required: false },
            { fieldKey: "qr", fieldType: "string", label: "QR payload", required: false },
            { fieldKey: "asset", fieldType: "string", label: "Asset / barcode", required: false },
          ] as const);
        await this.replaceTemplateFields(
          tx,
          principal.tenantId,
          versionId,
          defaultFields.map((f) => {
            const row: {
              fieldKey: string;
              fieldType: string;
              label?: string | null;
              required?: boolean;
              defaultValue?: string | null;
              metadataJson?: Record<string, unknown>;
            } = {
              fieldKey: f.fieldKey,
              fieldType: f.fieldType,
              label: f.label ?? null,
              required: f.required ?? false,
              defaultValue: "defaultValue" in f ? (f.defaultValue ?? null) : null,
            };
            if ("metadataJson" in f && f.metadataJson) {
              row.metadataJson = f.metadataJson as Record<string, unknown>;
            }
            return row;
          }),
        );
        return templateId;
      },
      principal.userId,
    ).then((templateId) => this.getLabelTemplate(principal, templateId));
  }

  async patchLabelTemplate(principal: ForgePrincipal, id: string, body: unknown) {
    const input = patchLabelTemplateInputSchema.parse(body ?? {});
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Label template not found");
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.category !== undefined) patch.category = input.category.trim();
        if (input.description !== undefined) patch.description = input.description;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        await tx
          .update(industrialLabelTemplates)
          .set(patch)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          );
      },
      principal.userId,
    );
    return this.getLabelTemplate(principal, id);
  }

  async createLabelTemplateDraft(principal: ForgePrincipal, id: string) {
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [template] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!template) throw new ForgeError("NOT_FOUND", "Label template not found");

        const [existingDraft] = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.DRAFT),
            ),
          )
          .limit(1);
        if (existingDraft) {
          throw new ForgeError("CONFLICT", "A draft version already exists for this template");
        }

        const [source] = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
            ),
          )
          .orderBy(desc(industrialLabelTemplateVersions.version))
          .limit(1);
        if (!source) throw new ForgeError("NOT_FOUND", "No template version to copy");

        const nextVersion = source.version + 1;
        const versionId = createId();
        const now = new Date();
        await tx.insert(industrialLabelTemplateVersions).values({
          id: versionId,
          tenantId: principal.tenantId,
          templateId: id,
          version: nextVersion,
          layoutJson: source.layoutJson ?? {},
          dpi: source.dpi,
          widthInches: source.widthInches,
          heightInches: source.heightInches,
          status: LabelTemplateVersionStatus.DRAFT,
          createdAt: now,
          updatedAt: now,
        });
        const fields = await this.loadTemplateFields(tx, principal.tenantId, source.id);
        await this.replaceTemplateFields(
          tx,
          principal.tenantId,
          versionId,
          fields.map((f) => ({
            fieldKey: f.fieldKey,
            fieldType: f.fieldType,
            label: f.label,
            required: f.required,
            defaultValue: f.defaultValue,
            metadataJson:
              f.metadataJson && typeof f.metadataJson === "object"
                ? (f.metadataJson as Record<string, unknown>)
                : {},
          })),
        );
        await tx
          .update(industrialLabelTemplates)
          .set({ updatedAt: now })
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          );
      },
      principal.userId,
    );
    return this.getLabelTemplate(principal, id);
  }

  async patchLabelTemplateVersion(
    principal: ForgePrincipal,
    templateId: string,
    versionId: string,
    body: unknown,
  ) {
    const input = patchLabelTemplateVersionInputSchema.parse(body ?? {});
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [version] = await tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.id, versionId),
              eq(industrialLabelTemplateVersions.templateId, templateId),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!version) throw new ForgeError("NOT_FOUND", "Template version not found");
        try {
          assertTemplateVersionMutable(version.status);
        } catch (err) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            err instanceof Error ? err.message : "Published versions are immutable",
          );
        }

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (input.widthInches !== undefined) patch.widthInches = input.widthInches;
        if (input.heightInches !== undefined) patch.heightInches = input.heightInches;
        if (input.dpi !== undefined) patch.dpi = input.dpi;
        if (input.layout !== undefined) patch.layoutJson = input.layout;
        await tx
          .update(industrialLabelTemplateVersions)
          .set(patch)
          .where(
            and(
              eq(industrialLabelTemplateVersions.id, versionId),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
            ),
          );
        if (input.fields) {
          await this.replaceTemplateFields(
            tx,
            principal.tenantId,
            versionId,
            input.fields.map((f) => {
              const row: {
                fieldKey: string;
                fieldType: string;
                label?: string | null;
                required?: boolean;
                defaultValue?: string | null;
                metadataJson?: Record<string, unknown>;
              } = {
                fieldKey: f.fieldKey,
                fieldType: f.fieldType,
                label: f.label ?? null,
                required: f.required ?? false,
                defaultValue: f.defaultValue ?? null,
              };
              if (f.metadataJson) row.metadataJson = f.metadataJson;
              return row;
            }),
          );
        }
      },
      principal.userId,
    );
    return this.getLabelTemplate(principal, templateId);
  }

  async publishLabelTemplate(principal: ForgePrincipal, id: string, body?: unknown) {
    const input = z.object({ versionId: z.string().uuid().optional() }).parse(body ?? {});
    await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [template] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!template) throw new ForgeError("NOT_FOUND", "Label template not found");

        const draftQuery = tx
          .select()
          .from(industrialLabelTemplateVersions)
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.DRAFT),
              ...(input.versionId ? [eq(industrialLabelTemplateVersions.id, input.versionId)] : []),
            ),
          )
          .orderBy(desc(industrialLabelTemplateVersions.version))
          .limit(1);
        const [draft] = await draftQuery;
        if (!draft) throw new ForgeError("VALIDATION_FAILED", "No draft version to publish");

        const now = new Date();
        await tx
          .update(industrialLabelTemplateVersions)
          .set({ status: LabelTemplateVersionStatus.ARCHIVED, updatedAt: now })
          .where(
            and(
              eq(industrialLabelTemplateVersions.templateId, id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.PUBLISHED),
            ),
          );
        await tx
          .update(industrialLabelTemplateVersions)
          .set({ status: LabelTemplateVersionStatus.PUBLISHED, updatedAt: now })
          .where(
            and(
              eq(industrialLabelTemplateVersions.id, draft.id),
              eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
            ),
          );
        await tx
          .update(industrialLabelTemplates)
          .set({ updatedAt: now, enabled: true })
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          );
      },
      principal.userId,
    );
    return this.getLabelTemplate(principal, id);
  }

  async previewLabelTemplate(principal: ForgePrincipal, id: string, body: unknown) {
    const input = previewLabelTemplateInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [template] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!template) throw new ForgeError("NOT_FOUND", "Label template not found");

        let version: typeof industrialLabelTemplateVersions.$inferSelect | undefined;
        if (input.versionId) {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.id, input.versionId),
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
        } else if (input.version) {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                eq(industrialLabelTemplateVersions.version, input.version),
              ),
            )
            .limit(1);
        } else {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.DRAFT),
              ),
            )
            .orderBy(desc(industrialLabelTemplateVersions.version))
            .limit(1);
          if (!version) {
            [version] = await tx
              .select()
              .from(industrialLabelTemplateVersions)
              .where(
                and(
                  eq(industrialLabelTemplateVersions.templateId, id),
                  eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                  eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.PUBLISHED),
                ),
              )
              .orderBy(desc(industrialLabelTemplateVersions.version))
              .limit(1);
          }
        }
        if (!version) throw new ForgeError("NOT_FOUND", "Template version not found");

        const rendered = await this.renderFromTemplateVersion(
          tx,
          principal.tenantId,
          version,
          input.fieldValues ?? {},
          input.output,
        );
        return {
          templateId: id,
          versionId: version.id,
          version: version.version,
          status: version.status,
          contentType: rendered.contentType,
          base64: rendered.buffer.toString("base64"),
          previewDataUrl: rendered.previewDataUrl,
          sha256: rendered.sha256,
          widthInches: rendered.widthInches,
          heightInches: rendered.heightInches,
          dpi: rendered.dpi,
        };
      },
      principal.userId,
    );
  }

  async exportLabelTemplateZpl(principal: ForgePrincipal, id: string, body: unknown) {
    const input = exportLabelTemplateZplInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [template] = await tx
          .select()
          .from(industrialLabelTemplates)
          .where(
            and(
              eq(industrialLabelTemplates.id, id),
              eq(industrialLabelTemplates.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!template) throw new ForgeError("NOT_FOUND", "Label template not found");

        let version: typeof industrialLabelTemplateVersions.$inferSelect | undefined;
        if (input.versionId) {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.id, input.versionId),
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
        } else if (input.version) {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                eq(industrialLabelTemplateVersions.version, input.version),
              ),
            )
            .limit(1);
        } else {
          [version] = await tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.templateId, id),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.DRAFT),
              ),
            )
            .orderBy(desc(industrialLabelTemplateVersions.version))
            .limit(1);
          if (!version) {
            [version] = await tx
              .select()
              .from(industrialLabelTemplateVersions)
              .where(
                and(
                  eq(industrialLabelTemplateVersions.templateId, id),
                  eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                  eq(industrialLabelTemplateVersions.status, LabelTemplateVersionStatus.PUBLISHED),
                ),
              )
              .orderBy(desc(industrialLabelTemplateVersions.version))
              .limit(1);
          }
        }
        if (!version) throw new ForgeError("NOT_FOUND", "Template version not found");

        const layout =
          version.layoutJson && typeof version.layoutJson === "object"
            ? (version.layoutJson as Record<string, unknown>)
            : {};
        const kind = layoutKind(layout);
        if (kind !== "ELEMENTS") {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "ZPL export is available for ELEMENTS layouts only",
          );
        }

        const fields = await this.loadTemplateFields(tx, principal.tenantId, version.id);
        const merged = mergeTemplateFieldValues({
          fields: fields.map((f) => ({
            fieldKey: f.fieldKey,
            required: f.required,
            defaultValue: f.defaultValue,
          })),
          fieldValues: input.fieldValues ?? {},
        });
        const zpl = elementsToZpl({
          widthInches: version.widthInches,
          heightInches: version.heightInches,
          dpi: version.dpi || BRADY_I4311_DPI,
          elements: parseLayoutElements(layout),
          values: merged,
        });
        return {
          templateId: id,
          versionId: version.id,
          version: version.version,
          dpi: version.dpi,
          widthInches: version.widthInches,
          heightInches: version.heightInches,
          zpl,
          contentType: "application/zpl",
          filename: `${template.code}-v${version.version}.zpl`,
        };
      },
      principal.userId,
    );
  }

  async createPrintJob(principal: ForgePrincipal, body: unknown) {
    if (await isDemoTenant(this.db, principal.tenantId)) {
      throw new ForgeError(
        "FORBIDDEN",
        "Printing to real devices is disabled in the DEMO ENVIRONMENT",
      );
    }
    const input = createPrintJobInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const route = await this.resolvePrintDestination(tx, principal.tenantId, {
          printerId: input.printerId ?? null,
          printerGroupId: input.printerGroupId ?? null,
          locationId: input.locationId ?? null,
          divisionId: input.divisionId ?? null,
          module: input.module ?? null,
          recordType: input.recordType ?? null,
        });

        const { printer, bridge, isDirect, failover } = await this.resolvePrinterForPrint(
          tx,
          principal.tenantId,
          route.printerId,
          {
            ...(input.printMode !== undefined ? { printMode: input.printMode } : {}),
            ...(input.acceptFailover !== undefined ? { acceptFailover: input.acceptFailover } : {}),
          },
        );

        const templateId = input.templateId ?? null;
        let templateVersion = input.templateVersion ?? null;
        const mediaDims = await this.resolveMediaDimensions(
          tx,
          principal.tenantId,
          input.mediaProfileId,
          input.widthInches,
          input.heightInches,
        );
        let widthInches = mediaDims.widthInches;
        let heightInches = mediaDims.heightInches;
        let dpi = input.dpi ?? printer.dpi ?? BRADY_I4311_DPI;
        let pinnedVersion: typeof industrialLabelTemplateVersions.$inferSelect | null = null;

        if (templateId) {
          const [tmpl] = await tx
            .select()
            .from(industrialLabelTemplates)
            .where(
              and(
                eq(industrialLabelTemplates.id, templateId),
                eq(industrialLabelTemplates.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!tmpl) throw new ForgeError("NOT_FOUND", "Label template not found");
          const versionQuery = tx
            .select()
            .from(industrialLabelTemplateVersions)
            .where(
              and(
                eq(industrialLabelTemplateVersions.templateId, templateId),
                eq(industrialLabelTemplateVersions.tenantId, principal.tenantId),
                ...(templateVersion
                  ? [eq(industrialLabelTemplateVersions.version, templateVersion)]
                  : [eq(industrialLabelTemplateVersions.status, "PUBLISHED")]),
              ),
            )
            .orderBy(desc(industrialLabelTemplateVersions.version))
            .limit(1);
          const [ver] = await versionQuery;
          if (!ver) throw new ForgeError("NOT_FOUND", "Label template version not found");
          pinnedVersion = ver;
          templateVersion = ver.version;
          widthInches = input.widthInches ?? ver.widthInches;
          heightInches = input.heightInches ?? ver.heightInches;
          dpi = input.dpi ?? ver.dpi ?? dpi;
        }

        const fieldValues = input.fieldValues ?? {};
        const rendered = pinnedVersion
          ? await this.renderFromTemplateVersion(
              tx,
              principal.tenantId,
              pinnedVersion,
              fieldValues,
              "png",
            )
          : await this.renderer.renderLabel(
              this.buildFieldLabelRenderOpts({
                fieldValues,
                widthInches,
                heightInches,
                dpi,
                module: input.module ?? null,
                layout: input.layout ?? null,
              }),
            );

        if (isDirect && rendered.contentType !== "image/png") {
          throw new ForgeError(
            "INTERNAL_ERROR",
            "Label renderer produced a non-PNG artifact. Brady Bluetooth printing requires PNG bitmaps.",
          );
        }

        return this.insertQueuedJob(tx, {
          tenantId: principal.tenantId,
          printer,
          bridge,
          isDirect,
          templateId,
          templateVersion,
          module: input.module ?? null,
          recordType: input.recordType ?? null,
          recordId: input.recordId ?? null,
          requestedBy: principal.userId,
          requestedFromDevice: input.requestedFromDevice ?? null,
          copies: input.copies,
          widthInches: rendered.widthInches,
          heightInches: rendered.heightInches,
          dpi: rendered.dpi,
          orientation: input.orientation ?? null,
          cutMode: input.cutMode ?? null,
          rendered,
          priority: input.priority ?? 0,
          routing: route,
          failover,
        });
      },
      principal.userId,
    );
  }

  private async insertQueuedJob(
    tx: DatabaseTransaction,
    opts: {
      tenantId: string;
      printer: IndustrialPrinterRow;
      bridge: IndustrialPrinterBridgeRow | null;
      isDirect?: boolean;
      batchId?: string | null;
      templateId: string | null;
      templateVersion: number | null;
      module?: string | null;
      recordType?: string | null;
      recordId?: string | null;
      requestedBy?: string | null;
      requestedFromDevice?: string | null;
      copies: number;
      widthInches: number;
      heightInches: number;
      dpi: number;
      orientation?: string | null;
      cutMode?: string | null;
      rendered: {
        buffer: Buffer;
        contentType: string;
        sha256: string;
        widthInches: number;
        heightInches: number;
        dpi: number;
      };
      priority?: number;
      parentJobId?: string | null;
      reprintReason?: string | null;
      retryCount?: number;
      routing?: {
        printerId: string;
        reason: string;
        ruleId?: string | null;
        ruleName?: string | null;
        groupId?: string | null;
        source: string;
      } | null;
      failover?: {
        originalPrinterId: string;
        replacementPrinterId: string;
        reason: string;
      } | null;
    },
  ) {
    const jobId = createId();
    const ext = opts.rendered.contentType === "image/png" ? "png" : "pdf";
    const objectKey = printArtifactObjectKey(opts.tenantId, jobId, ext);
    await this.storage.putObject({
      objectKey,
      body: opts.rendered.buffer,
      mimeType: opts.rendered.contentType,
    });

    const now = new Date();
    const isDirect = opts.isDirect === true || !opts.bridge;
    const status = isDirect ? PrintJobStatus.QUEUED : PrintJobStatus.BRIDGE_ASSIGNED;
    const [job] = await tx
      .insert(industrialPrintJobs)
      .values({
        id: jobId,
        tenantId: opts.tenantId,
        printerId: opts.printer.id,
        bridgeId: isDirect ? null : opts.bridge!.id,
        batchId: opts.batchId ?? null,
        templateId: opts.templateId,
        templateVersion: opts.templateVersion,
        module: opts.module ?? null,
        recordType: opts.recordType ?? null,
        recordId: opts.recordId ?? null,
        requestedBy: opts.requestedBy ?? null,
        requestedFromDevice: opts.requestedFromDevice ?? null,
        copies: opts.copies,
        widthInches: opts.widthInches,
        heightInches: opts.heightInches,
        dpi: opts.dpi,
        orientation: opts.orientation ?? null,
        cutMode: opts.cutMode ?? null,
        artifactType: opts.rendered.contentType === "image/png" ? "PNG" : "PDF",
        artifactStorageKey: objectKey,
        artifactSha256: opts.rendered.sha256,
        status,
        priority: opts.priority ?? 0,
        queuedAt: now,
        parentJobId: opts.parentJobId ?? null,
        reprintReason: opts.reprintReason ?? null,
        retryCount: opts.retryCount ?? 0,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      })
      .returning();

    const day = now.toISOString().slice(0, 10).replace(/-/g, "");
    await this.appendJobEvent(tx, {
      tenantId: opts.tenantId,
      printJobId: jobId,
      event: "job.created",
      status,
      message: `PRINT-${day}-${jobId.slice(0, 8)}`,
      source: "platform",
      metadata: { sha256: opts.rendered.sha256 },
    });
    if (opts.routing) {
      await this.appendJobEvent(tx, {
        tenantId: opts.tenantId,
        printJobId: jobId,
        event: "job.routing.completed",
        status,
        message: opts.routing.reason,
        source: "platform",
        metadata: {
          source: opts.routing.source,
          printerId: opts.routing.printerId,
          ruleId: opts.routing.ruleId ?? null,
          ruleName: opts.routing.ruleName ?? null,
          groupId: opts.routing.groupId ?? null,
        },
      });
    }
    if (opts.failover) {
      await this.appendJobEvent(tx, {
        tenantId: opts.tenantId,
        printJobId: jobId,
        event: "job.failover.accepted",
        status,
        message: opts.failover.reason,
        source: "platform",
        metadata: {
          originalPrinterId: opts.failover.originalPrinterId,
          replacementPrinterId: opts.failover.replacementPrinterId,
        },
      });
    }
    await this.appendJobEvent(tx, {
      tenantId: opts.tenantId,
      printJobId: jobId,
      event: "job.queued",
      status,
      message: isDirect ? "Assigned to direct Bluetooth client" : "Assigned to bridge",
      source: "platform",
    });

    return this.mapJob(job!);
  }

  async listJobs(
    principal: ForgePrincipal,
    query: {
      status?: string;
      queue?: string;
      history?: string;
      printerId?: string;
      bridgeId?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50) || 50));
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const conditions = [eq(industrialPrintJobs.tenantId, principal.tenantId)];
        if (query.printerId) conditions.push(eq(industrialPrintJobs.printerId, query.printerId));
        if (query.bridgeId) conditions.push(eq(industrialPrintJobs.bridgeId, query.bridgeId));

        const statusFilter = (query.status ?? "").trim().toUpperCase();
        if (statusFilter) {
          conditions.push(eq(industrialPrintJobs.status, statusFilter));
        } else if (query.queue === "1" || query.queue === "true") {
          conditions.push(
            sql`${industrialPrintJobs.status} not in (${sql.join(
              [...HISTORY_STATUSES].map((s) => sql`${s}`),
              sql`, `,
            )})`,
          );
        } else if (query.history === "1" || query.history === "true") {
          conditions.push(inArray(industrialPrintJobs.status, [...HISTORY_STATUSES] as string[]));
        }

        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialPrintJobs)
          .where(and(...conditions));
        const rows = await tx
          .select()
          .from(industrialPrintJobs)
          .where(and(...conditions))
          .orderBy(desc(industrialPrintJobs.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize);

        return {
          page,
          pageSize,
          total: countRow?.count ?? rows.length,
          items: rows.map((r) => this.mapJob(r)),
        };
      },
      principal.userId,
    );
  }

  /**
   * Print Manager Phase 1 dashboard: aggregates existing printers, bridges, and jobs.
   * Does not introduce a parallel print stack.
   */
  async getPrintManagerSummary(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printers, bridges, recentJobs, failedTodayRows, statusCounts, labelsTodayRow] =
          await Promise.all([
            tx
              .select()
              .from(industrialPrinters)
              .where(eq(industrialPrinters.tenantId, principal.tenantId))
              .orderBy(asc(industrialPrinters.name)),
            tx
              .select()
              .from(industrialPrinterBridges)
              .where(eq(industrialPrinterBridges.tenantId, principal.tenantId))
              .orderBy(asc(industrialPrinterBridges.name)),
            tx
              .select()
              .from(industrialPrintJobs)
              .where(eq(industrialPrintJobs.tenantId, principal.tenantId))
              .orderBy(desc(industrialPrintJobs.createdAt))
              .limit(25),
            tx
              .select()
              .from(industrialPrintJobs)
              .where(
                and(
                  eq(industrialPrintJobs.tenantId, principal.tenantId),
                  eq(industrialPrintJobs.status, PrintJobStatus.FAILED),
                  sql`${industrialPrintJobs.createdAt} >= date_trunc('day', now() at time zone 'utc')`,
                ),
              )
              .orderBy(desc(industrialPrintJobs.createdAt))
              .limit(20),
            tx
              .select({
                status: industrialPrintJobs.status,
                count: sql<number>`count(*)::int`,
              })
              .from(industrialPrintJobs)
              .where(eq(industrialPrintJobs.tenantId, principal.tenantId))
              .groupBy(industrialPrintJobs.status),
            tx
              .select({
                labels: sql<number>`coalesce(sum(${industrialPrintJobs.copies}), 0)::int`,
                jobs: sql<number>`count(*)::int`,
              })
              .from(industrialPrintJobs)
              .where(
                and(
                  eq(industrialPrintJobs.tenantId, principal.tenantId),
                  inArray(industrialPrintJobs.status, [...PRINT_MANAGER_SUCCESS_STATUSES]),
                  sql`${industrialPrintJobs.completedAt} >= date_trunc('day', now() at time zone 'utc')`,
                ),
              ),
          ]);

        const printerHealth = printers.map((row) => {
          const mapped = this.mapPrinter(row);
          const health = classifyPrintManagerPrinterHealth(mapped);
          return {
            id: mapped.id,
            name: mapped.displayName || mapped.name,
            locationId: mapped.locationId,
            bridgeId: mapped.bridgeId,
            connectionType: mapped.connectionType,
            transportType: mapped.transportType,
            status: health,
            online: mapped.online,
            ready: mapped.ready,
            enabled: mapped.enabled,
            lastSeenAt: mapped.lastSeenAt,
            lastErrorCode: mapped.lastErrorCode,
            lastErrorMessage: mapped.lastErrorMessage,
            currentJobId:
              recentJobs.find(
                (j) =>
                  j.printerId === mapped.id &&
                  PRINT_MANAGER_PRINTING_STATUSES.includes(
                    j.status as (typeof PRINT_MANAGER_PRINTING_STATUSES)[number],
                  ),
              )?.id ?? null,
          };
        });

        const printerCounts = {
          online: 0,
          offline: 0,
          warning: 0,
          error: 0,
          total: printerHealth.length,
        };
        for (const p of printerHealth) {
          if (p.status === "ONLINE") printerCounts.online += 1;
          else if (p.status === "OFFLINE") printerCounts.offline += 1;
          else if (p.status === "WARNING") printerCounts.warning += 1;
          else printerCounts.error += 1;
        }

        const bridgeHealth = bridges.map((row) => {
          const mapped = this.mapBridge(row);
          const printerCount = printers.filter((p) => p.bridgeId === mapped.id).length;
          const pendingJobs = recentJobs.filter(
            (j) =>
              j.bridgeId === mapped.id &&
              (PRINT_MANAGER_QUEUED_STATUSES.includes(
                j.status as (typeof PRINT_MANAGER_QUEUED_STATUSES)[number],
              ) ||
                PRINT_MANAGER_PRINTING_STATUSES.includes(
                  j.status as (typeof PRINT_MANAGER_PRINTING_STATUSES)[number],
                )),
          ).length;
          return {
            id: mapped.id,
            name: mapped.name,
            computerName: mapped.computerName,
            locationId: mapped.locationId,
            version: mapped.bridgeVersion,
            status: mapped.status,
            enabled: mapped.enabled,
            lastSeenAt: mapped.lastSeenAt,
            printerCount,
            pendingJobs,
          };
        });

        const bridgeCounts = {
          online: bridgeHealth.filter((b) => b.enabled && b.status === BridgeStatus.ONLINE).length,
          offline: bridgeHealth.filter(
            (b) =>
              !b.enabled || b.status === BridgeStatus.OFFLINE || b.status === BridgeStatus.DISABLED,
          ).length,
          total: bridgeHealth.length,
        };

        const byStatus = new Map(statusCounts.map((r) => [r.status, Number(r.count) || 0]));
        const countStatuses = (statuses: readonly string[]) =>
          statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);

        const [completedTodayRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.tenantId, principal.tenantId),
              inArray(industrialPrintJobs.status, [...PRINT_MANAGER_SUCCESS_STATUSES]),
              sql`${industrialPrintJobs.completedAt} >= date_trunc('day', now() at time zone 'utc')`,
            ),
          );
        const [failedTodayCountRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.tenantId, principal.tenantId),
              eq(industrialPrintJobs.status, PrintJobStatus.FAILED),
              sql`${industrialPrintJobs.createdAt} >= date_trunc('day', now() at time zone 'utc')`,
            ),
          );

        const batchRows = await tx
          .select()
          .from(industrialPrintBatches)
          .where(eq(industrialPrintBatches.tenantId, principal.tenantId))
          .orderBy(desc(industrialPrintBatches.createdAt))
          .limit(50);

        const batchSummary = {
          active: batchRows.filter((b) => b.status === "PRINTING" || b.status === "QUEUED").length,
          completedToday: batchRows.filter(
            (b) =>
              (b.status === "COMPLETED" || b.status === "PARTIAL") &&
              b.completedAt &&
              b.completedAt.getTime() >=
                Date.UTC(
                  new Date().getUTCFullYear(),
                  new Date().getUTCMonth(),
                  new Date().getUTCDate(),
                ),
          ).length,
          failedToday: batchRows.filter(
            (b) =>
              b.status === "FAILED" &&
              b.completedAt &&
              b.completedAt.getTime() >=
                Date.UTC(
                  new Date().getUTCFullYear(),
                  new Date().getUTCMonth(),
                  new Date().getUTCDate(),
                ),
          ).length,
          jobsCompleted: batchRows.reduce((s, b) => s + (b.completedJobs ?? 0), 0),
          jobsFailed: batchRows.reduce((s, b) => s + (b.failedJobs ?? 0), 0),
          jobsPending: batchRows.reduce(
            (s, b) =>
              s + Math.max(0, (b.totalJobs ?? 0) - (b.completedJobs ?? 0) - (b.failedJobs ?? 0)),
            0,
          ),
        };

        const supplyRows = await tx
          .select()
          .from(industrialPrintSupplies)
          .where(
            and(
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
              eq(industrialPrintSupplies.enabled, true),
            ),
          );
        const supplySummary = {
          warning: 0,
          critical: 0,
          empty: 0,
          total: supplyRows.length,
        };
        for (const s of supplyRows) {
          const level = computeSupplyAlertLevel({
            estimatedRemaining: s.estimatedRemaining,
            warningThreshold: s.warningThreshold,
            criticalThreshold: s.criticalThreshold,
          });
          if (level === PrintSupplyAlertLevel.EMPTY) supplySummary.empty += 1;
          else if (level === PrintSupplyAlertLevel.CRITICAL) supplySummary.critical += 1;
          else if (level === PrintSupplyAlertLevel.LOW) supplySummary.warning += 1;
        }

        const printerNameById = new Map(
          printers.map((p) => [p.id, p.displayName || p.name] as const),
        );
        const bridgeNameById = new Map(bridges.map((b) => [b.id, b.name] as const));

        return {
          printers: printerCounts,
          bridges: bridgeCounts,
          jobs: {
            queued: countStatuses(PRINT_MANAGER_QUEUED_STATUSES),
            printing: countStatuses(PRINT_MANAGER_PRINTING_STATUSES),
            completedToday: completedTodayRow?.count ?? 0,
            failedToday: failedTodayCountRow?.count ?? 0,
            labelsPrintedToday: Array.isArray(labelsTodayRow)
              ? (labelsTodayRow[0]?.labels ?? 0)
              : 0,
            pagesPrintedToday: 0,
          },
          batches: batchSummary,
          supplies: supplySummary,
          liveQueue: recentJobs
            .filter(
              (j) =>
                PRINT_MANAGER_QUEUED_STATUSES.includes(
                  j.status as (typeof PRINT_MANAGER_QUEUED_STATUSES)[number],
                ) ||
                PRINT_MANAGER_PRINTING_STATUSES.includes(
                  j.status as (typeof PRINT_MANAGER_PRINTING_STATUSES)[number],
                ),
            )
            .slice(0, 15)
            .map((j) => ({
              ...this.mapJob(j),
              printerName: j.printerId ? (printerNameById.get(j.printerId) ?? null) : null,
              bridgeName: j.bridgeId ? (bridgeNameById.get(j.bridgeId) ?? null) : null,
            })),
          printerHealth: printerHealth.slice(0, 25),
          bridgeHealth,
          recentErrors: failedTodayRows.map((j) => ({
            id: j.id,
            createdAt: toIso(j.createdAt),
            printerId: j.printerId,
            printerName: j.printerId ? (printerNameById.get(j.printerId) ?? null) : null,
            status: j.status,
            errorCode: j.errorCode,
            errorMessage: j.errorMessage,
            retryCount: j.retryCount,
          })),
        };
      },
      principal.userId,
    );
  }

  async getJob(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [job] = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!job) throw new ForgeError("NOT_FOUND", "Print job not found");

        const events = await tx
          .select()
          .from(industrialPrintJobEvents)
          .where(
            and(
              eq(industrialPrintJobEvents.printJobId, id),
              eq(industrialPrintJobEvents.tenantId, principal.tenantId),
            ),
          )
          .orderBy(asc(industrialPrintJobEvents.createdAt));

        let artifactUrl: string | null = null;
        if (job.artifactStorageKey) {
          const presign = await this.storage.createPresignedDownloadUrl({
            objectKey: job.artifactStorageKey,
            mimeType: job.artifactType === "PNG" ? "image/png" : "application/pdf",
            filename: `${job.id}.${job.artifactType === "PNG" ? "png" : "pdf"}`,
            inline: true,
          });
          artifactUrl = presign.downloadUrl;
        }

        return {
          ...this.mapJob(job),
          artifactUrl,
          events: events.map((e) => ({
            id: e.id,
            event: e.event,
            status: e.status,
            message: e.message,
            source: e.source,
            metadata: e.metadataJson,
            createdAt: toIso(e.createdAt),
          })),
        };
      },
      principal.userId,
    );
  }

  /**
   * Stream the stored print artifact through the API (auth + tenant scoped).
   * Used by Direct Bluetooth so the browser can flatten the PNG without S3 CORS.
   */
  async getJobArtifact(principal: ForgePrincipal, id: string) {
    const job = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .select({
            id: industrialPrintJobs.id,
            artifactStorageKey: industrialPrintJobs.artifactStorageKey,
            artifactType: industrialPrintJobs.artifactType,
          })
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Print job not found");
        return row;
      },
      principal.userId,
    );

    if (!job.artifactStorageKey) {
      throw new ForgeError("NOT_FOUND", "Print artifact is not ready yet.");
    }

    const stream = await this.storage.getObjectStream(job.artifactStorageKey);
    const ext = job.artifactType === "PNG" ? "png" : "pdf";
    const contentType =
      stream.contentType ?? (job.artifactType === "PNG" ? "image/png" : "application/pdf");
    return {
      body: stream.body,
      contentType,
      contentLength: stream.contentLength,
      filename: `${job.id}.${ext}`,
    };
  }

  async cancelJob(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [job] = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!job) throw new ForgeError("NOT_FOUND", "Print job not found");
        if (isTerminalSuccessStatus(job.status) || job.status === PrintJobStatus.CANCELLED) {
          return this.mapJob(job);
        }

        const wasTerminal = BATCH_TERMINAL_JOB_STATUSES.has(job.status);
        const [updated] = await tx
          .update(industrialPrintJobs)
          .set({ status: PrintJobStatus.CANCELLED })
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .returning();
        await this.appendJobEvent(tx, {
          tenantId: principal.tenantId,
          printJobId: id,
          event: "job.cancelled",
          status: PrintJobStatus.CANCELLED,
          message: "Cancelled by user",
          source: "platform",
        });
        if (!wasTerminal && updated?.batchId) {
          await this.applyBatchCounterForJobStatus(
            tx,
            principal.tenantId,
            updated.batchId,
            PrintJobStatus.CANCELLED,
          );
        }
        return this.mapJob(updated!);
      },
      principal.userId,
    );
  }

  async retryJob(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [job] = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!job) throw new ForgeError("NOT_FOUND", "Print job not found");

        // Idempotency: completed / sent jobs are never re-queued.
        if (isTerminalSuccessStatus(job.status)) {
          return this.mapJob(job);
        }
        if (job.status !== PrintJobStatus.FAILED && job.status !== PrintJobStatus.EXPIRED) {
          throw new ForgeError("BAD_REQUEST", "Only failed or expired jobs can be retried");
        }

        const now = new Date();
        const [updated] = await tx
          .update(industrialPrintJobs)
          .set({
            status: PrintJobStatus.BRIDGE_ASSIGNED,
            queuedAt: now,
            failedAt: null,
            errorCode: null,
            errorMessage: null,
            retryCount: job.retryCount + 1,
          })
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .returning();
        await this.appendJobEvent(tx, {
          tenantId: principal.tenantId,
          printJobId: id,
          event: "job.retried",
          status: PrintJobStatus.BRIDGE_ASSIGNED,
          message: `Retry #${job.retryCount + 1}`,
          source: "platform",
        });
        return this.mapJob(updated!);
      },
      principal.userId,
    );
  }

  async reprintJob(principal: ForgePrincipal, id: string, body: unknown) {
    const input = reprintJobInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [parent] = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!parent) throw new ForgeError("NOT_FOUND", "Print job not found");
        if (!parent.printerId) {
          throw new ForgeError("BAD_REQUEST", "Parent job has no printer assignment");
        }

        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, parent.printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!printer) {
          throw new ForgeError("BAD_REQUEST", "Printer no longer available");
        }

        const isDirect =
          !parent.bridgeId ||
          isDirectBluetoothPrintPath({
            bridgeId: printer.bridgeId,
            transportType: printer.transportType,
          });
        let bridge: IndustrialPrinterBridgeRow | null = null;
        if (!isDirect) {
          if (!parent.bridgeId) {
            throw new ForgeError("BAD_REQUEST", "Parent job has no printer/bridge assignment");
          }
          bridge = await this.loadBridgeForPrinter(tx, principal.tenantId, parent.bridgeId);
          if (!bridge) {
            throw new ForgeError("BAD_REQUEST", "Printer or bridge no longer available");
          }
        }

        // Re-render from parent dimensions (same WYSIWYG renderer path).
        const rendered = await this.renderer.renderLabel({
          widthInches: parent.widthInches ?? DEFAULT_WIDTH_IN,
          heightInches: parent.heightInches ?? DEFAULT_HEIGHT_IN,
          dpi: parent.dpi ?? BRADY_I4311_DPI,
          title: "Reprint",
          lines: [`Parent: ${parent.id}`, `Reason: ${input.reason}`],
          qrPayload: `forge-reprint:${parent.id}`,
        });

        return this.insertQueuedJob(tx, {
          tenantId: principal.tenantId,
          printer,
          bridge,
          isDirect,
          templateId: parent.templateId,
          templateVersion: parent.templateVersion,
          module: parent.module,
          recordType: parent.recordType,
          recordId: parent.recordId,
          requestedBy: principal.userId,
          copies: input.copies ?? parent.copies,
          widthInches: rendered.widthInches,
          heightInches: rendered.heightInches,
          dpi: rendered.dpi,
          orientation: parent.orientation,
          cutMode: parent.cutMode,
          rendered,
          parentJobId: parent.id,
          reprintReason: input.reason,
          priority: parent.priority,
        });
      },
      principal.userId,
    );
  }

  private async applyBatchCounterForJobStatus(
    tx: DatabaseTransaction,
    tenantId: string,
    batchId: string,
    status: string,
  ) {
    const normalized = String(status).toUpperCase();
    if (!BATCH_TERMINAL_JOB_STATUSES.has(normalized)) return;

    const [batch] = await tx
      .select()
      .from(industrialPrintBatches)
      .where(
        and(eq(industrialPrintBatches.id, batchId), eq(industrialPrintBatches.tenantId, tenantId)),
      )
      .limit(1);
    if (!batch) return;

    const completedDelta =
      normalized === PrintJobStatus.COMPLETED || normalized === PrintJobStatus.SENT_TO_PRINTER
        ? 1
        : 0;
    const failedDelta =
      normalized === PrintJobStatus.FAILED ||
      normalized === PrintJobStatus.CANCELLED ||
      normalized === PrintJobStatus.EXPIRED
        ? 1
        : 0;

    const completedJobs = batch.completedJobs + completedDelta;
    let failedJobs = batch.failedJobs + failedDelta;

    // stopOnFail: cancel remaining claimable jobs so they do not keep printing after a failure.
    if (
      batch.stopOnFail &&
      (normalized === PrintJobStatus.FAILED || normalized === PrintJobStatus.EXPIRED)
    ) {
      const cancelled = await this.cancelRemainingBatchJobs(tx, tenantId, batchId, {
        reason: "Batch stop-on-fail: cancelled after a job failure",
      });
      failedJobs += cancelled;
    }

    const nextStatus = computeBatchStatusFromCounters({
      totalJobs: batch.totalJobs,
      completedJobs,
      failedJobs,
    });
    const patch: Partial<typeof industrialPrintBatches.$inferInsert> = {
      completedJobs: Math.min(completedJobs, batch.totalJobs),
      failedJobs: Math.min(failedJobs, batch.totalJobs),
      status: nextStatus,
    };
    const sum = (patch.completedJobs ?? 0) + (patch.failedJobs ?? 0);
    if (sum > batch.totalJobs) {
      patch.failedJobs = Math.max(0, batch.totalJobs - (patch.completedJobs ?? 0));
    }
    if (nextStatus === "COMPLETED" || nextStatus === "FAILED" || nextStatus === "PARTIAL") {
      patch.completedAt = new Date();
    }

    await tx
      .update(industrialPrintBatches)
      .set(patch)
      .where(
        and(eq(industrialPrintBatches.id, batchId), eq(industrialPrintBatches.tenantId, tenantId)),
      );
  }

  /**
   * Cancel non-terminal jobs in a batch (stop-on-fail). Returns how many were cancelled.
   * Does not recurse into applyBatchCounter — caller adjusts counters.
   */
  private async cancelRemainingBatchJobs(
    tx: DatabaseTransaction,
    tenantId: string,
    batchId: string,
    opts: { reason: string },
  ): Promise<number> {
    const rows = await tx
      .select()
      .from(industrialPrintJobs)
      .where(
        and(
          eq(industrialPrintJobs.tenantId, tenantId),
          eq(industrialPrintJobs.batchId, batchId),
          inArray(industrialPrintJobs.status, [...BATCH_CANCELABLE_JOB_STATUSES]),
        ),
      );
    if (rows.length === 0) return 0;

    for (const job of rows) {
      await tx
        .update(industrialPrintJobs)
        .set({
          status: PrintJobStatus.CANCELLED,
          errorCode: "BATCH_STOP_ON_FAIL",
          errorMessage: opts.reason,
        })
        .where(and(eq(industrialPrintJobs.id, job.id), eq(industrialPrintJobs.tenantId, tenantId)));
      await this.appendJobEvent(tx, {
        tenantId,
        printJobId: job.id,
        event: "job.cancelled",
        status: PrintJobStatus.CANCELLED,
        message: opts.reason,
        source: "platform",
        metadata: { batchId, stopOnFail: true },
      });
    }
    return rows.length;
  }

  async createPrintBatch(principal: ForgePrincipal, body: unknown) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.batch.enabled",
      "Batch printing",
    );
    const input = createPrintBatchInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const firstItem = input.items[0];
        const route = await this.resolvePrintDestination(tx, principal.tenantId, {
          printerId: input.printerId ?? null,
          printerGroupId: input.printerGroupId ?? null,
          locationId: input.locationId ?? null,
          divisionId: input.divisionId ?? null,
          module: firstItem?.module ?? null,
          recordType: firstItem?.recordType ?? null,
        });
        const { printer, bridge, isDirect, failover } = await this.resolvePrinterForPrint(
          tx,
          principal.tenantId,
          route.printerId,
          {
            ...(input.printMode !== undefined ? { printMode: input.printMode } : {}),
            ...(input.acceptFailover !== undefined ? { acceptFailover: input.acceptFailover } : {}),
          },
        );

        const mediaDims = await this.resolveMediaDimensions(
          tx,
          principal.tenantId,
          input.mediaProfileId,
          input.widthInches,
          input.heightInches,
        );
        const dpi = input.dpi ?? printer.dpi ?? BRADY_I4311_DPI;
        const printMode =
          input.printMode ?? (isDirect ? ForgePrintMode.DIRECT_BLUETOOTH : ForgePrintMode.BRIDGE);

        const batchId = createId();
        const [batch] = await tx
          .insert(industrialPrintBatches)
          .values({
            id: batchId,
            tenantId: principal.tenantId,
            requestedBy: principal.userId,
            printerId: printer.id,
            name: input.name ?? null,
            stopOnFail: input.stopOnFail,
            printMode,
            mediaProfileId: input.mediaProfileId ?? null,
            copiesPerItem: input.copiesPerItem,
            totalJobs: 0,
            completedJobs: 0,
            failedJobs: 0,
            status: "PRINTING",
          })
          .returning();

        const jobs = [];
        const itemCount = input.items.length;
        for (let i = 0; i < itemCount; i++) {
          const item = input.items[i]!;
          const fieldValues = item.fieldValues ?? {};
          const rendered = await this.renderer.renderLabel(
            this.buildFieldLabelRenderOpts({
              fieldValues,
              widthInches: mediaDims.widthInches,
              heightInches: mediaDims.heightInches,
              dpi,
              module: item.module ?? null,
              titleOverride: item.title ?? null,
              layout: input.layout ?? null,
            }),
          );

          // Higher priority for earlier items so claim order stays sequential.
          const priority = itemCount - i;
          const job = await this.insertQueuedJob(tx, {
            tenantId: principal.tenantId,
            printer,
            bridge,
            isDirect,
            batchId,
            templateId: null,
            templateVersion: null,
            module: item.module ?? null,
            recordType: item.recordType ?? null,
            recordId: item.recordId ?? null,
            requestedBy: principal.userId,
            copies: input.copiesPerItem,
            widthInches: rendered.widthInches,
            heightInches: rendered.heightInches,
            dpi: rendered.dpi,
            orientation: input.orientation ?? "AUTO",
            cutMode: input.cutMode ?? null,
            rendered,
            priority,
            routing: route,
            failover,
          });
          jobs.push(job);
        }

        const [updatedBatch] = await tx
          .update(industrialPrintBatches)
          .set({ totalJobs: jobs.length })
          .where(
            and(
              eq(industrialPrintBatches.id, batchId),
              eq(industrialPrintBatches.tenantId, principal.tenantId),
            ),
          )
          .returning();

        return {
          ...this.mapBatch(updatedBatch ?? batch!),
          jobs,
        };
      },
      principal.userId,
    );
  }

  async listPrintBatches(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(industrialPrintBatches)
          .where(eq(industrialPrintBatches.tenantId, principal.tenantId))
          .orderBy(desc(industrialPrintBatches.createdAt))
          .limit(100);
        return { items: rows.map((r) => this.mapBatch(r)) };
      },
      principal.userId,
    );
  }

  async getPrintBatch(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [batch] = await tx
          .select()
          .from(industrialPrintBatches)
          .where(
            and(
              eq(industrialPrintBatches.id, id),
              eq(industrialPrintBatches.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!batch) throw new ForgeError("NOT_FOUND", "Print batch not found");
        const jobs = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.batchId, id),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .orderBy(desc(industrialPrintJobs.priority), asc(industrialPrintJobs.createdAt));
        return { ...this.mapBatch(batch), jobs: jobs.map((j) => this.mapJob(j)) };
      },
      principal.userId,
    );
  }

  async onAuthenticatedJobStatus(principal: ForgePrincipal, jobId: string, body: unknown) {
    const input = printJobStatusUpdateSchema.parse(body ?? {}) as PrintJobStatusUpdate;
    const status = String(input.status).trim().toUpperCase();

    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [job] = await tx
          .select()
          .from(industrialPrintJobs)
          .where(
            and(
              eq(industrialPrintJobs.id, jobId),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!job) throw new ForgeError("NOT_FOUND", "Print job not found");
        if (job.bridgeId != null) {
          throw new ForgeError(
            "BAD_REQUEST",
            "Bridge-assigned jobs must report status via the printer bridge",
          );
        }
        const ownsJob = job.requestedBy === principal.userId;
        if (
          !ownsJob &&
          !principal.permissions.has("industrial.printer.print") &&
          !principal.permissions.has("industrial.admin")
        ) {
          throw new ForgeError("FORBIDDEN", "Not allowed to update this print job");
        }

        if (isTerminalSuccessStatus(job.status) && isTerminalSuccessStatus(status)) {
          return this.mapJob(job);
        }

        const wasTerminal = BATCH_TERMINAL_JOB_STATUSES.has(job.status);
        const now = new Date();
        const patch: Partial<typeof industrialPrintJobs.$inferInsert> = { status };
        if (status === PrintJobStatus.RECEIVED) patch.receivedAt = now;
        if (
          status === PrintJobStatus.PRINTING ||
          status === PrintJobStatus.SPOOLING ||
          status === PrintJobStatus.TRANSMITTING
        ) {
          patch.startedAt = job.startedAt ?? now;
        }
        if (isTerminalSuccessStatus(status)) patch.completedAt = now;
        if (status === PrintJobStatus.FAILED) {
          patch.failedAt = now;
          patch.errorCode = input.errorCode ?? null;
          patch.errorMessage = input.errorMessage ?? input.message ?? null;
        }

        const [updated] = await tx
          .update(industrialPrintJobs)
          .set(patch)
          .where(
            and(
              eq(industrialPrintJobs.id, jobId),
              eq(industrialPrintJobs.tenantId, principal.tenantId),
            ),
          )
          .returning();

        await this.appendJobEvent(tx, {
          tenantId: principal.tenantId,
          printJobId: jobId,
          event: `job.status.${status.toLowerCase()}`,
          status,
          message: input.message ?? input.errorMessage ?? null,
          source: "client",
          metadata: (input.metadata as Record<string, unknown> | undefined) ?? {},
        });

        if (!wasTerminal && updated?.batchId && BATCH_TERMINAL_JOB_STATUSES.has(status)) {
          await this.applyBatchCounterForJobStatus(tx, principal.tenantId, updated.batchId, status);
        }

        if (!wasTerminal && updated && isTerminalSuccessStatus(status)) {
          await this.applySupplyUsageForCompletedJob(tx, {
            tenantId: principal.tenantId,
            principal,
            job: updated,
          });
        }

        return this.mapJob(updated!);
      },
      principal.userId,
    );
  }

  async registerDirectBluetoothPrinter(principal: ForgePrincipal, body: unknown) {
    const input = registerDirectBluetoothPrinterInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();

        // printer.locationId FK → industrial_sites (not supply locations).
        let locationId: string | null = null;
        if (input.locationId) {
          const [site] = await tx
            .select({ id: industrialSites.id })
            .from(industrialSites)
            .where(
              and(
                eq(industrialSites.id, input.locationId),
                eq(industrialSites.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          locationId = site?.id ?? null;
        }

        let divisionId: string | null = null;
        if (input.divisionId) {
          const [dept] = await tx
            .select({ id: industrialDepartments.id })
            .from(industrialDepartments)
            .where(
              and(
                eq(industrialDepartments.id, input.divisionId),
                eq(industrialDepartments.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          divisionId = dept?.id ?? null;
        }

        const [existing] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.tenantId, principal.tenantId),
              eq(industrialPrinters.bluetoothSavedId, input.bluetoothSavedId),
              isNull(industrialPrinters.bridgeId),
            ),
          )
          .limit(1);

        if (existing) {
          const [updated] = await tx
            .update(industrialPrinters)
            .set({
              name: input.name,
              displayName: input.displayName ?? input.name,
              model: input.model,
              manufacturer: "Brady",
              connectionType: PrinterConnectionType.BLUETOOTH_BLE,
              transportType: PrinterTransportType.BRADY_WEB_BLUETOOTH,
              bluetoothDeviceId: input.bluetoothDeviceId ?? existing.bluetoothDeviceId,
              bluetoothSavedId: input.bluetoothSavedId,
              deviceIdentifier: input.bluetoothSavedId,
              locationId: locationId ?? existing.locationId,
              divisionId: divisionId ?? existing.divisionId,
              dpi: existing.dpi ?? BRADY_I4311_DPI,
              online: true,
              connected: true,
              ready: true,
              enabled: true,
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(industrialPrinters.id, existing.id),
                eq(industrialPrinters.tenantId, principal.tenantId),
              ),
            )
            .returning();
          return this.mapPrinter(updated!);
        }

        const [inserted] = await tx
          .insert(industrialPrinters)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            bridgeId: null,
            name: input.name,
            displayName: input.displayName ?? input.name,
            manufacturer: "Brady",
            model: input.model,
            connectionType: PrinterConnectionType.BLUETOOTH_BLE,
            transportType: PrinterTransportType.BRADY_WEB_BLUETOOTH,
            deviceIdentifier: input.bluetoothSavedId,
            bluetoothDeviceId: input.bluetoothDeviceId ?? null,
            bluetoothSavedId: input.bluetoothSavedId,
            dpi: BRADY_I4311_DPI,
            locationId,
            divisionId,
            online: true,
            connected: true,
            ready: true,
            enabled: true,
            lastSeenAt: now,
          })
          .returning();
        return this.mapPrinter(inserted!);
      },
      principal.userId,
    );
  }

  private async ensureDefaultMediaProfiles(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<IndustrialPrinterMediaProfileRow[]> {
    const existing = await tx
      .select()
      .from(industrialPrinterMediaProfiles)
      .where(eq(industrialPrinterMediaProfiles.tenantId, tenantId))
      .orderBy(asc(industrialPrinterMediaProfiles.name));
    if (existing.length > 0) return existing;

    const inserted: IndustrialPrinterMediaProfileRow[] = [];
    for (const seed of DEFAULT_BRADY_MEDIA) {
      const [row] = await tx
        .insert(industrialPrinterMediaProfiles)
        .values({
          id: createId(),
          tenantId,
          manufacturer: "Brady",
          printerModel: "i4311",
          name: seed.name,
          widthInches: seed.widthInches,
          heightInches: seed.heightInches,
          continuous: false,
          dieCut: true,
        })
        .returning();
      if (row) inserted.push(row);
    }
    return inserted;
  }

  async listMediaProfiles(principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await this.ensureDefaultMediaProfiles(tx, principal.tenantId);
        return { items: rows.map((r) => this.mapMediaProfile(r)) };
      },
      principal.userId,
    );
  }

  async createMediaProfile(principal: ForgePrincipal, body: unknown) {
    const input = createMediaProfileInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .insert(industrialPrinterMediaProfiles)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            manufacturer: input.manufacturer,
            printerModel: input.printerModel,
            partNumber: input.partNumber ?? null,
            name: input.name,
            widthInches: input.widthInches,
            heightInches: input.heightInches,
            continuous: input.continuous ?? false,
            dieCut: input.dieCut ?? true,
            printableWidth: input.printableWidth ?? null,
            printableHeight: input.printableHeight ?? null,
            orientation: input.orientation ?? null,
          })
          .returning();
        return this.mapMediaProfile(row!);
      },
      principal.userId,
    );
  }

  async patchMediaProfile(principal: ForgePrincipal, id: string, body: unknown) {
    const input = patchMediaProfileInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrinterMediaProfiles)
          .where(
            and(
              eq(industrialPrinterMediaProfiles.id, id),
              eq(industrialPrinterMediaProfiles.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Media profile not found");

        const [updated] = await tx
          .update(industrialPrinterMediaProfiles)
          .set({
            ...(input.manufacturer !== undefined ? { manufacturer: input.manufacturer } : {}),
            ...(input.printerModel !== undefined ? { printerModel: input.printerModel } : {}),
            ...(input.partNumber !== undefined ? { partNumber: input.partNumber } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.widthInches !== undefined ? { widthInches: input.widthInches } : {}),
            ...(input.heightInches !== undefined ? { heightInches: input.heightInches } : {}),
            ...(input.continuous !== undefined ? { continuous: input.continuous } : {}),
            ...(input.dieCut !== undefined ? { dieCut: input.dieCut } : {}),
            ...(input.printableWidth !== undefined ? { printableWidth: input.printableWidth } : {}),
            ...(input.printableHeight !== undefined
              ? { printableHeight: input.printableHeight }
              : {}),
            ...(input.orientation !== undefined ? { orientation: input.orientation } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(industrialPrinterMediaProfiles.id, id),
              eq(industrialPrinterMediaProfiles.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return this.mapMediaProfile(updated!);
      },
      principal.userId,
    );
  }

  async deleteMediaProfile(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [deleted] = await tx
          .delete(industrialPrinterMediaProfiles)
          .where(
            and(
              eq(industrialPrinterMediaProfiles.id, id),
              eq(industrialPrinterMediaProfiles.tenantId, principal.tenantId),
            ),
          )
          .returning();
        if (!deleted) throw new ForgeError("NOT_FOUND", "Media profile not found");
        return { ok: true, id };
      },
      principal.userId,
    );
  }

  async getPrinterProfile(principal: ForgePrincipal, printerId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select({ id: industrialPrinters.id })
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");
        const profile = await this.loadPrinterProfile(tx, principal.tenantId, printerId);
        return profile
          ? this.mapPrinterProfile(profile)
          : {
              id: null,
              printerId,
              dpi: null,
              defaultMediaId: null,
              defaultOrientation: null,
              defaultCopies: 1,
              defaultCutMode: null,
              darkness: null,
              speed: null,
              xOffset: null,
              yOffset: null,
              preferredTransport: null,
              fallbackPrinterId: null,
              createdAt: null,
              updatedAt: null,
            };
      },
      principal.userId,
    );
  }

  async upsertPrinterProfile(principal: ForgePrincipal, printerId: string, body: unknown) {
    const input = upsertPrinterProfileInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select({ id: industrialPrinters.id })
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");

        if (input.fallbackPrinterId) {
          const [fallback] = await tx
            .select({ id: industrialPrinters.id })
            .from(industrialPrinters)
            .where(
              and(
                eq(industrialPrinters.id, input.fallbackPrinterId),
                eq(industrialPrinters.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!fallback) throw new ForgeError("NOT_FOUND", "Fallback printer not found");
          if (fallback.id === printerId) {
            throw new ForgeError("BAD_REQUEST", "Fallback printer cannot be the same printer");
          }
        }

        const existing = await this.loadPrinterProfile(tx, principal.tenantId, printerId);
        if (existing) {
          const [updated] = await tx
            .update(industrialPrinterProfiles)
            .set({
              ...(input.dpi !== undefined ? { dpi: input.dpi } : {}),
              ...(input.defaultMediaId !== undefined
                ? { defaultMediaId: input.defaultMediaId }
                : {}),
              ...(input.defaultCopies !== undefined ? { defaultCopies: input.defaultCopies } : {}),
              ...(input.preferredTransport !== undefined
                ? { preferredTransport: input.preferredTransport }
                : {}),
              ...(input.fallbackPrinterId !== undefined
                ? { fallbackPrinterId: input.fallbackPrinterId }
                : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(industrialPrinterProfiles.id, existing.id),
                eq(industrialPrinterProfiles.tenantId, principal.tenantId),
              ),
            )
            .returning();
          return this.mapPrinterProfile(updated!);
        }

        const [inserted] = await tx
          .insert(industrialPrinterProfiles)
          .values({
            id: createId(),
            tenantId: principal.tenantId,
            printerId,
            dpi: input.dpi ?? null,
            defaultMediaId: input.defaultMediaId ?? null,
            defaultCopies: input.defaultCopies ?? 1,
            preferredTransport: input.preferredTransport ?? null,
            fallbackPrinterId: input.fallbackPrinterId ?? null,
          })
          .returning();
        return this.mapPrinterProfile(inserted!);
      },
      principal.userId,
    );
  }

  async getPrinterHealth(principal: ForgePrincipal, printerId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [printer] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.id, printerId),
              eq(industrialPrinters.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");
        const bridge = await this.loadBridgeForPrinter(tx, principal.tenantId, printer.bridgeId);
        const mapped = this.mapPrinter(printer);
        return {
          printer: mapped,
          bridge: bridge ? this.mapBridge(bridge) : null,
          ribbonOk: printer.ribbonOk,
          mediaOk: printer.mediaOk,
          batteryPercent: printer.batteryPercent,
          supplyName: printer.supplyName,
          lastHealthAt: toIso(printer.lastHealthAt),
          capabilities: mapped.capabilities,
          online: printer.online,
          connected: printer.connected,
          ready: printer.ready,
        };
      },
      principal.userId,
    );
  }

  async runDiagnostics(principal: ForgePrincipal, printerId: string) {
    const health = await this.getPrinterHealth(principal, printerId);
    return {
      ...health,
      diagnostics: {
        ranAt: new Date().toISOString(),
        bridgeReachable: health.bridge
          ? health.bridge.enabled && health.bridge.status === BridgeStatus.ONLINE
          : null,
        printerReady: health.ready,
        supplyOk: health.ribbonOk !== false && health.mediaOk !== false,
      },
    };
  }

  // ─── Public bridge auth ─────────────────────────────────────────────────

  private async resolveTenantForPairingCode(codeHash: string): Promise<string> {
    const rows = await this.db.execute(
      sql`select forge_industrial_printer_bridge_tenant_for_pairing_code(${codeHash}) as tenant_id`,
    );
    const tenantId = extractTenantId(rows);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Pairing code not found or expired");
    return tenantId;
  }

  private async resolveTenantForDeviceToken(deviceId: string, tokenHash: string): Promise<string> {
    const rows = await this.db.execute(
      sql`select forge_industrial_printer_bridge_tenant_for_device_token(${deviceId}, ${tokenHash}) as tenant_id`,
    );
    const tenantId = extractTenantId(rows);
    if (!tenantId) throw new ForgeError("UNAUTHORIZED", "Invalid bridge credentials");
    return tenantId;
  }

  async authenticateBridge(
    deviceId: string,
    accessToken: string,
  ): Promise<IndustrialPrinterBridgeRow> {
    const id = String(deviceId ?? "").trim();
    const token = String(accessToken ?? "").trim();
    if (!id || !token) throw new ForgeError("UNAUTHORIZED", "Bridge credentials required");

    const tokenHash = hashOpaqueSecret(token);
    const tenantId = await this.resolveTenantForDeviceToken(id, tokenHash);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [bridge] = await tx
        .select()
        .from(industrialPrinterBridges)
        .where(
          and(
            eq(industrialPrinterBridges.deviceId, id),
            eq(industrialPrinterBridges.accessTokenHash, tokenHash),
            eq(industrialPrinterBridges.tenantId, tenantId),
            eq(industrialPrinterBridges.enabled, true),
          ),
        )
        .limit(1);
      if (!bridge || bridge.status === BridgeStatus.DISABLED) {
        throw new ForgeError("UNAUTHORIZED", "Invalid bridge credentials");
      }
      return bridge;
    });
  }

  async consumePairing(body: unknown) {
    const input = consumeBridgePairingInputSchema.parse(body ?? {}) as ConsumeBridgePairingInput;
    const code = String(input.pairingCode).trim().toUpperCase();
    const codeHash = hashOpaqueSecret(code);
    const tenantId = await this.resolveTenantForPairingCode(codeHash);
    const accessToken = randomBytes(32).toString("base64url");
    const accessTokenHash = hashOpaqueSecret(accessToken);
    const deviceId = String(input.deviceId).trim();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [pairing] = await tx
        .select()
        .from(industrialBridgePairingCodes)
        .where(
          and(
            eq(industrialBridgePairingCodes.codeHash, codeHash),
            eq(industrialBridgePairingCodes.tenantId, tenantId),
            isNull(industrialBridgePairingCodes.consumedAt),
          ),
        )
        .limit(1);
      if (!pairing) throw new ForgeError("NOT_FOUND", "Pairing code not found or already used");
      if (pairing.expiresAt.getTime() <= Date.now()) {
        throw new ForgeError("BAD_REQUEST", "Pairing code expired");
      }
      if (!pairing.bridgeId) {
        throw new ForgeError("INTERNAL_ERROR", "Pairing code has no bridge");
      }

      const [existingDevice] = await tx
        .select({ id: industrialPrinterBridges.id })
        .from(industrialPrinterBridges)
        .where(
          and(
            eq(industrialPrinterBridges.tenantId, tenantId),
            eq(industrialPrinterBridges.deviceId, deviceId),
          ),
        )
        .limit(1);
      if (existingDevice && existingDevice.id !== pairing.bridgeId) {
        throw new ForgeError("CONFLICT", "Device is already paired to another bridge");
      }

      const now = new Date();
      const bridgePatch: Partial<typeof industrialPrinterBridges.$inferInsert> = {
        deviceId,
        computerName: input.computerName ?? null,
        osVersion: input.osVersion ?? null,
        bridgeVersion: input.bridgeVersion ?? null,
        status: BridgeStatus.ONLINE,
        enabled: true,
        accessTokenHash,
        pairingCodeHash: null,
        pairingExpiresAt: null,
        registeredAt: now,
        lastSeenAt: now,
        updatedAt: now,
      };
      if (input.name?.trim()) bridgePatch.name = input.name.trim();

      const [bridge] = await tx
        .update(industrialPrinterBridges)
        .set(bridgePatch)
        .where(
          and(
            eq(industrialPrinterBridges.id, pairing.bridgeId),
            eq(industrialPrinterBridges.tenantId, tenantId),
          ),
        )
        .returning();
      if (!bridge) throw new ForgeError("NOT_FOUND", "Bridge not found for pairing");

      await tx
        .update(industrialBridgePairingCodes)
        .set({ consumedAt: now, bridgeId: bridge.id })
        .where(
          and(
            eq(industrialBridgePairingCodes.id, pairing.id),
            eq(industrialBridgePairingCodes.tenantId, tenantId),
          ),
        );

      const tenantRows = await tx.execute(sql`
        select tenant_key::text as tenant_key,
          coalesce(nullif(btrim(display_name), ''), nullif(btrim(legal_name), ''), slug)::text as display_name
        from tenants
        where id = ${tenantId}::uuid
        limit 1
      `);
      const tenantRow = (
        Array.isArray(tenantRows)
          ? tenantRows[0]
          : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
      ) as Record<string, unknown> | undefined;

      return {
        bridgeId: bridge.id,
        deviceId: bridge.deviceId,
        accessToken,
        tenantId,
        tenantKey: tenantRow?.tenant_key ? String(tenantRow.tenant_key) : null,
        tenantName: tenantRow?.display_name ? String(tenantRow.display_name) : null,
        locationId: bridge.locationId,
        divisionId: bridge.divisionId,
      };
    });
  }

  async heartbeat(deviceId: string, accessToken: string, body: unknown) {
    const bridge = await this.authenticateBridge(deviceId, accessToken);
    const input = bridgeHeartbeatInputSchema.parse(body ?? {}) as BridgeHeartbeatInput;
    return withTenantTransaction(this.db, bridge.tenantId, async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(industrialPrinterBridges)
        .set({
          status: input.status === "OFFLINE" ? BridgeStatus.OFFLINE : BridgeStatus.ONLINE,
          bridgeVersion: input.version ?? bridge.bridgeVersion,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialPrinterBridges.id, bridge.id),
            eq(industrialPrinterBridges.tenantId, bridge.tenantId),
          ),
        )
        .returning();
      return {
        bridgeId: updated!.id,
        status: updated!.status,
        lastSeenAt: toIso(updated!.lastSeenAt),
        printers: input.printers ?? null,
      };
    });
  }

  async upsertPrinters(deviceId: string, accessToken: string, body: unknown) {
    const bridge = await this.authenticateBridge(deviceId, accessToken);
    const printers = z
      .array(bridgePrinterUpsertSchema)
      .parse(
        Array.isArray(body) ? body : ((body as { printers?: unknown })?.printers ?? []),
      ) as BridgePrinterUpsert[];

    return withTenantTransaction(this.db, bridge.tenantId, async (tx) => {
      const now = new Date();
      const results: ReturnType<IndustrialPrintService["mapPrinter"]>[] = [];

      for (const p of printers) {
        const transport =
          p.transportType ??
          defaultTransportForConnection(p.connectionType) ??
          PrinterTransportType.WINDOWS_SPOOLER;
        const dpi = p.dpi ?? BRADY_I4311_DPI;

        const [existing] = await tx
          .select()
          .from(industrialPrinters)
          .where(
            and(
              eq(industrialPrinters.tenantId, bridge.tenantId),
              eq(industrialPrinters.bridgeId, bridge.id),
              eq(industrialPrinters.deviceIdentifier, p.deviceIdentifier),
            ),
          )
          .limit(1);

        if (existing) {
          const hasHealth =
            p.ribbonOk !== undefined ||
            p.mediaOk !== undefined ||
            p.batteryPercent !== undefined ||
            p.supplyName !== undefined;
          const [updated] = await tx
            .update(industrialPrinters)
            .set({
              name: p.name,
              displayName: p.displayName ?? existing.displayName,
              manufacturer: p.manufacturer ?? existing.manufacturer,
              model: p.model ?? existing.model,
              serialNumber: p.serialNumber ?? existing.serialNumber,
              connectionType: p.connectionType ?? existing.connectionType,
              transportType: transport,
              windowsQueueName: p.windowsQueueName ?? existing.windowsQueueName,
              bluetoothDeviceId: p.bluetoothDeviceId ?? existing.bluetoothDeviceId,
              bluetoothSavedId: p.bluetoothSavedId ?? existing.bluetoothSavedId,
              dpi,
              maxPrintWidthInches: p.maxPrintWidthInches ?? existing.maxPrintWidthInches,
              supportsBitmap: p.supportsBitmap ?? existing.supportsBitmap,
              supportsCut: p.supportsCut ?? existing.supportsCut,
              supportsFeed: p.supportsFeed ?? existing.supportsFeed,
              supportsMultipleCopies: p.supportsMultipleCopies ?? existing.supportsMultipleCopies,
              online: p.online ?? existing.online,
              connected: p.connected ?? existing.connected,
              ready: p.ready ?? existing.ready,
              ribbonOk: p.ribbonOk ?? existing.ribbonOk,
              mediaOk: p.mediaOk ?? existing.mediaOk,
              batteryPercent: p.batteryPercent ?? existing.batteryPercent,
              supplyName: p.supplyName ?? existing.supplyName,
              ...(hasHealth ? { lastHealthAt: now } : {}),
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(industrialPrinters.id, existing.id),
                eq(industrialPrinters.tenantId, bridge.tenantId),
              ),
            )
            .returning();
          results.push(this.mapPrinter(updated!));
        } else {
          const hasHealth =
            p.ribbonOk !== undefined ||
            p.mediaOk !== undefined ||
            p.batteryPercent !== undefined ||
            p.supplyName !== undefined;
          const [inserted] = await tx
            .insert(industrialPrinters)
            .values({
              id: createId(),
              tenantId: bridge.tenantId,
              bridgeId: bridge.id,
              name: p.name,
              displayName: p.displayName ?? p.name,
              manufacturer: p.manufacturer ?? null,
              model: p.model ?? null,
              serialNumber: p.serialNumber ?? null,
              connectionType: p.connectionType ?? null,
              transportType: transport,
              windowsQueueName: p.windowsQueueName ?? null,
              deviceIdentifier: p.deviceIdentifier,
              bluetoothDeviceId: p.bluetoothDeviceId ?? null,
              bluetoothSavedId: p.bluetoothSavedId ?? null,
              dpi,
              maxPrintWidthInches: p.maxPrintWidthInches ?? null,
              supportsBitmap: p.supportsBitmap ?? true,
              supportsCut: p.supportsCut ?? false,
              supportsFeed: p.supportsFeed ?? true,
              supportsMultipleCopies: p.supportsMultipleCopies ?? true,
              locationId: bridge.locationId,
              divisionId: bridge.divisionId,
              online: p.online ?? false,
              connected: p.connected ?? false,
              ready: p.ready ?? false,
              ribbonOk: p.ribbonOk ?? null,
              mediaOk: p.mediaOk ?? null,
              batteryPercent: p.batteryPercent ?? null,
              supplyName: p.supplyName ?? null,
              lastHealthAt: hasHealth ? now : null,
              lastSeenAt: now,
              // Discovered printers stay unpublished until an admin publishes them.
              enabled: false,
            })
            .returning();
          results.push(this.mapPrinter(inserted!));
        }
      }

      await tx
        .update(industrialPrinterBridges)
        .set({ lastSeenAt: now, updatedAt: now, status: BridgeStatus.ONLINE })
        .where(
          and(
            eq(industrialPrinterBridges.id, bridge.id),
            eq(industrialPrinterBridges.tenantId, bridge.tenantId),
          ),
        );

      return { items: results };
    });
  }

  async claimNextJobs(deviceId: string, accessToken: string, limit = 10) {
    const bridge = await this.authenticateBridge(deviceId, accessToken);
    if (await isDemoTenant(this.db, bridge.tenantId)) {
      return { items: [] };
    }
    const take = Math.min(25, Math.max(1, limit));

    return withTenantTransaction(this.db, bridge.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialPrintJobs)
        .where(
          and(
            eq(industrialPrintJobs.tenantId, bridge.tenantId),
            eq(industrialPrintJobs.bridgeId, bridge.id),
            inArray(industrialPrintJobs.status, [...CLAIMABLE_STATUSES]),
          ),
        )
        .orderBy(desc(industrialPrintJobs.priority), asc(industrialPrintJobs.queuedAt))
        .limit(take);

      const jobs = [];
      const now = new Date();
      for (const job of rows) {
        // Defense: never hand out another tenant's job even if bridgeId leaked.
        if (job.tenantId !== bridge.tenantId) {
          throw new ForgeError("FORBIDDEN", "Tenant isolation violation");
        }
        if (isTerminalSuccessStatus(job.status)) {
          continue;
        }

        let printerRow: IndustrialPrinterRow | null = null;
        if (job.printerId) {
          const [printer] = await tx
            .select()
            .from(industrialPrinters)
            .where(
              and(
                eq(industrialPrinters.id, job.printerId),
                eq(industrialPrinters.tenantId, bridge.tenantId),
              ),
            )
            .limit(1);
          printerRow = printer ?? null;
          // Unpublished / disabled printers stay queued until an admin publishes them.
          if (printerRow && !printerRow.enabled) {
            continue;
          }
        }

        if (job.status === PrintJobStatus.QUEUED || job.status === PrintJobStatus.BRIDGE_ASSIGNED) {
          await tx
            .update(industrialPrintJobs)
            .set({
              status: PrintJobStatus.DELIVERING,
              deliveredAt: now,
            })
            .where(
              and(
                eq(industrialPrintJobs.id, job.id),
                eq(industrialPrintJobs.tenantId, bridge.tenantId),
              ),
            );
          await this.appendJobEvent(tx, {
            tenantId: bridge.tenantId,
            printJobId: job.id,
            event: "job.delivering",
            status: PrintJobStatus.DELIVERING,
            message: "Claimed by bridge",
            source: "bridge",
          });
        }

        let artifactUrl = "";
        if (job.artifactStorageKey) {
          const presign = await this.storage.createPresignedDownloadUrl({
            objectKey: job.artifactStorageKey,
            mimeType: job.artifactType === "PNG" ? "image/png" : "application/pdf",
            filename: `${job.id}.${job.artifactType === "PNG" ? "png" : "pdf"}`,
            inline: true,
          });
          artifactUrl = presign.downloadUrl;
        }

        jobs.push(
          buildBridgeClaimJobPayload({
            job,
            printer: printerRow,
            artifactUrl,
            status: PrintJobStatus.DELIVERING,
          }),
        );
      }

      return { items: jobs };
    });
  }

  async updateJobStatusFromBridge(
    deviceId: string,
    accessToken: string,
    jobId: string,
    body: unknown,
  ) {
    const bridge = await this.authenticateBridge(deviceId, accessToken);
    const input = printJobStatusUpdateSchema.parse(body ?? {}) as PrintJobStatusUpdate;
    const status = String(input.status).trim().toUpperCase();

    return withTenantTransaction(this.db, bridge.tenantId, async (tx) => {
      const [job] = await tx
        .select()
        .from(industrialPrintJobs)
        .where(
          and(eq(industrialPrintJobs.id, jobId), eq(industrialPrintJobs.tenantId, bridge.tenantId)),
        )
        .limit(1);
      if (!job) throw new ForgeError("NOT_FOUND", "Print job not found");
      if (job.bridgeId !== bridge.id) {
        throw new ForgeError("FORBIDDEN", "Job is not assigned to this bridge");
      }
      if (job.tenantId !== bridge.tenantId) {
        throw new ForgeError("FORBIDDEN", "Tenant isolation violation");
      }

      // Idempotency: already completed — acknowledge without mutating.
      if (isTerminalSuccessStatus(job.status) && isTerminalSuccessStatus(status)) {
        return this.mapJob(job);
      }

      const wasTerminal = BATCH_TERMINAL_JOB_STATUSES.has(job.status);
      const now = new Date();
      const patch: Partial<typeof industrialPrintJobs.$inferInsert> = { status };
      if (status === PrintJobStatus.RECEIVED) patch.receivedAt = now;
      if (
        status === PrintJobStatus.PRINTING ||
        status === PrintJobStatus.SPOOLING ||
        status === PrintJobStatus.TRANSMITTING
      ) {
        patch.startedAt = job.startedAt ?? now;
      }
      if (isTerminalSuccessStatus(status)) patch.completedAt = now;
      if (status === PrintJobStatus.FAILED) {
        patch.failedAt = now;
        patch.errorCode = input.errorCode ?? null;
        patch.errorMessage = input.errorMessage ?? input.message ?? null;
      }

      const [updated] = await tx
        .update(industrialPrintJobs)
        .set(patch)
        .where(
          and(eq(industrialPrintJobs.id, jobId), eq(industrialPrintJobs.tenantId, bridge.tenantId)),
        )
        .returning();

      await this.appendJobEvent(tx, {
        tenantId: bridge.tenantId,
        printJobId: jobId,
        event: `job.status.${status.toLowerCase()}`,
        status,
        message: input.message ?? input.errorMessage ?? null,
        source: "bridge",
        metadata: (input.metadata as Record<string, unknown> | undefined) ?? {},
      });

      if (!wasTerminal && updated?.batchId && BATCH_TERMINAL_JOB_STATUSES.has(status)) {
        await this.applyBatchCounterForJobStatus(tx, bridge.tenantId, updated.batchId, status);
      }

      if (!wasTerminal && updated && isTerminalSuccessStatus(status)) {
        await this.applySupplyUsageForCompletedJob(tx, {
          tenantId: bridge.tenantId,
          actorUserId: updated.requestedBy,
          job: updated,
        });
      }

      return this.mapJob(updated!);
    });
  }

  private mapSupply(row: IndustrialPrintSupplyRow, printerName?: string | null) {
    const alertLevel = computeSupplyAlertLevel({
      estimatedRemaining: row.estimatedRemaining,
      warningThreshold: row.warningThreshold,
      criticalThreshold: row.criticalThreshold,
    });
    const alertUserIds = Array.isArray(row.alertUserIds)
      ? (row.alertUserIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    return {
      id: row.id,
      printerId: row.printerId,
      printerName: printerName ?? null,
      supplyType: row.supplyType,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      startingQuantity: row.startingQuantity,
      estimatedRemaining: row.estimatedRemaining,
      unitsConsumed: row.unitsConsumed,
      warningThreshold: row.warningThreshold,
      criticalThreshold: row.criticalThreshold,
      percentRemaining: supplyPercentRemaining(row.startingQuantity, row.estimatedRemaining),
      alertLevel,
      lastAlertLevel: row.lastAlertLevel,
      lastReplacedAt: toIso(row.lastReplacedAt),
      alertUserIds,
      estimated: true as const,
      enabled: row.enabled,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private supplyNotifyPrincipal(tenantId: string, actorUserId: string | null): ForgePrincipal {
    return {
      authenticationIdentityId: "print-supply",
      userId: actorUserId ?? "00000000-0000-0000-0000-000000000000",
      personId: null,
      tenantId,
      organizationIds: [],
      permissions: new Set(),
      activeProducts: new Set(),
      activeModules: new Set(),
      correlationId: "print-supply",
      requestId: "print-supply",
      authProvider: "COGNITO",
      isPlatformAdmin: false,
    };
  }

  /**
   * Decrement estimated stock for supplies linked to the job's printer (or tenant-wide).
   * Labels / specialty media consume by copies; ribbon also decrements when linked.
   */
  private async applySupplyUsageForCompletedJob(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      actorUserId?: string | null;
      principal?: ForgePrincipal;
      job: IndustrialPrintJobRow;
    },
  ) {
    const units = Math.max(1, input.job.copies ?? 1);
    const conditions = [
      eq(industrialPrintSupplies.tenantId, input.tenantId),
      eq(industrialPrintSupplies.enabled, true),
    ];
    if (input.job.printerId) {
      conditions.push(
        or(
          eq(industrialPrintSupplies.printerId, input.job.printerId),
          isNull(industrialPrintSupplies.printerId),
        )!,
      );
    } else {
      conditions.push(isNull(industrialPrintSupplies.printerId));
    }

    const rows = await tx
      .select()
      .from(industrialPrintSupplies)
      .where(and(...conditions));

    const consumableTypes = new Set(["LABELS", "PAPER", "SPECIALTY_MEDIA", "CARDS", "RIBBON"]);
    let printerName: string | null = null;
    if (input.job.printerId) {
      const [p] = await tx
        .select({ name: industrialPrinters.name, displayName: industrialPrinters.displayName })
        .from(industrialPrinters)
        .where(
          and(
            eq(industrialPrinters.id, input.job.printerId),
            eq(industrialPrinters.tenantId, input.tenantId),
          ),
        )
        .limit(1);
      printerName = p ? p.displayName || p.name : null;
    }

    const principal =
      input.principal ?? this.supplyNotifyPrincipal(input.tenantId, input.actorUserId ?? null);

    for (const row of rows) {
      if (!consumableTypes.has(String(row.supplyType).toUpperCase())) continue;
      const next = applyEstimatedSupplyConsumption({
        estimatedRemaining: row.estimatedRemaining,
        unitsConsumed: row.unitsConsumed,
        warningThreshold: row.warningThreshold,
        criticalThreshold: row.criticalThreshold,
        lastAlertLevel: row.lastAlertLevel,
        unitsUsed: units,
      });
      await tx
        .update(industrialPrintSupplies)
        .set({
          estimatedRemaining: next.estimatedRemaining,
          unitsConsumed: next.unitsConsumed,
          lastAlertLevel: next.alertLevel,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(industrialPrintSupplies.id, row.id),
            eq(industrialPrintSupplies.tenantId, input.tenantId),
          ),
        );

      if (next.shouldNotify) {
        const alertUserIds = Array.isArray(row.alertUserIds)
          ? (row.alertUserIds as unknown[]).filter((x): x is string => typeof x === "string")
          : [];
        await notifyPrintSupplyAlert(this.notifications, principal, {
          supplyId: row.id,
          supplyName: row.name,
          printerName,
          alertLevel: next.alertLevel,
          estimatedRemaining: next.estimatedRemaining,
          unit: row.unit,
          percentRemaining: supplyPercentRemaining(row.startingQuantity, next.estimatedRemaining),
          userIds: alertUserIds,
        });
      }
    }
  }

  async listPrintSupplies(principal: ForgePrincipal) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.supplies.enabled",
      "Print supplies",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const rows = await tx
          .select()
          .from(industrialPrintSupplies)
          .where(eq(industrialPrintSupplies.tenantId, principal.tenantId))
          .orderBy(asc(industrialPrintSupplies.name));
        const printers = await tx
          .select({
            id: industrialPrinters.id,
            name: industrialPrinters.name,
            displayName: industrialPrinters.displayName,
          })
          .from(industrialPrinters)
          .where(eq(industrialPrinters.tenantId, principal.tenantId));
        const nameById = new Map(printers.map((p) => [p.id, p.displayName || p.name] as const));
        return {
          items: rows.map((r) => this.mapSupply(r, r.printerId ? nameById.get(r.printerId) : null)),
        };
      },
      principal.userId,
    );
  }

  async createPrintSupply(principal: ForgePrincipal, body: unknown) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.supplies.enabled",
      "Print supplies",
    );
    const input = createPrintSupplyInputSchema.parse(body ?? {});
    if (input.criticalThreshold > input.warningThreshold) {
      throw new ForgeError(
        "BAD_REQUEST",
        "criticalThreshold must be less than or equal to warningThreshold",
      );
    }
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        if (input.printerId) {
          const [printer] = await tx
            .select({ id: industrialPrinters.id })
            .from(industrialPrinters)
            .where(
              and(
                eq(industrialPrinters.id, input.printerId),
                eq(industrialPrinters.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");
        }
        const remaining = input.estimatedRemaining ?? input.startingQuantity;
        const alertLevel = computeSupplyAlertLevel({
          estimatedRemaining: remaining,
          warningThreshold: input.warningThreshold,
          criticalThreshold: input.criticalThreshold,
        });
        const id = createId();
        const [row] = await tx
          .insert(industrialPrintSupplies)
          .values({
            id,
            tenantId: principal.tenantId,
            printerId: input.printerId ?? null,
            supplyType: input.supplyType,
            name: input.name,
            sku: input.sku ?? null,
            unit: input.unit,
            startingQuantity: input.startingQuantity,
            estimatedRemaining: remaining,
            unitsConsumed: 0,
            warningThreshold: input.warningThreshold,
            criticalThreshold: input.criticalThreshold,
            lastAlertLevel: alertLevel,
            alertUserIds: input.alertUserIds ?? [],
            enabled: input.enabled ?? true,
          })
          .returning();
        return this.mapSupply(row!);
      },
      principal.userId,
    );
  }

  async patchPrintSupply(principal: ForgePrincipal, id: string, body: unknown) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.supplies.enabled",
      "Print supplies",
    );
    const input = patchPrintSupplyInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrintSupplies)
          .where(
            and(
              eq(industrialPrintSupplies.id, id),
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Print supply not found");

        const warning = input.warningThreshold ?? existing.warningThreshold;
        const critical = input.criticalThreshold ?? existing.criticalThreshold;
        if (critical > warning) {
          throw new ForgeError(
            "BAD_REQUEST",
            "criticalThreshold must be less than or equal to warningThreshold",
          );
        }
        if (input.printerId) {
          const [printer] = await tx
            .select({ id: industrialPrinters.id })
            .from(industrialPrinters)
            .where(
              and(
                eq(industrialPrinters.id, input.printerId),
                eq(industrialPrinters.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!printer) throw new ForgeError("NOT_FOUND", "Printer not found");
        }

        const remaining = input.estimatedRemaining ?? existing.estimatedRemaining;
        const alertLevel = computeSupplyAlertLevel({
          estimatedRemaining: remaining,
          warningThreshold: warning,
          criticalThreshold: critical,
        });
        const [row] = await tx
          .update(industrialPrintSupplies)
          .set({
            ...(input.printerId !== undefined ? { printerId: input.printerId } : {}),
            ...(input.supplyType !== undefined ? { supplyType: input.supplyType } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.sku !== undefined ? { sku: input.sku } : {}),
            ...(input.unit !== undefined ? { unit: input.unit } : {}),
            ...(input.startingQuantity !== undefined
              ? { startingQuantity: input.startingQuantity }
              : {}),
            ...(input.estimatedRemaining !== undefined
              ? { estimatedRemaining: input.estimatedRemaining }
              : {}),
            ...(input.unitsConsumed !== undefined ? { unitsConsumed: input.unitsConsumed } : {}),
            ...(input.warningThreshold !== undefined
              ? { warningThreshold: input.warningThreshold }
              : {}),
            ...(input.criticalThreshold !== undefined
              ? { criticalThreshold: input.criticalThreshold }
              : {}),
            ...(input.alertUserIds !== undefined ? { alertUserIds: input.alertUserIds } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            lastAlertLevel: alertLevel,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(industrialPrintSupplies.id, id),
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return this.mapSupply(row!);
      },
      principal.userId,
    );
  }

  async replacePrintSupply(principal: ForgePrincipal, id: string, body: unknown) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.supplies.enabled",
      "Print supplies",
    );
    const input = replacePrintSupplyInputSchema.parse(body ?? {});
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(industrialPrintSupplies)
          .where(
            and(
              eq(industrialPrintSupplies.id, id),
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Print supply not found");
        const alertLevel = computeSupplyAlertLevel({
          estimatedRemaining: input.quantity,
          warningThreshold: existing.warningThreshold,
          criticalThreshold: existing.criticalThreshold,
        });
        const [row] = await tx
          .update(industrialPrintSupplies)
          .set({
            startingQuantity: input.quantity,
            estimatedRemaining: input.quantity,
            unitsConsumed: input.resetConsumed === false ? existing.unitsConsumed : 0,
            lastReplacedAt: new Date(),
            lastAlertLevel: alertLevel,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(industrialPrintSupplies.id, id),
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
            ),
          )
          .returning();
        return this.mapSupply(row!);
      },
      principal.userId,
    );
  }

  async deletePrintSupply(principal: ForgePrincipal, id: string) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.supplies.enabled",
      "Print supplies",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const deleted = await tx
          .delete(industrialPrintSupplies)
          .where(
            and(
              eq(industrialPrintSupplies.id, id),
              eq(industrialPrintSupplies.tenantId, principal.tenantId),
            ),
          )
          .returning({ id: industrialPrintSupplies.id });
        if (!deleted.length) throw new ForgeError("NOT_FOUND", "Print supply not found");
        return { id };
      },
      principal.userId,
    );
  }

  private async loadAnalyticsJobs(
    tx: DatabaseTransaction,
    tenantId: string,
    query: Record<string, string | undefined>,
  ) {
    const parsed = printAnalyticsQuerySchema.parse({
      from: query.from,
      to: query.to,
      locationId: query.locationId,
      divisionId: query.divisionId,
      module: query.module,
      printerId: query.printerId,
      bridgeId: query.bridgeId,
    });
    const { from, to } = parseAnalyticsRange(parsed);
    const conditions = [
      eq(industrialPrintJobs.tenantId, tenantId),
      gte(industrialPrintJobs.createdAt, from),
      lte(industrialPrintJobs.createdAt, to),
    ];
    if (parsed.module) conditions.push(eq(industrialPrintJobs.module, parsed.module));
    if (parsed.printerId) conditions.push(eq(industrialPrintJobs.printerId, parsed.printerId));
    if (parsed.bridgeId) conditions.push(eq(industrialPrintJobs.bridgeId, parsed.bridgeId));

    let jobs = await tx
      .select()
      .from(industrialPrintJobs)
      .where(and(...conditions))
      .orderBy(asc(industrialPrintJobs.createdAt));

    if (parsed.locationId || parsed.divisionId) {
      const printers = await tx
        .select({
          id: industrialPrinters.id,
          locationId: industrialPrinters.locationId,
          divisionId: industrialPrinters.divisionId,
        })
        .from(industrialPrinters)
        .where(eq(industrialPrinters.tenantId, tenantId));
      const allowed = new Set(
        printers
          .filter((p) => {
            if (parsed.locationId && p.locationId !== parsed.locationId) return false;
            if (parsed.divisionId && p.divisionId !== parsed.divisionId) return false;
            return true;
          })
          .map((p) => p.id),
      );
      jobs = jobs.filter((j) => j.printerId != null && allowed.has(j.printerId));
    }

    return { jobs, from, to, filters: parsed };
  }

  async getPrintAnalyticsSummary(
    principal: ForgePrincipal,
    query: Record<string, string | undefined>,
  ) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.analytics.enabled",
      "Print analytics",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const { jobs, from, to } = await this.loadAnalyticsJobs(tx, principal.tenantId, query);
        const total = jobs.length;
        const completed = jobs.filter((j) => isTerminalSuccessStatus(j.status)).length;
        const failed = jobs.filter((j) => j.status === PrintJobStatus.FAILED).length;
        const cancelled = jobs.filter((j) => j.status === PrintJobStatus.CANCELLED).length;
        const reprints = jobs.filter((j) => j.parentJobId != null).length;
        const retried = jobs.filter((j) => (j.retryCount ?? 0) > 0).length;
        const labelsPrinted = jobs
          .filter((j) => isTerminalSuccessStatus(j.status))
          .reduce((s, j) => s + (j.copies ?? 1), 0);
        const queueSamples = jobs.map((j) => {
          if (!j.queuedAt || !j.startedAt) return null;
          return j.startedAt.getTime() - j.queuedAt.getTime();
        });
        const printSamples = jobs.map((j) => {
          if (!j.startedAt || !j.completedAt) return null;
          return j.completedAt.getTime() - j.startedAt.getTime();
        });
        const byModule = new Map<string, number>();
        for (const j of jobs) {
          const key = j.module || "(none)";
          byModule.set(key, (byModule.get(key) ?? 0) + 1);
        }
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          totals: {
            jobs: total,
            completed,
            failed,
            cancelled,
            reprints,
            labelsPrinted,
            pagesPrinted: 0,
            failureRate: computePrintFailureRate(total, failed),
            retryRate: computePrintRetryRate(total, retried),
            averageQueueMs: averageMs(queueSamples),
            averagePrintMs: averageMs(printSamples),
          },
          byModule: [...byModule.entries()]
            .map(([module, count]) => ({ module, count }))
            .sort((a, b) => b.count - a.count),
        };
      },
      principal.userId,
    );
  }

  async getPrintAnalyticsVolume(
    principal: ForgePrincipal,
    query: Record<string, string | undefined>,
  ) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.analytics.enabled",
      "Print analytics",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const { jobs, from, to } = await this.loadAnalyticsJobs(tx, principal.tenantId, query);
        const byDay = new Map<string, { jobs: number; labels: number; failed: number }>();
        const byMonth = new Map<string, { jobs: number; labels: number; failed: number }>();
        for (const j of jobs) {
          const day = dayBucketUtc(j.createdAt);
          const month = monthBucketUtc(j.createdAt);
          const dayRow = byDay.get(day) ?? { jobs: 0, labels: 0, failed: 0 };
          dayRow.jobs += 1;
          if (isTerminalSuccessStatus(j.status)) dayRow.labels += j.copies ?? 1;
          if (j.status === PrintJobStatus.FAILED) dayRow.failed += 1;
          byDay.set(day, dayRow);
          const monthRow = byMonth.get(month) ?? { jobs: 0, labels: 0, failed: 0 };
          monthRow.jobs += 1;
          if (isTerminalSuccessStatus(j.status)) monthRow.labels += j.copies ?? 1;
          if (j.status === PrintJobStatus.FAILED) monthRow.failed += 1;
          byMonth.set(month, monthRow);
        }
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          byDay: [...byDay.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, v]) => ({ date, ...v })),
          byMonth: [...byMonth.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, v]) => ({ month, ...v })),
        };
      },
      principal.userId,
    );
  }

  async getPrintAnalyticsFailures(
    principal: ForgePrincipal,
    query: Record<string, string | undefined>,
  ) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.analytics.enabled",
      "Print analytics",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const { jobs, from, to } = await this.loadAnalyticsJobs(tx, principal.tenantId, query);
        const failed = jobs.filter((j) => j.status === PrintJobStatus.FAILED);
        const byCode = new Map<string, number>();
        for (const j of failed) {
          const code = j.errorCode || "(unknown)";
          byCode.set(code, (byCode.get(code) ?? 0) + 1);
        }
        const printers = await tx
          .select({
            id: industrialPrinters.id,
            name: industrialPrinters.name,
            displayName: industrialPrinters.displayName,
          })
          .from(industrialPrinters)
          .where(eq(industrialPrinters.tenantId, principal.tenantId));
        const nameById = new Map(printers.map((p) => [p.id, p.displayName || p.name] as const));
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          totalFailed: failed.length,
          failureRate: computePrintFailureRate(jobs.length, failed.length),
          byErrorCode: [...byCode.entries()]
            .map(([errorCode, count]) => ({ errorCode, count }))
            .sort((a, b) => b.count - a.count),
          recent: failed
            .slice()
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 50)
            .map((j) => ({
              id: j.id,
              createdAt: toIso(j.createdAt),
              printerId: j.printerId,
              printerName: j.printerId ? (nameById.get(j.printerId) ?? null) : null,
              module: j.module,
              errorCode: j.errorCode,
              errorMessage: j.errorMessage,
              retryCount: j.retryCount,
            })),
        };
      },
      principal.userId,
    );
  }

  async getPrintAnalyticsPrinters(
    principal: ForgePrincipal,
    query: Record<string, string | undefined>,
  ) {
    await this.assertPrintingFeatureEnabled(
      principal,
      "forge.printing.analytics.enabled",
      "Print analytics",
    );
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const { jobs, from, to } = await this.loadAnalyticsJobs(tx, principal.tenantId, query);
        const printers = await tx
          .select()
          .from(industrialPrinters)
          .where(eq(industrialPrinters.tenantId, principal.tenantId));
        const byPrinter = new Map<
          string,
          { jobs: number; completed: number; failed: number; labels: number; printMs: number[] }
        >();
        for (const j of jobs) {
          const key = j.printerId || "(unassigned)";
          const row = byPrinter.get(key) ?? {
            jobs: 0,
            completed: 0,
            failed: 0,
            labels: 0,
            printMs: [],
          };
          row.jobs += 1;
          if (isTerminalSuccessStatus(j.status)) {
            row.completed += 1;
            row.labels += j.copies ?? 1;
            if (j.startedAt && j.completedAt) {
              row.printMs.push(j.completedAt.getTime() - j.startedAt.getTime());
            }
          }
          if (j.status === PrintJobStatus.FAILED) row.failed += 1;
          byPrinter.set(key, row);
        }
        const nameById = new Map(printers.map((p) => [p.id, p.displayName || p.name] as const));
        const windowMs = Math.max(1, to.getTime() - from.getTime());
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          printers: [...byPrinter.entries()]
            .map(([printerId, v]) => {
              const avgPrint = averageMs(v.printMs);
              const busyMs = v.printMs.reduce((a, b) => a + b, 0);
              return {
                printerId: printerId === "(unassigned)" ? null : printerId,
                printerName:
                  printerId === "(unassigned)"
                    ? "(unassigned)"
                    : (nameById.get(printerId) ?? printerId),
                jobs: v.jobs,
                completed: v.completed,
                failed: v.failed,
                labelsPrinted: v.labels,
                failureRate: computePrintFailureRate(v.jobs, v.failed),
                averagePrintMs: avgPrint,
                /** Estimated busy fraction of the window based on measured print durations. */
                utilizationPercent:
                  Math.round(Math.min(100, (busyMs / windowMs) * 100) * 100) / 100,
              };
            })
            .sort((a, b) => b.jobs - a.jobs),
        };
      },
      principal.userId,
    );
  }

  getConnectInfo(deviceId: string) {
    const base = this.env.PUBLIC_API_URL.replace(/\/$/, "");
    const wsBase = base.replace(/^http/, "ws");
    return {
      deviceId,
      pollJobsPath: `/api/v1/printer-bridge/v1/bridges/${encodeURIComponent(deviceId)}/jobs`,
      heartbeatPath: `/api/v1/printer-bridge/v1/bridges/${encodeURIComponent(deviceId)}/heartbeat`,
      statusPath: `/api/v1/printer-bridge/v1/jobs/{jobId}/status`,
      webSocketUrlHint: `${wsBase}/printer-bridge/v1/connect`,
      note: "Phase 1 prefers HTTPS job polling; WebSocket push is optional.",
    };
  }
}
