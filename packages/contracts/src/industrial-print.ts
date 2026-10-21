/**
 * Forge Printer Bridge / Print Service contracts (Phase 1).
 */
import { z } from "zod";

export const PrinterConnectionType = {
  USB: "USB",
  ETHERNET: "ETHERNET",
  WIFI: "WIFI",
  BLUETOOTH_BLE: "BLUETOOTH_BLE",
} as const;
export type PrinterConnectionType = (typeof PrinterConnectionType)[keyof typeof PrinterConnectionType];

export const PrinterTransportType = {
  WINDOWS_SPOOLER: "WINDOWS_SPOOLER",
  BRADY_WEB_BLUETOOTH: "BRADY_WEB_BLUETOOTH",
  RAW_NETWORK: "RAW_NETWORK",
  ZPL: "ZPL",
} as const;
export type PrinterTransportType = (typeof PrinterTransportType)[keyof typeof PrinterTransportType];

export const ForgePrintMode = {
  BRIDGE: "BRIDGE",
  DIRECT_BLUETOOTH: "DIRECT_BLUETOOTH",
} as const;
export type ForgePrintMode = (typeof ForgePrintMode)[keyof typeof ForgePrintMode];

export const PrintJobStatus = {
  CREATED: "CREATED",
  RENDERING: "RENDERING",
  QUEUED: "QUEUED",
  BRIDGE_ASSIGNED: "BRIDGE_ASSIGNED",
  DELIVERING: "DELIVERING",
  RECEIVED: "RECEIVED",
  VALIDATING: "VALIDATING",
  WAITING_FOR_PRINTER: "WAITING_FOR_PRINTER",
  SPOOLING: "SPOOLING",
  TRANSMITTING: "TRANSMITTING",
  PRINTING: "PRINTING",
  COMPLETED: "COMPLETED",
  SENT_TO_PRINTER: "SENT_TO_PRINTER",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  PRINT_RESULT_UNKNOWN: "PRINT_RESULT_UNKNOWN",
} as const;
export type PrintJobStatus = (typeof PrintJobStatus)[keyof typeof PrintJobStatus];

export const BridgeStatus = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  PAIRING: "PAIRING",
  DISABLED: "DISABLED",
} as const;
export type BridgeStatus = (typeof BridgeStatus)[keyof typeof BridgeStatus];

/** Brady i4311 initial profile — 300 DPI. */
export const BRADY_I4311_DPI = 300;

export function inchesToPixels(inches: number, dpi: number = BRADY_I4311_DPI): number {
  return Math.round(inches * dpi);
}

export const printerCapabilitiesSchema = z.object({
  print: z.boolean(),
  bitmapPrint: z.boolean(),
  multipleCopies: z.boolean(),
  cut: z.boolean(),
  feed: z.boolean(),
  status: z.boolean(),
  mediaDetection: z.boolean(),
  ribbonDetection: z.boolean(),
  batteryStatus: z.boolean(),
  dpi: z.array(z.number().int().positive()),
  maxPrintWidthInches: z.number().positive().optional(),
});
export type PrinterCapabilities = z.infer<typeof printerCapabilitiesSchema>;

/** Relative layout knobs for field-rendered labels (1 = default). */
export const printLabelLayoutSchema = z.object({
  qrScale: z.number().min(0.5).max(1.5).optional(),
  textScale: z.number().min(0.5).max(1.5).optional(),
});
export type PrintLabelLayout = z.infer<typeof printLabelLayoutSchema>;

export const createPrintJobInputSchema = z.object({
  /** Optional when routing context can resolve a destination. */
  printerId: z.string().uuid().optional(),
  printerGroupId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  templateVersion: z.number().int().positive().optional(),
  module: z.string().max(120).optional(),
  recordType: z.string().max(120).optional(),
  recordId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  copies: z.number().int().min(1).max(100).default(1),
  widthInches: z.number().positive().optional(),
  heightInches: z.number().positive().optional(),
  dpi: z.number().int().positive().optional(),
  orientation: z.string().max(32).optional(),
  cutMode: z.string().max(32).optional(),
  /** Pre-rendered PNG/bitmap fields for fields used in label layout. */
  fieldValues: z.record(z.coerce.string()).optional(),
  layout: printLabelLayoutSchema.optional(),
  requestedFromDevice: z.string().max(200).optional(),
  priority: z.number().int().optional(),
  printMode: z.enum([ForgePrintMode.BRIDGE, ForgePrintMode.DIRECT_BLUETOOTH]).optional(),
  mediaProfileId: z.string().uuid().optional(),
  acceptFailover: z.boolean().optional(),
});
export type CreatePrintJobInput = z.infer<typeof createPrintJobInputSchema>;

