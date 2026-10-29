import { Inject, Injectable } from "@nestjs/common";
import {
  completeAttachmentUploadInputSchema,
  initializeAttachmentUploadInputSchema,
  patchAttachmentInputSchema,
} from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  nerisIncidentAttachments,
  nerisIncidents,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { DocumentStorageService } from "./document-storage.service.js";
import { MALWARE_SCANNER, type MalwareScanner } from "./malware-scan.interface.js";
import { NerisIncidentsAccessService } from "./neris-incidents-access.service.js";
import { IncidentStateMachineService } from "./incident-state-machine.service.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "image/gif",
]);

const MAX_BYTES = 50 * 1024 * 1024;

@Injectable()
export class IncidentAttachmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly access: NerisIncidentsAccessService,
    private readonly storage: DocumentStorageService,
    private readonly stateMachine: IncidentStateMachineService,
    private readonly audit: AuditService,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
  ) {}

  async initializeUpload(
    tenantId: string,
    incidentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = initializeAttachmentUploadInputSchema.parse(input);
    if (!ALLOWED_MIME_TYPES.has(data.mimeType)) {
      throw new ForgeError("BAD_REQUEST", `File type not allowed: ${data.mimeType}`);
    }
    if (data.fileSizeBytes > MAX_BYTES) {
      throw new ForgeError("BAD_REQUEST", "File exceeds 50 MB limit");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await tx.query.nerisIncidents.findFirst({
        where: and(eq(nerisIncidents.id, incidentId), eq(nerisIncidents.tenantId, tenantId)),
      });
      if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
      this.stateMachine.assertEditable(incident.status as never);

      const storedFilename = this.storage.buildStoredFilename(data.originalFilename);
      const objectKey = this.storage.buildObjectKey(tenantId, incidentId, storedFilename);
      const documentId = createId();
      const attachmentId = createId();

      await tx.insert(forgeDocuments).values({
        id: documentId,
        tenantId,
        originalFilename: data.originalFilename,
        storedFilename,
        objectKey,
        bucketName: this.storage.bucketName,
        mimeType: data.mimeType,
        fileSizeBytes: data.fileSizeBytes,
        checksumSha256: data.checksumSha256 ?? null,
        securityClassification: data.securityClassification,
        malwareScanStatus: "PENDING",
        retentionRule: "INCIDENT_DEFAULT",
        uploadStatus: "INITIALIZED",
        source: data.source,
        captureAt: data.captureAt ? new Date(data.captureAt) : null,
        uploadedByUserId: principal.userId,
      });

      await tx.insert(nerisIncidentAttachments).values({
        id: attachmentId,
        tenantId,
        incidentId,
        documentId,
        specialtySection: data.specialtySection ?? null,
        repeatableRecordType: data.repeatableRecordType ?? null,
        repeatableRecordId: data.repeatableRecordId ?? null,
        category: data.category,
        caption: data.caption ?? null,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
      });

      const presign = await this.storage.createPresignedUploadUrl({
        objectKey,
        mimeType: data.mimeType,
        contentLength: data.fileSizeBytes,
      });

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "neris.attachment.upload.initialize",
        resourceType: "neris_incident_attachment",
        resourceId: attachmentId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: {
          incidentId,
          category: data.category,
          mimeType: data.mimeType,
          fileSizeBytes: data.fileSizeBytes,
        },
      });

      return {
        attachmentId,
        documentId,
        objectKey,
        bucketName: this.storage.bucketName,
        uploadUrl: presign.uploadUrl,
        expiresInSeconds: presign.expiresInSeconds,
        uploadMode: presign.mode,
        malwareScanStatus: "PENDING",
        recordVersion: 1,
      };
    });
  }

  async completeUpload(
    tenantId: string,
    incidentId: string,
    attachmentId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = completeAttachmentUploadInputSchema.parse(input ?? {});

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await tx.query.nerisIncidents.findFirst({
        where: and(eq(nerisIncidents.id, incidentId), eq(nerisIncidents.tenantId, tenantId)),
      });
      if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
      this.stateMachine.assertEditable(incident.status as never);

      const attachment = await tx.query.nerisIncidentAttachments.findFirst({
        where: and(
          eq(nerisIncidentAttachments.id, attachmentId),
          eq(nerisIncidentAttachments.incidentId, incidentId),
        ),
      });
      if (!attachment || attachment.archivedAt) {
        throw new ForgeError("NOT_FOUND", "Attachment not found");
      }

      const document = await tx.query.forgeDocuments.findFirst({
        where: eq(forgeDocuments.id, attachment.documentId),
      });
      if (!document) throw new ForgeError("NOT_FOUND", "Document not found");

      if (
        data.checksumSha256 &&
        document.checksumSha256 &&
        data.checksumSha256.toLowerCase() !== document.checksumSha256.toLowerCase()
      ) {
        throw new ForgeError("BAD_REQUEST", "Checksum does not match initialized upload");
      }

      const scan = await this.scanner.scan({
        tenantId,
        documentId: document.id,
        objectKey: document.objectKey,
        bucketName: document.bucketName,
        mimeType: document.mimeType,
        checksumSha256: data.checksumSha256 ?? document.checksumSha256,
      });

      const [updatedDoc] = await tx
        .update(forgeDocuments)
        .set({
          uploadStatus: "COMPLETE",
          uploadedAt: new Date(),
          checksumSha256: data.checksumSha256 ?? document.checksumSha256,
          malwareScanStatus: scan.status,
          malwareScanDetail: scan.detail,
          recordVersion: document.recordVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(forgeDocuments.id, document.id),
            eq(forgeDocuments.recordVersion, document.recordVersion),
          ),
        )
        .returning();
      if (!updatedDoc)
        throw concurrencyConflict({
          tenantId,
          resourceType: "forge_document",
          resourceId: document.id,
          expectedVersion: document.recordVersion,
          actualVersion: null,
        });

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "neris.attachment.upload.complete",
        resourceType: "neris_incident_attachment",
        resourceId: attachmentId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { malwareScanStatus: scan.status },
      });

      return this.toDto(attachment, updatedDoc);
    });
  }

  async list(tenantId: string, incidentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireIncident(tx, tenantId, incidentId);
      const rows = await tx
        .select({
          attachment: nerisIncidentAttachments,
          document: forgeDocuments,
        })
        .from(nerisIncidentAttachments)
        .innerJoin(forgeDocuments, eq(nerisIncidentAttachments.documentId, forgeDocuments.id))
        .where(
          and(
            eq(nerisIncidentAttachments.incidentId, incidentId),
            isNull(nerisIncidentAttachments.archivedAt),
          ),
        );
      return rows.map((row) => this.toDto(row.attachment, row.document));
    });
  }

  async get(tenantId: string, incidentId: string, attachmentId: string, principal: ForgePrincipal) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.requireAttachment(tx, tenantId, incidentId, attachmentId);
      return this.toDto(row.attachment, row.document);
    });
  }

  async patch(
    tenantId: string,
    incidentId: string,
    attachmentId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: number | "*",
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    const data = patchAttachmentInputSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      this.stateMachine.assertEditable(incident.status as never);
      const { attachment } = await this.requireAttachment(tx, tenantId, incidentId, attachmentId);
      if (attachment.recordVersion !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_incident_attachment",
          resourceId: attachmentId,
          expectedVersion: expectedVersion,
          actualVersion: attachment.recordVersion,
        });
      }
      const [updated] = await tx
        .update(nerisIncidentAttachments)
        .set({
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.caption !== undefined ? { caption: data.caption } : {}),
          ...(data.specialtySection !== undefined
            ? { specialtySection: data.specialtySection }
            : {}),
          recordVersion: attachment.recordVersion + 1,
          updatedByUserId: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(nerisIncidentAttachments.id, attachmentId))
        .returning();
      const document = await tx.query.forgeDocuments.findFirst({
        where: eq(forgeDocuments.id, attachment.documentId),
      });
      return this.toDto(updated!, document!);
    });
  }

  async archive(
    tenantId: string,
    incidentId: string,
    attachmentId: string,
    principal: ForgePrincipal,
    expectedVersion: number | "*",
  ) {
    await this.access.assertSpecialtyWorkflowsEnabled(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const incident = await this.requireIncident(tx, tenantId, incidentId);
      this.stateMachine.assertEditable(incident.status as never);
      const { attachment, document } = await this.requireAttachment(
        tx,
        tenantId,
        incidentId,
        attachmentId,
      );
      if (attachment.recordVersion !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "neris_incident_attachment",
          resourceId: attachmentId,
          expectedVersion: expectedVersion,
          actualVersion: attachment.recordVersion,
        });
      }
      const now = new Date();
      const [updated] = await tx
        .update(nerisIncidentAttachments)
        .set({
          archivedAt: now,
          archivedByUserId: principal.userId,
          recordVersion: attachment.recordVersion + 1,
          updatedAt: now,
          updatedByUserId: principal.userId,
        })
        .where(eq(nerisIncidentAttachments.id, attachmentId))
        .returning();
      await tx
        .update(forgeDocuments)
        .set({
          archivedAt: now,
          archivedByUserId: principal.userId,
          recordVersion: document.recordVersion + 1,
          updatedAt: now,
        })
        .where(eq(forgeDocuments.id, document.id));

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "neris.attachment.archive",
        resourceType: "neris_incident_attachment",
        resourceId: attachmentId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
      });

      return this.toDto(updated!, { ...document, archivedAt: now });
    });
  }

  private toDto(
    attachment: typeof nerisIncidentAttachments.$inferSelect,
    document: typeof forgeDocuments.$inferSelect,
  ) {
    return {
      attachmentId: attachment.id,
      tenantId: attachment.tenantId,
      incidentId: attachment.incidentId,
      specialtySection: attachment.specialtySection,
      repeatableRecordId: attachment.repeatableRecordId,
      repeatableRecordType: attachment.repeatableRecordType,
      documentId: document.id,
      category: attachment.category,
      caption: attachment.caption,
      originalFilename: document.originalFilename,
      storedFilename: document.storedFilename,
      objectKey: document.objectKey,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      checksumSha256: document.checksumSha256,
      captureAt: document.captureAt,
      uploadedAt: document.uploadedAt,
      uploadedByUserId: document.uploadedByUserId,
      source: document.source,
      securityClassification: document.securityClassification,
      malwareScanStatus: document.malwareScanStatus,
      malwareScanDetail: document.malwareScanDetail,
      retentionRule: document.retentionRule,
      uploadStatus: document.uploadStatus,
      recordVersion: attachment.recordVersion,
      archivedAt: attachment.archivedAt,
      archivedByUserId: attachment.archivedByUserId,
      clearedForUse: document.malwareScanStatus === "CLEARED",
      isImage: document.mimeType.startsWith("image/"),
      isPdf: document.mimeType === "application/pdf",
    };
  }

  private async requireIncident(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
  ) {
    const incident = await tx.query.nerisIncidents.findFirst({
      where: and(eq(nerisIncidents.id, incidentId), eq(nerisIncidents.tenantId, tenantId)),
    });
    if (!incident) throw new ForgeError("NOT_FOUND", "Incident not found");
    return incident;
  }

  private async requireAttachment(
    tx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
    tenantId: string,
    incidentId: string,
    attachmentId: string,
  ) {
    await this.requireIncident(tx, tenantId, incidentId);
    const attachment = await tx.query.nerisIncidentAttachments.findFirst({
      where: and(
        eq(nerisIncidentAttachments.id, attachmentId),
        eq(nerisIncidentAttachments.incidentId, incidentId),
        eq(nerisIncidentAttachments.tenantId, tenantId),
      ),
    });
    if (!attachment) throw new ForgeError("NOT_FOUND", "Attachment not found");
    const document = await tx.query.forgeDocuments.findFirst({
      where: eq(forgeDocuments.id, attachment.documentId),
    });
    if (!document) throw new ForgeError("NOT_FOUND", "Document not found");
    return { attachment, document };
  }
}
