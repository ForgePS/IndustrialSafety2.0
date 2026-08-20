import { Inject, Injectable } from "@nestjs/common";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import {
  attestationTemplateVersions,
  attestationTemplates,
  createId,
  transactionAttestations,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull, or } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import { hashCanonicalContent } from "./legal-evaluator.js";

const FLAG_ATTEST = "industrial.legalAcknowledgments.transactionAttestations.enabled";
const FLAG_ENABLED = "industrial.legalAcknowledgments.enabled";

@Injectable()
export class AttestationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly features: FeatureFlagsService,
  ) {}

  async isEnabled(tenantId: string, principal: ForgePrincipal): Promise<boolean> {
    const flags = await this.features.effective(tenantId, principal);
    const master = flags.find((f) => f.key === FLAG_ENABLED);
    const attest = flags.find((f) => f.key === FLAG_ATTEST);
    return master?.value !== false && attest?.value !== false;
  }

  async getActiveTemplate(
    tenantId: string,
    templateKey: string,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const templates = await tx
        .select()
        .from(attestationTemplates)
        .where(
          and(
            eq(attestationTemplates.templateKey, templateKey),
            or(isNull(attestationTemplates.tenantId), eq(attestationTemplates.tenantId, tenantId)),
          ),
        )
        .limit(1);
      const template = templates[0];
      if (!template?.currentVersionId) {
        throw new ForgeError("NOT_FOUND", `Attestation template ${templateKey} not found`);
      }
      const versions = await tx
        .select()
        .from(attestationTemplateVersions)
        .where(eq(attestationTemplateVersions.id, template.currentVersionId))
        .limit(1);
      const version = versions[0];
      if (!version) {
        throw new ForgeError("NOT_FOUND", "Attestation template version not found");
      }
      return { template, version };
    });
  }

  async sign(
    tenantId: string,
    principal: ForgePrincipal,
    body: {
      templateKey: string;
      module: string;
      recordType: string;
      recordId: string;
      action: string;
      authSessionId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      correlationId: string;
      requestId: string;
    },
  ) {
    if (!(await this.isEnabled(tenantId, principal))) {
      throw new ForgeError("FORBIDDEN", "Transaction attestations are not enabled");
    }
    const { template, version } = await this.getActiveTemplate(tenantId, body.templateKey);
    const hash = version.contentHash || hashCanonicalContent(version.attestationText);
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      await tx.insert(transactionAttestations).values({
        id,
        tenantId,
        product: INDUSTRIAL_PRODUCT_CODE,
        module: body.module,
        recordType: body.recordType,
        recordId: body.recordId,
        action: body.action,
        userId: principal.userId,
        attestationTemplateId: template.id,
        attestationVersion: version.version,
        attestationText: version.attestationText,
        attestationHash: hash,
        signedAt: now,
        authSessionId: body.authSessionId ?? null,
        ipAddress: body.ipAddress ?? null,
        userAgent: body.userAgent ?? null,
        createdAt: now,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "attestation.signed",
        resourceType: "transaction_attestation",
        resourceId: id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: body.correlationId,
        requestId: body.requestId,
        after: {
          templateKey: body.templateKey,
          recordType: body.recordType,
          recordId: body.recordId,
          attestationHash: hash,
        },
        occurredAt: now,
      });
      return { id, attestationHash: hash, signedAt: now, attestationVersion: version.version };
    });
  }

  async getById(tenantId: string, attestationId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(transactionAttestations)
        .where(
          and(
            eq(transactionAttestations.tenantId, tenantId),
            eq(transactionAttestations.id, attestationId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new ForgeError("NOT_FOUND", "Attestation not found");
      return rows[0];
    });
  }
}