export const PrinterGroupStrategy = {
  PRIMARY_FAILOVER: "PRIMARY_FAILOVER",
  ROUND_ROBIN: "ROUND_ROBIN",
  LEAST_BUSY: "LEAST_BUSY",
  FIRST_AVAILABLE: "FIRST_AVAILABLE",
  MANUAL: "MANUAL",
} as const;
export type PrinterGroupStrategy =
  (typeof PrinterGroupStrategy)[keyof typeof PrinterGroupStrategy];

export const printRouteConditionsSchema = z.object({
  locationId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  module: z.string().max(120).nullable().optional(),
  recordType: z.string().max(120).nullable().optional(),
});
export type PrintRouteConditions = z.infer<typeof printRouteConditionsSchema>;

export const printRouteActionSchema = z.object({
  printerId: z.string().uuid().nullable().optional(),
  printerGroupId: z.string().uuid().nullable().optional(),
});
export type PrintRouteAction = z.infer<typeof printRouteActionSchema>;

export const createPrinterGroupInputSchema = z.object({
  name: z.string().min(1).max(200),
  strategy: z
    .enum([
      PrinterGroupStrategy.PRIMARY_FAILOVER,
      PrinterGroupStrategy.ROUND_ROBIN,
      PrinterGroupStrategy.LEAST_BUSY,
      PrinterGroupStrategy.FIRST_AVAILABLE,
      PrinterGroupStrategy.MANUAL,
    ])
    .default(PrinterGroupStrategy.PRIMARY_FAILOVER),
  locationId: z.string().uuid().nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  members: z
    .array(
      z.object({
        printerId: z.string().uuid(),
        sortOrder: z.number().int().min(0).optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
});
export type CreatePrinterGroupInput = z.infer<typeof createPrinterGroupInputSchema>;

export const patchPrinterGroupInputSchema = createPrinterGroupInputSchema.partial();
export type PatchPrinterGroupInput = z.infer<typeof patchPrinterGroupInputSchema>;

export const createPrintRoutingRuleInputSchema = z.object({
  name: z.string().min(1).max(200),
  priority: z.number().int().min(0).max(10000).default(100),
  enabled: z.boolean().optional(),
  conditions: printRouteConditionsSchema.default({}),
  action: printRouteActionSchema.refine(
    (a) => Boolean(a.printerId || a.printerGroupId),
    { message: "Action requires printerId or printerGroupId" },
  ),
});
export type CreatePrintRoutingRuleInput = z.infer<typeof createPrintRoutingRuleInputSchema>;

export const patchPrintRoutingRuleInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  enabled: z.boolean().optional(),
  conditions: printRouteConditionsSchema.optional(),
  action: printRouteActionSchema
    .refine((a) => Boolean(a.printerId || a.printerGroupId), {
      message: "Action requires printerId or printerGroupId",
    })
    .optional(),
});
export type PatchPrintRoutingRuleInput = z.infer<typeof patchPrintRoutingRuleInputSchema>;

export const resolvePrintRouteInputSchema = z.object({
  printerId: z.string().uuid().optional(),
  printerGroupId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  module: z.string().max(120).optional(),
  recordType: z.string().max(120).optional(),
});
export type ResolvePrintRouteInput = z.infer<typeof resolvePrintRouteInputSchema>;

/** Preview uses the same renderer as print (no printer / job queue). */
export const previewPrintJobInputSchema = z.object({
  widthInches: z.number().positive().optional(),
  heightInches: z.number().positive().optional(),
  dpi: z.number().int().positive().optional(),
  orientation: z.string().max(32).optional(),
  fieldValues: z.record(z.coerce.string()).optional(),
  module: z.string().max(120).optional(),
  layout: printLabelLayoutSchema.optional(),
  mediaProfileId: z.string().uuid().optional(),
});
export type PreviewPrintJobInput = z.infer<typeof previewPrintJobInputSchema>;

export const createPrintBatchItemSchema = z.object({
  module: z.string().max(120).optional(),
  recordType: z.string().max(120).optional(),
  recordId: z.string().uuid().optional(),
  fieldValues: z.record(z.coerce.string()).optional(),
  title: z.string().max(300).optional(),
});
export type CreatePrintBatchItem = z.infer<typeof createPrintBatchItemSchema>;

export const createPrintBatchInputSchema = z.object({
  /** Optional when routing context can resolve a destination. */
  printerId: z.string().uuid().optional(),
  printerGroupId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  items: z.array(createPrintBatchItemSchema).min(1).max(200),
  copiesPerItem: z.number().int().min(1).max(100).default(1),
  mediaProfileId: z.string().uuid().optional(),
  widthInches: z.number().positive().optional(),
  heightInches: z.number().positive().optional(),
  dpi: z.number().int().positive().optional(),
  orientation: z.string().max(32).optional(),
  cutMode: z.string().max(32).optional(),
  layout: printLabelLayoutSchema.optional(),
  stopOnFail: z.boolean().default(true),
  printMode: z.enum([ForgePrintMode.BRIDGE, ForgePrintMode.DIRECT_BLUETOOTH]).optional(),
  acceptFailover: z.boolean().optional(),
  name: z.string().max(300).optional(),
});
export type CreatePrintBatchInput = z.infer<typeof createPrintBatchInputSchema>;

export const registerDirectBluetoothPrinterInputSchema = z.object({
  name: z.string().min(1).max(200),
  bluetoothDeviceId: z.string().max(200).optional(),
  bluetoothSavedId: z.string().min(1).max(200),
  displayName: z.string().max(300).optional(),
  model: z.string().max(120).default("i4311"),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
});
export type RegisterDirectBluetoothPrinterInput = z.infer<
  typeof registerDirectBluetoothPrinterInputSchema
>;

export const upsertPrinterProfileInputSchema = z.object({
  dpi: z.number().int().positive().optional(),
  defaultMediaId: z.string().uuid().nullable().optional(),
  defaultCopies: z.number().int().min(1).max(100).optional(),
  preferredTransport: z.string().max(64).optional(),
  fallbackPrinterId: z.string().uuid().nullable().optional(),
});
export type UpsertPrinterProfileInput = z.infer<typeof upsertPrinterProfileInputSchema>;

export const createMediaProfileInputSchema = z.object({
  manufacturer: z.string().min(1).max(120).default("Brady"),
  printerModel: z.string().min(1).max(120).default("i4311"),
  partNumber: z.string().max(120).optional(),
  name: z.string().min(1).max(300),
  widthInches: z.number().positive(),
  heightInches: z.number().positive(),
  continuous: z.boolean().optional(),
  dieCut: z.boolean().optional(),
  printableWidth: z.number().positive().optional(),
  printableHeight: z.number().positive().optional(),
  orientation: z.string().max(32).optional(),
});
export type CreateMediaProfileInput = z.infer<typeof createMediaProfileInputSchema>;

export const patchMediaProfileInputSchema = createMediaProfileInputSchema.partial();
export type PatchMediaProfileInput = z.infer<typeof patchMediaProfileInputSchema>;

export const createBridgePairingInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
});
export type CreateBridgePairingInput = z.infer<typeof createBridgePairingInputSchema>;

