import type {
  AiNarrativeProvider,
  AiNarrativeProviderRequest,
  AiNarrativeProviderResponse,
  AiProviderSelectionContext,
} from "@forge/ai-contracts";

/**
 * Registry for AI narrative providers. Product code selects via policy —
 * never import Bedrock/OpenAI SDKs from product modules.
 */
export class AiNarrativeProviderRegistry {
  private readonly providers = new Map<string, AiNarrativeProvider>();

  register(provider: AiNarrativeProvider): void {
    this.providers.set(provider.providerKey, provider);
  }

  get(providerKey: string): AiNarrativeProvider | undefined {
    return this.providers.get(providerKey);
  }

  list(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Selection uses explicit providerKey from approved model policy when present.
   * modelPolicyId is not a provider key — callers resolve policy → providerKey first.
   * Fail closed when no provider is registered.
   */
  select(
    context: AiProviderSelectionContext & { providerKey?: string | null },
  ): AiNarrativeProvider | null {
    if (context.providerKey) {
      return this.providers.get(context.providerKey) ?? null;
    }
    // Development/test only: allow stub when explicitly flagged.
    if (context.featureFlags["ai.narrative.stub_provider"] === true) {
      return this.providers.get("stub") ?? null;
    }
    return null;
  }
}

/** Stub provider for local/unit/acceptance tests — never used as a production vendor. */
export class StubAiNarrativeProvider implements AiNarrativeProvider {
  readonly providerKey = "stub";

  async generateNarrative(
    request: AiNarrativeProviderRequest,
  ): Promise<AiNarrativeProviderResponse> {
    const included = request.sourceManifest.fields.filter((f) => f.included && !f.redacted);
    const missingInformation = included
      .filter(
        (f) => !f.valuePreview || f.valuePreview.trim() === "" || f.valuePreview === "[missing]",
      )
      .map((f) => `Missing authorized field: ${f.label} (${f.fieldId})`);

    const byCategory = new Map<string, string[]>();
    for (const field of included) {
      if (!field.valuePreview) continue;
      const list = byCategory.get(field.category) ?? [];
      list.push(field.valuePreview);
      byCategory.set(field.category, list);
    }
    const conflicts: string[] = [];
    for (const [category, values] of byCategory) {
      const unique = [...new Set(values)];
      if (unique.length > 1) {
        conflicts.push(`Conflicting values in ${category}: ${unique.join(" vs ")}`);
      }
    }

    const factLines = included
      .filter((f) => f.valuePreview && f.valuePreview !== "[missing]")
      .map((f) => `${f.label}: ${f.valuePreview}`);

    const narrative = [
      "AI DRAFT — NOT REVIEWED.",
      "Synthetic stub narrative generated from authorized source facts only.",
      ...factLines.map((line) => `- ${line}`),
    ].join("\n");

    const body = {
      narrative,
      missingInformation,
      conflicts,
      warnings: [
        "Stub provider — not for production use",
        ...(conflicts.length > 0 ? ["Source conflicts require officer resolution"] : []),
      ],
      unsupportedClaims: [],
      sourceReferences: included.map((f) => f.fieldId),
      qualityChecks: {
        chronological: true,
        clear: true,
        professional: true,
        factsOnly: true,
      },
    };
    return {
      provider: this.providerKey,
      modelId: "stub-v1",
      rawText: JSON.stringify(body),
      structured: body,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 1,
      estimatedCostUsd: 0,
    };
  }
}

export { validateProviderNarrative } from "@forge/ai-evaluation";
export { redactSourceManifest } from "@forge/ai-redaction";
export { buildNarrativePrompts } from "@forge/ai-prompts";
export {
  evaluateClassificationGate,
  ANTI_HALLUCINATION_RULES,
  REQUIRED_USER_WARNING,
} from "@forge/ai-policy";
export {
  assembleSourceManifest,
  RMS_INCIDENT_SOURCE_CATEGORIES,
  type AssembleSourceInput,
  type SourceFieldInput,
} from "./source-assembler.js";
export {
  runNarrativeGenerationPipeline,
  assertRecordAllowsAiMutation,
  AI_LOCKED_RECORD_STATUSES,
  type NarrativePipelineInput,
  type NarrativePipelineResult,
} from "./pipeline.js";
