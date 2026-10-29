import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialDotComplianceRecords,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import {
  dotDqfDocumentObjectKeyPrefix,
  isAllowedDotDqfDocumentMime,
  MAX_DOT_DQF_DOCUMENT_BYTES,
} from "./industrial-dot-dqf-documents.mime.js";

/** Accept UUID v4/v7 and other hex uuid shapes used by createId() / Postgres uuid. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/;

@Injectable()
export class IndustrialDotDqfDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  private parseFieldId(raw: unknown): string {
    const fieldId = String(raw ?? "").trim();
    if (!FIELD_ID_PATTERN.test(fieldId)) {
      throw new ForgeError("VALIDATION_FAILED", "fieldId must be a valid DQF field id");
    }
    return fieldId;
  }

  async createUploadUrl(
    principal: ForgePrincipal,
    body: {
      fieldId?: string;
      recordId?: string;
      filename?: string;
      mimeType?: string;
      contentLength?: number;
    },
  ) {
    const tenantId = this.tenant(principal);
    const fieldId = this.parseFieldId(body.fieldId);
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);
    const recordId = String(body.recordId ?? "").trim();

    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedDotDqfDocumentMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF or an image (JPEG, PNG, WebP, HEIC).",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_DOT_DQF_DOCUMENT_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_DOT_DQF_DOCUMENT_BYTES} bytes`,
      );
    }
    if (recordId && !UUID_PATTERN.test(recordId)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId must be a UUID");
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${dotDqfDocumentObjectKeyPrefix(tenantId, fieldId)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        if (recordId) {
          const [record] = await tx
            .select({ id: industrialDotComplianceRecords.id })
            .from(industrialDotComplianceRecords)
            .where(
              and(
                eq(industrialDotComplianceRecords.id, recordId),
                eq(industrialDotComplianceRecords.tenantId, tenantId),
                isNull(industrialDotComplianceRecords.archivedAt),
              ),
            )
            .limit(1);
          if (!record) throw new ForgeError("NOT_FOUND", "DOT record not found");
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
          retentionRule: "DOT_DQF_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: "INDUSTRIAL_DOT_DQF",
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
      fieldId,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      originalFilename: filename,
      mimeType,
      ...(recordId ? { recordId } : {}),
    };
  }

  async completeUpload(
    principal: ForgePrincipal,
    body: { documentId?: string; fieldId?: string; recordId?: string },
  ) {
    const tenantId = this.tenant(principal);
    const documentId = String(body.documentId ?? "").trim();
    const fieldId = body.fieldId != null ? this.parseFieldId(body.fieldId) : "";
    const recordId = String(body.recordId ?? "").trim();
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError("VALIDATION_FAILED", "documentId must be a UUID");
    }
    if (recordId && !UUID_PATTERN.test(recordId)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId must be a UUID");
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
        if (document.source !== "INDUSTRIAL_DOT_DQF") {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a DOT DQF upload");
        }

        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(eq(forgeDocuments.id, document.id));

        return {
          documentId: document.id,
          fieldId: fieldId || undefined,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
          fileSizeBytes: document.fileSizeBytes,
          uploadStatus: "COMPLETE",
          ...(recordId ? { recordId } : {}),
        };
      },
      principal.userId,
    );
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
        if (row.source !== "INDUSTRIAL_DOT_DQF" && row.source !== "INDUSTRIAL_PERSONNEL_LICENSE") {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a DOT DQF upload");
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

    // Skip HeadObject here — it added seconds per preview when a DQF sheet opened
    // many copies. Missing objects still fail when the browser GETs the presigned URL.
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
