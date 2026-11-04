import { Inject, Injectable } from "@nestjs/common";
import {
  brandingAssetUploadInputSchema,
  brandingObjectKeyPrefix,
  documentBelongsToTenant,
  objectKeyBelongsToTenant,
  putTenantBrandingInputSchema,
  type PutTenantBrandingInput,
} from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  tenantBranding,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";

@Injectable()
export class BrandingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  async get(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.tenantBranding.findFirst({
        where: eq(tenantBranding.tenantId, tenantId),
      });
      return row ?? null;
    });
  }

  async put(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = putTenantBrandingInputSchema.parse(input) as PutTenantBrandingInput;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.assertOwnedDocumentRef(tx, tenantId, data.logoDocumentId ?? null);
        await this.assertOwnedDocumentRef(tx, tenantId, data.logoDarkDocumentId ?? null);
        await this.assertOwnedDocumentRef(tx, tenantId, data.iconDocumentId ?? null);

        const existing = await tx.query.tenantBranding.findFirst({
          where: eq(tenantBranding.tenantId, tenantId),
        });
        const now = new Date();
        const patch = {
          displayName: data.displayName,
          shortName: data.shortName,
          logoDocumentId: data.logoDocumentId,
          logoDarkDocumentId:
            data.logoDarkDocumentId !== undefined
              ? data.logoDarkDocumentId
              : (existing?.logoDarkDocumentId ?? null),
          iconDocumentId: data.iconDocumentId,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
          accentColor: data.accentColor,
          ...(data.approvedColorsJson !== undefined
            ? { approvedColorsJson: data.approvedColorsJson ?? [] }
            : {}),
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          emailSenderName: data.emailSenderName,
          supportEmail: data.supportEmail,
          reportIdentity: data.reportIdentity,
          documentFooter: data.documentFooter,
          ...(data.customCssEnabled !== undefined
            ? { customCssEnabled: data.customCssEnabled }
            : {}),
        };

        let row;
        if (existing) {
          [row] = await tx
            .update(tenantBranding)
            .set({
              ...patch,
              recordVersion: sql`${tenantBranding.recordVersion} + 1`,
              updatedAt: now,
            })
            .where(eq(tenantBranding.id, existing.id))
            .returning();
        } else {
          [row] = await tx
            .insert(tenantBranding)
            .values({
              id: createId(),
              tenantId,
              ...patch,
              approvedColorsJson: data.approvedColorsJson ?? [],
              customCssEnabled: data.customCssEnabled ?? false,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
        }
        if (!row) {
          throw new Error("Failed to upsert tenant branding");
        }
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "branding.put",
          resourceType: "tenant_branding",
          resourceId: row.id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return row;
      },
      principal.userId,
    );
  }

  async createAssetUpload(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = brandingAssetUploadInputSchema.parse(input);
    const storedFilename = this.storage.buildStoredFilename(data.filename);
    const objectKey = this.storage.buildBrandingObjectKey(tenantId, data.kind, storedFilename);
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const documentId = createId();
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
          retentionRule: "BRANDING_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: "BRANDING",
          uploadedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "branding.asset.upload_initialized",
          resourceType: "forge_document",
          resourceId: documentId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { kind: data.kind, objectKey },
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
      documentId,
      kind: data.kind,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
    };
  }

  async createAssetDownloadUrl(tenantId: string, documentId: string, principal: ForgePrincipal) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document) {
          throw new ForgeError("NOT_FOUND", "Branding asset document not found for tenant");
        }
        if (!documentBelongsToTenant(document.tenantId, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Document does not belong to the requested tenant");
        }
        if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
          throw new ForgeError("FORBIDDEN", "Object key does not belong to the requested tenant");
        }
        if (!document.objectKey.startsWith(brandingObjectKeyPrefix(tenantId))) {
          throw new ForgeError("FORBIDDEN", "Document is not a branding asset for this tenant");
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
          action: "branding.asset.download_requested",
          resourceType: "forge_document",
          resourceId: document.id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { expiresAt: presign.expiresAt },
        });

        return {
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

  private async assertOwnedDocumentRef(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    documentId: string | null,
  ): Promise<void> {
    if (!documentId) return;
    const document = await tx.query.forgeDocuments.findFirst({
      where: and(eq(forgeDocuments.id, documentId), eq(forgeDocuments.tenantId, tenantId)),
    });
    if (!document) {
      throw new ForgeError(
        "FORBIDDEN",
        "Branding asset document is missing or owned by another tenant",
      );
    }
    if (!documentBelongsToTenant(document.tenantId, tenantId)) {
      throw new ForgeError("FORBIDDEN", "Cannot assign another tenant's document");
    }
    if (!objectKeyBelongsToTenant(document.objectKey, tenantId)) {
      throw new ForgeError("FORBIDDEN", "Cannot overwrite or bind a cross-tenant object key");
    }
  }
}
