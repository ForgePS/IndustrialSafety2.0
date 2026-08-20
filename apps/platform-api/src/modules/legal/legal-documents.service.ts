import { Inject, Injectable } from "@nestjs/common";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import {
  createId,
  legalAcknowledgmentRequirements,
  legalDocumentVersions,
  legalDocuments,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { hashCanonicalContent } from "./legal-evaluator.js";

@Injectable()
export class LegalDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listDocuments(tenantId: string, scope: "global" | "tenant" | "all" = "all") {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: legalDocuments.id,
          tenantId: legalDocuments.tenantId,
          documentKey: legalDocuments.documentKey,
          productScope: legalDocuments.productScope,
          documentType: legalDocuments.documentType,
          title: legalDocuments.title,
          status: legalDocuments.status,
          currentVersionId: legalDocuments.currentVersionId,
          description: legalDocuments.description,
        })
        .from(legalDocuments)
        .where(
          scope === "global"
            ? isNull(legalDocuments.tenantId)
            : scope === "tenant"
              ? eq(legalDocuments.tenantId, tenantId)
              : or(isNull(legalDocuments.tenantId), eq(legalDocuments.tenantId, tenantId)),
        )
        .orderBy(legalDocuments.title);
      return { items: rows };
    });
  }

  async listVersions(tenantId: string, documentId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const doc = await tx
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.id, documentId))
        .limit(1);
      if (!doc[0]) throw new ForgeError("LEGAL_DOCUMENT_NOT_FOUND", "Document not found");
      if (doc[0].tenantId && doc[0].tenantId !== tenantId) {
        throw new ForgeError("TENANT_POLICY_NOT_AUTHORIZED", "Document belongs to another tenant");
      }
      const versions = await tx
        .select({
          id: legalDocumentVersions.id,
          version: legalDocumentVersions.version,
          versionNumber: legalDocumentVersions.versionNumber,
          status: legalDocumentVersions.status,
          effectiveAt: legalDocumentVersions.effectiveAt,
          publishedAt: legalDocumentVersions.publishedAt,
          contentHash: legalDocumentVersions.contentHash,
          requiresReacknowledgment: legalDocumentVersions.requiresReacknowledgment,
          materialChange: legalDocumentVersions.materialChange,
        })
        .from(legalDocumentVersions)
        .where(eq(legalDocumentVersions.legalDocumentId, documentId))
        .orderBy(desc(legalDocumentVersions.versionNumber));
      return { document: doc[0], versions };
    });
  }

  /**
   * Create a tenant-owned policy document (Customer/Tenant Provided Content).
   * Forge-global documents require platform admin.
   */
  async createTenantPolicy(
    tenantId: string,
    principal: ForgePrincipal,
    body: {
      documentKey: string;
      title: string;
      description?: string;
      content: string;
      version?: string;
      requireReacknowledgment?: boolean;
      publish?: boolean;
      correlationId: string;
      requestId: string;
    },
  ) {
    if (!principal.isPlatformAdmin) {
      const perms = principal.permissions;
      const allowed =
        perms.has("industrial.legal.tenantPolicies.manage") ||
        perms.has("industrial.legal.tenantPolicies.publish") ||
        perms.has("industrial.admin");
      if (!allowed) {
        throw new ForgeError("TENANT_POLICY_NOT_AUTHORIZED", "Not authorized to manage tenant policies");
      }
    }

    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx
        .select({ id: legalDocuments.id })
        .from(legalDocuments)
        .where(
          and(eq(legalDocuments.tenantId, tenantId), eq(legalDocuments.documentKey, body.documentKey)),
        )
        .limit(1);
      if (existing[0]) {
        throw new ForgeError("CONFLICT", "A tenant policy with this key already exists");
      }

      const documentId = createId();
      const versionId = createId();
      const content = body.content.trim();
      const hash = hashCanonicalContent(content);
      const publish = body.publish !== false;
      const versionLabel = body.version ?? "1.0";

      await tx.insert(legalDocuments).values({
        id: documentId,
        tenantId,
        documentKey: body.documentKey,
        productScope: INDUSTRIAL_PRODUCT_CODE,
        documentType: "TENANT_POLICY",
        title: body.title,
        description:
          body.description ??
          "Customer/Tenant Provided Content. Forge does not author, approve, or provide legal advice regarding customer-created policies.",
        status: publish ? "ACTIVE" : "DRAFT",
        currentVersionId: publish ? versionId : null,
        createdByUserId: principal.userId,
        updatedByUserId: principal.userId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(legalDocumentVersions).values({
        id: versionId,
        legalDocumentId: documentId,
        tenantId,
        version: versionLabel,
        versionNumber: 1,
        effectiveAt: now,
        publishedAt: publish ? now : null,
        publishedByUserId: publish ? principal.userId : null,
        contentFormat: "HTML",
        content,
        contentHash: hash,
        changeSummary: "Initial tenant policy version",
        materialChange: true,
        requiresReacknowledgment: body.requireReacknowledgment !== false,
        status: publish ? "ACTIVE" : "DRAFT",
        createdAt: now,
      });

      if (publish) {
        await tx.insert(legalAcknowledgmentRequirements).values({
          id: createId(),
          tenantId,
          product: INDUSTRIAL_PRODUCT_CODE,
          documentId,
          documentVersionId: versionId,
          required: true,
          requiredFrom: now,
          reacknowledgmentPolicy: "ON_MATERIAL_VERSION",
          blockingMode: "BLOCKING",
          createdByUserId: principal.userId,
          createdAt: now,
        });
      }

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "legal.tenant_policy.created",
        resourceType: "legal_document",
        resourceId: documentId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: body.correlationId,
        requestId: body.requestId,
        after: { documentKey: body.documentKey, published: publish },
        occurredAt: now,
      });

      return { documentId, versionId, contentHash: hash, published: publish };
    });
  }

  /**
   * Publish a new immutable version of a document (global: platform admin only).
   */
  async publishVersion(
    tenantId: string,
    principal: ForgePrincipal,
    documentId: string,
    body: {
      content: string;
      version: string;
      changeSummary?: string;
      materialChange?: boolean;
      requiresReacknowledgment?: boolean;
      effectiveAt?: string;
      correlationId: string;
      requestId: string;
    },
  ) {
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const docs = await tx
        .select()
        .from(legalDocuments)
        .where(eq(legalDocuments.id, documentId))
        .limit(1);
      const doc = docs[0];
      if (!doc) throw new ForgeError("LEGAL_DOCUMENT_NOT_FOUND", "Document not found");

      if (doc.tenantId == null) {
        if (!principal.isPlatformAdmin) {
          throw new ForgeError(
            "FORBIDDEN",
            "Only platform administrators may publish Forge-global legal documents",
          );
        }
      } else if (doc.tenantId !== tenantId) {
        throw new ForgeError("TENANT_POLICY_NOT_AUTHORIZED", "Document belongs to another tenant");
      } else {
        const allowed =
          principal.isPlatformAdmin ||
          principal.permissions.has("industrial.legal.tenantPolicies.publish") ||
          principal.permissions.has("industrial.legal.documents.publish") ||
          principal.permissions.has("industrial.admin");
        if (!allowed) {
          throw new ForgeError("TENANT_POLICY_NOT_AUTHORIZED", "Not authorized to publish");
        }
      }

      if (body.requiresReacknowledgment) {
        // Explicit confirmation path — caller must send the flag intentionally.
      }

      const maxRows = await tx
        .select({ maxVersion: sql<number>`coalesce(max(${legalDocumentVersions.versionNumber}), 0)` })
        .from(legalDocumentVersions)
        .where(eq(legalDocumentVersions.legalDocumentId, documentId));
      const nextNumber = Number(maxRows[0]?.maxVersion ?? 0) + 1;
      const versionId = createId();
      const content = body.content.trim();
      const hash = hashCanonicalContent(content);
      const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : now;

      if (doc.currentVersionId) {
        await tx
          .update(legalDocumentVersions)
          .set({ status: "SUPERSEDED" })
          .where(eq(legalDocumentVersions.id, doc.currentVersionId));
      }

      await tx.insert(legalDocumentVersions).values({
        id: versionId,
        legalDocumentId: documentId,
        tenantId: doc.tenantId,
        version: body.version,
        versionNumber: nextNumber,
        effectiveAt,
        publishedAt: now,
        publishedByUserId: principal.userId,
        contentFormat: "HTML",
        content,
        contentHash: hash,
        changeSummary: body.changeSummary ?? null,
        materialChange: body.materialChange !== false,
        requiresReacknowledgment: body.requiresReacknowledgment !== false,
        status: effectiveAt.getTime() > now.getTime() ? "SCHEDULED" : "ACTIVE",
        createdAt: now,
      });

      await tx
        .update(legalDocuments)
        .set({
          currentVersionId: versionId,
          status: "ACTIVE",
          updatedByUserId: principal.userId,
          updatedAt: now,
        })
        .where(eq(legalDocuments.id, documentId));

      await tx.insert(legalAcknowledgmentRequirements).values({
        id: createId(),
        tenantId: doc.tenantId,
        product: INDUSTRIAL_PRODUCT_CODE,
        documentId,
        documentVersionId: versionId,
        required: true,
        requiredFrom: effectiveAt,
        reacknowledgmentPolicy: "ON_MATERIAL_VERSION",
        blockingMode: "BLOCKING",
        createdByUserId: principal.userId,
        createdAt: now,
      });

      await this.audit.writeInTransaction(tx, {
        tenantId: doc.tenantId ?? tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "legal.document.published",
        resourceType: "legal_document_version",
        resourceId: versionId,
        result: "SUCCESS",
        riskLevel: "HIGH",
        correlationId: body.correlationId,
        requestId: body.requestId,
        after: {
          documentKey: doc.documentKey,
          version: body.version,
          requiresReacknowledgment: body.requiresReacknowledgment !== false,
          contentHash: hash,
        },
        occurredAt: now,
      });

      return {
        documentId,
        versionId,
        versionNumber: nextNumber,
        contentHash: hash,
        warning:
          body.requiresReacknowledgment !== false
            ? "Publishing this version will require affected users to acknowledge the new version before continuing to use the applicable Forge product."
            : null,
      };
    });
  }
}
