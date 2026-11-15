import { createHash } from "node:crypto";
import type { AiDataClassification, AiSourceManifest } from "@forge/ai-contracts";

export type SourceFieldInput = {
  fieldId: string;
  category: string;
  label: string;
  classification: AiDataClassification;
  value: unknown;
  include?: boolean;
};

export type AssembleSourceInput = {
  recordType: string;
  recordId: string;
  fields: SourceFieldInput[];
  includeCategories?: string[];
  excludeCategories?: string[];
};

function previewValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Builds an explicit source manifest of fields supplied to the AI pipeline.
 * Callers must already authorize the user to view the source record.
 */
export function assembleSourceManifest(input: AssembleSourceInput): AiSourceManifest {
  const include = new Set(input.includeCategories ?? []);
  const exclude = new Set(input.excludeCategories ?? []);
  const useIncludeFilter = include.size > 0;

  const fields = input.fields.map((field) => {
    const categoryBlocked = exclude.has(field.category);
    const categoryAllowed = !useIncludeFilter || include.has(field.category);
    const included = (field.include ?? true) && categoryAllowed && !categoryBlocked;
    return {
      fieldId: field.fieldId,
      category: field.category,
      label: field.label,
      classification: field.classification,
      included,
      redacted: false,
      valuePreview: included ? previewValue(field.value) : undefined,
    };
  });

  const excludedFieldIds = fields.filter((f) => !f.included).map((f) => f.fieldId);
  const hashPayload = JSON.stringify({
    recordType: input.recordType,
    recordId: input.recordId,
    fields: fields.map((f) => ({
      fieldId: f.fieldId,
      included: f.included,
      classification: f.classification,
      valuePreview: f.valuePreview,
    })),
  });
  const sourceHash = createHash("sha256").update(hashPayload).digest("hex");

  return {
    recordType: input.recordType,
    recordId: input.recordId,
    fields,
    excludedFieldIds,
    sourceHash,
  };
}

/** RMS incident categories permitted for narrative drafting (never auto-includes restricted PII). */
export const RMS_INCIDENT_SOURCE_CATEGORIES = [
  "dispatch",
  "datetime",
  "location",
  "incident_type",
  "units_dispatched",
  "units_responding",
  "personnel",
  "arrival_conditions",
  "actions_taken",
  "property",
  "apparatus",
  "water_supply",
  "fire_control",
  "patient_count_summary",
  "hazards",
  "exposures",
  "mutual_aid",
  "weather",
  "officer_notes",
  "cad_timeline",
  "review_corrections",
  "disposition",
] as const;
