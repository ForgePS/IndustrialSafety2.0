import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  platformDocumentAckRequirements,
  platformDocumentAcknowledgments,
  platformDocumentDistributions,
  platformDocumentFolders,
  platformDocumentVersions,
  platformDocuments,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import {
  canApproveVersion,
  canObsoleteDocument,
  canRejectVersion,
  canSubmitVersionForReview,
  DISTRIBUTION_SCOPE,
  DOC_WORKFLOW,
  isReviewDueSoon,
  isReviewOverdue,
  normalizeDocWorkflow,
  VERSION_WORKFLOW,
} from "./document-control-workflow.js";
import {
  checkFolderRename,
  folderKey,
  MAX_FOLDER_NAME_LENGTH,
  mergeDocumentFolders,
  normalizeFolderName,
} from "./document-control-folders.js";

const MAX_CONTENT_LENGTH = 50_000_000;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

const uploadSchema = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  contentLength: z.number().int().positive().max(MAX_CONTENT_LENGTH),
  changeSummary: z.string().max(2000).optional(),
});

function objectKey(tenantId: string, documentId: string, versionId: string, filename: string) {
  return `tenants/${tenantId}/documents/${documentId}/${versionId}/${filename}`;
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

@Injectable()
export class IndustrialDocumentControlService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: DocumentStorageService,
  ) {}

  private mapDoc(row: typeof platformDocuments.$inferSelect) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      documentNumber: row.documentNumber,
      siteId: row.siteId,
      status: row.status,
      workflowStatus: normalizeDocWorkflow(row.workflowStatus),
      ownerUserId: row.ownerUserId,
      reviewDueAt: toIso(row.reviewDueAt),
      currentApprovedVersionId: row.currentApprovedVersionId,
      metadata: row.metadata ?? {},
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      archivedAt: toIso(row.archivedAt),
      reviewOverdue: isReviewOverdue(row.reviewDueAt),
      reviewDueSoon: isReviewDueSoon(row.reviewDueAt),
    };
  }

  private mapVersion(row: typeof platformDocumentVersions.$inferSelect) {
    return {
      id: row.id,
      documentId: row.documentId,
      versionNumber: row.versionNumber,
      filename: row.filename,
      contentType: row.contentType,
      contentLength: row.contentLength,
      status: row.status,
      workflowStatus: row.workflowStatus,
      changeSummary: row.changeSummary,
      submittedByUserId: row.submittedByUserId,
      submittedAt: toIso(row.submittedAt),
      approvedByUserId: row.approvedByUserId,
      approvedAt: toIso(row.approvedAt),
      hasFile: Boolean(row.storageKey?.trim()),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  async list(
    principal: ForgePrincipal,
    query: {
      q?: string;
      category?: string;
      workflowStatus?: string;
      siteId?: string;
      includeArchived?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50) || 50));
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const conditions = [eq(platformDocuments.tenantId, principal.tenantId)];
      if (query.includeArchived !== "1" && query.includeArchived !== "true") {
        conditions.push(isNull(platformDocuments.archivedAt));
      }
      const q = (query.q ?? "").trim();
      if (q) {
        conditions.push(
          or(
            ilike(platformDocuments.name, `%${q}%`),
            ilike(platformDocuments.category, `%${q}%`),
            ilike(platformDocuments.documentNumber, `%${q}%`),
          )!,
        );
      }
      const category = (query.category ?? "").trim();
      if (category) {
        conditions.push(sql`lower(${platformDocuments.category}) = lower(${category})`);
      }
      const siteId = (query.siteId ?? "").trim();
      if (siteId) conditions.push(eq(platformDocuments.siteId, siteId));
      const wf = (query.workflowStatus ?? "").trim().toUpperCase();
      if (wf) conditions.push(eq(platformDocuments.workflowStatus, normalizeDocWorkflow(wf)));

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(platformDocuments)
        .where(and(...conditions));
      const rows = await tx
        .select()
        .from(platformDocuments)
        .where(and(...conditions))
        .orderBy(asc(platformDocuments.name))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        page,
        pageSize,
        total: countRow?.count ?? rows.length,
        items: rows.map((r) => this.mapDoc(r)),
      };
    });
  }

  async getById(principal: ForgePrincipal, id: string) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(platformDocuments)
        .where(
          and(eq(platformDocuments.id, id), eq(platformDocuments.tenantId, principal.tenantId)),
        )
        .limit(1);
      if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
      const versions = await tx
        .select()
        .from(platformDocumentVersions)
        .where(
          and(
            eq(platformDocumentVersions.documentId, id),
            eq(platformDocumentVersions.tenantId, principal.tenantId),
            isNull(platformDocumentVersions.archivedAt),
          ),
        )
        .orderBy(desc(platformDocumentVersions.versionNumber));
      const distributions = await tx
        .select()
        .from(platformDocumentDistributions)
        .where(
          and(
            eq(platformDocumentDistributions.documentId, id),
            eq(platformDocumentDistributions.tenantId, principal.tenantId),
          ),
        );
      return {
        ...this.mapDoc(doc),
        versions: versions.map((v) => this.mapVersion(v)),
        distributions: distributions.map((d) => ({
          id: d.id,
          scopeType: d.scopeType,
          scopeId: d.scopeId,
          enabled: d.enabled,
        })),
      };
    });
  }

  async create(principal: ForgePrincipal, body: Record<string, unknown>) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const now = new Date();
    const id = createId();
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [row] = await tx
          .insert(platformDocuments)
          .values({
            id,
            tenantId: principal.tenantId,
            name,
            description: body.description != null ? String(body.description) : null,
            category: body.category != null ? String(body.category).trim() || null : "GENERAL",
            documentNumber:
              body.documentNumber != null ? String(body.documentNumber).trim() || null : null,
            siteId:
              typeof body.siteId === "string" && body.siteId.trim() ? body.siteId.trim() : null,
            status: "ACTIVE",
            workflowStatus: DOC_WORKFLOW.DRAFT,
            ownerUserId: principal.userId,
            reviewDueAt:
              typeof body.reviewDueAt === "string" && body.reviewDueAt.trim()
                ? new Date(body.reviewDueAt)
                : null,
            metadata: {},
            sourceSystem: "FORGE",
            sourcePayload: {},
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx.insert(platformDocumentDistributions).values({
          id: createId(),
          tenantId: principal.tenantId,
          documentId: id,
          scopeType: DISTRIBUTION_SCOPE.TENANT,
          scopeId: null,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.created",
          resourceType: "platform_document",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: "",
          requestId: "",
          metadata: { name },
        });
        return this.mapDoc(row!);
      },
      principal.userId,
    );
  }

  private async loadFolders(tx: DatabaseTransaction, tenantId: string) {
    const stored = await tx
      .select({ id: platformDocumentFolders.id, name: platformDocumentFolders.name })
      .from(platformDocumentFolders)
      .where(eq(platformDocumentFolders.tenantId, tenantId));
    const categoryCounts = await tx
      .select({ category: platformDocuments.category, count: sql<number>`count(*)::int` })
      .from(platformDocuments)
      .where(and(eq(platformDocuments.tenantId, tenantId), isNull(platformDocuments.archivedAt)))
      .groupBy(platformDocuments.category);
    return mergeDocumentFolders({ stored, categoryCounts });
  }

  async listFolders(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => ({
      items: await this.loadFolders(tx, principal.tenantId),
    }));
  }

  async createFolder(principal: ForgePrincipal, body: Record<string, unknown>) {
    const name = normalizeFolderName(body.name);
    if (!name) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `Folder name is required (up to ${MAX_FOLDER_NAME_LENGTH} characters)`,
      );
    }
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const existing = await this.loadFolders(tx, principal.tenantId);
        if (existing.some((f) => folderKey(f.name) === folderKey(name))) {
          throw new ForgeError("CONFLICT", `A folder named "${name}" already exists`);
        }
        const now = new Date();
        const id = createId();
        await tx.insert(platformDocumentFolders).values({
          id,
          tenantId: principal.tenantId,
          name,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.folder_created",
          resourceType: "platform_document_folder",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: "",
          requestId: "",
          metadata: { name },
        });
        return {
          id,
          name,
          documentCount: 0,
          builtIn: false,
          canRename: true,
          canDelete: true,
        };
      },
      principal.userId,
    );
  }

  /**
   * Rename a folder: every document filed in it (archived ones too) moves to the new name.
   * Works for created folders and for categories already in use; built-ins are fixed.
   */
  async renameFolder(principal: ForgePrincipal, body: Record<string, unknown>) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const folders = await this.loadFolders(tx, principal.tenantId);
        const check = checkFolderRename(folders, body.name, body.newName);
        if (!check.ok) throw new ForgeError(check.code, check.message);
        const oldName = normalizeFolderName(body.name)!;
        const now = new Date();

        const moved = await tx
          .update(platformDocuments)
          .set({ category: check.name, updatedAt: now })
          .where(
            and(
              eq(platformDocuments.tenantId, principal.tenantId),
              sql`lower(${platformDocuments.category}) = lower(${oldName})`,
            ),
          )
          .returning({ id: platformDocuments.id });

        const [stored] = await tx
          .select({ id: platformDocumentFolders.id })
          .from(platformDocumentFolders)
          .where(
            and(
              eq(platformDocumentFolders.tenantId, principal.tenantId),
              sql`lower(${platformDocumentFolders.name}) = lower(${oldName})`,
            ),
          )
          .limit(1);
        let folderId = stored?.id ?? null;
        if (folderId) {
          await tx
            .update(platformDocumentFolders)
            .set({ name: check.name, updatedAt: now })
            .where(eq(platformDocumentFolders.id, folderId));
        } else {
          // A category-only folder becomes a stored folder so it survives being emptied.
          folderId = createId();
          await tx.insert(platformDocumentFolders).values({
            id: folderId,
            tenantId: principal.tenantId,
            name: check.name,
            createdByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          });
        }

        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.folder_renamed",
          resourceType: "platform_document_folder",
          resourceId: folderId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: "",
          requestId: "",
          metadata: { from: oldName, to: check.name, documentsMoved: moved.length },
        });
        return { id: folderId, name: check.name, documentsMoved: moved.length };
      },
      principal.userId,
    );
  }

  /**
   * Delete a folder. Documents in it are kept: their category is cleared, so they show
   * under All documents. Built-in folders can't be deleted.
   */
  async deleteFolderByName(principal: ForgePrincipal, rawName: unknown) {
    const name = normalizeFolderName(rawName);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "Folder name is required");
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const folders = await this.loadFolders(tx, principal.tenantId);
        const folder = folders.find((f) => folderKey(f.name) === folderKey(name));
        if (!folder) throw new ForgeError("NOT_FOUND", "Folder not found");
        if (!folder.canDelete) {
          throw new ForgeError("VALIDATION_FAILED", `"${folder.name}" can't be deleted`);
        }
        const now = new Date();
        const moved = await tx
          .update(platformDocuments)
          .set({ category: null, updatedAt: now })
          .where(
            and(
              eq(platformDocuments.tenantId, principal.tenantId),
              sql`lower(${platformDocuments.category}) = lower(${name})`,
            ),
          )
          .returning({ id: platformDocuments.id });
        await tx
          .delete(platformDocumentFolders)
          .where(
            and(
              eq(platformDocumentFolders.tenantId, principal.tenantId),
              sql`lower(${platformDocumentFolders.name}) = lower(${name})`,
            ),
          );
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.folder_deleted",
          resourceType: "platform_document_folder",
          resourceId: folder.id ?? folder.name,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: "",
          requestId: "",
          metadata: { name: folder.name, documentsMoved: moved.length },
        });
        return { name: folder.name, deleted: true, documentsMoved: moved.length };
      },
      principal.userId,
    );
  }

  /** Delete a stored folder by id (kept for clients that delete by id). */
  async deleteFolder(principal: ForgePrincipal, id: string) {
    const name = await withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [folder] = await tx
        .select({ name: platformDocumentFolders.name })
        .from(platformDocumentFolders)
        .where(
          and(
            eq(platformDocumentFolders.id, id),
            eq(platformDocumentFolders.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      return folder?.name ?? null;
    });
    if (!name) throw new ForgeError("NOT_FOUND", "Folder not found");
    return this.deleteFolderByName(principal, name);
  }

  async update(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(eq(platformDocuments.id, id), eq(platformDocuments.tenantId, principal.tenantId)),
          )
          .limit(1);
        if (!existing || existing.archivedAt) {
          throw new ForgeError("NOT_FOUND", "Document not found");
        }
        const now = new Date();
        const patch: Record<string, unknown> = { updatedAt: now };
        if (body.name !== undefined) {
          const name = String(body.name).trim();
          if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
          patch.name = name;
        }
        if (body.description !== undefined) {
          patch.description = body.description == null ? null : String(body.description);
        }
        if (body.category !== undefined) {
          patch.category = body.category == null ? null : String(body.category).trim() || null;
        }
        if (body.documentNumber !== undefined) {
          patch.documentNumber =
            body.documentNumber == null ? null : String(body.documentNumber).trim() || null;
        }
        if (body.siteId !== undefined) {
          patch.siteId =
            typeof body.siteId === "string" && body.siteId.trim() ? body.siteId.trim() : null;
        }
        if (body.reviewDueAt !== undefined) {
          patch.reviewDueAt =
            typeof body.reviewDueAt === "string" && body.reviewDueAt.trim()
              ? new Date(body.reviewDueAt)
              : null;
        }
        if (body.ownerUserId !== undefined) {
          patch.ownerUserId =
            typeof body.ownerUserId === "string" && body.ownerUserId.trim()
              ? body.ownerUserId.trim()
              : null;
        }
        const [row] = await tx
          .update(platformDocuments)
          .set(patch)
          .where(eq(platformDocuments.id, id))
          .returning();
        return this.mapDoc(row!);
      },
      principal.userId,
    );
  }

  async createVersionUploadUrl(principal: ForgePrincipal, documentId: string, input: unknown) {
    const data = uploadSchema.parse(input);
    const mime = data.mimeType.trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new ForgeError("VALIDATION_FAILED", "MIME type not allowed for controlled documents");
    }
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
              isNull(platformDocuments.archivedAt),
            ),
          )
          .limit(1);
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        const [{ maxVersion } = { maxVersion: 0 }] = await tx
          .select({
            maxVersion: sql<number>`coalesce(max(${platformDocumentVersions.versionNumber}), 0)::int`,
          })
          .from(platformDocumentVersions)
          .where(
            and(
              eq(platformDocumentVersions.documentId, documentId),
              eq(platformDocumentVersions.tenantId, principal.tenantId),
            ),
          );
        const versionId = createId();
        const storedFilename = this.storage.buildStoredFilename(data.filename);
        const key = objectKey(principal.tenantId, documentId, versionId, storedFilename);
        this.storage.assertTenantObjectKey(key, principal.tenantId);
        const now = new Date();
        await tx.insert(platformDocumentVersions).values({
          id: versionId,
          tenantId: principal.tenantId,
          documentId,
          versionNumber: maxVersion + 1,
          filename: data.filename,
          contentType: mime,
          contentLength: data.contentLength,
          storageBucket: this.storage.bucketName,
          storageKey: key,
          status: "PENDING_UPLOAD",
          workflowStatus: VERSION_WORKFLOW.DRAFT,
          changeSummary: data.changeSummary?.trim() || null,
          metadata: {},
          sourceSystem: "FORGE",
          sourcePayload: {},
          createdAt: now,
          updatedAt: now,
        });
        const presign = await this.storage.createPresignedUploadUrl({
          objectKey: key,
          mimeType: mime,
          contentLength: data.contentLength,
        });
        return {
          versionId,
          documentId,
          versionNumber: maxVersion + 1,
          objectKey: key,
          uploadUrl: presign.uploadUrl,
          expiresInSeconds: presign.expiresInSeconds,
          mode: "S3_PRESIGNED" as const,
        };
      },
      principal.userId,
    );
  }

  async completeVersionUpload(principal: ForgePrincipal, documentId: string, versionId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [version] = await tx
          .select()
          .from(platformDocumentVersions)
          .where(
            and(
              eq(platformDocumentVersions.id, versionId),
              eq(platformDocumentVersions.documentId, documentId),
              eq(platformDocumentVersions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!version) throw new ForgeError("NOT_FOUND", "Version not found");
        await this.storage.assertObjectExists(version.storageKey);
        const now = new Date();
        const [row] = await tx
          .update(platformDocumentVersions)
          .set({ status: "ACTIVE", updatedAt: now })
          .where(eq(platformDocumentVersions.id, versionId))
          .returning();
        return this.mapVersion(row!);
      },
      principal.userId,
    );
  }

  async downloadUrl(
    principal: ForgePrincipal,
    documentId: string,
    versionId: string,
    canManage: boolean,
  ) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const [doc] = await tx
        .select()
        .from(platformDocuments)
        .where(
          and(
            eq(platformDocuments.id, documentId),
            eq(platformDocuments.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
      const [version] = await tx
        .select()
        .from(platformDocumentVersions)
        .where(
          and(
            eq(platformDocumentVersions.id, versionId),
            eq(platformDocumentVersions.documentId, documentId),
            eq(platformDocumentVersions.tenantId, principal.tenantId),
          ),
        )
        .limit(1);
      if (!version || !version.storageKey) {
        throw new ForgeError("NOT_FOUND", "Version file not found");
      }
      const published =
        version.workflowStatus === VERSION_WORKFLOW.APPROVED ||
        doc.currentApprovedVersionId === version.id;
      if (!canManage && !published) {
        throw new ForgeError("FORBIDDEN", "Only published versions can be downloaded");
      }
      const downloadUrl = await this.storage.createPresignedDownloadUrl({
        objectKey: version.storageKey,
        ...(version.filename ? { filename: version.filename } : {}),
      });
      return {
        downloadUrl,
        filename: version.filename,
        contentType: version.contentType,
      };
    });
  }

  async submitReview(principal: ForgePrincipal, documentId: string, versionId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
              isNull(platformDocuments.archivedAt),
            ),
          )
          .limit(1);
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        const [version] = await tx
          .select()
          .from(platformDocumentVersions)
          .where(
            and(
              eq(platformDocumentVersions.id, versionId),
              eq(platformDocumentVersions.documentId, documentId),
              eq(platformDocumentVersions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!version) throw new ForgeError("NOT_FOUND", "Version not found");
        if (version.status === "PENDING_UPLOAD") {
          throw new ForgeError("VALIDATION_FAILED", "Complete the file upload before submitting");
        }
        if (
          !canSubmitVersionForReview(
            version.workflowStatus,
            normalizeDocWorkflow(doc.workflowStatus),
          )
        ) {
          throw new ForgeError("VALIDATION_FAILED", "Version cannot be submitted for review");
        }
        const now = new Date();
        await tx
          .update(platformDocumentVersions)
          .set({
            workflowStatus: VERSION_WORKFLOW.IN_REVIEW,
            submittedByUserId: principal.userId,
            submittedAt: now,
            updatedAt: now,
          })
          .where(eq(platformDocumentVersions.id, versionId));
        await tx
          .update(platformDocuments)
          .set({ workflowStatus: DOC_WORKFLOW.IN_REVIEW, updatedAt: now })
          .where(eq(platformDocuments.id, documentId));
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.submitted_review",
          resourceType: "platform_document_version",
          resourceId: versionId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: "",
          requestId: "",
          metadata: { documentId },
        });
        return { ok: true as const, documentId, versionId };
      },
      principal.userId,
    );
  }

  async approve(principal: ForgePrincipal, documentId: string, versionId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
              isNull(platformDocuments.archivedAt),
            ),
          )
          .limit(1);
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        const [version] = await tx
          .select()
          .from(platformDocumentVersions)
          .where(
            and(
              eq(platformDocumentVersions.id, versionId),
              eq(platformDocumentVersions.documentId, documentId),
              eq(platformDocumentVersions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!version) throw new ForgeError("NOT_FOUND", "Version not found");
        if (!canApproveVersion(version.workflowStatus)) {
          throw new ForgeError("VALIDATION_FAILED", "Only versions in review can be approved");
        }
        const now = new Date();
        if (doc.currentApprovedVersionId) {
          await tx
            .update(platformDocumentVersions)
            .set({ workflowStatus: VERSION_WORKFLOW.SUPERSEDED, updatedAt: now })
            .where(eq(platformDocumentVersions.id, doc.currentApprovedVersionId));
        }
        await tx
          .update(platformDocumentVersions)
          .set({
            workflowStatus: VERSION_WORKFLOW.APPROVED,
            approvedByUserId: principal.userId,
            approvedAt: now,
            status: "ACTIVE",
            updatedAt: now,
          })
          .where(eq(platformDocumentVersions.id, versionId));
        await tx
          .update(platformDocuments)
          .set({
            workflowStatus: DOC_WORKFLOW.PUBLISHED,
            currentApprovedVersionId: versionId,
            status: "ACTIVE",
            updatedAt: now,
          })
          .where(eq(platformDocuments.id, documentId));

        const dists = await tx
          .select()
          .from(platformDocumentDistributions)
          .where(
            and(
              eq(platformDocumentDistributions.documentId, documentId),
              eq(platformDocumentDistributions.tenantId, principal.tenantId),
              eq(platformDocumentDistributions.enabled, true),
            ),
          );
        for (const dist of dists) {
          await tx.insert(platformDocumentAckRequirements).values({
            id: createId(),
            tenantId: principal.tenantId,
            documentId,
            versionId,
            distributionId: dist.id,
            required: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.approved",
          resourceType: "platform_document_version",
          resourceId: versionId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: "",
          requestId: "",
          metadata: { documentId },
        });
        return { ok: true as const, documentId, versionId };
      },
      principal.userId,
    );
  }

  async reject(principal: ForgePrincipal, documentId: string, versionId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [version] = await tx
          .select()
          .from(platformDocumentVersions)
          .where(
            and(
              eq(platformDocumentVersions.id, versionId),
              eq(platformDocumentVersions.documentId, documentId),
              eq(platformDocumentVersions.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!version) throw new ForgeError("NOT_FOUND", "Version not found");
        if (!canRejectVersion(version.workflowStatus)) {
          throw new ForgeError("VALIDATION_FAILED", "Only versions in review can be rejected");
        }
        const now = new Date();
        await tx
          .update(platformDocumentVersions)
          .set({
            workflowStatus: VERSION_WORKFLOW.DRAFT,
            submittedAt: null,
            submittedByUserId: null,
            updatedAt: now,
          })
          .where(eq(platformDocumentVersions.id, versionId));
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(eq(platformDocuments.id, documentId))
          .limit(1);
        await tx
          .update(platformDocuments)
          .set({
            workflowStatus: doc?.currentApprovedVersionId
              ? DOC_WORKFLOW.PUBLISHED
              : DOC_WORKFLOW.DRAFT,
            updatedAt: now,
          })
          .where(eq(platformDocuments.id, documentId));
        return { ok: true as const, documentId, versionId };
      },
      principal.userId,
    );
  }

  async obsolete(principal: ForgePrincipal, documentId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        if (!canObsoleteDocument(normalizeDocWorkflow(doc.workflowStatus))) {
          throw new ForgeError("VALIDATION_FAILED", "Document cannot be marked obsolete");
        }
        const now = new Date();
        const [row] = await tx
          .update(platformDocuments)
          .set({ workflowStatus: DOC_WORKFLOW.OBSOLETE, updatedAt: now })
          .where(eq(platformDocuments.id, documentId))
          .returning();
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.obsoleted",
          resourceType: "platform_document",
          resourceId: documentId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: "",
          requestId: "",
          metadata: {},
        });
        return this.mapDoc(row!);
      },
      principal.userId,
    );
  }

  async archive(principal: ForgePrincipal, documentId: string) {
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(platformDocuments)
          .set({
            archivedAt: now,
            status: "ARCHIVED",
            workflowStatus: DOC_WORKFLOW.OBSOLETE,
            updatedAt: now,
          })
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
              isNull(platformDocuments.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Document not found");
        return this.mapDoc(row);
      },
      principal.userId,
    );
  }

  async replaceDistributions(
    principal: ForgePrincipal,
    documentId: string,
    body: { distributions?: Array<{ scopeType: string; scopeId?: string | null }> },
  ) {
    const items = Array.isArray(body.distributions) ? body.distributions : [];
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(platformDocuments)
          .where(
            and(
              eq(platformDocuments.id, documentId),
              eq(platformDocuments.tenantId, principal.tenantId),
            ),
          )
          .limit(1);
        if (!doc) throw new ForgeError("NOT_FOUND", "Document not found");
        await tx
          .delete(platformDocumentDistributions)
          .where(
            and(
              eq(platformDocumentDistributions.documentId, documentId),
              eq(platformDocumentDistributions.tenantId, principal.tenantId),
            ),
          );
        const now = new Date();
        const rows =
          items.length > 0
            ? items
            : [{ scopeType: DISTRIBUTION_SCOPE.TENANT, scopeId: null as string | null }];
        for (const item of rows) {
          const scopeType = String(item.scopeType ?? "")
            .trim()
            .toUpperCase();
          if (!Object.values(DISTRIBUTION_SCOPE).includes(scopeType as never)) {
            throw new ForgeError("VALIDATION_FAILED", `Invalid scopeType: ${scopeType}`);
          }
          await tx.insert(platformDocumentDistributions).values({
            id: createId(),
            tenantId: principal.tenantId,
            documentId,
            scopeType,
            scopeId:
              typeof item.scopeId === "string" && item.scopeId.trim() ? item.scopeId.trim() : null,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        return { ok: true as const, documentId };
      },
      principal.userId,
    );
  }

  async listApprovalsQueue(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const versions = await tx
        .select({
          version: platformDocumentVersions,
          document: platformDocuments,
        })
        .from(platformDocumentVersions)
        .innerJoin(platformDocuments, eq(platformDocuments.id, platformDocumentVersions.documentId))
        .where(
          and(
            eq(platformDocumentVersions.tenantId, principal.tenantId),
            eq(platformDocumentVersions.workflowStatus, VERSION_WORKFLOW.IN_REVIEW),
            isNull(platformDocumentVersions.archivedAt),
            isNull(platformDocuments.archivedAt),
          ),
        )
        .orderBy(desc(platformDocumentVersions.submittedAt));
      return {
        items: versions.map(({ version, document }) => ({
          ...this.mapVersion(version),
          document: this.mapDoc(document),
        })),
      };
    });
  }

  async listOverdueReviews(principal: ForgePrincipal) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(platformDocuments)
        .where(
          and(
            eq(platformDocuments.tenantId, principal.tenantId),
            isNull(platformDocuments.archivedAt),
            eq(platformDocuments.workflowStatus, DOC_WORKFLOW.PUBLISHED),
            isNotNull(platformDocuments.reviewDueAt),
            lte(platformDocuments.reviewDueAt, soon),
          ),
        )
        .orderBy(asc(platformDocuments.reviewDueAt));
      return {
        items: rows.map((r) => this.mapDoc(r)),
      };
    });
  }

  async myPendingAcknowledgments(principal: ForgePrincipal) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const reqs = await tx
        .select({
          requirement: platformDocumentAckRequirements,
          document: platformDocuments,
          version: platformDocumentVersions,
        })
        .from(platformDocumentAckRequirements)
        .innerJoin(
          platformDocuments,
          eq(platformDocuments.id, platformDocumentAckRequirements.documentId),
        )
        .innerJoin(
          platformDocumentVersions,
          eq(platformDocumentVersions.id, platformDocumentAckRequirements.versionId),
        )
        .where(
          and(
            eq(platformDocumentAckRequirements.tenantId, principal.tenantId),
            eq(platformDocumentAckRequirements.required, true),
            isNull(platformDocumentAckRequirements.archivedAt),
            eq(platformDocuments.workflowStatus, DOC_WORKFLOW.PUBLISHED),
            isNull(platformDocuments.archivedAt),
          ),
        );
      const acked = await tx
        .select({ versionId: platformDocumentAcknowledgments.versionId })
        .from(platformDocumentAcknowledgments)
        .where(
          and(
            eq(platformDocumentAcknowledgments.tenantId, principal.tenantId),
            eq(platformDocumentAcknowledgments.userId, principal.userId),
          ),
        );
      const ackedSet = new Set(acked.map((a) => a.versionId));
      const items = reqs
        .filter((r) => !ackedSet.has(r.requirement.versionId))
        .map((r) => ({
          requirementId: r.requirement.id,
          document: this.mapDoc(r.document),
          version: this.mapVersion(r.version),
        }));
      return { items };
    });
  }

  async acknowledge(principal: ForgePrincipal, versionIds: string[]) {
    const ids = [...new Set(versionIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) throw new ForgeError("VALIDATION_FAILED", "versionIds required");
    return withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const now = new Date();
        const created: string[] = [];
        for (const versionId of ids) {
          const [version] = await tx
            .select()
            .from(platformDocumentVersions)
            .where(
              and(
                eq(platformDocumentVersions.id, versionId),
                eq(platformDocumentVersions.tenantId, principal.tenantId),
              ),
            )
            .limit(1);
          if (!version || version.workflowStatus !== VERSION_WORKFLOW.APPROVED) {
            throw new ForgeError("VALIDATION_FAILED", `Version not acknowledgeable: ${versionId}`);
          }
          const id = createId();
          try {
            await tx.insert(platformDocumentAcknowledgments).values({
              id,
              tenantId: principal.tenantId,
              documentId: version.documentId,
              versionId,
              userId: principal.userId,
              acceptedAt: now,
              source: "DOCUMENT_CONTROL",
              createdAt: now,
            });
            created.push(id);
          } catch {
            // unique constraint — already acknowledged
          }
        }
        await this.audit.writeInTransaction(tx, {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "document_control.acknowledged",
          resourceType: "platform_document_acknowledgment",
          resourceId: created[0] ?? ids[0]!,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: "",
          requestId: "",
          metadata: { versionIds: ids, count: created.length },
        });
        return { acknowledged: created.length, versionIds: ids };
      },
      principal.userId,
    );
  }

  async listDocumentAcknowledgments(principal: ForgePrincipal, documentId: string) {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(platformDocumentAcknowledgments)
        .where(
          and(
            eq(platformDocumentAcknowledgments.documentId, documentId),
            eq(platformDocumentAcknowledgments.tenantId, principal.tenantId),
          ),
        )
        .orderBy(desc(platformDocumentAcknowledgments.acceptedAt));
      return {
        items: rows.map((r) => ({
          id: r.id,
          documentId: r.documentId,
          versionId: r.versionId,
          userId: r.userId,
          acceptedAt: toIso(r.acceptedAt),
          source: r.source,
        })),
      };
    });
  }
}