export const consumeBridgePairingInputSchema = z.object({
  pairingCode: z.string().min(6).max(32),
  deviceId: z.string().min(1).max(120),
  computerName: z.string().max(200).optional(),
  osVersion: z.string().max(120).optional(),
  bridgeVersion: z.string().max(64).optional(),
  name: z.string().min(1).max(200).optional(),
});
export type ConsumeBridgePairingInput = z.infer<typeof consumeBridgePairingInputSchema>;

export const bridgeHeartbeatInputSchema = z.object({
  status: z.enum(["ONLINE", "OFFLINE"]).default("ONLINE"),
  version: z.string().max(64).optional(),
  printers: z
    .object({
      total: z.number().int().nonnegative(),
      ready: z.number().int().nonnegative(),
      offline: z.number().int().nonnegative(),
    })
    .optional(),
});
export type BridgeHeartbeatInput = z.infer<typeof bridgeHeartbeatInputSchema>;

export const bridgePrinterUpsertSchema = z.object({
  deviceIdentifier: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  displayName: z.string().max(300).optional(),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  serialNumber: z.string().max(120).optional(),
  connectionType: z.string().max(64).optional(),
  transportType: z.string().max(64).optional(),
  windowsQueueName: z.string().max(300).optional(),
  bluetoothDeviceId: z.string().max(200).optional(),
  bluetoothSavedId: z.string().max(200).optional(),
  dpi: z.number().int().positive().optional(),
  maxPrintWidthInches: z.number().positive().optional(),
  supportsBitmap: z.boolean().optional(),
  supportsCut: z.boolean().optional(),
  supportsFeed: z.boolean().optional(),
  supportsMultipleCopies: z.boolean().optional(),
  online: z.boolean().optional(),
  connected: z.boolean().optional(),
  ready: z.boolean().optional(),
  ribbonOk: z.boolean().optional(),
  mediaOk: z.boolean().optional(),
  batteryPercent: z.number().int().min(0).max(100).optional(),
  supplyName: z.string().max(200).optional(),
});
export type BridgePrinterUpsert = z.infer<typeof bridgePrinterUpsertSchema>;

