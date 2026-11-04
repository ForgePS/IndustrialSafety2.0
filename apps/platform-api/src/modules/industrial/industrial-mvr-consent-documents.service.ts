import { Inject, Injectable } from "@nestjs/common";
import { documentBelongsToTenant, objectKeyBelongsToTenant } from "@forge/contracts";
import {
  createId,
  forgeDocuments,
  industrialDotComplianceRecords,
  industrialFleetDrivers,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { DocumentStorageService } from "../documents/document-storage.service.js";
import {
  isAllowedDotDqfDocumentMime,
  MAX_DOT_DQF_DOCUMENT_BYTES,
} from "./industrial-dot-dqf-documents.mime.js";
import { ensureCompanyDriverRosterEntry } from "./company-driver-roster.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MvrDocumentKind = "consent" | "report";

const KIND_META: Record<
  MvrDocumentKind,
  {
    source: string;
    payloadKey: "mvrReleaseUploads" | "mvrUploads";
    dateKey: "mvrReleaseDate" | "lastMvrDate";
    objectFolder: string;
    retentionRule: string;
  }
> = {
  consent: {
    source: "INDUSTRIAL_MVR_CONSENT",
    payloadKey: "mvrReleaseUploads",
    dateKey: "mvrReleaseDate",
    objectFolder: "mvr-consent",
    retentionRule: "FLEET_MVR_CONSENT_DEFAULT",
  },
  report: {
    source: "INDUSTRIAL_MVR_REPORT",
    payloadKey: "mvrUploads",
    dateKey: "lastMvrDate",
    objectFolder: "mvr-report",
    retentionRule: "FLEET_MVR_REPORT_DEFAULT",
  },
};

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

function asUploadList(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && !Array.isArray(entry),
  );
}

function parseKind(raw: unknown): MvrDocumentKind {
  const value = String(raw ?? "consent")
    .trim()
    .toLowerCase();
  if (value === "report" || value === "mvr" || value === "mvr_report") return "report";
  if (value === "consent" || value === "mvr_consent" || value === "release") return "consent";
  throw new ForgeError("VALIDATION_FAILED", "kind must be consent or report");
}

/**
 * Paper MVR Consent and MVR Report uploads for company drivers.
 * Stores forge_documents + appends slim metadata to fleet driver source_payload.
 */
