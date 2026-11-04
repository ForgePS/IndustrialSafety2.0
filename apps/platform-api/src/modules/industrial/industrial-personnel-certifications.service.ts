import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialPersonnel,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import {
  isAllowedPersonnelCertMime,
  isPersonnelCertKind,
  MAX_PERSONNEL_CERT_BYTES,
  personnelCertColumn,
  personnelCertObjectKeyPrefix,
  type PersonnelCertKind,
} from "./industrial-personnel-certifications.mime.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalCertDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (text === "") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

function optionalCertDocumentId(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  if (!UUID_PATTERN.test(text)) {
    throw new ForgeError("VALIDATION_FAILED", "Certification document id must be a UUID");
  }
  return text;
}

@Injectable()
export class IndustrialPersonnelCertificationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  private parseKind(raw: unknown): PersonnelCertKind {
    const kind = String(raw ?? "")
      .trim()
      .toUpperCase()
      .replace(/-/g, "_");
    const normalized =
      kind === "FIRST_AID" || kind === "FIRSTAID" ? "FIRST_AID" : kind === "CPR" ? "CPR" : "";
    if (!isPersonnelCertKind(normalized)) {
      throw new ForgeError("VALIDATION_FAILED", "kind must be CPR or FIRST_AID");
    }
    return normalized;
  }

  async createUploadUrl(
    principal: ForgePrincipal,
    body: {
      kind?: string;
      personnelId?: string;
      filename?: string;
      mimeType?: string;
      contentLength?: number;
    },
  ) {
    const tenantId = this.tenant(principal);
    const kind = this.parseKind(body.kind);
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);
    const personnelId = String(body.personnelId ?? "").trim();

    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedPersonnelCertMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF or an image (JPEG, PNG, WebP, HEIC).",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_PERSONNEL_CERT_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_PERSONNEL_CERT_BYTES} bytes`,
      );
    }
    if (personnelId && !UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${personnelCertObjectKeyPrefix(tenantId, kind)}${storedFilename}`;
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
          retentionRule: "PERSONNEL_CERT_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: "INDUSTRIAL_PERSONNEL_CERT",
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
      kind,
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
    body: { kind?: string; documentId?: string; personnelId?: string },
  ) {
    const tenantId = this.tenant(principal);
    const kind = this.parseKind(body.kind);
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
        if (document.source !== "INDUSTRIAL_PERSONNEL_CERT") {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Document is not a personnel certification upload",
          );
        }

        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(eq(forgeDocuments.id, document.id));

        if (personnelId) {
          const column = personnelCertColumn(kind);
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
          await tx
            .update(industrialPersonnel)
            .set({ [column]: documentId, updatedAt: now } as never)
            .where(eq(industrialPersonnel.id, personnelId));
        }

        return {
          documentId: document.id,
          kind,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          uploadStatus: "COMPLETE",
          ...(personnelId ? { personnelId } : {}),
        };
      },
      principal.userId,
    );
  }

  /**
   * Link CPR / First Aid certification copies and expiry dates to a personnel file.
   * Allowed for personnel.manage or first_aid.manage (narrower than full PATCH).
   */
  async assignToPersonnel(
    principal: ForgePrincipal,
    body: {
      personnelId?: string;
      tracksFirstAid?: boolean;
      cprCertificationExpiresDate?: string | null;
      firstAidCertificationExpiresDate?: string | null;
      cprCertificationDocumentId?: string | null;
      firstAidCertificationDocumentId?: string | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    const personnelId = String(body.personnelId ?? "").trim();
    if (!UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }

    const hasCprDate = Object.prototype.hasOwnProperty.call(body, "cprCertificationExpiresDate");
    const hasFaDate = Object.prototype.hasOwnProperty.call(
      body,
      "firstAidCertificationExpiresDate",
    );
    const hasCprDoc = Object.prototype.hasOwnProperty.call(body, "cprCertificationDocumentId");
    const hasFaDoc = Object.prototype.hasOwnProperty.call(body, "firstAidCertificationDocumentId");
    const hasTracks = Object.prototype.hasOwnProperty.call(body, "tracksFirstAid");

    if (!hasCprDate && !hasFaDate && !hasCprDoc && !hasFaDoc && !hasTracks) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Provide at least one certification field (expiry date, document, or tracksFirstAid)",
      );
    }

    const cprExpires = hasCprDate ? optionalCertDate(body.cprCertificationExpiresDate) : undefined;
    const faExpires = hasFaDate
      ? optionalCertDate(body.firstAidCertificationExpiresDate)
      : undefined;
    const cprDocId = hasCprDoc
      ? optionalCertDocumentId(body.cprCertificationDocumentId)
      : undefined;
    const faDocId = hasFaDoc
      ? optionalCertDocumentId(body.firstAidCertificationDocumentId)
      : undefined;

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [person] = await tx
          .select({
            id: industrialPersonnel.id,
            displayName: industrialPersonnel.displayName,
            tracksFirstAid: industrialPersonnel.tracksFirstAid,
            cprCertificationExpiresDate: industrialPersonnel.cprCertificationExpiresDate,
            firstAidCertificationExpiresDate: industrialPersonnel.firstAidCertificationExpiresDate,
            cprCertificationDocumentId: industrialPersonnel.cprCertificationDocumentId,
            firstAidCertificationDocumentId: industrialPersonnel.firstAidCertificationDocumentId,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

        if (cprDocId) await this.assertCompleteCertDocument(tx, tenantId, cprDocId);
        if (faDocId) await this.assertCompleteCertDocument(tx, tenantId, faDocId);

        const now = new Date();
        const patch: Record<string, unknown> = { updatedAt: now };
        if (hasTracks) {
          patch.tracksFirstAid = Boolean(body.tracksFirstAid);
        } else if (cprExpires || faExpires || cprDocId || faDocId) {
          // Linking a cert implies the person should appear on the First Aid roster.
          patch.tracksFirstAid = true;
        }
        if (cprExpires !== undefined) patch.cprCertificationExpiresDate = cprExpires;
        if (faExpires !== undefined) patch.firstAidCertificationExpiresDate = faExpires;
        if (cprDocId !== undefined) patch.cprCertificationDocumentId = cprDocId;
        if (faDocId !== undefined) patch.firstAidCertificationDocumentId = faDocId;

        const [row] = await tx
          .update(industrialPersonnel)
          .set(patch as never)
          .where(eq(industrialPersonnel.id, personnelId))
          .returning({
            id: industrialPersonnel.id,
            displayName: industrialPersonnel.displayName,
            tracksFirstAid: industrialPersonnel.tracksFirstAid,
            cprCertificationExpiresDate: industrialPersonnel.cprCertificationExpiresDate,
            firstAidCertificationExpiresDate: industrialPersonnel.firstAidCertificationExpiresDate,
            cprCertificationDocumentId: industrialPersonnel.cprCertificationDocumentId,
            firstAidCertificationDocumentId: industrialPersonnel.firstAidCertificationDocumentId,
          });

        return {
          personnelId: row!.id,
          displayName: row!.displayName,
          tracksFirstAid: Boolean(row!.tracksFirstAid),
          cprCertificationExpiresDate: row!.cprCertificationExpiresDate
            ? String(row!.cprCertificationExpiresDate).slice(0, 10)
            : null,
          firstAidCertificationExpiresDate: row!.firstAidCertificationExpiresDate
            ? String(row!.firstAidCertificationExpiresDate).slice(0, 10)
            : null,
          cprCertificationDocumentId: row!.cprCertificationDocumentId ?? null,
          firstAidCertificationDocumentId: row!.firstAidCertificationDocumentId ?? null,
        };
      },
      principal.userId,
    );
  }

  private async assertCompleteCertDocument(
    tx: DatabaseTransaction,
    tenantId: string,
    documentId: string,
  ) {
    const document = await tx.query.forgeDocuments.findFirst({
      where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
    });
    if (!document || document.uploadStatus !== "COMPLETE") {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Certification document was not found or the upload is incomplete",
      );
    }
    if (document.source !== "INDUSTRIAL_PERSONNEL_CERT") {
      throw new ForgeError("VALIDATION_FAILED", "Document is not a personnel certification upload");
    }
    if (!documentBelongsToTenant(document.tenantId, tenantId)) {
      throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
    }
  }

  async createDownloadUrl(principal: ForgePrincipal, personnelId: string, kindRaw: string) {
    const tenantId = this.tenant(principal);
    const kind = this.parseKind(kindRaw);
    if (!UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }

    const { document } = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [person] = await tx
          .select()
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!person) throw new ForgeError("NOT_FOUND", "Personnel not found");

        const documentId =
          kind === "CPR"
            ? person.cprCertificationDocumentId
            : person.firstAidCertificationDocumentId;
        if (!documentId) {
          throw new ForgeError("NOT_FOUND", "No certification copy on file");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document || document.uploadStatus !== "COMPLETE") {
          throw new ForgeError("NOT_FOUND", "Certification document is not available");
        }
        return { document };
      },
      principal.userId,
    );

    await this.storage.assertObjectExists(document.objectKey);
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
      kind,
      documentId: document.id,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      downloadUrl: presign.downloadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      expiresAt: presign.expiresAt,
      mode: presign.mode,
    };
  }

  /** Resolve document metadata for personnel GET payloads. */
  async resolveCertMeta(
    tenantId: string,
    documentId: string | null | undefined,
  ): Promise<{
    documentId: string;
    originalFilename: string;
    mimeType: string;
    fileSizeBytes: number;
  } | null> {
    if (!documentId || !UUID_PATTERN.test(documentId)) return null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const document = await tx.query.forgeDocuments.findFirst({
        where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
      });
      if (!document || document.uploadStatus !== "COMPLETE") return null;
      return {
        documentId: document.id,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        fileSizeBytes: document.fileSizeBytes,
      };
    });
  }
}