export const printJobStatusUpdateSchema = z.object({
  status: z.string().min(1).max(64),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type PrintJobStatusUpdate = z.infer<typeof printJobStatusUpdateSchema>;

export const PRINT_REPRINT_REASONS = [
  "Damaged Label",
  "Lost Label",
  "Unreadable Label",
  "Incorrect Placement",
  "Replacement",
  "Printer Issue",
  "Other",
] as const;
export type PrintReprintReason = (typeof PRINT_REPRINT_REASONS)[number];

export const reprintJobInputSchema = z.object({
  reason: z.enum(PRINT_REPRINT_REASONS),
  copies: z.number().int().min(1).max(100).optional(),
});
export type ReprintJobInput = z.infer<typeof reprintJobInputSchema>;

/** Normalized printer health for Print Manager dashboard cards. */
export const PrintManagerPrinterHealth = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  WARNING: "WARNING",
  ERROR: "ERROR",
} as const;
export type PrintManagerPrinterHealth =
  (typeof PrintManagerPrinterHealth)[keyof typeof PrintManagerPrinterHealth];

export function classifyPrintManagerPrinterHealth(input: {
  enabled?: boolean | null;
  online?: boolean | null;
  ready?: boolean | null;
  mediaOk?: boolean | null;
  ribbonOk?: boolean | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}): PrintManagerPrinterHealth {
  if (input.enabled === false) return PrintManagerPrinterHealth.OFFLINE;
  const err = String(input.lastErrorCode ?? input.lastErrorMessage ?? "").trim();
  if (err) return PrintManagerPrinterHealth.ERROR;
  if (!input.online) return PrintManagerPrinterHealth.OFFLINE;
  if (input.ready === false || input.mediaOk === false || input.ribbonOk === false) {
    return PrintManagerPrinterHealth.WARNING;
  }
  return PrintManagerPrinterHealth.ONLINE;
}

export const PRINT_MANAGER_QUEUED_STATUSES = [
  PrintJobStatus.CREATED,
  PrintJobStatus.RENDERING,
  PrintJobStatus.QUEUED,
  PrintJobStatus.BRIDGE_ASSIGNED,
  PrintJobStatus.WAITING_FOR_PRINTER,
] as const;

export const PRINT_MANAGER_PRINTING_STATUSES = [
  PrintJobStatus.DELIVERING,
  PrintJobStatus.RECEIVED,
  PrintJobStatus.VALIDATING,
  PrintJobStatus.SPOOLING,
  PrintJobStatus.TRANSMITTING,
  PrintJobStatus.PRINTING,
] as const;

export const PRINT_MANAGER_SUCCESS_STATUSES = [
  PrintJobStatus.COMPLETED,
  PrintJobStatus.SENT_TO_PRINTER,
] as const;

/** Label / document template version lifecycle (Phase 4). */
export const LabelTemplateVersionStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type LabelTemplateVersionStatus =
  (typeof LabelTemplateVersionStatus)[keyof typeof LabelTemplateVersionStatus];

export const labelTemplateFieldInputSchema = z.object({
  fieldKey: z.string().min(1).max(120),
  fieldType: z.string().min(1).max(64).default("string"),
  label: z.string().max(300).nullable().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().max(4000).nullable().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});
export type LabelTemplateFieldInput = z.infer<typeof labelTemplateFieldInputSchema>;

/** layout_json shapes: ELEMENTS (Phase 5 designer), HTML (Phase 4), FIELDS / TEST_PRINT. */
export const labelTemplateElementTypeSchema = z.enum([
  "text",
  "dynamicText",
  "qr",
  "barcode",
  "rectangle",
  "line",
]);
export type LabelTemplateElementType = z.infer<typeof labelTemplateElementTypeSchema>;

export const labelTemplateElementSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  type: labelTemplateElementTypeSchema,
  /** Position/size in inches from top-left of the label. */
  x: z.number().min(0).max(24).default(0),
  y: z.number().min(0).max(24).default(0),
  width: z.number().positive().max(24).default(1),
  height: z.number().positive().max(24).default(0.25),
  /** Static text, or template with {{vars}} for text/qr/barcode. */
  content: z.string().max(4000).optional(),
  /** Field key for dynamicText (merged into content as {{key}}). */
  fieldKey: z.string().max(120).optional(),
  fontSizePt: z.number().positive().max(72).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  /** barcode symbology — Phase 5 ships Code 128. */
  barcodeFormat: z.enum(["CODE128", "CODE39"]).optional(),
  showHumanReadable: z.boolean().optional(),
  strokeWidthPt: z.number().min(0).max(12).optional(),
  fill: z.boolean().optional(),
});
export type LabelTemplateElement = z.infer<typeof labelTemplateElementSchema>;

