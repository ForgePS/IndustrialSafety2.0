import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  forgeDocuments,
  forgePhotos,
  photoMarkupRevisions,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";

const createPhotoSchema = z.object({
  originalDocumentId: z.string().uuid(),
  originalFileName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  source: z.enum(["camera", "upload", "import"]).optional().default("upload"),
  module: z.string().max(80).optional(),
  recordId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  caption: z.string().max(2000).optional(),
  description: z.string().max(8000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

const saveMarkupSchema = z.object({
  annotationJson: z.unknown(),
  status: z.enum(["draft", "final"]).optional().default("final"),
  notes: z.string().max(2000).optional(),
  canvasWidth: z.number().int().nonnegative().optional().default(0),
  canvasHeight: z.number().int().nonnegative().optional().default(0),
  renderedDocumentId: z.string().uuid().optional(),
  sourceRevisionId: z.string().uuid().optional(),
});

function requireTenant(principal: ForgePrincipal): string {
  const tenantId = principal.tenantId;
  if (!tenantId) {
    throw new ForgeError("UNAUTHORIZED", "Tenant context required");
  }
  return tenantId;
}

@Injectable()
export class PhotoMarkupService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  async getPhoto(principal: ForgePrincipal, photoId: string) {
    const tenantId = requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(forgePhotos)
        .where(
          and(
            eq(forgePhotos.tenantId, tenantId),
            eq(forgePhotos.id, photoId),
            isNull(forgePhotos.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Photo not found");
      return row;
    });
  }

  async createPhoto(principal: ForgePrincipal, input: unknown) {
    const tenantId = requireTenant(principal);
    const data = createPhotoSchema.parse(input);
    const photoId = createId();
    const now = new Date();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(forgeDocuments)
        .where(
          and(
            eq(forgeDocuments.tenantId, tenantId),
            eq(forgeDocuments.id, data.originalDocumentId),
            isNull(forgeDocuments.archivedAt),
          ),
        )
        .limit(1);
      if (!doc) {
        throw new ForgeError("NOT_FOUND", "Original document not found");
      }

      await tx.insert(forgePhotos).values({
        id: photoId,
        tenantId,
        originalDocumentId: data.originalDocumentId,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        width: data.width ?? null,
        height: data.height ?? null,
        fileSizeBytes: data.fileSizeBytes ?? doc.fileSizeBytes,
        source: data.source,
        module: data.module ?? null,
        recordId: data.recordId ?? null,
        locationId: data.locationId ?? null,
        divisionId: data.divisionId ?? null,
        capturedByUserId: principal.userId,
        uploadedByUserId: principal.userId,
        uploadedAt: now,
        caption: data.caption ?? null,
        description: data.description ?? null,
        hasMarkup: false,
        createdAt: now,
        updatedAt: now,
      });

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "photo.uploaded",
        resourceType: "forge_photo",
        resourceId: photoId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: {
          module: data.module ?? null,
          recordId: data.recordId ?? null,
          source: data.source,
        },
      });
    });

    return this.getPhoto(principal, photoId);
  }

  async getCurrentMarkup(principal: ForgePrincipal, photoId: string) {
    const photo = await this.getPhoto(principal, photoId);
    if (!photo.currentRevisionId) return null;
    return this.getRevision(principal, photoId, photo.currentRevisionId);
  }

  async listRevisions(principal: ForgePrincipal, photoId: string) {
    const tenantId = requireTenant(principal);
    await this.getPhoto(principal, photoId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(photoMarkupRevisions)
        .where(
          and(
            eq(photoMarkupRevisions.tenantId, tenantId),
            eq(photoMarkupRevisions.photoId, photoId),
          ),
        )
        .orderBy(desc(photoMarkupRevisions.version));
    });
  }

  async getRevision(principal: ForgePrincipal, photoId: string, revisionId: string) {
    const tenantId = requireTenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(photoMarkupRevisions)
        .where(
          and(
            eq(photoMarkupRevisions.tenantId, tenantId),
            eq(photoMarkupRevisions.photoId, photoId),
            eq(photoMarkupRevisions.id, revisionId),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Markup revision not found");
      return row;
    });
  }

  async saveMarkup(principal: ForgePrincipal, photoId: string, input: unknown) {
    const tenantId = requireTenant(principal);
    const data = saveMarkupSchema.parse(input);
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "User required to save markup");
    }
    const revisionId = createId();
    const now = new Date();

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [photo] = await tx
        .select()
        .from(forgePhotos)
        .where(
          and(
            eq(forgePhotos.tenantId, tenantId),
            eq(forgePhotos.id, photoId),
            isNull(forgePhotos.archivedAt),
          ),
        )
        .limit(1);
      if (!photo) throw new ForgeError("NOT_FOUND", "Photo not found");

      const [agg] = await tx
        .select({ maxVersion: max(photoMarkupRevisions.version) })
        .from(photoMarkupRevisions)
        .where(
          and(
            eq(photoMarkupRevisions.tenantId, tenantId),
            eq(photoMarkupRevisions.photoId, photoId),
          ),
        );
      const nextVersion = (agg?.maxVersion ?? 0) + 1;

      await tx.insert(photoMarkupRevisions).values({
        id: revisionId,
        tenantId,
        photoId,
        version: nextVersion,
        status: data.status,
        annotationJson: (data.annotationJson ?? {}) as Record<string, unknown>,
        renderedDocumentId: data.renderedDocumentId ?? null,
        canvasWidth: data.canvasWidth,
        canvasHeight: data.canvasHeight,
        sourceRevisionId: data.sourceRevisionId ?? null,
        notes: data.notes ?? null,
        createdByUserId: principal.userId!,
        createdAt: now,
        updatedAt: now,
      });

      await tx
        .update(forgePhotos)
        .set({
          hasMarkup: true,
          currentRevisionId: revisionId,
          updatedAt: now,
          recordVersion: sql`${forgePhotos.recordVersion} + 1`,
        })
        .where(and(eq(forgePhotos.tenantId, tenantId), eq(forgePhotos.id, photoId)));

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "photo.markup.saved",
        resourceType: "photo_markup_revision",
        resourceId: revisionId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: {
          photoId,
          version: nextVersion,
          status: data.status,
          hasRendered: Boolean(data.renderedDocumentId),
        },
      });
    });

    return this.getRevision(principal, photoId, revisionId);
  }

  async restoreRevision(principal: ForgePrincipal, photoId: string, revisionId: string) {
    const source = await this.getRevision(principal, photoId, revisionId);
    return this.saveMarkup(principal, photoId, {
      annotationJson: source.annotationJson,
      status: "final",
      canvasWidth: source.canvasWidth,
      canvasHeight: source.canvasHeight,
      renderedDocumentId: source.renderedDocumentId ?? undefined,
      sourceRevisionId: source.id,
      notes: `Restored from revision v${source.version}`,
    });
  }

  async createOriginalDownloadUrl(principal: ForgePrincipal, photoId: string) {
    const tenantId = requireTenant(principal);
    const photo = await this.getPhoto(principal, photoId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(forgeDocuments)
        .where(
          and(
            eq(forgeDocuments.tenantId, tenantId),
            eq(forgeDocuments.id, photo.originalDocumentId),
          ),
        )
        .limit(1);
      if (!doc) throw new ForgeError("NOT_FOUND", "Original document missing");
      const downloadUrl = await this.storage.createPresignedDownloadUrl({
        objectKey: doc.objectKey,
        mimeType: doc.mimeType,
        filename: doc.originalFilename,
        inline: true,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "photo.downloaded",
        resourceType: "forge_photo",
        resourceId: photoId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { kind: "original" },
      });
      return { downloadUrl: downloadUrl.downloadUrl, documentId: doc.id };
    });
  }

  async createRenderedDownloadUrl(
    principal: ForgePrincipal,
    photoId: string,
    revisionId: string,
  ) {
    const tenantId = requireTenant(principal);
    const revision = await this.getRevision(principal, photoId, revisionId);
    if (!revision.renderedDocumentId) {
      throw new ForgeError("NOT_FOUND", "Rendered markup image not available");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(forgeDocuments)
        .where(
          and(
            eq(forgeDocuments.tenantId, tenantId),
            eq(forgeDocuments.id, revision.renderedDocumentId!),
          ),
        )
        .limit(1);
      if (!doc) throw new ForgeError("NOT_FOUND", "Rendered document missing");
      const downloadUrl = await this.storage.createPresignedDownloadUrl({
        objectKey: doc.objectKey,
        mimeType: doc.mimeType,
        filename: doc.originalFilename,
        inline: true,
      });
      return { downloadUrl: downloadUrl.downloadUrl, documentId: doc.id, revisionId };
    });
  }
}
