import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  forgeDocuments,
  platformCompanyDocuments,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import { isAllowedCompanyDocumentMime } from "./company-documents.mime.js";

export {
  COMPANY_DOCUMENT_ALLOWED_MIME_TYPES,
  isAllowedCompanyDocumentMime,
} from "./company-documents.mime.js";

const MAX_CONTENT_LENGTH = 25_000_000;

const uploadUrlSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.string().min(1).max(64).optional().default("GENERAL"),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  contentLength: z.number().int().positive().max(MAX_CONTENT_LENGTH),
});

function companyDocumentsObjectKeyPrefix(tenantId: string): string {
  return `tenants/${tenantId}/company-documents/`;
}

@Injectable()
export class CompanyDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(platformCompanyDocuments)
        .where(
          and(
            eq(platformCompanyDocuments.tenantId, tenantId),
            isNull(platformCompanyDocuments.archivedAt),
          ),
        )
        .orderBy(desc(platformCompanyDocuments.updatedAt));
    });
  }

  async createUploadUrl(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = uploadUrlSchema.parse(input);
    if (!isAllowedCompanyDocumentMime(data.mimeType)) {
      throw new ForgeError("VALIDATION_FAILED", "MIME type not allowed for company documents");
    }

    const storedFilename = this.storage.buildStoredFilename(data.filename);
    const objectKey = `${companyDocumentsObjectKeyPrefix(tenantId)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const documentId = createId();
    const companyDocumentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx.insert(forgeDocuments).values({
          id: documentId,
          tenantId,
          originalFilename: data.filename,
          storedFilename,
          objectKey,
          bucketName: this.storage.bucketName,
          mimeType: data.mimeType,
          fileSizeBytes: data.contentLength,
          securityClassification: "INTERNAL",
          malwareScanStatus: "PENDING",
          retentionRule: "COMPANY_DOCUMENT_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: "COMPANY_DOCUMENT",
          uploadedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(platformCompanyDocuments).values({
          id: companyDocumentId,
          tenantId,
          documentId,
          title: data.title,
          category: data.category,
          mimeType: data.mimeType,
          originalFilename: data.filename,
          byteSize: data.contentLength,
          status: "PENDING_UPLOAD",
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "company_document.upload_initialized",
          resourceType: "platform_company_document",
          resourceId: companyDocumentId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { documentId, objectKey, title: data.title },
        });
      },
      principal.userId,
    );

    const presign = await this.storage.createPresignedUploadUrl({
      objectKey,
      mimeType: data.mimeType,
      contentLength: data.contentLength,
    });

    return {
      id: companyDocumentId,
      documentId,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
    };
  }

  async completeUpload(tenantId: string, id: string, principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const companyDoc = await tx.query.platformCompanyDocuments.findFirst({
          where: and(
            eq(platformCompanyDocuments.id, id),
            eq(platformCompanyDocuments.tenantId, tenantId),
          ),
        });
        if (!companyDoc || companyDoc.archivedAt) {
          throw new ForgeError("NOT_FOUND", "Company document not found");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(
            eq(forgeDocuments.id, companyDoc.documentId),
            eq(forgeDocuments.tenantId, tenantId),
          ),
        });
        if (!document) {
          throw new ForgeError("NOT_FOUND", "Document not found");
        }
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }

        const now = new Date();
        await tx
          .update(forgeDocuments)
          .set({
            uploadStatus: "COMPLETE",
            uploadedAt: now,
            updatedAt: now,
          })
          .where(eq(forgeDocuments.id, document.id));

        const [updated] = await tx
          .update(platformCompanyDocuments)
          .set({
            status: "ACTIVE",
            updatedAt: now,
          })
          .where(eq(platformCompanyDocuments.id, id))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "company_document.upload_completed",
          resourceType: "platform_company_document",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
        });

        return updated;
      },
      principal.userId,
    );
  }

  async createDownloadUrl(tenantId: string, id: string, principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const companyDoc = await tx.query.platformCompanyDocuments.findFirst({
          where: and(
            eq(platformCompanyDocuments.id, id),
            eq(platformCompanyDocuments.tenantId, tenantId),
          ),
        });
        if (!companyDoc || companyDoc.archivedAt) {
          throw new ForgeError("NOT_FOUND", "Company document not found");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(
            eq(forgeDocuments.id, companyDoc.documentId),
            eq(forgeDocuments.tenantId, tenantId),
          ),
        });
        if (!document) {
          throw new ForgeError("NOT_FOUND", "Document not found");
        }
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }
        if (!document.objectKey.startsWith(companyDocumentsObjectKeyPrefix(tenantId))) {
          throw new ForgeError("FORBIDDEN", "Document is not a company document for this tenant");
        }

        const presign = await this.storage.createPresignedDownloadUrl({
          objectKey: document.objectKey,
          mimeType: document.mimeType,
          filename: document.originalFilename,
        });
        this.storage.assertDownloadNotExpired(presign.expiresAt);

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "company_document.download_requested",
          resourceType: "platform_company_document",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { expiresAt: presign.expiresAt },
        });

        return {
          id: companyDoc.id,
          documentId: document.id,
          downloadUrl: presign.downloadUrl,
          expiresInSeconds: presign.expiresInSeconds,
          expiresAt: presign.expiresAt,
          mode: presign.mode,
          mimeType: document.mimeType,
        };
      },
      principal.userId,
    );
  }

  async archive(tenantId: string, id: string, principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const companyDoc = await tx.query.platformCompanyDocuments.findFirst({
          where: and(
            eq(platformCompanyDocuments.id, id),
            eq(platformCompanyDocuments.tenantId, tenantId),
          ),
        });
        if (!companyDoc || companyDoc.archivedAt) {
          throw new ForgeError("NOT_FOUND", "Company document not found");
        }

        const now = new Date();
        const [updated] = await tx
          .update(platformCompanyDocuments)
          .set({
            status: "ARCHIVED",
            archivedAt: now,
            updatedAt: now,
          })
          .where(eq(platformCompanyDocuments.id, id))
          .returning();

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "company_document.archived",
          resourceType: "platform_company_document",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
        });

        return updated;
      },
      principal.userId,
    );
  }
}
