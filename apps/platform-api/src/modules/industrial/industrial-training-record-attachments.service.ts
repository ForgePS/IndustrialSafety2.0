import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialTrainingRecords,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import {
  isAllowedTrainingRecordAttachmentMime,
  MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
  TRAINING_RECORD_ATTACHMENT_SOURCE,
  trainingRecordAttachmentObjectKeyPrefix,
} from "./industrial-training-record-attachments.mime.js";

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

export type TrainingRecordAttachmentMeta = {
  documentId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export function readTrainingRecordAttachments(payload: unknown): TrainingRecordAttachmentMeta[] {
  const root = unwrapPayload(payload);
  const raw = root.certificateUploads;
  if (!Array.isArray(raw)) return [];
  const out: TrainingRecordAttachmentMeta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const documentId = String(row.documentId ?? "").trim();
    if (!UUID_PATTERN.test(documentId)) continue;
    const fileName =
      String(row.fileName ?? row.originalFilename ?? row.name ?? "").trim() || "Attachment";
    const contentType =
      String(row.contentType ?? row.mimeType ?? "").trim() || "application/octet-stream";
    const uploadedAt = String(row.uploadedAt ?? "").trim() || new Date(0).toISOString();
    out.push({ documentId, fileName, contentType, uploadedAt });
  }
  return out;
}

/**
 * Certificate / proof-of-training uploads for industrial_training_records
 * (legacy Excel imports and manual completion rows).
 */