export const labelTemplateLayoutSchema = z
  .object({
    kind: z.enum(["HTML", "FIELDS", "TEST_PRINT", "ELEMENTS"]).default("ELEMENTS"),
    html: z.string().max(200_000).optional(),
    brand: z.string().max(300).optional(),
    title: z.string().max(300).optional(),
    subtitle: z.string().max(500).optional(),
    lines: z.array(z.string().max(500)).max(40).optional(),
    caption: z.string().max(300).optional(),
    footerLines: z.array(z.string().max(500)).max(20).optional(),
    qrPayload: z.string().max(2000).optional(),
    elements: z.array(labelTemplateElementSchema).max(80).optional(),
  })
  .passthrough();
export type LabelTemplateLayout = z.infer<typeof labelTemplateLayoutSchema>;

export const exportLabelTemplateZplInputSchema = z.object({
  versionId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  fieldValues: z.record(z.coerce.string()).optional(),
});
export type ExportLabelTemplateZplInput = z.infer<typeof exportLabelTemplateZplInputSchema>;

export const createLabelTemplateInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._-]+$/, "Code must be alphanumeric with . _ -"),
  name: z.string().min(1).max(300),
  category: z.string().min(1).max(120).default("Custom Labels"),
  description: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  widthInches: z.number().positive().default(4),
  heightInches: z.number().positive().default(2),
  dpi: z.number().int().positive().default(300),
  layout: labelTemplateLayoutSchema.optional(),
  fields: z.array(labelTemplateFieldInputSchema).max(100).optional(),
});
export type CreateLabelTemplateInput = z.infer<typeof createLabelTemplateInputSchema>;

export const patchLabelTemplateInputSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  category: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type PatchLabelTemplateInput = z.infer<typeof patchLabelTemplateInputSchema>;

export const patchLabelTemplateVersionInputSchema = z.object({
  widthInches: z.number().positive().optional(),
  heightInches: z.number().positive().optional(),
  dpi: z.number().int().positive().optional(),
  layout: labelTemplateLayoutSchema.optional(),
  fields: z.array(labelTemplateFieldInputSchema).max(100).optional(),
});
export type PatchLabelTemplateVersionInput = z.infer<typeof patchLabelTemplateVersionInputSchema>;

