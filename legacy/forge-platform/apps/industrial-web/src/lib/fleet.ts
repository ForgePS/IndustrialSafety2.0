export const FLEET_LIST_HREF = "/modules/fleet/";

export const FLEET_ASSET_TYPE_OPTIONS: readonly string[] = [
  "PASSENGER_VEHICLE",
  "FLEET_VEHICLE",
  "BOB_TRUCK",
  "TRASH_TRUCK",
  "TRACTOR_TRUCK",
  "DUMP_TRUCK",
  "CONSTRUCTION_EQUIPMENT",
  "TRAILER",
  "OTHER",
];

export const FLEET_ASSET_STATUS_OPTIONS: readonly string[] = [
  "ACTIVE",
  "INACTIVE",
  "OUT_OF_SERVICE",
  "REMOVED",
  "SOLD",
  "DISPOSED",
  "ARCHIVED",
];

export const FLEET_INSURANCE_STATUS_OPTIONS: readonly string[] = [
  "UNKNOWN",
  "INSURED",
  "NOT_INSURED",
  "PENDING",
  "LAPSED",
];

export const FLEET_COUNTY_STATUS_OPTIONS: readonly string[] = [
  "UNKNOWN",
  "ASSESSED",
  "NOT_ASSESSED",
  "EXEMPT",
  "PENDING",
];

export const FLEET_COMMUTE_OPTIONS: readonly string[] = ["UNKNOWN", "YES", "NO", "OCCASIONAL"];

export const FLEET_COMPLIANCE_OPTIONS: readonly string[] = [
  "UNKNOWN",
  "REQUIRED",
  "FILED",
  "NOT_REQUIRED",
  "OVERDUE",
];

export const FLEET_DOCUMENT_TYPES = [
  "TITLE",
  "REGISTRATION",
  "INSURANCE_CARD",
  "INSURANCE_POLICY",
  "INSPECTION",
  "MAINTENANCE",
  "OTHER",
] as const;

/** Document types shown under Insurance & compliance photo capture. */
export const FLEET_COMPLIANCE_DOCUMENT_TYPES = [
  "INSURANCE_CARD",
  "INSURANCE_POLICY",
  "REGISTRATION",
  "TITLE",
] as const;

/** Document types shown under Maintenance Documents / Other. */
export const FLEET_OTHER_DOCUMENT_TYPES = ["MAINTENANCE", "INSPECTION", "OTHER"] as const;

export const FLEET_MAINTENANCE_TYPES = [
  "PM",
  "REPAIR",
  "RECALL",
  "TIRES",
  "INSPECTION_FOLLOWUP",
  "OTHER",
] as const;

/** Common maintenance jobs shown on the asset page dropdown. */
export const FLEET_COMMON_MAINTENANCE_ITEMS: ReadonlyArray<{
  title: string;
  maintenanceType: (typeof FLEET_MAINTENANCE_TYPES)[number];
}> = [
  { title: "Oil change", maintenanceType: "PM" },
  { title: "Scheduled PM / service", maintenanceType: "PM" },
  { title: "Tire rotation", maintenanceType: "TIRES" },
  { title: "Tire replacement", maintenanceType: "TIRES" },
  { title: "Brake inspection / service", maintenanceType: "REPAIR" },
  { title: "Battery replacement", maintenanceType: "REPAIR" },
  { title: "Air / cabin filter", maintenanceType: "PM" },
  { title: "Fuel filter", maintenanceType: "PM" },
  { title: "Coolant flush", maintenanceType: "PM" },
  { title: "Transmission service", maintenanceType: "PM" },
  { title: "Alignment", maintenanceType: "REPAIR" },
  { title: "Wiper blades", maintenanceType: "REPAIR" },
  { title: "Lights / bulbs", maintenanceType: "REPAIR" },
  { title: "Glass / windshield", maintenanceType: "REPAIR" },
  { title: "DOT / safety inspection prep", maintenanceType: "INSPECTION_FOLLOWUP" },
  { title: "Inspection follow-up", maintenanceType: "INSPECTION_FOLLOWUP" },
  { title: "Recall repair", maintenanceType: "RECALL" },
  { title: "Other", maintenanceType: "OTHER" },
];

export function fleetMaintenanceItemByTitle(
  title: string,
): (typeof FLEET_COMMON_MAINTENANCE_ITEMS)[number] | undefined {
  return FLEET_COMMON_MAINTENANCE_ITEMS.find((item) => item.title === title);
}

/** Asset detail page. Ids stay in the query string (static export). */
export function fleetAssetHref(id: string, opts?: { print?: boolean }): string {
  const base = `/modules/fleet/asset/?id=${encodeURIComponent(id)}`;
  return opts?.print ? `${base}&print=1` : base;
}

export function fleetListHref(tab: string = "assets"): string {
  return `/modules/fleet/?tab=${encodeURIComponent(tab)}`;
}

