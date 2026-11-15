import type {
  AiNarrativeProvider,
  AiNarrativeProviderRequest,
  AiNarrativeStructuredResponse,
  AiSourceManifest,
  CreateAiNarrativeRequest,
} from "@forge/ai-contracts";
import { AI_DRAFT_LABELS } from "@forge/ai-contracts";
import { validateProviderNarrative } from "@forge/ai-evaluation";
import { buildNarrativePrompts } from "@forge/ai-prompts";
import {
  evaluateClassificationGate,
  REQUIRED_USER_WARNING,
  type ClassificationGateInput,
} from "@forge/ai-policy";
import { redactSourceManifest, type RedactionResult } from "@forge/ai-redaction";

export type NarrativePipelineInput = {
  request: CreateAiNarrativeRequest;
  tenantId: string;
  requestId: string;
  correlationId: string;
  provider: AiNarrativeProvider;
  manifest: AiSourceManifest;
  classificationGate: ClassificationGateInput;
  allowRestrictedRedactionBypass?: boolean;
  maxOutputTokens?: number;
};

export type NarrativePipelineSuccess = {
  ok: true;
  redaction: RedactionResult;
  structured: AiNarrativeStructuredResponse;
  unsupportedClaims: string[];
  providerKey: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  draftLabel: typeof AI_DRAFT_LABELS.UNREVIEWED;
  requiredWarning: typeof REQUIRED_USER_WARNING;
  prompts: ReturnType<typeof buildNarrativePrompts>;
};

export type NarrativePipelineFailure = {
  ok: false;
  stage: "CLASSIFICATION" | "PROVIDER" | "VALIDATION";
  reasonCode: string;
  message: string;
  redaction?: RedactionResult;
  details?: unknown;
};

export type NarrativePipelineResult = NarrativePipelineSuccess | NarrativePipelineFailure;

/**
 * Shared generate → redact → prompt → provider → deterministic validate pipeline.
 * Does not persist; callers own DB, audit, quotas, and record locks.
 */
export async function runNarrativeGenerationPipeline(
  input: NarrativePipelineInput,
): Promise<NarrativePipelineResult> {
  const gate = evaluateClassificationGate(input.classificationGate);
  if (!gate.allowed) {
    return {
      ok: false,
      stage: "CLASSIFICATION",
      reasonCode: gate.reasonCode,
      message: gate.message,
    };
  }

  const redaction = redactSourceManifest(input.manifest, {
    allowRestricted: input.allowRestrictedRedactionBypass === true,
  });

  const prompts = buildNarrativePrompts({
    requestType: input.request.requestType,
    product: input.request.product,
    tone: input.request.tone,
    detailLevel: input.request.detailLevel,
    manifest: redaction.manifest,
    existingNarrative: input.request.existingNarrative ?? null,
  });

  const providerRequest: AiNarrativeProviderRequest = {
    requestId: input.requestId,
    tenantId: input.tenantId,
    product: input.request.product,
    requestType: input.request.requestType,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    sourceManifest: redaction.manifest,
    maxOutputTokens: input.maxOutputTokens ?? 2000,
    temperature: 0.2,
    correlationId: input.correlationId,
  };

  let providerResponse;
  try {
    providerResponse = await input.provider.generateNarrative(providerRequest);
  } catch (error) {
    return {
      ok: false,
      stage: "PROVIDER",
      reasonCode: "PROVIDER_FAILURE",
      message: error instanceof Error ? error.message : "Provider invocation failed",
      redaction,
    };
  }

  const validation = validateProviderNarrative(
    providerResponse.structured
      ? JSON.stringify(providerResponse.structured)
      : providerResponse.rawText,
    redaction.manifest,
  );
  if (!validation.ok) {
    return {
      ok: false,
      stage: "VALIDATION",
      reasonCode: validation.reasonCode,
      message: validation.message,
      redaction,
      details: validation.details,
    };
  }

  return {
    ok: true,
    redaction,
    structured: validation.structured,
    unsupportedClaims: validation.unsupportedClaims,
    providerKey: providerResponse.provider,
    modelId: providerResponse.modelId,
    inputTokens: providerResponse.inputTokens ?? 0,
    outputTokens: providerResponse.outputTokens ?? 0,
    latencyMs: providerResponse.latencyMs ?? 0,
    estimatedCostUsd: providerResponse.estimatedCostUsd ?? 0,
    draftLabel: AI_DRAFT_LABELS.UNREVIEWED,
    requiredWarning: REQUIRED_USER_WARNING,
    prompts,
  };
}

/** Record statuses that must not be altered via AI narrative acceptance. */
export const AI_LOCKED_RECORD_STATUSES = new Set([
  "FINALIZED",
  "VOIDED",
  "ARCHIVED",
  "CLOSED",
  "APPROVED",
]);

export function assertRecordAllowsAiMutation(status: string): void {
  if (AI_LOCKED_RECORD_STATUSES.has(status)) {
    throw new Error(`AI_NARRATIVE_RECORD_LOCKED:${status}`);
  }
}