export const previewLabelTemplateInputSchema = z.object({
  versionId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  fieldValues: z.record(z.coerce.string()).optional(),
  /** Prefer PNG for Brady; PDF when HTML document preview is needed. */
  output: z.enum(["png", "pdf"]).default("png"),
});
export type PreviewLabelTemplateInput = z.infer<typeof previewLabelTemplateInputSchema>;

/** Print consumable types (Phase 7). Distinct from Safety Supplies PPE inventory. */
export const PrintSupplyType = {
  PAPER: "PAPER",
  LABELS: "LABELS",
  RIBBON: "RIBBON",
  TONER: "TONER",
  INK: "INK",
  CARDS: "CARDS",
  SPECIALTY_MEDIA: "SPECIALTY_MEDIA",
  OTHER: "OTHER",
} as const;
export type PrintSupplyType = (typeof PrintSupplyType)[keyof typeof PrintSupplyType];

export const PrintSupplyAlertLevel = {
  NONE: "NONE",
  LOW: "LOW",
  CRITICAL: "CRITICAL",
  EMPTY: "EMPTY",
} as const;
export type PrintSupplyAlertLevel =
  (typeof PrintSupplyAlertLevel)[keyof typeof PrintSupplyAlertLevel];

export const createPrintSupplyInputSchema = z.object({
  printerId: z.string().uuid().nullable().optional(),
  supplyType: z
    .enum([
      PrintSupplyType.PAPER,
      PrintSupplyType.LABELS,
      PrintSupplyType.RIBBON,
      PrintSupplyType.TONER,
      PrintSupplyType.INK,
      PrintSupplyType.CARDS,
      PrintSupplyType.SPECIALTY_MEDIA,
      PrintSupplyType.OTHER,
    ])
    .default(PrintSupplyType.LABELS),
  name: z.string().min(1).max(200),
  sku: z.string().max(120).nullable().optional(),
  unit: z.string().min(1).max(64).default("labels"),
  startingQuantity: z.number().int().min(0).max(10_000_000).default(0),
  estimatedRemaining: z.number().int().min(0).max(10_000_000).optional(),
  warningThreshold: z.number().int().min(0).max(10_000_000).default(50),
  criticalThreshold: z.number().int().min(0).max(10_000_000).default(15),
  alertUserIds: z.array(z.string().uuid()).max(50).optional(),
  enabled: z.boolean().optional(),
});
export type CreatePrintSupplyInput = z.infer<typeof createPrintSupplyInputSchema>;

export const patchPrintSupplyInputSchema = z.object({
  printerId: z.string().uuid().nullable().optional(),
  supplyType: z
    .enum([
      PrintSupplyType.PAPER,
      PrintSupplyType.LABELS,
      PrintSupplyType.RIBBON,
      PrintSupplyType.TONER,
      PrintSupplyType.INK,
      PrintSupplyType.CARDS,
      PrintSupplyType.SPECIALTY_MEDIA,
      PrintSupplyType.OTHER,
    ])
    .optional(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(120).nullable().optional(),
  unit: z.string().min(1).max(64).optional(),
  startingQuantity: z.number().int().min(0).max(10_000_000).optional(),
  estimatedRemaining: z.number().int().min(0).max(10_000_000).optional(),
  unitsConsumed: z.number().int().min(0).max(10_000_000).optional(),
  warningThreshold: z.number().int().min(0).max(10_000_000).optional(),
  criticalThreshold: z.number().int().min(0).max(10_000_000).optional(),
  alertUserIds: z.array(z.string().uuid()).max(50).optional(),
  enabled: z.boolean().optional(),
});
export type PatchPrintSupplyInput = z.infer<typeof patchPrintSupplyInputSchema>;

export const replacePrintSupplyInputSchema = z.object({
  quantity: z.number().int().min(1).max(10_000_000),
  /** When true, resets unitsConsumed to 0. Default true. */
  resetConsumed: z.boolean().optional(),
});
export type ReplacePrintSupplyInput = z.infer<typeof replacePrintSupplyInputSchema>;

export const printAnalyticsQuerySchema = z.object({
  from: z.string().min(1).max(64).optional(),
  to: z.string().min(1).max(64).optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  module: z.string().max(120).optional(),
  printerId: z.string().uuid().optional(),
  bridgeId: z.string().uuid().optional(),
});
export type PrintAnalyticsQuery = z.infer<typeof printAnalyticsQuerySchema>;

