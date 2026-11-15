import type { AiDataClassification, AiSourceManifest } from "@forge/ai-contracts";
import { isSensitiveKey } from "@forge/security";

const BLOCKED_FIELD_PATTERNS =
  /(ssn|social_security|password|secret|token|authorization|cookie|driver_license|bank_account|routing_number|full_dob|date_of_birth|fema_sid)/i;

export type RedactionResult = {
  manifest: AiSourceManifest;
  redactedFieldIds: string[];
  blockedFieldIds: string[];
  /** Safe for audit — never includes removed values. */
  auditSummary: {
    redactedCount: number;
    blockedCount: number;
    fieldIds: string[];
  };
};

export function shouldBlockField(fieldId: string, classification: AiDataClassification): boolean {
  if (classification === "RESTRICTED") return true;
  return BLOCKED_FIELD_PATTERNS.test(fieldId) || isSensitiveKey(fieldId);
}

/**
 * Removes or masks sensitive fields before provider invocation.
 * Never returns or logs the original restricted values.
 */
export function redactSourceManifest(
  manifest: AiSourceManifest,
  options: { allowRestricted: boolean } = { allowRestricted: false },
): RedactionResult {
  const redactedFieldIds: string[] = [];
  const blockedFieldIds: string[] = [];

  const fields = manifest.fields.map((field) => {
    const blocked = shouldBlockField(field.fieldId, field.classification);
    if (blocked && !(options.allowRestricted && field.classification === "RESTRICTED")) {
      blockedFieldIds.push(field.fieldId);
      return {
        ...field,
        included: false,
        redacted: true,
        valuePreview: undefined,
      };
    }
    if (field.redacted || (field.classification === "CONFIDENTIAL" && field.valuePreview)) {
      redactedFieldIds.push(field.fieldId);
      return {
        ...field,
        redacted: true,
        valuePreview: field.included ? "[REDACTED]" : undefined,
      };
    }
    return field;
  });

  const excludedFieldIds = [
    ...new Set([...manifest.excludedFieldIds, ...blockedFieldIds, ...redactedFieldIds]),
  ];

  return {
    manifest: { ...manifest, fields, excludedFieldIds },
    redactedFieldIds,
    blockedFieldIds,
    auditSummary: {
      redactedCount: redactedFieldIds.length,
      blockedCount: blockedFieldIds.length,
      fieldIds: [...new Set([...redactedFieldIds, ...blockedFieldIds])],
    },
  };
}
