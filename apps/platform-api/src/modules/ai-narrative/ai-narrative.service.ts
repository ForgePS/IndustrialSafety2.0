import { Inject, Injectable } from "@nestjs/common";
import {
  AI_FEATURE_FLAGS,
  AI_NARRATIVE_ENTITLEMENTS,
  AI_DRAFT_LABELS,
  acceptAiNarrativeSchema,
  createAiNarrativeRequestSchema,
  rejectAiNarrativeSchema,
  type CreateAiNarrativeRequest,
} from "@forge/ai-contracts";
import {
  AiNarrativeProviderRegistry,
  StubAiNarrativeProvider,
  assembleSourceManifest,
  assertRecordAllowsAiMutation,
  runNarrativeGenerationPipeline,
} from "@forge/ai";
import { emitAiNarrativeMetric, AI_NARRATIVE_METRICS } from "@forge/ai-observability";
import { resolveFeatureValue } from "@forge/authorization";
import {
  aiModelPolicies,
  aiNarrativeAuditEvents,
  aiNarrativeDrafts,
  aiNarrativeFeedback,
  aiNarrativePolicies,
  aiNarrativeRequests,
  aiNarrativeRevisions,
  aiNarrativeSources,
  aiNarrativeTemplates,
  aiNarrativeTemplateVersions,
  aiNarrativeUsage,
  aiProviderConfigurations,
  createId,
  featureDefinitions,
  featureOverrides,
  nerisIncidents,
  nerisIncidentNarratives,
  platformModules,
  tenantModuleEntitlements,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";

const MANAGEMENT_FLAG_KEYS = [
  AI_FEATURE_FLAGS.ENABLED,
  AI_FEATURE_FLAGS.RMS,
  AI_FEATURE_FLAGS.INDUSTRIAL,
  AI_FEATURE_FLAGS.ACADEMY,
  AI_FEATURE_FLAGS.REWRITE,
  AI_FEATURE_FLAGS.QUALITY_CHECK,
  AI_FEATURE_FLAGS.VOICE_INPUT,
  AI_FEATURE_FLAGS.SENSITIVE_DATA,
  AI_FEATURE_FLAGS.ANALYTICS,
] as const;

const PRODUCT_FLAG: Record<string, string> = {
  RMS: AI_FEATURE_FLAGS.RMS,
  INDUSTRIAL: AI_FEATURE_FLAGS.INDUSTRIAL,
  ACADEMY: AI_FEATURE_FLAGS.ACADEMY,
};

const PRODUCT_ENTITLEMENT: Record<string, string> = {
  RMS: AI_NARRATIVE_ENTITLEMENTS.RMS,
  INDUSTRIAL: AI_NARRATIVE_ENTITLEMENTS.INDUSTRIAL,
  ACADEMY: AI_NARRATIVE_ENTITLEMENTS.ACADEMY,
};

@Injectable()
export class AiNarrativeService {
  private readonly providers = new AiNarrativeProviderRegistry();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {
    // Stub only — production providers register via approved config (Secrets Manager).
    this.providers.register(new StubAiNarrativeProvider());
  }

  async create(tenantId: string, principal: ForgePrincipal, body: unknown, correlationId: string) {
    const input = createAiNarrativeRequestSchema.parse(body);
    await this.assertActivation(tenantId, principal, input.product);

    if (!input.acknowledgeWarning) {
      throw new ForgeError("VALIDATION_FAILED", "Required AI warning must be acknowledged");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.query.aiNarrativeRequests.findFirst({
          where: and(
            eq(aiNarrativeRequests.tenantId, tenantId),
            eq(aiNarrativeRequests.idempotencyKey, input.idempotencyKey),
          ),
        });
        if (existing) {
          return this.loadRequestBundle(tx, tenantId, existing.id);
        }
      }

      await this.assertSourceRecordAuthorized(tx, tenantId, principal, input);

      const policy = await tx.query.aiNarrativePolicies.findFirst({
        where: and(
          eq(aiNarrativePolicies.tenantId, tenantId),
          eq(aiNarrativePolicies.product, input.product),
        ),
      });
      if (!policy || policy.status !== "ACTIVE") {
        throw new ForgeError(
          "FORBIDDEN",
          "AI narrative policy is not active for this tenant/product",
        );
      }
      if (policy.requireAcceptedTerms && !policy.termsAcceptedAt) {
        throw new ForgeError("FORBIDDEN", "Tenant AI terms must be accepted before use");
      }

      await this.assertQuotas(tx, tenantId, principal.userId!, input, policy);

      const requestId = createId();
      const startedAt = new Date();

      await tx.insert(aiNarrativeRequests).values({
        id: requestId,
        tenantId,
        product: input.product,
        module: input.module,
        recordType: input.recordType,
        recordId: input.recordId,
        requestedByUserId: principal.userId!,
        requestType: input.requestType,
        status: "VALIDATING",
        correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
        startedAt,
      });

      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: input.product,
        module: input.module,
        recordType: input.recordType,
        recordId: input.recordId,
        requestId,
        action: "AiNarrativeRequested",
        correlationId,
        metadata: { requestType: input.requestType },
      });

      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.Requests,
        tenantId,
        product: input.product,
      });

      const fields = await this.buildSourceFields(tx, tenantId, input);
      const manifest = assembleSourceManifest({
        recordType: input.recordType,
        recordId: input.recordId,
        fields,
        includeCategories: input.includeCategories,
        excludeCategories: input.excludeCategories,
      });

      await tx
        .update(aiNarrativeRequests)
        .set({ status: "REDACTING", sourceHash: manifest.sourceHash })
        .where(eq(aiNarrativeRequests.id, requestId));

      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: input.product,
        module: input.module,
        recordType: input.recordType,
        recordId: input.recordId,
        requestId,
        action: "AiNarrativeSourcePrepared",
        correlationId,
        metadata: {
          sourceHash: manifest.sourceHash,
          fieldCount: manifest.fields.length,
          includedCount: manifest.fields.filter((f) => f.included).length,
        },
      });

      const provider = this.providers.select({
        environment: process.env.APP_ENV ?? "development",
        tenantId,
        product: input.product,
        dataClassification: "INTERNAL",
        featureFlags: {
          "ai.narrative.stub_provider": true,
        },
        providerKey: "stub",
      });
      if (!provider) {
        await this.failRequest(tx, requestId, "PROVIDER_NOT_CONFIGURED", "No approved provider");
        throw new ForgeError("FORBIDDEN", "No approved AI provider is configured");
      }

      await tx
        .update(aiNarrativeRequests)
        .set({ status: "GENERATING", provider: provider.providerKey })
        .where(eq(aiNarrativeRequests.id, requestId));

      const hasSensitive = principal.permissions.has("ai.narrative.use_sensitive_data");
      const pipeline = await runNarrativeGenerationPipeline({
        request: input,
        tenantId,
        requestId,
        correlationId,
        provider,
        manifest,
        classificationGate: {
          classification: "INTERNAL",
          tenantAllowsConfidential: false,
          tenantAllowsRestricted: false,
          hasSensitivePermission: hasSensitive,
          authorizeSensitiveData: input.authorizeSensitiveData,
          businessPurpose: input.businessPurpose ?? null,
        },
      });

      if (pipeline.redaction) {
        await tx.insert(aiNarrativeSources).values({
          id: createId(),
          tenantId,
          requestId,
          manifestJson: pipeline.redaction.manifest,
          redactionSummaryJson: pipeline.redaction.auditSummary,
        });
        await this.writeAiAudit(tx, {
          tenantId,
          userId: principal.userId,
          product: input.product,
          module: input.module,
          recordType: input.recordType,
          recordId: input.recordId,
          requestId,
          action: "AiNarrativeDataRedacted",
          correlationId,
          metadata: pipeline.redaction.auditSummary,
        });
      }

      if (!pipeline.ok) {
        if (
          pipeline.reasonCode.includes("RESTRICTED") ||
          pipeline.reasonCode.includes("SENSITIVE")
        ) {
          emitAiNarrativeMetric({
            metric: AI_NARRATIVE_METRICS.SensitiveDataBlocked,
            tenantId,
            product: input.product,
          });
        }
        await this.failRequest(tx, requestId, pipeline.reasonCode, pipeline.message);
        emitAiNarrativeMetric({
          metric: AI_NARRATIVE_METRICS.Failure,
          tenantId,
          product: input.product,
          outcome: pipeline.reasonCode,
        });
        throw new ForgeError("VALIDATION_FAILED", pipeline.message, {
          details: [{ reasonCode: pipeline.reasonCode, stage: pipeline.stage }],
        });
      }

      await tx
        .update(aiNarrativeRequests)
        .set({ status: "VALIDATING_RESPONSE" })
        .where(eq(aiNarrativeRequests.id, requestId));

      const draftId = createId();
      await tx.insert(aiNarrativeDrafts).values({
        id: draftId,
        tenantId,
        requestId,
        draftText: pipeline.structured.narrative,
        structuredResponseJson: pipeline.structured,
        confidenceSummary: "Deterministic schema validation passed; human review required",
        warningsJson: pipeline.structured.warnings,
        missingInformationJson: pipeline.structured.missingInformation,
        unsupportedClaimsJson: pipeline.unsupportedClaims,
        sourceMappingJson: pipeline.structured.sourceReferences,
        label: AI_DRAFT_LABELS.UNREVIEWED,
        createdByUserId: principal.userId!,
        version: 1,
      });

      await tx.insert(aiNarrativeRevisions).values({
        id: createId(),
        tenantId,
        requestId,
        draftId,
        action: "GENERATED",
        actorUserId: principal.userId!,
        snapshotJson: {
          label: AI_DRAFT_LABELS.UNREVIEWED,
          narrativeLength: pipeline.structured.narrative.length,
        },
      });

      await tx.insert(aiNarrativeUsage).values({
        id: createId(),
        tenantId,
        product: input.product,
        userId: principal.userId!,
        requestId,
        inputTokens: pipeline.inputTokens,
        outputTokens: pipeline.outputTokens,
        estimatedCostUsd: String(pipeline.estimatedCostUsd),
        latencyMs: pipeline.latencyMs,
        outcome: "SUCCESS",
      });

      await tx
        .update(aiNarrativeRequests)
        .set({
          status: "READY_FOR_REVIEW",
          completedAt: new Date(),
          provider: pipeline.providerKey,
        })
        .where(eq(aiNarrativeRequests.id, requestId));

      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: input.product,
        module: input.module,
        recordType: input.recordType,
        recordId: input.recordId,
        requestId,
        action: "AiNarrativeGenerated",
        correlationId,
        metadata: {
          draftId,
          provider: pipeline.providerKey,
          modelId: pipeline.modelId,
          sourceHash: manifest.sourceHash,
        },
      });

      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "AiNarrativeGenerated",
        resourceType: "ai_narrative_request",
        resourceId: requestId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId,
        requestId: correlationId,
        metadata: { draftId, product: input.product },
      });

      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.Success,
        tenantId,
        product: input.product,
      });
      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.Latency,
        value: pipeline.latencyMs,
        tenantId,
        product: input.product,
      });

      return this.loadRequestBundle(tx, tenantId, requestId);
    });
  }

  async get(tenantId: string, requestId: string, principal: ForgePrincipal, correlationId: string) {
    await this.assertActivation(tenantId, principal, undefined);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const bundle = await this.loadRequestBundle(tx, tenantId, requestId);
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: bundle.request.product,
        module: bundle.request.module,
        recordType: bundle.request.recordType,
        recordId: bundle.request.recordId,
        requestId,
        action: "AiNarrativeViewed",
        correlationId,
        metadata: {},
      });
      return bundle;
    });
  }

  async regenerate(
    tenantId: string,
    requestId: string,
    principal: ForgePrincipal,
    correlationId: string,
  ) {
    const prior = await this.get(tenantId, requestId, principal, correlationId);
    const body: CreateAiNarrativeRequest = {
      product: prior.request.product as CreateAiNarrativeRequest["product"],
      module: prior.request.module,
      recordType: prior.request.recordType,
      recordId: prior.request.recordId,
      requestType: prior.request.requestType as CreateAiNarrativeRequest["requestType"],
      tone: "NEUTRAL",
      detailLevel: "STANDARD",
      includeCategories: [],
      excludeCategories: [],
      acknowledgeWarning: true,
      authorizeSensitiveData: false,
      existingNarrative: prior.drafts[0]?.draftText,
    };
    const result = await this.create(tenantId, principal, body, correlationId);
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: body.product,
        module: body.module,
        recordType: body.recordType,
        recordId: body.recordId,
        requestId: result.request.id,
        action: "AiNarrativeRegenerated",
        correlationId,
        metadata: { priorRequestId: requestId },
      });
    });
    return result;
  }

  async accept(
    tenantId: string,
    requestId: string,
    principal: ForgePrincipal,
    body: unknown,
    correlationId: string,
  ) {
    const input = acceptAiNarrativeSchema.parse(body);
    await this.assertActivation(tenantId, principal, undefined);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const request = await tx.query.aiNarrativeRequests.findFirst({
        where: and(
          eq(aiNarrativeRequests.id, requestId),
          eq(aiNarrativeRequests.tenantId, tenantId),
        ),
      });
      if (!request) throw new ForgeError("NOT_FOUND", "AI narrative request not found");
      if (request.status !== "READY_FOR_REVIEW") {
        throw new ForgeError("CONFLICT", `Request status ${request.status} cannot be accepted`);
      }

      const draft = await tx.query.aiNarrativeDrafts.findFirst({
        where: and(
          eq(aiNarrativeDrafts.id, input.draftId),
          eq(aiNarrativeDrafts.requestId, requestId),
          eq(aiNarrativeDrafts.tenantId, tenantId),
        ),
      });
      if (!draft) throw new ForgeError("NOT_FOUND", "Draft not found");

      if (request.recordType === "neris_incident") {
        const incident = await tx.query.nerisIncidents.findFirst({
          where: and(
            eq(nerisIncidents.id, request.recordId),
            eq(nerisIncidents.tenantId, tenantId),
          ),
        });
        if (!incident) throw new ForgeError("NOT_FOUND", "Source incident not found");
        try {
          assertRecordAllowsAiMutation(incident.status);
        } catch {
          throw new ForgeError(
            "FORBIDDEN",
            "Finalized or locked incidents cannot be altered through AI",
          );
        }
      }

      const acceptedAt = new Date();
      await tx
        .update(aiNarrativeDrafts)
        .set({
          acceptedAt,
          acceptedByUserId: principal.userId!,
          label: AI_DRAFT_LABELS.REVIEWED,
        })
        .where(eq(aiNarrativeDrafts.id, draft.id));

      await tx
        .update(aiNarrativeRequests)
        .set({ status: "ACCEPTED" })
        .where(eq(aiNarrativeRequests.id, requestId));

      await tx.insert(aiNarrativeRevisions).values({
        id: createId(),
        tenantId,
        requestId,
        draftId: draft.id,
        action: input.mode === "PARTIAL" ? "PARTIAL_ACCEPT" : "ACCEPT_ALL",
        actorUserId: principal.userId!,
        snapshotJson: {
          acceptedAt: acceptedAt.toISOString(),
          selectedSections: input.selectedSections,
        },
      });

      if (input.feedback) {
        await tx.insert(aiNarrativeFeedback).values({
          id: createId(),
          tenantId,
          requestId,
          draftId: draft.id,
          body: input.feedback,
          createdByUserId: principal.userId!,
        });
      }

      if (input.insertIntoRecord && request.recordType === "neris_incident") {
        // Acceptance alone does not silently overwrite; insert requires explicit flag.
        const narrative = await tx.query.nerisIncidentNarratives.findFirst({
          where: eq(nerisIncidentNarratives.incidentId, request.recordId),
        });
        const body = draft.draftText;
        const characterCount = body.length;
        if (narrative) {
          await tx
            .update(nerisIncidentNarratives)
            .set({
              body,
              characterCount,
              updatedAt: new Date(),
              updatedByUserId: principal.userId,
            })
            .where(eq(nerisIncidentNarratives.id, narrative.id));
        } else {
          await tx.insert(nerisIncidentNarratives).values({
            id: createId(),
            tenantId,
            incidentId: request.recordId,
            body,
            characterCount,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
          });
        }
        await this.writeAiAudit(tx, {
          tenantId,
          userId: principal.userId,
          product: request.product,
          module: request.module,
          recordType: request.recordType,
          recordId: request.recordId,
          requestId,
          action: "AiNarrativeInserted",
          correlationId,
          metadata: { draftId: draft.id, created: !narrative },
        });
      }

      const action =
        input.mode === "PARTIAL" ? "AiNarrativePartiallyAccepted" : "AiNarrativeAccepted";
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: request.product,
        module: request.module,
        recordType: request.recordType,
        recordId: request.recordId,
        requestId,
        action,
        correlationId,
        metadata: {
          draftId: draft.id,
          acceptedAt: acceptedAt.toISOString(),
          acceptedBy: principal.userId,
        },
      });

      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.Accepted,
        tenantId,
        product: request.product,
      });

      return this.loadRequestBundle(tx, tenantId, requestId);
    });
  }

  async reject(
    tenantId: string,
    requestId: string,
    principal: ForgePrincipal,
    body: unknown,
    correlationId: string,
  ) {
    const input = rejectAiNarrativeSchema.parse(body);
    await this.assertActivation(tenantId, principal, undefined);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const request = await tx.query.aiNarrativeRequests.findFirst({
        where: and(
          eq(aiNarrativeRequests.id, requestId),
          eq(aiNarrativeRequests.tenantId, tenantId),
        ),
      });
      if (!request) throw new ForgeError("NOT_FOUND", "AI narrative request not found");

      await tx
        .update(aiNarrativeRequests)
        .set({ status: "REJECTED" })
        .where(eq(aiNarrativeRequests.id, requestId));

      await tx.insert(aiNarrativeFeedback).values({
        id: createId(),
        tenantId,
        requestId,
        draftId: input.draftId,
        body: input.feedback ?? input.reason,
        createdByUserId: principal.userId!,
      });

      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: request.product,
        module: request.module,
        recordType: request.recordType,
        recordId: request.recordId,
        requestId,
        action: "AiNarrativeRejected",
        correlationId,
        metadata: { reason: input.reason },
      });

      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.Rejected,
        tenantId,
        product: request.product,
      });

      return this.loadRequestBundle(tx, tenantId, requestId);
    });
  }

  async history(tenantId: string, requestId: string, principal: ForgePrincipal) {
    await this.assertActivation(tenantId, principal, undefined);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const request = await tx.query.aiNarrativeRequests.findFirst({
        where: and(
          eq(aiNarrativeRequests.id, requestId),
          eq(aiNarrativeRequests.tenantId, tenantId),
        ),
      });
      if (!request) throw new ForgeError("NOT_FOUND", "AI narrative request not found");
      const drafts = await tx.query.aiNarrativeDrafts.findMany({
        where: and(
          eq(aiNarrativeDrafts.requestId, requestId),
          eq(aiNarrativeDrafts.tenantId, tenantId),
        ),
        orderBy: (t, { asc }) => [asc(t.version)],
      });
      const revisions = await tx.query.aiNarrativeRevisions.findMany({
        where: and(
          eq(aiNarrativeRevisions.requestId, requestId),
          eq(aiNarrativeRevisions.tenantId, tenantId),
        ),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      });
      return { request, drafts, revisions };
    });
  }

  async usage(tenantId: string, principal: ForgePrincipal, options?: { limit?: number }) {
    this.assertUsageAccess(principal);
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.aiNarrativeUsage.findMany({
        where: eq(aiNarrativeUsage.tenantId, tenantId),
        orderBy: (t, { desc: d }) => [d(t.occurredAt)],
        limit,
      });
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const monthRows = rows.filter((row) => row.occurredAt >= monthStart);
      return {
        items: rows,
        summary: {
          monthRequestCount: monthRows.length,
          monthInputTokens: monthRows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
          monthOutputTokens: monthRows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
        },
      };
    });
  }

  async listPolicies(tenantId: string, principal: ForgePrincipal) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.configure") &&
      !principal.permissions.has("platform.ai.policy.manage") &&
      !principal.permissions.has("platform.ai.narrative.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing configure permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const items = await tx.query.aiNarrativePolicies.findMany({
        where: eq(aiNarrativePolicies.tenantId, tenantId),
      });
      return { items };
    });
  }

  async listTemplates(tenantId: string, principal: ForgePrincipal) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.use") &&
      !principal.permissions.has("ai.narrative.manage_templates") &&
      !principal.permissions.has("platform.ai.narrative.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing template list permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const items = await tx.query.aiNarrativeTemplates.findMany({
        where: eq(aiNarrativeTemplates.tenantId, tenantId),
        orderBy: (t, { asc }) => [asc(t.name)],
      });
      return {
        items,
        note:
          items.length === 0
            ? "No tenant templates yet. Create and publish a template, or wait for system library seed."
            : undefined,
      };
    });
  }

  async createTemplate(
    tenantId: string,
    principal: ForgePrincipal,
    body: unknown,
    correlationId: string,
  ) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.manage_templates") &&
      !principal.permissions.has("platform.ai.narrative.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing ai.narrative.manage_templates permission");
    }
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authenticated user required");
    }
    const input = body as {
      product?: string;
      module?: string;
      recordType?: string;
      key?: string;
      name?: string;
      systemPrompt?: string;
      userPromptTemplate?: string;
    };
    const product = (input.product ?? "RMS").toUpperCase();
    const module = input.module?.trim() || "INCIDENT";
    const recordType = input.recordType?.trim() || "neris_incident";
    const key = input.key?.trim();
    const name = input.name?.trim();
    const systemPrompt = input.systemPrompt?.trim();
    const userPromptTemplate = input.userPromptTemplate?.trim();
    if (!key || !name || !systemPrompt || !userPromptTemplate) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "key, name, systemPrompt, and userPromptTemplate are required",
      );
    }
    if (!["RMS", "INDUSTRIAL", "ACADEMY"].includes(product)) {
      throw new ForgeError("VALIDATION_FAILED", "Unsupported product");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.aiNarrativeTemplates.findFirst({
        where: and(
          eq(aiNarrativeTemplates.tenantId, tenantId),
          eq(aiNarrativeTemplates.product, product),
          eq(aiNarrativeTemplates.key, key),
        ),
      });
      if (existing) {
        throw new ForgeError("CONFLICT", "Template key already exists for this product");
      }
      const templateId = createId();
      const versionId = createId();
      const now = new Date();
      await tx.insert(aiNarrativeTemplates).values({
        id: templateId,
        tenantId,
        product,
        module,
        recordType,
        key,
        name,
        status: "DRAFT",
        isSystem: false,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(aiNarrativeTemplateVersions).values({
        id: versionId,
        tenantId,
        templateId,
        version: 1,
        status: "DRAFT",
        systemPrompt,
        userPromptTemplate,
        safetyRulesJson: [],
        createdByUserId: principal.userId!,
        createdAt: now,
      });
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product,
        action: "AiNarrativeTemplatePublished",
        correlationId,
        metadata: { templateId, versionId, status: "DRAFT", created: true },
      });
      return { created: true, templateId, versionId, status: "DRAFT" };
    });
  }

  async publishTemplate(
    tenantId: string,
    principal: ForgePrincipal,
    templateId: string,
    correlationId: string,
  ) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.manage_templates") &&
      !principal.permissions.has("platform.ai.narrative.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing template publish permission");
    }
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authenticated user required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const template = await tx.query.aiNarrativeTemplates.findFirst({
        where: and(
          eq(aiNarrativeTemplates.id, templateId),
          eq(aiNarrativeTemplates.tenantId, tenantId),
        ),
      });
      if (!template) {
        throw new ForgeError("NOT_FOUND", "Template not found");
      }
      const version = await tx.query.aiNarrativeTemplateVersions.findFirst({
        where: and(
          eq(aiNarrativeTemplateVersions.templateId, templateId),
          eq(aiNarrativeTemplateVersions.version, template.currentVersion),
        ),
      });
      if (!version) {
        throw new ForgeError("NOT_FOUND", "Current template version not found");
      }
      const now = new Date();
      await tx
        .update(aiNarrativeTemplates)
        .set({ status: "PUBLISHED", updatedAt: now })
        .where(eq(aiNarrativeTemplates.id, templateId));
      await tx
        .update(aiNarrativeTemplateVersions)
        .set({ status: "PUBLISHED", publishedAt: now })
        .where(eq(aiNarrativeTemplateVersions.id, version.id));
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: template.product,
        action: "AiNarrativeTemplatePublished",
        correlationId,
        metadata: {
          templateId,
          versionId: version.id,
          version: version.version,
          from: template.status,
          to: "PUBLISHED",
        },
      });
      return {
        published: true,
        templateId,
        versionId: version.id,
        version: version.version,
        status: "PUBLISHED",
      };
    });
  }

  async listModels(tenantId: string, principal: ForgePrincipal) {
    this.assertManagementAccess(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const items = await tx.query.aiModelPolicies.findMany({
        where: eq(aiModelPolicies.tenantId, tenantId),
        orderBy: (t, { asc }) => [asc(t.name)],
      });
      return {
        items,
        catalog: [
          {
            providerKey: "stub",
            modelId: "stub-v1",
            name: "Stub narrative model",
            commercial: false,
            note: "Development-only stub. No external network.",
          },
        ],
      };
    });
  }

  async createModelPolicy(
    tenantId: string,
    principal: ForgePrincipal,
    body: unknown,
    correlationId: string,
  ) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.provider.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform AI manage permission");
    }
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authenticated user required");
    }
    const input = body as {
      product?: string;
      name?: string;
      providerKey?: string;
      modelId?: string;
      status?: string;
      maxInputTokens?: number;
      maxOutputTokens?: number;
      allowConfidential?: boolean;
      allowRestricted?: boolean;
    };
    const product = (input.product ?? "RMS").toUpperCase();
    const name = input.name?.trim();
    const providerKey = input.providerKey?.trim() || "stub";
    const modelId = input.modelId?.trim();
    if (!name || !modelId) {
      throw new ForgeError("VALIDATION_FAILED", "name and modelId are required");
    }
    if (input.allowRestricted === true) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Restricted medical / sensitive model policies require separate authorization",
      );
    }
    const status = (input.status ?? "APPROVED").toUpperCase();
    if (!["DRAFT", "APPROVED", "DISABLED"].includes(status)) {
      throw new ForgeError("VALIDATION_FAILED", "Invalid model policy status");
    }
    // Commercial providers stay out of scope until product-owner authorization.
    if (providerKey !== "stub") {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Only stub provider model policies may be created until commercial provider authorization",
      );
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const now = new Date();
      await tx.insert(aiModelPolicies).values({
        id,
        tenantId,
        product,
        name,
        providerKey,
        modelId,
        maxInputTokens: input.maxInputTokens ?? 8000,
        maxOutputTokens: input.maxOutputTokens ?? 2000,
        allowConfidential: input.allowConfidential === true,
        allowRestricted: false,
        status,
        createdAt: now,
        updatedAt: now,
      });
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product,
        action: "AiNarrativePolicyChanged",
        correlationId,
        metadata: { kind: "model_policy", modelPolicyId: id, status, modelId, providerKey },
      });
      return { created: true, id, status };
    });
  }

  async patchModelPolicy(
    tenantId: string,
    principal: ForgePrincipal,
    modelPolicyId: string,
    body: unknown,
    correlationId: string,
  ) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.provider.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform AI manage permission");
    }
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authenticated user required");
    }
    const input = body as {
      status?: string;
      name?: string;
      maxInputTokens?: number;
      maxOutputTokens?: number;
      allowConfidential?: boolean;
    };
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.aiModelPolicies.findFirst({
        where: and(eq(aiModelPolicies.id, modelPolicyId), eq(aiModelPolicies.tenantId, tenantId)),
      });
      if (!existing) {
        throw new ForgeError("NOT_FOUND", "Model policy not found");
      }
      if (existing.providerKey !== "stub") {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Commercial model policies cannot be mutated until authorized",
        );
      }
      const nextStatus = input.status ? input.status.toUpperCase() : existing.status;
      if (!["DRAFT", "APPROVED", "DISABLED"].includes(nextStatus)) {
        throw new ForgeError("VALIDATION_FAILED", "Invalid model policy status");
      }
      const now = new Date();
      await tx
        .update(aiModelPolicies)
        .set({
          status: nextStatus,
          name: input.name?.trim() || existing.name,
          maxInputTokens: input.maxInputTokens ?? existing.maxInputTokens,
          maxOutputTokens: input.maxOutputTokens ?? existing.maxOutputTokens,
          allowConfidential:
            input.allowConfidential === undefined
              ? existing.allowConfidential
              : input.allowConfidential === true,
          updatedAt: now,
        })
        .where(eq(aiModelPolicies.id, modelPolicyId));
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: existing.product,
        action: "AiNarrativePolicyChanged",
        correlationId,
        metadata: {
          kind: "model_policy",
          modelPolicyId,
          from: existing.status,
          to: nextStatus,
        },
      });
      return { updated: true, id: modelPolicyId, status: nextStatus };
    });
  }

  async patchPolicy(
    tenantId: string,
    principal: ForgePrincipal,
    policyId: string,
    body: unknown,
    correlationId: string,
  ) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.policy.manage") &&
      !principal.permissions.has("platform.ai.narrative.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform.ai.policy.manage permission");
    }
    if (!principal.userId) {
      throw new ForgeError("UNAUTHORIZED", "Authenticated user required");
    }
    const input = body as {
      status?: string;
      monthlyRequestQuota?: number;
      dailyUserQuota?: number;
      perRecordLimit?: number;
      requireAcceptedTerms?: boolean;
    };
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.aiNarrativePolicies.findFirst({
        where: and(
          eq(aiNarrativePolicies.id, policyId),
          eq(aiNarrativePolicies.tenantId, tenantId),
        ),
      });
      if (!existing) {
        throw new ForgeError("NOT_FOUND", "Policy not found");
      }
      const nextStatus = input.status ? input.status.toUpperCase() : existing.status;
      if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(nextStatus)) {
        throw new ForgeError("VALIDATION_FAILED", "Invalid policy status");
      }
      const monthly =
        input.monthlyRequestQuota === undefined
          ? existing.monthlyRequestQuota
          : Number(input.monthlyRequestQuota);
      const daily =
        input.dailyUserQuota === undefined ? existing.dailyUserQuota : Number(input.dailyUserQuota);
      const perRecord =
        input.perRecordLimit === undefined ? existing.perRecordLimit : Number(input.perRecordLimit);
      if (
        ![monthly, daily, perRecord].every((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000)
      ) {
        throw new ForgeError("VALIDATION_FAILED", "Quota values must be non-negative numbers");
      }
      const now = new Date();
      await tx
        .update(aiNarrativePolicies)
        .set({
          status: nextStatus,
          monthlyRequestQuota: monthly,
          dailyUserQuota: daily,
          perRecordLimit: perRecord,
          requireAcceptedTerms:
            input.requireAcceptedTerms === undefined
              ? existing.requireAcceptedTerms
              : input.requireAcceptedTerms === true,
          updatedAt: now,
        })
        .where(eq(aiNarrativePolicies.id, policyId));
      await this.writeAiAudit(tx, {
        tenantId,
        userId: principal.userId!,
        product: existing.product,
        action: "AiNarrativePolicyChanged",
        correlationId,
        metadata: {
          policyId,
          from: existing.status,
          to: nextStatus,
          monthlyRequestQuota: monthly,
          dailyUserQuota: daily,
          perRecordLimit: perRecord,
        },
      });
      return {
        updated: true,
        id: policyId,
        status: nextStatus,
        monthlyRequestQuota: monthly,
        dailyUserQuota: daily,
        perRecordLimit: perRecord,
      };
    });
  }

  async listProviders(tenantId: string, principal: ForgePrincipal) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.provider.manage") &&
      !principal.permissions.has("platform.ai.usage.view")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform AI provider permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx.query.aiProviderConfigurations.findMany({
        where: eq(aiProviderConfigurations.tenantId, tenantId),
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          product: row.product,
          providerKey: row.providerKey,
          status: row.status,
          region: row.region,
          hasCredentials: Boolean(row.secretArn),
          secretArn: null as string | null,
          credentialsLabel: row.secretArn ? "configured" : "no credentials",
          configurationJson: row.configurationJson,
          updatedAt: row.updatedAt,
        })),
      };
    });
  }

  async listAudit(tenantId: string, principal: ForgePrincipal, options?: { limit?: number }) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.view_audit") &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.usage.view")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing ai.narrative.view_audit permission");
    }
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const items = await tx.query.aiNarrativeAuditEvents.findMany({
        where: eq(aiNarrativeAuditEvents.tenantId, tenantId),
        orderBy: (t, { desc: d }) => [d(t.occurredAt)],
        limit,
      });
      return { items };
    });
  }

  async managementOverview(tenantId: string, principal: ForgePrincipal) {
    this.assertManagementAccess(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const flags: Record<string, boolean> = {};
      for (const key of MANAGEMENT_FLAG_KEYS) {
        flags[key] = await this.resolveFlagInTx(tx, tenantId, key, false);
      }

      const aiModule = await tx
        .select({ id: platformModules.id, code: platformModules.code })
        .from(platformModules)
        .innerJoin(
          tenantModuleEntitlements,
          eq(tenantModuleEntitlements.moduleId, platformModules.id),
        )
        .where(
          and(
            eq(tenantModuleEntitlements.tenantId, tenantId),
            eq(tenantModuleEntitlements.status, "ACTIVE"),
            eq(platformModules.code, "AI_NARRATIVE"),
          ),
        )
        .limit(1);

      const policies = await tx.query.aiNarrativePolicies.findMany({
        where: eq(aiNarrativePolicies.tenantId, tenantId),
      });
      const providers = await tx.query.aiProviderConfigurations.findMany({
        where: eq(aiProviderConfigurations.tenantId, tenantId),
      });

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const usageRows = await tx
        .select({ occurredAt: aiNarrativeUsage.occurredAt })
        .from(aiNarrativeUsage)
        .where(eq(aiNarrativeUsage.tenantId, tenantId));
      const usageMonthCount = usageRows.filter((row) => row.occurredAt >= monthStart).length;
      const [requestAgg] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(aiNarrativeRequests)
        .where(eq(aiNarrativeRequests.tenantId, tenantId));

      const rmsPolicy = policies.find((p) => p.product === "RMS") ?? policies[0] ?? null;
      const suspended = policies.some((p) => p.status === "SUSPENDED");

      return {
        tenantId,
        flags,
        entitlement: {
          aiNarrativeModulePresent: aiModule.length > 0,
          moduleCode: "AI_NARRATIVE",
        },
        providers: providers.map((p) => ({
          id: p.id,
          providerKey: p.providerKey,
          product: p.product,
          status: p.status,
          region: p.region,
          hasCredentials: Boolean(p.secretArn),
          credentialsLabel: p.secretArn ? "configured" : "no credentials",
        })),
        policy: rmsPolicy
          ? {
              id: rmsPolicy.id,
              product: rmsPolicy.product,
              status: rmsPolicy.status,
              monthlyRequestQuota: rmsPolicy.monthlyRequestQuota,
              dailyUserQuota: rmsPolicy.dailyUserQuota,
              perRecordLimit: rmsPolicy.perRecordLimit,
              requireAcceptedTerms: rmsPolicy.requireAcceptedTerms,
              termsAcceptedAt: rmsPolicy.termsAcceptedAt,
            }
          : null,
        policies,
        usage: {
          monthRequestCount: usageMonthCount,
          totalRequestCount: Number(requestAgg?.count ?? 0),
        },
        sensitiveDataEnabled: flags[AI_FEATURE_FLAGS.SENSITIVE_DATA] === true,
        suspended,
      };
    });
  }

  async suspendTenant(tenantId: string, principal: ForgePrincipal, correlationId: string) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.policy.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform.ai.narrative.manage permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const policies = await tx.query.aiNarrativePolicies.findMany({
        where: eq(aiNarrativePolicies.tenantId, tenantId),
      });
      if (policies.length === 0) {
        throw new ForgeError("NOT_FOUND", "No AI narrative policies found for tenant");
      }
      for (const policy of policies) {
        await tx
          .update(aiNarrativePolicies)
          .set({ status: "SUSPENDED", updatedAt: new Date() })
          .where(eq(aiNarrativePolicies.id, policy.id));
        await this.writeAiAudit(tx, {
          tenantId,
          userId: principal.userId!,
          product: policy.product,
          action: "AiNarrativePolicyChanged",
          correlationId,
          metadata: { from: policy.status, to: "SUSPENDED", reason: "creator_suspend" },
        });
      }
      return {
        tenantId,
        suspended: true,
        policyIds: policies.map((p) => p.id),
      };
    });
  }

  async unsuspendTenant(tenantId: string, principal: ForgePrincipal, correlationId: string) {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.policy.manage")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing platform.ai.narrative.manage permission");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const policies = await tx.query.aiNarrativePolicies.findMany({
        where: eq(aiNarrativePolicies.tenantId, tenantId),
      });
      if (policies.length === 0) {
        throw new ForgeError("NOT_FOUND", "No AI narrative policies found for tenant");
      }
      for (const policy of policies) {
        await tx
          .update(aiNarrativePolicies)
          .set({ status: "ACTIVE", updatedAt: new Date() })
          .where(eq(aiNarrativePolicies.id, policy.id));
        await this.writeAiAudit(tx, {
          tenantId,
          userId: principal.userId!,
          product: policy.product,
          action: "AiNarrativePolicyChanged",
          correlationId,
          metadata: { from: policy.status, to: "ACTIVE", reason: "creator_unsuspend" },
        });
      }
      return {
        tenantId,
        suspended: false,
        policyIds: policies.map((p) => p.id),
      };
    });
  }

  resolveManagementTenantId(principal: ForgePrincipal, queryTenantId: string | undefined): string {
    if (queryTenantId) {
      if (
        !principal.isPlatformAdmin &&
        principal.tenantId !== queryTenantId &&
        !principal.permissions.has("platform.ai.narrative.manage") &&
        !principal.permissions.has("platform.ai.usage.view")
      ) {
        throw new ForgeError("FORBIDDEN", "Cannot inspect another tenant");
      }
      return queryTenantId;
    }
    return principal.tenantId;
  }

  private assertManagementAccess(principal: ForgePrincipal): void {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("platform.ai.narrative.manage") &&
      !principal.permissions.has("platform.ai.usage.view")
    ) {
      throw new ForgeError(
        "FORBIDDEN",
        "Missing platform.ai.narrative.manage or platform.ai.usage.view",
      );
    }
  }

  private assertUsageAccess(principal: ForgePrincipal): void {
    if (
      !principal.isPlatformAdmin &&
      !principal.permissions.has("ai.narrative.view_usage") &&
      !principal.permissions.has("platform.ai.usage.view")
    ) {
      throw new ForgeError("FORBIDDEN", "Missing ai.narrative.view_usage permission");
    }
  }

  async qualityCheck(_tenantId: string, _principal: ForgePrincipal, body: unknown) {
    const input = createAiNarrativeRequestSchema
      .pick({
        product: true,
        module: true,
        recordType: true,
        recordId: true,
        requestType: true,
        existingNarrative: true,
        acknowledgeWarning: true,
      })
      .extend({
        requestType: createAiNarrativeRequestSchema.shape.requestType,
        acknowledgeWarning: createAiNarrativeRequestSchema.shape.acknowledgeWarning,
      })
      .parse(body);

    // Offline quality check does not call a provider — deterministic only.
    return {
      requiredWarning:
        "AI-generated content may be incomplete or inaccurate. Review and verify every statement before saving or submitting this record.",
      checks: {
        hasNarrative: Boolean(input.existingNarrative?.trim()),
        humanReviewRequired: true,
        finalizeBlockedWithoutAccept: true,
      },
      note: "Quality check is advisory only and does not approve or finalize any record.",
    };
  }

  private async assertActivation(
    tenantId: string,
    principal: ForgePrincipal,
    product: string | undefined,
  ): Promise<void> {
    if (principal.isPlatformAdmin) {
      // Creator may inspect, but tenant feature flags still default off for synthetic tenants.
    }
    const master = await this.resolveFlag(tenantId, AI_FEATURE_FLAGS.ENABLED, false);
    if (!master && !principal.isPlatformAdmin) {
      throw new ForgeError(
        "FORBIDDEN",
        "AI Narrative Assistant is disabled (ai.narrative.enabled)",
      );
    }
    if (product) {
      const productFlag = PRODUCT_FLAG[product];
      if (productFlag) {
        const enabled = await this.resolveFlag(tenantId, productFlag, false);
        if (!enabled && !principal.isPlatformAdmin) {
          throw new ForgeError(
            "FORBIDDEN",
            `AI Narrative is disabled for product (${productFlag})`,
          );
        }
      }
      if (!principal.isPlatformAdmin) {
        const hasModule =
          principal.activeModules.has("AI_NARRATIVE") ||
          principal.activeModules.has(PRODUCT_ENTITLEMENT[product] ?? "");
        if (!hasModule) {
          throw new ForgeError(
            "ENTITLEMENT_REQUIRED",
            `Product entitlement ${PRODUCT_ENTITLEMENT[product] ?? "AI_NARRATIVE"} is required`,
          );
        }
      }
    }
  }

  private async assertSourceRecordAuthorized(
    tx: DatabaseTransaction,
    tenantId: string,
    principal: ForgePrincipal,
    input: CreateAiNarrativeRequest,
  ): Promise<void> {
    if (input.recordType === "neris_incident") {
      const incident = await tx.query.nerisIncidents.findFirst({
        where: and(eq(nerisIncidents.id, input.recordId), eq(nerisIncidents.tenantId, tenantId)),
      });
      if (!incident) {
        throw new ForgeError("NOT_FOUND", "Source incident not found or not visible");
      }
      if (!principal.isPlatformAdmin && !principal.permissions.has("rms.neris.incident.view")) {
        throw new ForgeError("FORBIDDEN", "Missing permission to view source record");
      }
      try {
        assertRecordAllowsAiMutation(incident.status);
      } catch {
        if (input.requestType === "GENERATE_FROM_RECORD") {
          throw new ForgeError(
            "FORBIDDEN",
            "Locked or finalized incidents cannot use AI narrative generation",
          );
        }
      }
      return;
    }
    throw new ForgeError(
      "VALIDATION_FAILED",
      `Unsupported record type for foundation release: ${input.recordType}`,
    );
  }

  private async buildSourceFields(
    tx: DatabaseTransaction,
    tenantId: string,
    input: CreateAiNarrativeRequest,
  ) {
    if (input.sourceFacts && input.sourceFacts.length > 0) {
      return input.sourceFacts.map((fact) => ({
        fieldId: fact.fieldId,
        category: fact.category,
        label: fact.label,
        classification: fact.classification,
        value: fact.value ?? (fact.include === false ? null : "[missing]"),
        include: fact.include,
      }));
    }
    if (input.recordType !== "neris_incident") return [];
    const incident = await tx.query.nerisIncidents.findFirst({
      where: and(eq(nerisIncidents.id, input.recordId), eq(nerisIncidents.tenantId, tenantId)),
    });
    if (!incident) return [];
    const narrative = await tx.query.nerisIncidentNarratives.findFirst({
      where: eq(nerisIncidentNarratives.incidentId, incident.id),
    });
    return [
      {
        fieldId: "incident_number",
        category: "dispatch",
        label: "Incident number",
        classification: "INTERNAL" as const,
        value: incident.incidentNumber,
      },
      {
        fieldId: "status",
        category: "disposition",
        label: "Status",
        classification: "INTERNAL" as const,
        value: incident.status,
      },
      {
        fieldId: "alarm_at",
        category: "datetime",
        label: "Alarm time",
        classification: "INTERNAL" as const,
        value: incident.alarmAt?.toISOString?.() ?? incident.alarmAt,
      },
      {
        fieldId: "existing_narrative",
        category: "officer_notes",
        label: "Existing narrative",
        classification: "INTERNAL" as const,
        value: narrative?.body ?? input.existingNarrative ?? null,
      },
    ];
  }

  private async assertQuotas(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    input: CreateAiNarrativeRequest,
    policy: typeof aiNarrativePolicies.$inferSelect,
  ): Promise<void> {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    // Count in-process to avoid driver Date serialization issues with timestamptz binds.
    const tenantRequests = await tx
      .select({
        createdAt: aiNarrativeRequests.createdAt,
        requestedByUserId: aiNarrativeRequests.requestedByUserId,
        recordType: aiNarrativeRequests.recordType,
        recordId: aiNarrativeRequests.recordId,
      })
      .from(aiNarrativeRequests)
      .where(eq(aiNarrativeRequests.tenantId, tenantId));

    const monthCount = tenantRequests.filter((row) => row.createdAt >= monthStart).length;
    if (monthCount >= policy.monthlyRequestQuota) {
      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.QuotaExceeded,
        tenantId,
        product: input.product,
        outcome: "monthly",
      });
      throw new ForgeError("RATE_LIMITED", "Monthly tenant AI narrative quota exceeded");
    }

    const dayCount = tenantRequests.filter(
      (row) => row.requestedByUserId === userId && row.createdAt >= dayStart,
    ).length;
    if (dayCount >= policy.dailyUserQuota) {
      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.QuotaExceeded,
        tenantId,
        product: input.product,
        outcome: "daily_user",
      });
      throw new ForgeError("RATE_LIMITED", "Daily user AI narrative quota exceeded");
    }

    const recordCount = tenantRequests.filter(
      (row) => row.recordType === input.recordType && row.recordId === input.recordId,
    ).length;
    if (recordCount >= policy.perRecordLimit) {
      emitAiNarrativeMetric({
        metric: AI_NARRATIVE_METRICS.QuotaExceeded,
        tenantId,
        product: input.product,
        outcome: "per_record",
      });
      throw new ForgeError("RATE_LIMITED", "Per-record AI narrative generation limit exceeded");
    }
  }

  private async failRequest(
    tx: DatabaseTransaction,
    requestId: string,
    code: string,
    summary: string,
  ) {
    await tx
      .update(aiNarrativeRequests)
      .set({
        status: "FAILED",
        failureCode: code,
        failureSummary: summary,
        failedAt: new Date(),
      })
      .where(eq(aiNarrativeRequests.id, requestId));
  }

  private async loadRequestBundle(tx: DatabaseTransaction, tenantId: string, requestId: string) {
    const request = await tx.query.aiNarrativeRequests.findFirst({
      where: and(eq(aiNarrativeRequests.id, requestId), eq(aiNarrativeRequests.tenantId, tenantId)),
    });
    if (!request) throw new ForgeError("NOT_FOUND", "AI narrative request not found");
    const sources = await tx.query.aiNarrativeSources.findMany({
      where: and(
        eq(aiNarrativeSources.requestId, requestId),
        eq(aiNarrativeSources.tenantId, tenantId),
      ),
    });
    const drafts = await tx.query.aiNarrativeDrafts.findMany({
      where: and(
        eq(aiNarrativeDrafts.requestId, requestId),
        eq(aiNarrativeDrafts.tenantId, tenantId),
      ),
      orderBy: (t, { desc }) => [desc(t.version)],
    });
    return {
      request,
      sources,
      drafts,
      requiredWarning:
        "AI-generated content may be incomplete or inaccurate. Review and verify every statement before saving or submitting this record.",
      humanReviewRequired: true,
    };
  }

  private async writeAiAudit(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      userId: string;
      product: string;
      module?: string | null;
      recordType?: string | null;
      recordId?: string | null;
      requestId?: string | null;
      action: string;
      correlationId: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.insert(aiNarrativeAuditEvents).values({
      id: createId(),
      tenantId: input.tenantId,
      userId: input.userId,
      product: input.product,
      module: input.module ?? null,
      recordType: input.recordType ?? null,
      recordId: input.recordId ?? null,
      requestId: input.requestId ?? null,
      action: input.action,
      correlationId: input.correlationId,
      metadataJson: input.metadata,
    });
  }

  private async resolveFlag(
    tenantId: string,
    key: string,
    fallbackDefault: boolean,
  ): Promise<boolean> {
    return withTenantTransaction(this.db, tenantId, async (tx) =>
      this.resolveFlagInTx(tx, tenantId, key, fallbackDefault),
    );
  }

  private async resolveFlagInTx(
    tx: DatabaseTransaction,
    tenantId: string,
    key: string,
    fallbackDefault: boolean,
  ): Promise<boolean> {
    const def = await tx.query.featureDefinitions.findFirst({
      where: eq(featureDefinitions.key, key),
    });
    if (!def) return fallbackDefault;
    const tenantOv = await tx.query.featureOverrides.findFirst({
      where: and(
        eq(featureOverrides.tenantId, tenantId),
        eq(featureOverrides.featureDefinitionId, def.id),
        isNull(featureOverrides.organizationId),
        isNull(featureOverrides.userId),
      ),
    });
    const value = resolveFeatureValue({
      tenant: tenantOv?.valueJson as unknown,
      defaultValue: def.defaultValueJson as unknown,
    });
    return value === true;
  }
}
