import {
  aiNarrativeStructuredResponseSchema,
  type AiNarrativeStructuredResponse,
  type AiSourceManifest,
} from "@forge/ai-contracts";

export type ValidationResult =
  | { ok: true; structured: AiNarrativeStructuredResponse; unsupportedClaims: string[] }
  | { ok: false; reasonCode: string; message: string; details?: unknown };

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as unknown;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in provider response");
  return JSON.parse(match[0]) as unknown;
}

/**
 * Deterministic validation pass — schema + unsupported-claim heuristics.
 * A second generative call is never the only validator.
 */
export function validateProviderNarrative(
  rawText: string,
  manifest: AiSourceManifest,
): ValidationResult {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(rawText);
  } catch (error) {
    return {
      ok: false,
      reasonCode: "INVALID_PROVIDER_JSON",
      message: error instanceof Error ? error.message : "Invalid provider JSON",
    };
  }

  const structuredResult = aiNarrativeStructuredResponseSchema.safeParse(parsed);
  if (!structuredResult.success) {
    return {
      ok: false,
      reasonCode: "SCHEMA_MISMATCH",
      message: "Provider response did not match required narrative schema",
      details: structuredResult.error.flatten(),
    };
  }

  const structured = structuredResult.data;
  const allowedTokens = new Set<string>();
  for (const field of manifest.fields) {
    if (!field.included || field.redacted) continue;
    if (field.valuePreview) {
      for (const token of field.valuePreview.split(/\W+/).filter((t) => t.length > 3)) {
        allowedTokens.add(token.toLowerCase());
      }
    }
    allowedTokens.add(field.label.toLowerCase());
  }

  const unsupportedClaims = [...structured.unsupportedClaims];
  // Heuristic: flag long capitalized proper-noun-like tokens not present in sources.
  const properNouns = structured.narrative.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
  for (const noun of properNouns) {
    if (!allowedTokens.has(noun.toLowerCase()) && !["The", "This", "That", "Unit"].includes(noun)) {
      // Soft signal only — surfaced to reviewer, does not auto-reject alone.
      if (!unsupportedClaims.includes(noun)) {
        unsupportedClaims.push(`Possible unsupported proper noun: ${noun}`);
      }
    }
  }

  if (!structured.qualityChecks.factsOnly) {
    return {
      ok: false,
      reasonCode: "FACTS_ONLY_FAILED",
      message: "Provider marked factsOnly=false",
    };
  }

  return {
    ok: true,
    structured: { ...structured, unsupportedClaims },
    unsupportedClaims,
  };
}
