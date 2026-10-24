import { createHash, randomBytes } from "node:crypto";
import {
  createId,
  industrialCorrectiveActions,
  industrialEquipment,
  industrialFleetVehicles,
  industrialQrLinkAuditEvents,
  type DatabaseTransaction,
} from "@forge/database";
import { and, eq, isNull } from "drizzle-orm";

type AssetTargetType = "EQUIPMENT" | "MACHINE" | "VEHICLE" | "TOOL";

export function isQrAssetTargetType(value: string): value is AssetTargetType {
  return value === "EQUIPMENT" || value === "MACHINE" || value === "VEHICLE" || value === "TOOL";
}

function unwrapPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function andEqVehicle(targetId: string, tenantId: string) {
  return and(
    eq(industrialFleetVehicles.id, targetId),
    eq(industrialFleetVehicles.tenantId, tenantId),
    isNull(industrialFleetVehicles.archivedAt),
  );
}

function eqVehicle(targetId: string, tenantId: string) {
  return and(
    eq(industrialFleetVehicles.id, targetId),
    eq(industrialFleetVehicles.tenantId, tenantId),
  );
}

function andEqEquipment(targetId: string, tenantId: string) {
  return and(
    eq(industrialEquipment.id, targetId),
    eq(industrialEquipment.tenantId, tenantId),
    isNull(industrialEquipment.archivedAt),
  );
}

function eqEquipment(targetId: string, tenantId: string) {
  return and(eq(industrialEquipment.id, targetId), eq(industrialEquipment.tenantId, tenantId));
}

