/** Shared AI Narrative feature flags. All default OFF in seed. */
export const AI_FEATURE_FLAGS = {
  ENABLED: "ai.narrative.enabled",
  RMS: "ai.narrative.rms.enabled",
  INDUSTRIAL: "ai.narrative.industrial.enabled",
  ACADEMY: "ai.narrative.academy.enabled",
  REWRITE: "ai.narrative.rewrite.enabled",
  QUALITY_CHECK: "ai.narrative.quality_check.enabled",
  VOICE_INPUT: "ai.narrative.voice_input.enabled",
  SENSITIVE_DATA: "ai.narrative.sensitive_data.enabled",
  ANALYTICS: "ai.narrative.analytics.enabled",
} as const;

export type AiFeatureFlag = (typeof AI_FEATURE_FLAGS)[keyof typeof AI_FEATURE_FLAGS];

/** Product entitlement / module codes (not auto-granted). */
export const AI_NARRATIVE_ENTITLEMENTS = {
  RMS: "RMS_AI_NARRATIVE",
  INDUSTRIAL: "INDUSTRIAL_AI_NARRATIVE",
  ACADEMY: "ACADEMY_AI_NARRATIVE",
} as const;

export const AI_NARRATIVE_MODULE_CODE = "AI_NARRATIVE" as const;

export const AI_NARRATIVE_PRODUCTS = ["RMS", "INDUSTRIAL", "ACADEMY", "PLATFORM"] as const;
export type AiNarrativeProduct = (typeof AI_NARRATIVE_PRODUCTS)[number];

export const AI_NARRATIVE_REQUEST_TYPES = [
  "GENERATE_FROM_RECORD",
  "IMPROVE_EXISTING",
  "GRAMMAR_AND_CLARITY",
  "EXPAND_BRIEF_NOTES",
  "CONDENSE",
  "PROFESSIONALIZE",
  "ACTIVE_VOICE",
  "TIMELINE_FORMAT",
  "QUALITY_REVIEW",
  "MISSING_INFORMATION_CHECK",
  "CONTRADICTION_CHECK",
] as const;
export type AiNarrativeRequestType = (typeof AI_NARRATIVE_REQUEST_TYPES)[number];

export const AI_NARRATIVE_REQUEST_STATUSES = [
  "PENDING",
  "VALIDATING",
  "REDACTING",
  "GENERATING",
  "VALIDATING_RESPONSE",
  "READY_FOR_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type AiNarrativeRequestStatus = (typeof AI_NARRATIVE_REQUEST_STATUSES)[number];

export const AI_DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;
export type AiDataClassification = (typeof AI_DATA_CLASSIFICATIONS)[number];

export const AI_DRAFT_LABELS = {
  UNREVIEWED: "AI DRAFT — NOT REVIEWED",
  REVIEWED: "AI-ASSISTED — HUMAN REVIEWED",
} as const;

export const AI_NARRATIVE_AUDIT_ACTIONS = [
  "AiNarrativeRequested",
  "AiNarrativeSourcePrepared",
  "AiNarrativeDataRedacted",
  "AiNarrativeGenerated",
  "AiNarrativeGenerationFailed",
  "AiNarrativeViewed",
  "AiNarrativeAccepted",
  "AiNarrativePartiallyAccepted",
  "AiNarrativeRejected",
  "AiNarrativeRegenerated",
  "AiNarrativeInserted",
  "AiNarrativePolicyChanged",
  "AiNarrativeTemplatePublished",
  "AiNarrativeSensitiveDataAuthorized",
] as const;