export function fleetAssetLabel(item: Record<string, unknown> | null | undefined): string {
  if (!item) return "Asset";
  const year = item.year ? String(item.year) : "";
  const make = String(item.make ?? "").trim();
  const model = String(item.model ?? "").trim();
  const plate = String(item.licensePlate ?? "").trim();
  const number = String(item.assetNumber ?? "").trim();
  return (
    [year, make, model].filter(Boolean).join(" ") || number || plate || String(item.id ?? "Asset")
  );
}

/** Absolute URL encoded into Brady label QR. */
export function fleetAssetPrintQrUrl(
  item: Record<string, unknown> | null | undefined,
  appBaseUrl?: string | null,
): string | undefined {
  const id = String(item?.id ?? "").trim();
  if (!id) return undefined;
  // DOT-regulated assets should use the public DVIR form URL via ensureFleetDvirPrintQrPayload.
  // Fall back to the asset page only for non-DOT labels.
  const path = fleetAssetHref(id);
  const base =
    (typeof appBaseUrl === "string" && appBaseUrl.trim()) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return path;
  try {
    return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
  } catch {
    return path;
  }
}

export function fleetAssetIsDotRegulated(
  item: Record<string, unknown> | null | undefined,
): boolean {
  return item?.dotRegulated === true || item?.dotRegulated === "true";
}

/**
 * Resolve the QR payload for a Brady / Forge print label.
 * DOT-regulated assets use the public DVIR inspection URL so scanning opens
 * the pre/post-trip form (not the authenticated fleet asset page).
 */
export async function ensureFleetDvirPrintQrPayload(
  item: Record<string, unknown> | null | undefined,
  opts?: {
    appBaseUrl?: string | null;
    ensureDvirQr?: (vehicleId: string, appBaseUrl: string) => Promise<{ url: string }>;
  },
): Promise<string | undefined> {
  if (!item) return undefined;
  const appBaseUrl =
    (typeof opts?.appBaseUrl === "string" && opts.appBaseUrl.trim()) ||
    (typeof window !== "undefined" ? window.location.origin : "");
  if (fleetAssetIsDotRegulated(item)) {
    const id = String(item.id ?? "").trim();
    if (!id) return undefined;
    const ensure =
      opts?.ensureDvirQr ??
      (async (vehicleId: string, base: string) => {
        const { apiSend } = await import("@forge/web-kit");
        return apiSend<{ url: string }>(
          `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvir-qr/ensure`,
          "POST",
          { appBaseUrl: base },
        );
      });
    const ensured = await ensure(id, appBaseUrl);
    const url = String(ensured?.url ?? "").trim();
    if (url) return url;
  }
  return fleetAssetPrintQrUrl(item, appBaseUrl || null);
}

/** Field values for ForgePrintDialog / Brady asset tags. */
export function fleetAssetPrintFieldValues(
  item: Record<string, unknown> | null | undefined,
  opts?: { appBaseUrl?: string | null; qrPayload?: string | null },
): Record<string, string> {
  if (!item) return {};
  const title = fleetAssetLabel(item);
  const unit = String(item.assetNumber ?? "").trim();
  const values: Record<string, string> = {
    title,
    name: unit || title,
  };
  if (unit) values.unit = unit;
  const vin = String(item.vin ?? "").trim();
  if (vin) values.vin = vin;
  const plate = [item.licensePlate, item.licenseState]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (plate) values.plate = plate;
  const type = String(item.customAssetTypeLabel || item.assetType || "").trim();
  if (type) values.type = type;
  const qr =
    (typeof opts?.qrPayload === "string" && opts.qrPayload.trim()) ||
    (!fleetAssetIsDotRegulated(item) ? fleetAssetPrintQrUrl(item, opts?.appBaseUrl) : undefined);
  if (qr) {
    values.qr = qr;
    values.qrPayload = qr;
  }
  return values;
}

export function asFleetText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function asFleetBoolSelect(value: unknown): "" | "true" | "false" {
  if (value === true || value === "true") return "true";
  if (value === false || value === "false") return "false";
  return "";
}

/** Cap aligned with industrial inspection / license photo uploads. */
export const MAX_FLEET_DOC_DATA_URL_LENGTH = 3_500_000;

export async function compressFleetDocumentFile(
  file: File,
  maxDim = 1600,
  quality = 0.78,
): Promise<{ dataUrl: string; contentType: string; fileName: string }> {
  const fileName = file.name || "document.jpg";
  if (file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > MAX_FLEET_DOC_DATA_URL_LENGTH) {
      throw new Error("PDF is too large. Use a smaller file.");
    }
    return { dataUrl, contentType: "application/pdf", fileName };
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
    throw new Error("Choose an image or PDF.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Unable to compress image");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  if (dataUrl.length > MAX_FLEET_DOC_DATA_URL_LENGTH) {
    throw new Error("Photo is still too large after compression. Try a closer shot.");
  }
  return {
    dataUrl,
    contentType: "image/jpeg",
    fileName: fileName.replace(/\.[^.]+$/, "") + ".jpg",
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

export function fleetDocumentPreviewSrc(row: Record<string, unknown>): string | null {
  const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl.trim() : "";
  if (dataUrl.startsWith("data:image/") || /^https?:\/\//i.test(dataUrl)) return dataUrl;
  return null;
}
