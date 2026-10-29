import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialDotComplianceRecords,
  industrialFleetDrivers,
  industrialPersonnel,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import {
  isAllowedPersonnelLicenseMime,
  isPersonnelLicenseSide,
  MAX_PERSONNEL_LICENSE_BYTES,
  personnelLicenseObjectKeyPrefix,
  type PersonnelLicenseSide,
} from "./industrial-personnel-license-documents.mime.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unwrapPayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return unwrapPayload(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

/**
 * Driver's license front/back uploads for personnel — same 12 MB S3 path as DQF.
 * On complete (with personnelId), mirrors onto fleet roster and linked DQF file.
 */
@Injectable()
export class IndustrialPersonnelLicenseDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  private parseSide(raw: unknown): PersonnelLicenseSide {
    const side = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!isPersonnelLicenseSide(side)) {
      throw new ForgeError("VALIDATION_FAILED", "side must be front or back");
    }
    return side;
  }

  async createUploadUrl(
    principal: ForgePrincipal,
    body: {
      side?: string;
      personnelId?: string;
      filename?: string;
      mimeType?: string;
      contentLength?: number;
    },
  ) {
    const tenantId = this.tenant(principal);
    const side = this.parseSide(body.side);
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);
    const personnelId = String(body.personnelId ?? "").trim();

    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedPersonnelLicenseMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF or an image (JPEG, PNG, WebP, HEIC, GIF).",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_PERSONNEL_LICENSE_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_PERSONNEL_LICENSE_BYTES} bytes`,
      );
    }
    if (personnelId && !UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${personnelLicenseObjectKeyPrefix(tenantId, side)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        if (personnelId) {
          const [person] = await tx
            .select({ id: industrialPersonnel.id })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, personnelId),
                eq(industrialPersonnel.tenantId, tenantId),
              ),
            )
            .limit(1);
          if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");
        }

        await tx.insert(forgeDocuments).values({
          id: documentId,
          tenantId,
          originalFilename: filename,
          storedFilename,
          objectKey,
          bucketName: this.storage.bucketName,
          mimeType,
          fileSizeBytes: contentLength,
          securityClassification: "INTERNAL",
          malwareScanStatus: "PENDING",
          retentionRule: "PERSONNEL_LICENSE_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: "INDUSTRIAL_PERSONNEL_LICENSE",
          uploadedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
      },
      principal.userId,
    );

    const presign = await this.storage.createPresignedUploadUrl({
      objectKey,
      mimeType,
      contentLength,
    });

    return {
      documentId,
      side,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      originalFilename: filename,
      mimeType,
      ...(personnelId ? { personnelId } : {}),
    };
  }

  async completeUpload(
    principal: ForgePrincipal,
    body: { side?: string; documentId?: string; personnelId?: string },
  ) {
    const tenantId = this.tenant(principal);
    const side = this.parseSide(body.side);
    const documentId = String(body.documentId ?? "").trim();
    const personnelId = String(body.personnelId ?? "").trim();
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError("VALIDATION_FAILED", "documentId must be a UUID");
    }
    if (personnelId && !UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }
        if (document.source !== "INDUSTRIAL_PERSONNEL_LICENSE") {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a personnel license upload");
        }

        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(eq(forgeDocuments.id, document.id));

        const uploadMeta = {
          name: document.originalFilename,
          fileName: document.originalFilename,
          documentId: document.id,
          contentType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          uploadedAt: now.toISOString(),
        };

        if (personnelId) {
          await this.attachLicenseToPersonnel(tx, tenantId, personnelId, side, uploadMeta, now);
        }

        return {
          documentId: document.id,
          side,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          uploadStatus: "COMPLETE",
          file: uploadMeta,
          ...(personnelId ? { personnelId } : {}),
        };
      },
      principal.userId,
    );
  }

  private async attachLicenseToPersonnel(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    personnelId: string,
    side: PersonnelLicenseSide,
    uploadMeta: Record<string, unknown>,
    now: Date,
  ) {
    const [person] = await tx
      .select({
        id: industrialPersonnel.id,
        sourcePayload: industrialPersonnel.sourcePayload,
      })
      .from(industrialPersonnel)
      .where(
        and(eq(industrialPersonnel.id, personnelId), eq(industrialPersonnel.tenantId, tenantId)),
      )
      .limit(1);
    if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

    const payload = unwrapPayload(person.sourcePayload);
    const uploadKey = side === "front" ? "licenseFrontUpload" : "licenseBackUpload";
    const urlKey = side === "front" ? "licenseFrontUrl" : "licenseBackUrl";
    const nextPayload: Record<string, unknown> = {
      ...payload,
      [uploadKey]: uploadMeta,
      // Clear inline data URLs so jsonb stays slim.
      [urlKey]: "",
    };

    await tx
      .update(industrialPersonnel)
      .set({ sourcePayload: nextPayload, updatedAt: now })
      .where(eq(industrialPersonnel.id, personnelId));

    const [linkedDriver] = await tx
      .select()
      .from(industrialFleetDrivers)
      .where(
        and(
          eq(industrialFleetDrivers.tenantId, tenantId),
          eq(industrialFleetDrivers.personnelId, personnelId),
          isNull(industrialFleetDrivers.archivedAt),
        ),
      )
      .limit(1);
    if (linkedDriver) {
      const driverPayload = unwrapPayload(linkedDriver.sourcePayload);
      await tx
        .update(industrialFleetDrivers)
        .set({
          sourcePayload: {
            ...driverPayload,
            [uploadKey]: uploadMeta,
            [urlKey]: "",
          },
          updatedAt: now,
        })
        .where(eq(industrialFleetDrivers.id, linkedDriver.id));
    }

    const [linkedDot] = await tx
      .select()
      .from(industrialDotComplianceRecords)
      .where(
        and(
          eq(industrialDotComplianceRecords.tenantId, tenantId),
          eq(industrialDotComplianceRecords.personnelId, personnelId),
          isNull(industrialDotComplianceRecords.archivedAt),
        ),
      )
      .orderBy(desc(industrialDotComplianceRecords.updatedAt))
      .limit(1);
    if (linkedDot) {
      const dotPayload = unwrapPayload(linkedDot.sourcePayload);
      const details =
        dotPayload.details &&
        typeof dotPayload.details === "object" &&
        !Array.isArray(dotPayload.details)
          ? { ...(dotPayload.details as Record<string, unknown>) }
          : {};
      const copyList = [uploadMeta];
      const nextDot: Record<string, unknown> = {
        ...dotPayload,
        [uploadKey]: uploadMeta,
        [urlKey]: "",
      };
      // DQF worksheet uses a combined driversLicenseCopy field for the front/combined image.
      if (side === "front") {
        nextDot.driversLicenseCopy = copyList;
        details.driversLicenseCopy = JSON.stringify(copyList);
        nextDot.details = details;
      } else {
        nextDot.driversLicenseBack = uploadMeta;
        details.driversLicenseBack = JSON.stringify(copyList);
        nextDot.details = details;
      }
      await tx
        .update(industrialDotComplianceRecords)
        .set({ sourcePayload: nextDot, updatedAt: now })
        .where(eq(industrialDotComplianceRecords.id, linkedDot.id));
    }
  }

  async createDownloadUrl(principal: ForgePrincipal, documentIdRaw: string) {
    const tenantId = this.tenant(principal);
    const documentId = String(documentIdRaw ?? "").trim();
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError("VALIDATION_FAILED", "documentId must be a UUID");
    }

    const document = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!row || row.uploadStatus !== "COMPLETE") {
          throw new ForgeError("NOT_FOUND", "Document is not available");
        }
        if (row.source !== "INDUSTRIAL_PERSONNEL_LICENSE" && row.source !== "INDUSTRIAL_DOT_DQF") {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a license file");
        }
        if (!documentBelongsToTenant(row.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(row.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }
        return row;
      },
      principal.userId,
    );

    const inline =
      document.mimeType.startsWith("image/") || document.mimeType === "application/pdf";
    const presign = await this.storage.createPresignedDownloadUrl({
      objectKey: document.objectKey,
      mimeType: document.mimeType,
      filename: document.originalFilename,
      inline,
    });
    this.storage.assertDownloadNotExpired(presign.expiresAt);

    return {
      documentId: document.id,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      downloadUrl: presign.downloadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      expiresAt: presign.expiresAt,
      mode: presign.mode,
    };
  }
}
