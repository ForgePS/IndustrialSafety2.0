import { Inject, Injectable } from "@nestjs/common";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import {
  createId,
  legalAcknowledgmentRequirements,
  legalDocumentVersions,
  legalDocuments,
  userLegalAcknowledgments,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import {
  evaluatePendingRequirements,
  hasBlockingOutstanding,
  type RequirementRow,
} from "./legal-evaluator.js";

const FLAG_ENABLED = "industrial.legalAcknowledgments.enabled";
const FLAG_LOGIN_GATE = "industrial.legalAcknowledgments.loginGate.enabled";
const FLAG_ADMIN = "industrial.legalAcknowledgments.adminReporting.enabled";

@Injectable()
export class AcknowledgmentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly features: FeatureFlagsService,
  ) {}

  private async flagValue(
    tenantId: string,
    principal: ForgePrincipal,
    key: string,
  ): Promise<boolean> {
    const flags = await this.features.effective(tenantId, principal);
    const found = flags.find((f) => f.key === key);
    return found?.value !== false;
  }

  async isEnabled(tenantId: string, principal: ForgePrincipal): Promise<boolean> {
    return this.flagValue(tenantId, principal, FLAG_ENABLED);
  }

  async isLoginGateEnabled(tenantId: string, principal: ForgePrincipal): Promise<boolean> {
    if (!(await this.isEnabled(tenantId, principal))) return false;
    return this.flagValue(tenantId, principal, FLAG_LOGIN_GATE);
  }

  async isAdminReportingEnabled(tenantId: string, principal: ForgePrincipal): Promise<boolean> {
    if (!(await this.isEnabled(tenantId, principal))) return false;
    return this.flagValue(tenantId, principal, FLAG_ADMIN);
  }

  private async evaluateInTx(
    tx: DatabaseTransaction,
    tenantId: string,
    principal: ForgePrincipal,
    product = INDUSTRIAL_PRODUCT_CODE,
  ) {
    const now = new Date();
    const reqRows = await tx
      .select({
        requirementId: legalAcknowledgmentRequirements.id,
        documentId: legalAcknowledgmentRequirements.documentId,
        documentVersionId: legalAcknowledgmentRequirements.documentVersionId,
        blockingMode: legalAcknowledgmentRequirements.blockingMode,
        requiredBy: legalAcknowledgmentRequirements.requiredBy,
        tenantId: legalAcknowledgmentRequirements.tenantId,
        documentKey: legalDocuments.documentKey,
        documentTitle: legalDocuments.title,
        documentType: legalDocuments.documentType,
        version: legalDocumentVersions.version,
        versionNumber: legalDocumentVersions.versionNumber,
        contentHash: legalDocumentVersions.contentHash,
        effectiveAt: legalDocumentVersions.effectiveAt,
        userScope: legalAcknowledgmentRequirements.userScope,
      })
      .from(legalAcknowledgmentRequirements)
      .innerJoin(legalDocuments, eq(legalDocuments.id, legalAcknowledgmentRequirements.documentId))
      .innerJoin(
        legalDocumentVersions,
        eq(legalDocumentVersions.id, legalAcknowledgmentRequirements.documentVersionId),
      )
      .where(
        and(
          eq(legalAcknowledgmentRequirements.product, product),
          eq(legalAcknowledgmentRequirements.required, true),
          or(
            isNull(legalAcknowledgmentRequirements.tenantId),
            eq(legalAcknowledgmentRequirements.tenantId, tenantId),
          ),
          lte(legalAcknowledgmentRequirements.requiredFrom, now),
          or(
            isNull(legalAcknowledgmentRequirements.requiredUntil),
            sql`${legalAcknowledgmentRequirements.requiredUntil} > ${now}`,
          ),
          eq(legalDocumentVersions.status, "ACTIVE"),
          lte(legalDocumentVersions.effectiveAt, now),
        ),
      );

    const applicable = reqRows.filter((r) => !r.userScope || r.userScope === principal.userId);
    const versionIds = applicable.map((r) => r.documentVersionId);
    const acceptances =
      versionIds.length === 0
        ? []
        : await tx
            .select({
              documentVersionId: userLegalAcknowledgments.documentVersionId,
              status: userLegalAcknowledgments.status,
            })
            .from(userLegalAcknowledgments)
            .where(
              and(
                eq(userLegalAcknowledgments.tenantId, tenantId),
                eq(userLegalAcknowledgments.userId, principal.userId),
                inArray(userLegalAcknowledgments.documentVersionId, versionIds),
              ),
            );

    const requirements: RequirementRow[] = applicable.map((r) => ({
      requirementId: r.requirementId,
      documentId: r.documentId,
      documentVersionId: r.documentVersionId,
      documentKey: r.documentKey,
      documentTitle: r.documentTitle,
      documentType: r.documentType,
      version: r.version,
      versionNumber: r.versionNumber,
      contentHash: r.contentHash,
      effectiveAt: r.effectiveAt,
      blockingMode: r.blockingMode,
      requiredBy: r.requiredBy,
      tenantId: r.tenantId,
    }));

    const pending = evaluatePendingRequirements({ requirements, acceptances, now });
    const blocking = hasBlockingOutstanding(pending);
    return {
      product,
      pending,
      pendingCount: pending.length,
      status: blocking ? ("REQUIRED" as const) : ("CURRENT" as const),
      gatePath: "/legal/acknowledge/",
    };
  }

  async evaluateForUser(
    tenantId: string,
    principal: ForgePrincipal,
    product = INDUSTRIAL_PRODUCT_CODE,
  ) {
    return withTenantTransaction(this.db, tenantId, (tx) =>
      this.evaluateInTx(tx, tenantId, principal, product),
    );
  }

  async summaryForMe(tenantId: string, principal: ForgePrincipal) {
    if (!(await this.isEnabled(tenantId, principal))) {
      return {
        status: "NOT_REQUIRED" as const,
        pendingCount: 0,
        gatePath: "/legal/acknowledge/",
        enabled: false,
        loginGateEnabled: false,
        pending: [] as const,
      };
    }
    const evaluation = await this.evaluateForUser(tenantId, principal);
    const gateOn = await this.isLoginGateEnabled(tenantId, principal);
    const status =
      gateOn && evaluation.status === "REQUIRED"
        ? ("REQUIRED" as const)
        : evaluation.status === "REQUIRED"
          ? ("ACTION_REQUIRED" as const)
          : ("CURRENT" as const);
    return {
      status,
      pendingCount: evaluation.pendingCount,
      gatePath: evaluation.gatePath,
      enabled: true,
      loginGateEnabled: gateOn,
      pending: evaluation.pending,
    };
  }

  async getVersion(tenantId: string, documentId: string, versionId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx
        .select({
          documentId: legalDocuments.id,
          documentKey: legalDocuments.documentKey,
          title: legalDocuments.title,
          documentType: legalDocuments.documentType,
          versionId: legalDocumentVersions.id,
          version: legalDocumentVersions.version,
          versionNumber: legalDocumentVersions.versionNumber,
          content: legalDocumentVersions.content,
          contentFormat: legalDocumentVersions.contentFormat,
          contentHash: legalDocumentVersions.contentHash,
          effectiveAt: legalDocumentVersions.effectiveAt,
          publishedAt: legalDocumentVersions.publishedAt,
          status: legalDocumentVersions.status,
        })
        .from(legalDocumentVersions)
        .innerJoin(legalDocuments, eq(legalDocuments.id, legalDocumentVersions.legalDocumentId))
        .where(
          and(eq(legalDocuments.id, documentId), eq(legalDocumentVersions.id, versionId)),
        )
        .limit(1);
      const found = row[0];
      if (!found) {
        throw new ForgeError("LEGAL_DOCUMENT_NOT_FOUND", "Legal document version not found");
      }
      return found;
    });
  }

  async accept(
    tenantId: string,
    principal: ForgePrincipal,
    body: {
      documentVersionIds: string[];
      acceptedAction?: string;
      source?: string;
      authSessionId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      correlationId: string;
      requestId: string;
    },
  ) {
    if (!(await this.isEnabled(tenantId, principal))) {
      throw new ForgeError("FORBIDDEN", "Legal acknowledgments are not enabled");
    }
    const versionIds = [...new Set(body.documentVersionIds)].filter(Boolean);
    if (versionIds.length === 0) {
      throw new ForgeError("VALIDATION_FAILED", "documentVersionIds is required");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const evaluationBefore = await this.evaluateInTx(tx, tenantId, principal);
      const requiredIds = new Set(evaluationBefore.pending.map((p) => p.documentVersionId));
      for (const id of versionIds) {
        if (!requiredIds.has(id)) {
          throw new ForgeError(
            "LEGAL_DOCUMENT_VERSION_STALE",
            "One or more document versions are not currently required",
            { details: [{ documentVersionId: id }] },
          );
        }
      }

      const versions = await tx
        .select({
          id: legalDocumentVersions.id,
          legalDocumentId: legalDocumentVersions.legalDocumentId,
          version: legalDocumentVersions.version,
          contentHash: legalDocumentVersions.contentHash,
          documentKey: legalDocuments.documentKey,
        })
        .from(legalDocumentVersions)
        .innerJoin(legalDocuments, eq(legalDocuments.id, legalDocumentVersions.legalDocumentId))
        .where(inArray(legalDocumentVersions.id, versionIds));

      if (versions.length !== versionIds.length) {
        throw new ForgeError("LEGAL_DOCUMENT_NOT_FOUND", "One or more versions were not found");
      }

      const now = new Date();
      const created: string[] = [];
      for (const version of versions) {
        const existing = await tx
          .select({ id: userLegalAcknowledgments.id })
          .from(userLegalAcknowledgments)
          .where(
            and(
              eq(userLegalAcknowledgments.tenantId, tenantId),
              eq(userLegalAcknowledgments.userId, principal.userId),
              eq(userLegalAcknowledgments.documentVersionId, version.id),
            ),
          )
          .limit(1);
        if (existing[0]) {
          created.push(existing[0].id);
          continue;
        }
        const id = createId();
        await tx.insert(userLegalAcknowledgments).values({
          id,
          tenantId,
          product: INDUSTRIAL_PRODUCT_CODE,
          userId: principal.userId,
          documentId: version.legalDocumentId,
          documentVersionId: version.id,
          documentKey: version.documentKey,
          documentVersion: version.version,
          documentHash: version.contentHash,
          acknowledgmentType: "PLATFORM_USER",
          acknowledgmentTextVersion: "LOGIN-GATE-1",
          acceptedAt: now,
          acceptedAction: body.acceptedAction ?? "I_ACKNOWLEDGE_AND_CONTINUE",
          authSessionId: body.authSessionId ?? null,
          ipAddress: body.ipAddress ?? null,
          userAgent: body.userAgent ?? null,
          deviceMetadata: {},
          source: body.source ?? "LOGIN_GATE",
          roleSnapshot: { permissions: [...principal.permissions].slice(0, 50) },
          status: "ACKNOWLEDGED",
          createdAt: now,
        });
        created.push(id);
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "legal.acknowledgment.accepted",
          resourceType: "user_legal_acknowledgment",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: body.correlationId,
          requestId: body.requestId,
          after: {
            documentKey: version.documentKey,
            documentVersionId: version.id,
            documentHash: version.contentHash,
          },
          metadata: { source: body.source ?? "LOGIN_GATE" },
          occurredAt: now,
        });
      }

      const evaluationAfter = await this.evaluateInTx(tx, tenantId, principal);
      return {
        acknowledgmentIds: created,
        status: evaluationAfter.status,
        pendingCount: evaluationAfter.pendingCount,
        pending: evaluationAfter.pending,
      };
    });
  }

  async listMine(tenantId: string, principal: ForgePrincipal) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select({
          id: userLegalAcknowledgments.id,
          documentKey: userLegalAcknowledgments.documentKey,
          documentVersion: userLegalAcknowledgments.documentVersion,
          documentHash: userLegalAcknowledgments.documentHash,
          documentId: userLegalAcknowledgments.documentId,
          documentVersionId: userLegalAcknowledgments.documentVersionId,
          acceptedAt: userLegalAcknowledgments.acceptedAt,
          acceptedAction: userLegalAcknowledgments.acceptedAction,
          status: userLegalAcknowledgments.status,
          title: legalDocuments.title,
          documentType: legalDocuments.documentType,
          effectiveAt: legalDocumentVersions.effectiveAt,
        })
        .from(userLegalAcknowledgments)
        .innerJoin(legalDocuments, eq(legalDocuments.id, userLegalAcknowledgments.documentId))
        .innerJoin(
          legalDocumentVersions,
          eq(legalDocumentVersions.id, userLegalAcknowledgments.documentVersionId),
        )
        .where(
          and(
            eq(userLegalAcknowledgments.tenantId, tenantId),
            eq(userLegalAcknowledgments.userId, principal.userId),
          ),
        )
        .orderBy(sql`${userLegalAcknowledgments.acceptedAt} desc`);
    });
  }

  async adminList(
    tenantId: string,
    principal: ForgePrincipal,
    query: { page?: number; pageSize?: number },
  ) {
    if (!(await this.isAdminReportingEnabled(tenantId, principal))) {
      throw new ForgeError("FORBIDDEN", "Admin acknowledgment reporting is not enabled");
    }
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: userLegalAcknowledgments.id,
          userId: userLegalAcknowledgments.userId,
          emailSnapshot: userLegalAcknowledgments.emailSnapshot,
          displayNameSnapshot: userLegalAcknowledgments.displayNameSnapshot,
          documentKey: userLegalAcknowledgments.documentKey,
          documentVersion: userLegalAcknowledgments.documentVersion,
          documentHash: userLegalAcknowledgments.documentHash,
          acceptedAt: userLegalAcknowledgments.acceptedAt,
          status: userLegalAcknowledgments.status,
          title: legalDocuments.title,
        })
        .from(userLegalAcknowledgments)
        .innerJoin(legalDocuments, eq(legalDocuments.id, userLegalAcknowledgments.documentId))
        .where(eq(userLegalAcknowledgments.tenantId, tenantId))
        .orderBy(sql`${userLegalAcknowledgments.acceptedAt} desc`)
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      return { items: rows, page, pageSize };
    });
  }

  async adminGet(tenantId: string, principal: ForgePrincipal, acknowledgmentId: string) {
    if (!(await this.isAdminReportingEnabled(tenantId, principal))) {
      throw new ForgeError("FORBIDDEN", "Admin acknowledgment reporting is not enabled");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx
        .select()
        .from(userLegalAcknowledgments)
        .where(
          and(
            eq(userLegalAcknowledgments.tenantId, tenantId),
            eq(userLegalAcknowledgments.id, acknowledgmentId),
          ),
        )
        .limit(1);
      if (!row[0]) throw new ForgeError("NOT_FOUND", "Acknowledgment not found");
      return row[0];
    });
  }

  async exportCsv(
    tenantId: string,
    principal: ForgePrincipal,
    ids: { correlationId: string; requestId: string },
  ) {
    if (!(await this.isAdminReportingEnabled(tenantId, principal))) {
      throw new ForgeError("FORBIDDEN", "Admin acknowledgment reporting is not enabled");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          userId: userLegalAcknowledgments.userId,
          emailSnapshot: userLegalAcknowledgments.emailSnapshot,
          documentKey: userLegalAcknowledgments.documentKey,
          documentVersion: userLegalAcknowledgments.documentVersion,
          documentHash: userLegalAcknowledgments.documentHash,
          acceptedAt: userLegalAcknowledgments.acceptedAt,
          status: userLegalAcknowledgments.status,
        })
        .from(userLegalAcknowledgments)
        .where(eq(userLegalAcknowledgments.tenantId, tenantId))
        .orderBy(sql`${userLegalAcknowledgments.acceptedAt} desc`)
        .limit(5000);

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "legal.acknowledgment.export.generated",
        resourceType: "user_legal_acknowledgment",
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: ids.correlationId,
        requestId: ids.requestId,
        metadata: { rowCount: rows.length },
        occurredAt: new Date(),
      });

      const header = [
        "Tenant",
        "Product",
        "User",
        "Email",
        "Document",
        "Document Version",
        "Document Hash",
        "Acknowledged Date",
        "Status",
      ];
      const lines = [header.join(",")];
      for (const row of rows) {
        lines.push(
          [
            tenantId,
            INDUSTRIAL_PRODUCT_CODE,
            row.userId,
            csv(row.emailSnapshot),
            csv(row.documentKey),
            csv(row.documentVersion),
            csv(row.documentHash),
            row.acceptedAt?.toISOString?.() ?? "",
            csv(row.status),
          ].join(","),
        );
      }
      return lines.join("\n");
    });
  }
}

function csv(value: string | null | undefined): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