@Injectable()
export class IndustrialMvrConsentDocumentsService {
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
    body: {
      personnelId?: string;
      kind?: string;
      filename?: string;
      mimeType?: string;
      contentLength?: number;
    },
  ) {
    const tenantId = this.tenant(principal);
    const kind = parseKind(body.kind ?? "consent");
    const meta = KIND_META[kind];
    const personnelId = String(body.personnelId ?? "").trim();
    const filename = String(body.filename ?? "").trim();
    const mimeType = String(body.mimeType ?? "")
      .trim()
      .toLowerCase();
    const contentLength = Number(body.contentLength ?? 0);

    if (!UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }
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

    const storedFilename = this.storage.buildStoredFilename(filename);
    const objectKey = `tenants/${tenantId}/fleet/${meta.objectFolder}/${personnelId}/${storedFilename}`;
    this.storage.assertTenantObjectKey(objectKey, tenantId);

    const documentId = createId();
    const now = new Date();

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await ensureCompanyDriverRosterEntry(tx, tenantId, {
          personnelId,
          seededFrom: kind === "report" ? "mvr_report_paper_upload" : "mvr_consent_paper_upload",
        });

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
          retentionRule: meta.retentionRule,
          uploadStatus: "INITIALIZED",
          source: meta.source,
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
      personnelId,
      kind,
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
    body: { personnelId?: string; documentId?: string; kind?: string },
  ) {
    const tenantId = this.tenant(principal);
    const kind = parseKind(body.kind ?? "consent");
    const meta = KIND_META[kind];
    const personnelId = String(body.personnelId ?? "").trim();
    const documentId = String(body.documentId ?? "").trim();
    if (!UUID_PATTERN.test(personnelId)) {
      throw new ForgeError("VALIDATION_FAILED", "personnelId must be a UUID");
    }
    if (!UUID_PATTERN.test(documentId)) {
      throw new ForgeError("VALIDATION_FAILED", "documentId must be a UUID");
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
        if (document.source !== meta.source) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            kind === "report"
              ? "Document is not an MVR report upload"
              : "Document is not an MVR consent upload",
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

        const [driver] = await tx
          .select()
          .from(industrialFleetDrivers)
          .where(
            and(
              eq(industrialFleetDrivers.tenantId, tenantId),
              eq(industrialFleetDrivers.personnelId, personnelId),
            ),
          )
          .orderBy(desc(industrialFleetDrivers.updatedAt))
          .limit(1);
        if (!driver) throw new ForgeError("NOT_FOUND", "Company driver roster entry not found");

        const payload = unwrapPayload(driver.sourcePayload);
        const uploads = asUploadList(payload[meta.payloadKey]);
        const entry = {
          name: document.originalFilename,
          fileName: document.originalFilename,
          documentId: document.id,
          contentType: document.mimeType,
          uploadedAt: now.toISOString(),
        };
        if (!uploads.some((row) => String(row.documentId ?? "") === document.id)) {
          uploads.push(entry);
        }
        const today = now.toISOString().slice(0, 10);
        const nextPayload: Record<string, unknown> = {
          ...payload,
          [meta.payloadKey]: uploads,
          [meta.dateKey]: String(payload[meta.dateKey] ?? "").trim() || today,
        };
        if (kind === "report" && !String(payload.initialMvrDate ?? "").trim()) {
          nextPayload.initialMvrDate = today;
        }

        await tx
          .update(industrialFleetDrivers)
          .set({
            sourcePayload: nextPayload,
            archivedAt: null,
            status: driver.status === "removed" ? "on_insurance" : driver.status,
            ...(kind === "report"
              ? {
                  lastMvrDate: today,
                  ...(String(driver.initialMvrDate ?? "").trim() ? {} : { initialMvrDate: today }),
                }
              : {}),
            updatedAt: now,
          })
          .where(eq(industrialFleetDrivers.id, driver.id));

        const [dot] = await tx
          .select()
          .from(industrialDotComplianceRecords)
          .where(
            and(
              eq(industrialDotComplianceRecords.tenantId, tenantId),
              eq(industrialDotComplianceRecords.personnelId, personnelId),
              isNull(industrialDotComplianceRecords.archivedAt),
            ),
          )
          .orderBy(desc(industrialDotComplianceRecords.updatedAt))
          .limit(1);
        if (dot) {
          const dotPayload = unwrapPayload(dot.sourcePayload);
          const details =
            dotPayload.details &&
            typeof dotPayload.details === "object" &&
            !Array.isArray(dotPayload.details)
              ? { ...(dotPayload.details as Record<string, unknown>) }
              : {};
          const copyJson = JSON.stringify([
            {
              name: document.originalFilename,
              documentId: document.id,
              contentType: document.mimeType,
              uploadedAt: now.toISOString(),
            },
          ]);
          if (kind === "consent") {
            details.mvrReleaseFormCopy = copyJson;
            details.mvrReleaseForm = String(details.mvrReleaseForm ?? "").trim() || today;
            await tx
              .update(industrialDotComplianceRecords)
              .set({
                sourcePayload: {
                  ...dotPayload,
                  details,
                  mvrReleaseFormCopy: copyJson,
                  mvrReleaseForm: details.mvrReleaseForm,
                  mvrReleaseDate: today,
                },
                updatedAt: now,
              })
              .where(eq(industrialDotComplianceRecords.id, dot.id));
          } else {
            details.mvrAnnualCopy = copyJson;
            details.mvrAnnual = String(details.mvrAnnual ?? "").trim() || today;
            await tx
              .update(industrialDotComplianceRecords)
              .set({
                sourcePayload: {
                  ...dotPayload,
                  details,
                  mvrAnnualCopy: copyJson,
                  mvrAnnual: details.mvrAnnual,
                  lastMvrDate: today,
                },
                updatedAt: now,
              })
              .where(eq(industrialDotComplianceRecords.id, dot.id));
          }
        }

        return {
          documentId: document.id,
          personnelId,
          driverId: driver.id,
          kind,
          originalFilename: document.originalFilename,
          mimeType: document.mimeType,
          uploadedAt: now.toISOString(),
          mvrReleaseDate:
            kind === "consent" ? today : String(nextPayload.mvrReleaseDate ?? "").trim(),
          lastMvrDate: kind === "report" ? today : String(nextPayload.lastMvrDate ?? "").trim(),
          mvrReleaseUploadCount: asUploadList(nextPayload.mvrReleaseUploads).length,
          mvrUploadCount: asUploadList(nextPayload.mvrUploads).length,
          file: entry,
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
        if (
          row.source !== "INDUSTRIAL_MVR_CONSENT" &&
          row.source !== "INDUSTRIAL_MVR_REPORT" &&
          row.source !== "INDUSTRIAL_DOT_DQF"
        ) {
          throw new ForgeError("VALIDATION_FAILED", "Document is not an MVR file");
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
