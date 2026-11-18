/**
 * Yes / No / N/A checklist fields for Industrial forms (notes required on No).
 */
import type { FormField } from "./forms-module";

export const YES_NO_NA_OPTIONS = ["Yes", "No", "N/A"] as const;
export type YesNoNaAnswer = "YES" | "NO" | "NA";

export function yesNoNotesFieldId(fieldId: string): string {
  return `${fieldId}__notes`;
}

export function normalizeYesNoAnswer(raw: string): YesNoNaAnswer | null {
  const upper = raw.trim().toUpperCase();
  if (upper === "YES" || upper === "Y") return "YES";
  if (upper === "NO" || upper === "N") return "NO";
  if (upper === "NA" || upper === "N/A") return "NA";
  return null;
}

export function formatYesNoAnswer(answer: YesNoNaAnswer): string {
  if (answer === "YES") return "Yes";
  if (answer === "NO") return "No";
  return "N/A";
}

export function isYesNoField(field: FormField): boolean {
  return field.type === "yesno";
}

export function validateYesNoFormFields(
  fields: readonly FormField[],
  answers: Record<string, string>,
): { ok: true } | { ok: false; message: string } {
  for (const field of fields) {
    if (!isYesNoField(field)) continue;
    const answer = normalizeYesNoAnswer(answers[field.id] ?? "");
    if (!answer) {
      return { ok: false, message: `Answer Yes, No, or N/A for “${field.label}”.` };
    }
    if (answer === "NO" && !answers[yesNoNotesFieldId(field.id)]?.trim()) {
      return { ok: false, message: `Add a note for “${field.label}” (answered No).` };
    }
  }
  return { ok: true };
}