@Injectable()
export class IndustrialTrainingRecordAttachmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  async createUploadUrl(
    principal: ForgePrincipal,
    recordId: string,
    body: { filename?: string; mimeType?: string; contentLength?: number },
  ) {
    const tenantId = this.tenant(principal);
    const id = String(recordId ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);

    if (!UUID_PATTERN.test(id)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId must be a UUID");
    }
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedTrainingRecordAttachmentMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF or an image (JPEG, PNG, WebP, HEIC).",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_TRAINING_RECORD_ATTACHMENT_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_TRAINING_RECORD_ATTACHMENT_BYTES} bytes`,
      );
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${trainingRecordAttachmentObjectKeyPrefix(tenantId, id)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);
    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [record] = await tx
          .select({ id: industrialTrainingRecords.id })
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.id, id),
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
            ),
          )
          .limit(1);
        if (!record) throw new ForgeError("NOT_FOUND", "Training record not found");

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
          retentionRule: "TRAINING_RECORD_ATTACHMENT_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: TRAINING_RECORD_ATTACHMENT_SOURCE,
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
      recordId: id,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      originalFilename: filename,
      mimeType,
    };
  }

  async completeUpload(principal: ForgePrincipal, recordId: string, body: { documentId?: string }) {
    const tenantId = this.tenant(principal);
    const id = String(recordId ?? "").trim();
    const documentId = String(body.documentId ?? "").trim();
    if (!UUID_PATTERN.test(id)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId must be a UUID");
    }
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        documentId
          ? `documentId must be a UUID (received "${documentId.slice(0, 64)}")`
          : "documentId must be a UUID (missing from complete request)",
      );
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [record] = await tx
          .select()
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.id, id),
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
            ),
          )
          .limit(1);
        if (!record) throw new ForgeError("NOT_FOUND", "Training record not found");

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
        if (document.source !== TRAINING_RECORD_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a training record attachment");
        }
        const expectedPrefix = trainingRecordAttachmentObjectKeyPrefix(tenantId, id);
        if (!document.objectKey.startsWith(expectedPrefix)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Document does not belong to this training record",
          );
        }

        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({
            uploadStatus: "COMPLETE",
            uploadedAt: now,
            updatedAt: now,
          })
          .where(and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)));

        const payload = unwrapPayload(record.sourcePayload);
        const uploads = readTrainingRecordAttachments(payload);
        if (!uploads.some((row) => row.documentId === document.id)) {
          uploads.push({
            documentId: document.id,
            fileName: document.originalFilename,
            contentType: document.mimeType,
            uploadedAt: now.toISOString(),
          });
        }

        const [updated] = await tx
          .update(industrialTrainingRecords)
          .set({
            sourcePayload: {
              ...payload,
              certificateUploads: uploads,
            },
            updatedAt: now,
          })
          .where(eq(industrialTrainingRecords.id, id))
          .returning();

        return {
          recordId: id,
          documentId: document.id,
          fileName: document.originalFilename,
          attachments: uploads,
          record: updated,
        };
      },
      principal.userId,
    );
  }

  async createDownloadUrl(principal: ForgePrincipal, recordId: string, documentId: string) {
    const tenantId = this.tenant(principal);
    const id = String(recordId ?? "").trim();
    const docId = String(documentId ?? "").trim();
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(docId)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId and documentId must be UUIDs");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [record] = await tx
          .select({
            id: industrialTrainingRecords.id,
            sourcePayload: industrialTrainingRecords.sourcePayload,
          })
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.id, id),
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
            ),
          )
          .limit(1);
        if (!record) throw new ForgeError("NOT_FOUND", "Training record not found");

        const attachments = readTrainingRecordAttachments(record.sourcePayload);
        if (!attachments.some((row) => row.documentId === docId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this training record");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, docId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        if (document.source !== TRAINING_RECORD_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a training record attachment");
        }

        const inline =
          document.mimeType.startsWith("image/") || document.mimeType === "application/pdf";
        const download = await this.storage.createPresignedDownloadUrl({
          objectKey: document.objectKey,
          mimeType: document.mimeType,
          filename: document.originalFilename,
          inline,
        });

        return {
          documentId: document.id,
          fileName: document.originalFilename,
          mimeType: document.mimeType,
          downloadUrl: download.downloadUrl,
          expiresInSeconds: download.expiresInSeconds,
          expiresAt: download.expiresAt,
          mode: download.mode,
        };
      },
      principal.userId,
    );
  }

  async deleteAttachment(principal: ForgePrincipal, recordId: string, documentId: string) {
    const tenantId = this.tenant(principal);
    const id = String(recordId ?? "").trim();
    const docId = String(documentId ?? "").trim();
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(docId)) {
      throw new ForgeError("VALIDATION_FAILED", "recordId and documentId must be UUIDs");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [record] = await tx
          .select()
          .from(industrialTrainingRecords)
          .where(
            and(
              eq(industrialTrainingRecords.id, id),
              eq(industrialTrainingRecords.tenantId, tenantId),
              isNull(industrialTrainingRecords.archivedAt),
            ),
          )
          .limit(1);
        if (!record) throw new ForgeError("NOT_FOUND", "Training record not found");

        const payload = unwrapPayload(record.sourcePayload);
        const existing = readTrainingRecordAttachments(payload);
        if (!existing.some((row) => row.documentId === docId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this training record");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, docId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }
        if (document.source !== TRAINING_RECORD_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not a training record attachment");
        }
        const expectedPrefix = trainingRecordAttachmentObjectKeyPrefix(tenantId, id);
        if (!document.objectKey.startsWith(expectedPrefix)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "Document does not belong to this training record",
          );
        }

        const now = new Date();
        const remaining = existing.filter((row) => row.documentId !== docId);

        await tx
          .update(forgeDocuments)
          .set({
            archivedAt: now,
            archivedByUserId: principal.userId,
            recordVersion: document.recordVersion + 1,
            updatedAt: now,
          })
          .where(and(eq(forgeDocuments.id, docId), eq(forgeDocuments.tenantId, tenantId)));

        await tx
          .update(industrialTrainingRecords)
          .set({
            sourcePayload: {
              ...payload,
              certificateUploads: remaining,
            },
            updatedAt: now,
          })
          .where(eq(industrialTrainingRecords.id, id));

        return {
          recordId: id,
          documentId: docId,
          attachments: remaining,
        };
      },
      principal.userId,
    );
  }
}
