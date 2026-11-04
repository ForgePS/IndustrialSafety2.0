import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialPersonnelDisciplinaryActions,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import {
  isAllowedTrainingRecordAttachmentMime,
  MAX_TRAINING_RECORD_ATTACHMENT_BYTES,
} from "./industrial-training-record-attachments.mime.js";
import {
  DISCIPLINE_ATTACHMENT_SOURCE,
  disciplineAttachmentObjectKeyPrefix,
  readDisciplineAttachments,
} from "./personnel-discipline-helpers.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed write-ups and photos attached to personnel disciplinary actions. */
@Injectable()
export class IndustrialPersonnelDisciplineAttachmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: DocumentStorageService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    if (!principal.tenantId) throw new ForgeError("FORBIDDEN", "Tenant context required");
    return principal.tenantId;
  }

  private assertIds(...ids: string[]) {
    for (const id of ids) {
      if (!UUID_PATTERN.test(id)) throw new ForgeError("NOT_FOUND", "Record not found");
    }
  }

  private async loadAction(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
    actionId: string,
  ) {
    const [action] = await tx
      .select()
      .from(industrialPersonnelDisciplinaryActions)
      .where(
        and(
          eq(industrialPersonnelDisciplinaryActions.id, actionId),
          eq(industrialPersonnelDisciplinaryActions.tenantId, tenantId),
          eq(industrialPersonnelDisciplinaryActions.personnelId, personnelId),
          isNull(industrialPersonnelDisciplinaryActions.archivedAt),
        ),
      )
      .limit(1);
    if (!action) throw new ForgeError("NOT_FOUND", "Disciplinary action not found");
    return action;
  }

  private async loadDocument(
    tx: DatabaseTransaction,
    tenantId: string,
    actionId: string,
    documentId: string,
  ) {
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
    if (
      document.source !== DISCIPLINE_ATTACHMENT_SOURCE ||
      !document.objectKey.startsWith(disciplineAttachmentObjectKeyPrefix(tenantId, actionId))
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Document does not belong to this disciplinary action",
      );
    }
    return document;
  }

  async createUploadUrl(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);
    this.assertIds(personnelId, actionId);
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
        `File must be between 1 byte and ${Math.round(MAX_TRAINING_RECORD_ATTACHMENT_BYTES / (1024 * 1024))} MB`,
      );
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${disciplineAttachmentObjectKeyPrefix(tenantId, actionId)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);
    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.loadAction(tx, tenantId, personnelId, actionId);
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
          retentionRule: "PERSONNEL_DISCIPLINE_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: DISCIPLINE_ATTACHMENT_SOURCE,
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
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      originalFilename: filename,
      mimeType,
    };
  }

  async completeUpload(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    body: Record<string, unknown>,
  ) {
    const tenantId = this.tenant(principal);
    const documentId = String(body.documentId ?? "").trim();
    this.assertIds(personnelId, actionId);
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError("VALIDATION_FAILED", "documentId must be a UUID");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const action = await this.loadAction(tx, tenantId, personnelId, actionId);
        const document = await this.loadDocument(tx, tenantId, actionId, documentId);
        await this.storage.assertObjectExists(document.objectKey);

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({ uploadStatus: "COMPLETE", uploadedAt: now, updatedAt: now })
          .where(and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)));

        const attachments = readDisciplineAttachments(action.attachments);
        if (!attachments.some((row) => row.documentId === document.id)) {
          attachments.push({
            documentId: document.id,
            fileName: document.originalFilename,
            contentType: document.mimeType,
            uploadedAt: now.toISOString(),
          });
        }
        await tx
          .update(industrialPersonnelDisciplinaryActions)
          .set({ attachments, updatedAt: now })
          .where(eq(industrialPersonnelDisciplinaryActions.id, action.id));

        return { actionId, documentId: document.id, attachments };
      },
      principal.userId,
    );
  }

  async createDownloadUrl(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    documentId: string,
  ) {
    const tenantId = this.tenant(principal);
    this.assertIds(personnelId, actionId, documentId);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const action = await this.loadAction(tx, tenantId, personnelId, actionId);
        if (
          !readDisciplineAttachments(action.attachments).some(
            (row) => row.documentId === documentId,
          )
        ) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this disciplinary action");
        }
        const document = await this.loadDocument(tx, tenantId, actionId, documentId);
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
        };
      },
      principal.userId,
    );
  }

  async deleteAttachment(
    principal: ForgePrincipal,
    personnelId: string,
    actionId: string,
    documentId: string,
  ) {
    const tenantId = this.tenant(principal);
    this.assertIds(personnelId, actionId, documentId);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const action = await this.loadAction(tx, tenantId, personnelId, actionId);
        const existing = readDisciplineAttachments(action.attachments);
        if (!existing.some((row) => row.documentId === documentId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this disciplinary action");
        }
        const document = await this.loadDocument(tx, tenantId, actionId, documentId);
        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({
            archivedAt: now,
            archivedByUserId: principal.userId,
            recordVersion: document.recordVersion + 1,
            updatedAt: now,
          })
          .where(and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)));

        const attachments = existing.filter((row) => row.documentId !== documentId);
        await tx
          .update(industrialPersonnelDisciplinaryActions)
          .set({ attachments, updatedAt: now })
          .where(eq(industrialPersonnelDisciplinaryActions.id, action.id));

        return { actionId, documentId, attachments };
      },
      principal.userId,
    );
  }
}
