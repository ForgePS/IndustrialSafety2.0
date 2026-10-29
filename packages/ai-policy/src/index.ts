import type { AiDataClassification } from "@forge/ai-contracts";

export type ClassificationGateInput = {
  classification: AiDataClassification;
  tenantAllowsConfidential: boolean;
  tenantAllowsRestricted: boolean;
  hasSensitivePermission: boolean;
  authorizeSensitiveData: boolean;
  businessPurpose?: string | null;
};

export type ClassificationGateResult =
  { allowed: true } | { allowed: false; reasonCode: string; message: string };

/**
 * Default policy: PUBLIC/INTERNAL permitted; CONFIDENTIAL requires tenant policy;
 * RESTRICTED blocked unless explicitly authorized.
 */
export function evaluateClassificationGate(
  input: ClassificationGateInput,
): ClassificationGateResult {
  switch (input.classification) {
    case "PUBLIC":
    case "INTERNAL":
      return { allowed: true };
    case "CONFIDENTIAL":
      if (!input.tenantAllowsConfidential) {
        return {
          allowed: false,
          reasonCode: "CONFIDENTIAL_POLICY_REQUIRED",
          message: "Confidential data requires an approved tenant AI policy",
        };
      }
      return { allowed: true };
    case "RESTRICTED":
      if (!input.tenantAllowsRestricted) {
        return {
          allowed: false,
          reasonCode: "RESTRICTED_BLOCKED",
          message: "Restricted data is blocked by default for AI narratives",
        };
      }
      if (!input.hasSensitivePermission) {
        return {
          allowed: false,
          reasonCode: "SENSITIVE_PERMISSION_REQUIRED",
          message: "Missing ai.narrative.use_sensitive_data permission",
        };
      }
      if (!input.authorizeSensitiveData) {
        return {
          allowed: false,
          reasonCode: "SENSITIVE_CONFIRMATION_REQUIRED",
          message: "Human confirmation is required to send restricted data",
        };
      }
      if (!input.businessPurpose?.trim()) {
        return {
          allowed: false,
          reasonCode: "BUSINESS_PURPOSE_REQUIRED",
          message: "Documented business purpose is required for restricted data",
        };
      }
      return { allowed: true };
    default:
      return {
        allowed: false,
        reasonCode: "UNKNOWN_CLASSIFICATION",
        message: "Unknown data classification",
      };
  }
}

export const ANTI_HALLUCINATION_RULES = [
  "Use only supplied facts.",
  "Do not infer names, measurements, causes, outcomes, or actions.",
  "Do not state that an action occurred unless supported by source data.",
  "Mark missing information instead of inventing it.",
  "Identify conflicting information.",
  "Preserve uncertainty.",
  "Distinguish observed facts from reported statements.",
  "Do not make a fire-cause determination.",
  "Do not make medical diagnoses.",
  "Do not make legal conclusions.",
  "Do not assign blame.",
] as const;

export const REQUIRED_USER_WARNING =
  "AI-generated content may be incomplete or inaccurate. Review and verify every statement before saving or submitting this record.";
