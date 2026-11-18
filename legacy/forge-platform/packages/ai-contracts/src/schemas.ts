import { z } from "zod";
import {
  AI_DATA_CLASSIFICATIONS,
  AI_NARRATIVE_PRODUCTS,
  AI_NARRATIVE_REQUEST_TYPES,
} from "./enums.js";

export const aiNarrativeQualityChecksSchema = z.object({
  chronological: z.boolean(),
  clear: z.boolean(),
  professional: z.boolean(),
  factsOnly: z.boolean(),
});

export const aiNarrativeStructuredResponseSchema = z.object({
  narrative: z.string().min(1),
  missingInformation: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
  sourceReferences: z.array(z.string()).default([]),
  qualityChecks: aiNarrativeQualityChecksSchema,
});

export type AiNarrativeStructuredResponse = z.infer<typeof aiNarrativeStructuredResponseSchema>;

export const aiSourceFieldSchema = z.object({
  fieldId: z.string().min(1).max(200),
  category: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  classification: z.enum(AI_DATA_CLASSIFICATIONS),
  included: z.boolean(),
  redacted: z.boolean().default(false),
  valuePreview: z.string().max(500).optional(),
});

export const aiSourceManifestSchema = z.object({
  recordType: z.string().min(1).max(120),
  recordId: z.string().uuid(),
  fields: z.array(aiSourceFieldSchema),
  excludedFieldIds: z.array(z.string()).default([]),
  sourceHash: z.string().min(8).max(128),
});

export type AiSourceManifest = z.infer<typeof aiSourceManifestSchema>;

export const createAiNarrativeRequestSchema = z.object({
  product: z.enum(AI_NARRATIVE_PRODUCTS),
  module: z.string().min(1).max(64),
  recordType: z.string().min(1).max(120),
  recordId: z.string().uuid(),
  requestType: z.enum(AI_NARRATIVE_REQUEST_TYPES),
  tone: z.enum(["NEUTRAL", "FORMAL", "CONCISE", "DETAILED"]).default("NEUTRAL"),
  detailLevel: z.enum(["BRIEF", "STANDARD", "DETAILED"]).default("STANDARD"),
  includeCategories: z.array(z.string().max(120)).default([]),
  excludeCategories: z.array(z.string().max(120)).default([]),
  existingNarrative: z.string().max(50_000).optional().nullable(),
  templateKey: z.string().max(120).optional().nullable(),
  acknowledgeWarning: z.literal(true),
  authorizeSensitiveData: z.boolean().default(false),
  businessPurpose: z.string().max(2000).optional().nullable(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  /** Optional explicit source facts (synthetic/acceptance). Never include restricted values. */
  sourceFacts: z
    .array(
      z.object({
        fieldId: z.string().min(1).max(200),
        category: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        classification: z.enum(AI_DATA_CLASSIFICATIONS).default("INTERNAL"),
        value: z.unknown().optional(),
        include: z.boolean().default(true),
      }),
    )
    .max(200)
    .optional(),
});

export type CreateAiNarrativeRequest = z.infer<typeof createAiNarrativeRequestSchema>;

export const acceptAiNarrativeSchema = z.object({
  draftId: z.string().uuid(),
  mode: z.enum(["ACCEPT_ALL", "PARTIAL"]).default("ACCEPT_ALL"),
  selectedSections: z.array(z.string().max(200)).default([]),
  insertIntoRecord: z.boolean().default(false),
  feedback: z.string().max(4000).optional().nullable(),
});

export const rejectAiNarrativeSchema = z.object({
  draftId: z.string().uuid(),
  reason: z.string().min(1).max(4000),
  feedback: z.string().max(4000).optional().nullable(),
});

export const aiNarrativeProviderRequestSchema = z.object({
  requestId: z.string().uuid(),
  tenantId: z.string().uuid(),
  product: z.enum(AI_NARRATIVE_PRODUCTS),
  requestType: z.enum(AI_NARRATIVE_REQUEST_TYPES),
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  sourceManifest: aiSourceManifestSchema,
  maxOutputTokens: z.number().int().positive().max(8000).default(2000),
  temperature: z.number().min(0).max(1).default(0.2),
  correlationId: z.string().min(1).max(128),
});

export type AiNarrativeProviderRequest = z.infer<typeof aiNarrativeProviderRequestSchema>;

export const aiNarrativeProviderResponseSchema = z.object({
  provider: z.string().min(1).max(64),
  modelId: z.string().min(1).max(200),
  rawText: z.string().min(1),
  structured: aiNarrativeStructuredResponseSchema.optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export type AiNarrativeProviderResponse = z.infer<typeof aiNarrativeProviderResponseSchema>;
