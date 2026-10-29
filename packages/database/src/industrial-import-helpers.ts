import { createHash } from "node:crypto";

/**
 * Pure helpers for CONTROLLED-AURORA-IMPORT industrial importer.
 * Kept free of DB/S3 so unit tests can cover remap + FK resolution.
 */

export const PACKAGE_TENANT_ID = "5da680d3-50f5-46ac-8b85-6cf454b6a0da";
export const PRODUCTION_TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
export const AUTHORIZED_TENANT_IDS = new Set([PACKAGE_TENANT_ID, PRODUCTION_TENANT_ID]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdMapIndex = {
  bySourceId: Map<string, string>;
  byCollectionAndSourceId: Map<string, string>;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Same deterministic UUID scheme as DM-S2 transformer (sha256 → UUID-shaped). */
export function deterministicTargetId(sourceCollection: string, sourceDocumentId: string): string {
  const h = createHash("sha256")
    .update(`firebase:${sourceCollection}:${sourceDocumentId}`)
    .digest("hex")
    .slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function resolveLiveTenantId(requested: string): string {
  if (requested === PACKAGE_TENANT_ID) return PRODUCTION_TENANT_ID;
  return requested;
}

export function normalizePackageTenantId(
  awsTenantId: string | null | undefined,
  liveTenantId: string,
): string | null {
  if (!awsTenantId) return null;
  if (awsTenantId === liveTenantId || awsTenantId === PACKAGE_TENANT_ID) return liveTenantId;
  return awsTenantId;
}

export function unwrapValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (obj.type === "timestamp" && typeof obj.value === "string") return obj.value;
    if ("value" in obj && ("type" in obj || Object.keys(obj).length <= 3)) {
      return obj.value;
    }
  }
  return value;
}

export function resolveMappedId(
  index: IdMapIndex,
  raw: unknown,
  preferredCollections: string[] = [],
): string | undefined {
  const value = unwrapValue(raw);
  if (value == null) return undefined;
  const asString = String(value);
  if (isUuid(asString)) return asString;
  for (const collection of preferredCollections) {
    const hit = index.byCollectionAndSourceId.get(`${collection}::${asString}`);
    if (hit) return hit;
  }
  return index.bySourceId.get(asString);
}

export function storageKeyFromAttachmentData(
  data: Record<string, unknown>,
  targetId: string,
): string {
  const explicit = unwrapValue(data.storageKey ?? data.storage_key);
  if (explicit) return String(explicit);
  const fileUrl = unwrapValue(data.fileUrl ?? data.url);
  if (typeof fileUrl === "string" && fileUrl.includes("/o/")) {
    try {
      const encoded = fileUrl.split("/o/")[1]?.split("?")[0] ?? "";
      const decoded = decodeURIComponent(encoded);
      if (decoded) return decoded;
    } catch {
      /* fall through */
    }
  }
  const fileName = unwrapValue(data.fileName ?? data.name);
  return `import/attachments/${targetId}/${String(fileName ?? "file")}`;
}

/**
 * Canonical documents-bucket key for Producers imports.
 * Never persist Firebase-relative `business-*` paths after promotion.
 */
export function promoteStorageKeyForLiveTenant(
  raw: string,
  liveTenantId: string = PRODUCTION_TENANT_ID,
  firebaseBusinessId = "business-1782553339499",
): string {
  let key = String(raw || "").trim();
  if (!key) return key;
  if (key.startsWith(`tenants/${liveTenantId}/`)) return key;
  key = key.split(firebaseBusinessId).join(liveTenantId);
  if (!key.startsWith("tenants/")) key = `tenants/${liveTenantId}/${key}`;
  return key;
}

export function indexLogicalId(
  index: IdMapIndex,
  entity: string,
  logicalId: string,
  targetId: string,
): void {
  if (!logicalId || !isUuid(targetId) || isUuid(logicalId)) return;
  index.bySourceId.set(logicalId, targetId);
  index.byCollectionAndSourceId.set(`${entity}::${logicalId}`, targetId);
}

export function classifySkipReason(reason: string | undefined): string {
  if (!reason) return "none";
  if (reason === "missing_tenant") return "SKIP_NON_PRODUCERS";
  if (reason === "fabricated_fleet_vehicle") return "SKIP_NO_VEHICLE_SOURCE";
  if (reason.startsWith("missing_required_fk:")) return "SKIP_MISSING_PARENT";
  if (reason === "tenant_mismatch") return "ERROR_TENANT_MISMATCH";
  if (reason === "invalid_target_id") return "SKIP_INVALID_TARGET_ID";
  return `SKIP_${reason}`;
}
