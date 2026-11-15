/** Shared AI narrative permissions (tenant-scoped unless noted). */
export const AI_NARRATIVE_PERMISSIONS = [
  "ai.narrative.use",
  "ai.narrative.generate",
  "ai.narrative.rewrite",
  "ai.narrative.review",
  "ai.narrative.accept",
  "ai.narrative.reject",
  "ai.narrative.configure",
  "ai.narrative.view_audit",
  "ai.narrative.view_usage",
  "ai.narrative.manage_templates",
  "ai.narrative.use_sensitive_data",
  "ai.narrative.override_warning",
] as const;

export type AiNarrativePermission = (typeof AI_NARRATIVE_PERMISSIONS)[number];

export const RMS_AI_NARRATIVE_PERMISSIONS = [
  "rms.incident.ai_narrative.generate",
  "rms.incident.ai_narrative.accept",
] as const;

export const INDUSTRIAL_AI_NARRATIVE_PERMISSIONS = [
  "industrial.incident.ai_narrative.generate",
  "industrial.investigation.ai_narrative.generate",
] as const;

export const ACADEMY_AI_NARRATIVE_PERMISSIONS = [
  "academy.evaluation.ai_narrative.generate",
] as const;

/** Creator / platform AI management permissions. */
export const PLATFORM_AI_NARRATIVE_PERMISSIONS = [
  "platform.ai.narrative.manage",
  "platform.ai.provider.manage",
  "platform.ai.policy.manage",
  "platform.ai.usage.view",
] as const;

export const ALL_AI_NARRATIVE_PERMISSIONS = [
  ...AI_NARRATIVE_PERMISSIONS,
  ...RMS_AI_NARRATIVE_PERMISSIONS,
  ...INDUSTRIAL_AI_NARRATIVE_PERMISSIONS,
  ...ACADEMY_AI_NARRATIVE_PERMISSIONS,
  ...PLATFORM_AI_NARRATIVE_PERMISSIONS,
] as const;
