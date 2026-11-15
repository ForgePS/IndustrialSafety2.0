import type { AiNarrativeRequestType, AiSourceManifest } from "@forge/ai-contracts";
import { ANTI_HALLUCINATION_RULES } from "@forge/ai-policy";

export type PromptBundle = {
  templateKey: string;
  templateVersion: string;
  systemPrompt: string;
  userPrompt: string;
};

const RESPONSE_SCHEMA_INSTRUCTIONS = `Respond with JSON only matching:
{
  "narrative": "...",
  "missingInformation": [],
  "conflicts": [],
  "warnings": [],
  "unsupportedClaims": [],
  "sourceReferences": [],
  "qualityChecks": {
    "chronological": true,
    "clear": true,
    "professional": true,
    "factsOnly": true
  }
}`;

export function buildNarrativePrompts(input: {
  requestType: AiNarrativeRequestType;
  product: string;
  tone: string;
  detailLevel: string;
  manifest: AiSourceManifest;
  existingNarrative?: string | null;
}): PromptBundle {
  const included = input.manifest.fields.filter((f) => f.included && !f.redacted);
  const facts = included
    .map((f) => `- ${f.label} (${f.fieldId}): ${f.valuePreview ?? "[present]"}`)
    .join("\n");

  const systemPrompt = [
    "You are the Forge Platform AI Narrative Assistant — a drafting aid only.",
    "You never approve, finalize, submit to NERIS, submit an ePCR, or replace human judgment.",
    "You never fabricate facts or add unsupported details.",
    ...ANTI_HALLUCINATION_RULES,
    RESPONSE_SCHEMA_INSTRUCTIONS,
  ].join("\n");

  const userPrompt = [
    `Product: ${input.product}`,
    `Mode: ${input.requestType}`,
    `Tone: ${input.tone}`,
    `Detail: ${input.detailLevel}`,
    `Record: ${input.manifest.recordType} ${input.manifest.recordId}`,
    "Authorized source facts:",
    facts || "(no includable fields)",
    input.existingNarrative
      ? `Existing narrative to improve:\n${input.existingNarrative}`
      : "No existing narrative provided.",
    "Produce a draft narrative using only the authorized facts.",
  ].join("\n\n");

  return {
    templateKey: `system.${input.product.toLowerCase()}.${input.requestType.toLowerCase()}`,
    templateVersion: "1",
    systemPrompt,
    userPrompt,
  };
}
