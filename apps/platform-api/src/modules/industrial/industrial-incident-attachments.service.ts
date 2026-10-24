import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialIncidents,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../neris-incidents/document-storage.service.js";
import {
  INCIDENT_ATTACHMENT_SOURCE,
  isAllowedIncidentAttachmentMime,
  MAX_INCIDENT_ATTACHMENT_BYTES,
  incidentAttachmentObjectKeyPrefix,
} from "./industrial-incident-attachments.mime.js";

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

export type IncidentAttachmentMeta = {
  documentId: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export function readIncidentAttachments(payload: unknown): IncidentAttachmentMeta[] {
  const root = unwrapPayload(payload);
  const raw = root.attachments;
  if (!Array.isArray(raw)) return [];
  const out: IncidentAttachmentMeta[] = [];
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

/** Binary document uploads for industrial_incidents (photos, PDFs, office files). */
@Injectable()
export class IndustrialIncidentAttachmentsService {
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
    incidentId: string,
    body: { filename?: string; mimeType?: string; contentLength?: number },
  ) {
    const tenantId = this.tenant(principal);
    const id = String(incidentId ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);

    if (!UUID_PATTERN.test(id)) {
      throw new ForgeError("VALIDATION_FAILED", "incidentId must be a UUID");
    }
    if (!filename) throw new ForgeError("VALIDATION_FAILED", "filename is required");
    if (!isAllowedIncidentAttachmentMime(mimeType)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "File type not allowed. Use PDF, an image, Word, Excel, or plain text.",
      );
    }
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_INCIDENT_ATTACHMENT_BYTES
    ) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        `contentLength must be between 1 and ${MAX_INCIDENT_ATTACHMENT_BYTES} bytes`,
      );
    }

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `${incidentAttachmentObjectKeyPrefix(tenantId, id)}${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);
    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [incident] = await tx
          .select({ id: industrialIncidents.id })
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, id),
              eq(industrialIncidents.tenantId, tenantId),
              isNull(industrialIncidents.archivedAt),
            ),
          )
          .limit(1);
        if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

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
          retentionRule: "INCIDENT_ATTACHMENT_DEFAULT",
          uploadStatus: "INITIALIZED",
          source: INCIDENT_ATTACHMENT_SOURCE,
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
      incidentId: id,
      objectKey,
      uploadUrl: presign.uploadUrl,
      expiresInSeconds: presign.expiresInSeconds,
      mode: presign.mode,
      originalFilename: filename,
      mimeType,
    };
  }

  async completeUpload(
    principal: ForgePrincipal,
    incidentId: string,
    body: { documentId?: string },
  ) {
    const tenantId = this.tenant(principal);
    const id = String(incidentId ?? "").trim();
    const documentId = String(body.documentId ?? "").trim();
    if (!UUID_PATTERN.test(id)) {
      throw new ForgeError("VALIDATION_FAILED", "incidentId must be a UUID");
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
        const [incident] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, id),
              eq(industrialIncidents.tenantId, tenantId),
              isNull(industrialIncidents.archivedAt),
            ),
          )
          .limit(1);
        if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

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
        if (document.source !== INCIDENT_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not an incident attachment");
        }
        const expectedPrefix = incidentAttachmentObjectKeyPrefix(tenantId, id);
        if (!document.objectKey.startsWith(expectedPrefix)) {
          throw new ForgeError("VALIDATION_FAILED", "Document does not belong to this incident");
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

        const payload = unwrapPayload(incident.sourcePayload);
        const uploads = readIncidentAttachments(payload);
        if (!uploads.some((row) => row.documentId === document.id)) {
          uploads.push({
            documentId: document.id,
            fileName: document.originalFilename,
            contentType: document.mimeType,
            uploadedAt: now.toISOString(),
          });
        }

        const [updated] = await tx
          .update(industrialIncidents)
          .set({
            sourcePayload: {
              ...payload,
              attachments: uploads,
            },
            updatedAt: now,
          })
          .where(eq(industrialIncidents.id, id))
          .returning();

        return {
          incidentId: id,
          documentId: document.id,
          fileName: document.originalFilename,
          attachments: uploads,
          incident: updated,
        };
      },
      principal.userId,
    );
  }

  async createDownloadUrl(principal: ForgePrincipal, incidentId: string, documentId: string) {
    const tenantId = this.tenant(principal);
    const id = String(incidentId ?? "").trim();
    const docId = String(documentId ?? "").trim();
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(docId)) {
      throw new ForgeError("VALIDATION_FAILED", "incidentId and documentId must be UUIDs");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [incident] = await tx
          .select({
            id: industrialIncidents.id,
            sourcePayload: industrialIncidents.sourcePayload,
          })
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, id),
              eq(industrialIncidents.tenantId, tenantId),
              isNull(industrialIncidents.archivedAt),
            ),
          )
          .limit(1);
        if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

        const attachments = readIncidentAttachments(incident.sourcePayload);
        if (!attachments.some((row) => row.documentId === docId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this incident");
        }

        const document = await tx.query.forgeDocuments.findFirst({
          where: and(eq(forgeDocuments.id, docId), eq(forgeDocuments.tenantId, tenantId)),
        });
        if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
        if (document.source !== INCIDENT_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not an incident attachment");
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

  async deleteAttachment(principal: ForgePrincipal, incidentId: string, documentId: string) {
    const tenantId = this.tenant(principal);
    const id = String(incidentId ?? "").trim();
    const docId = String(documentId ?? "").trim();
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(docId)) {
      throw new ForgeError("VALIDATION_FAILED", "incidentId and documentId must be UUIDs");
    }

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [incident] = await tx
          .select()
          .from(industrialIncidents)
          .where(
            and(
              eq(industrialIncidents.id, id),
              eq(industrialIncidents.tenantId, tenantId),
              isNull(industrialIncidents.archivedAt),
            ),
          )
          .limit(1);
        if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");

        const payload = unwrapPayload(incident.sourcePayload);
        const existing = readIncidentAttachments(payload);
        if (!existing.some((row) => row.documentId === docId)) {
          throw new ForgeError("NOT_FOUND", "Attachment not found on this incident");
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
        if (document.source !== INCIDENT_ATTACHMENT_SOURCE) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not an incident attachment");
        }

        const now = new Date();
        const next = existing.filter((row) => row.documentId !== docId);
        await tx
          .update(industrialIncidents)
          .set({
            sourcePayload: {
              ...payload,
              attachments: next,
            },
            updatedAt: now,
          })
          .where(eq(industrialIncidents.id, id));

        await tx
          .update(forgeDocuments)
          .set({
            uploadStatus: "DELETED",
            updatedAt: now,
          })
          .where(and(eq(forgeDocuments.id, docId), eq(forgeDocuments.tenantId, tenantId)));

        return { incidentId: id, documentId: docId, attachments: next };
      },
      principal.userId,
    );
  }
}