export async function markQrAssetOutOfService(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    targetType: string;
    targetId: string;
    reason: string;
    personnelId?: string | null;
    personnelName?: string | null;
    notes?: string | null;
    qrLinkId?: string | null;
    source?: string;
  },
): Promise<{ outOfService: true; reason: string }> {
  const targetType = String(input.targetType).trim().toUpperCase();
  const targetId = String(input.targetId).trim();
  const reason = String(input.reason ?? "").trim();
  if (!reason) throw new Error("reason is required");
  if (!isQrAssetTargetType(targetType)) {
    throw new Error("Asset out-of-service is not supported for this target");
  }

  const now = new Date();
  const metaPatch = {
    outOfService: true,
    out_of_service: true,
    outOfServiceReason: reason,
    out_of_service_reason: reason,
    outOfServiceAt: now.toISOString(),
    outOfServiceByPersonnelId: input.personnelId ?? null,
    outOfServiceByName: input.personnelName ?? null,
    outOfServiceNotes: input.notes ?? null,
    outOfServiceSource: input.source ?? "QR_SCAN",
    qrLinkId: input.qrLinkId ?? null,
  };

  if (targetType === "VEHICLE") {
    const [row] = await tx
      .select()
      .from(industrialFleetVehicles)
      .where(andEqVehicle(targetId, input.tenantId))
      .limit(1);
    if (!row) throw new Error("Vehicle not found");
    const payload = { ...unwrapPayload(row.sourcePayload), ...metaPatch };
    await tx
      .update(industrialFleetVehicles)
      .set({
        outOfService: true,
        outOfServiceReason: reason,
        status: "OUT_OF_SERVICE",
        sourcePayload: payload,
        updatedAt: now,
      })
      .where(eqVehicle(targetId, input.tenantId));
  } else {
    const [row] = await tx
      .select()
      .from(industrialEquipment)
      .where(andEqEquipment(targetId, input.tenantId))
      .limit(1);
    if (!row) throw new Error("Equipment not found");
    const payload = { ...unwrapPayload(row.sourcePayload), ...metaPatch };
    await tx
      .update(industrialEquipment)
      .set({
        status: "OUT_OF_SERVICE",
        sourcePayload: payload,
        updatedAt: now,
      })
      .where(eqEquipment(targetId, input.tenantId));
  }

  if (input.qrLinkId) {
    await tx.insert(industrialQrLinkAuditEvents).values({
      id: createId(),
      tenantId: input.tenantId,
      qrLinkId: input.qrLinkId,
      eventType: "ASSET_MARKED_OUT_OF_SERVICE",
      eventAt: now,
      details: {
        targetType,
        targetId,
        reason,
        personnelId: input.personnelId ?? null,
        personnelName: input.personnelName ?? null,
        source: input.source ?? "QR_SCAN",
      },
      sourceSystem: "FORGE",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { outOfService: true, reason };
}

export async function returnQrAssetToService(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    targetType: string;
    targetId: string;
    personnelId?: string | null;
    personnelName?: string | null;
    notes?: string | null;
    qrLinkId?: string | null;
  },
): Promise<{ outOfService: false }> {
  const targetType = String(input.targetType).trim().toUpperCase();
  const targetId = String(input.targetId).trim();
  if (!isQrAssetTargetType(targetType)) {
    throw new Error("Return to service is not supported for this target");
  }

  const now = new Date();
  const metaPatch = {
    outOfService: false,
    out_of_service: false,
    outOfServiceReason: null,
    out_of_service_reason: null,
    returnedToServiceAt: now.toISOString(),
    returnedToServiceByPersonnelId: input.personnelId ?? null,
    returnedToServiceByName: input.personnelName ?? null,
    returnedToServiceNotes: input.notes ?? null,
    qrLinkId: input.qrLinkId ?? null,
  };

  if (targetType === "VEHICLE") {
    const [row] = await tx
      .select()
      .from(industrialFleetVehicles)
      .where(andEqVehicle(targetId, input.tenantId))
      .limit(1);
    if (!row) throw new Error("Vehicle not found");
    const payload = { ...unwrapPayload(row.sourcePayload), ...metaPatch };
    await tx
      .update(industrialFleetVehicles)
      .set({
        outOfService: false,
        outOfServiceReason: null,
        status: "ACTIVE",
        sourcePayload: payload,
        updatedAt: now,
      })
      .where(eqVehicle(targetId, input.tenantId));
  } else {
    const [row] = await tx
      .select()
      .from(industrialEquipment)
      .where(andEqEquipment(targetId, input.tenantId))
      .limit(1);
    if (!row) throw new Error("Equipment not found");
    const payload = { ...unwrapPayload(row.sourcePayload), ...metaPatch };
    await tx
      .update(industrialEquipment)
      .set({
        status: "ACTIVE",
        sourcePayload: payload,
        updatedAt: now,
      })
      .where(eqEquipment(targetId, input.tenantId));
  }

  if (input.qrLinkId) {
    await tx.insert(industrialQrLinkAuditEvents).values({
      id: createId(),
      tenantId: input.tenantId,
      qrLinkId: input.qrLinkId,
      eventType: "ASSET_RETURNED_TO_SERVICE",
      eventAt: now,
      details: {
        targetType,
        targetId,
        personnelId: input.personnelId ?? null,
        personnelName: input.personnelName ?? null,
        notes: input.notes ?? null,
      },
      sourceSystem: "FORGE",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { outOfService: false };
}

export async function createQrIssueCorrectiveAction(
  tx: DatabaseTransaction,
  input: {
    tenantId: string;
    qrLinkId: string;
    targetType?: string | null;
    targetId?: string | null;
    siteId?: string | null;
    personnelId?: string | null;
    personnelName?: string | null;
    title: string;
    description: string;
    priority?: string | null;
    category?: string | null;
    immediateHazard?: boolean;
    photos?: unknown[];
    appBaseUrl?: string;
    anonymous?: boolean;
  },
) {
  const now = new Date();
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const caId = createId();
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const appBase = (input.appBaseUrl ?? "https://producersrice.forgeindustrialsafety.com").replace(
    /\/$/,
    "",
  );
  const reporterName =
    String(input.personnelName ?? "").trim() ||
    (input.anonymous ? "Anonymous scanner" : "QR reporter");

  await tx.insert(industrialCorrectiveActions).values({
    id: caId,
    tenantId: input.tenantId,
    siteId: input.siteId ?? null,
    parentEntityType: "QR_ISSUE",
    parentEntityId: input.qrLinkId,
    title: input.title.slice(0, 500),
    description: input.description,
    finding: input.description,
    requiredAction: "Investigate and correct the reported issue.",
    priority: input.priority ?? "MEDIUM",
    status: "OPEN",
    assignedPersonnelId: input.personnelId ?? null,
    ownerName: reporterName,
    closeoutTokenHash: tokenHash,
    closeoutTokenExpiresAt: expires,
    sourceSystem: "FORGE",
    sourcePayload: {
      source: "QR_ISSUE",
      qrLinkId: input.qrLinkId,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      reporterPersonnelId: input.personnelId ?? null,
      reporterName,
      anonymous: Boolean(input.anonymous) || !input.personnelId,
      category: input.category ?? null,
      immediateHazard: input.immediateHazard ?? false,
      photos: input.photos ?? [],
    },
    createdAt: now,
    updatedAt: now,
  } as never);

  return {
    id: caId,
    closeoutUrl: `${appBase}/closeout/?token=${encodeURIComponent(token)}`,
  };
}
