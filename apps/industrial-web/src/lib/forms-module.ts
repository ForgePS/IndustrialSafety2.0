import {
  isProducersMvrConsentForm,
  PRODUCERS_MVR_POLICY_FIELD_ID,
  PRODUCERS_MVR_POLICY_TEXT,
} from "./producers-mvr-policy";
import { US_STATE_SELECT_OPTIONS, normalizeUsStateSelectValue } from "./us-states";

export const ISSUING_STATE_FIELD_ID = "license-issuing-state";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "email"
  | "tel"
  | "select"
  | "checkbox"
  | "radio"
  | "signature"
  | "content";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
  /** Static policy / instructions shown in the fill UI (not submitted). */
  content?: string;
};

export type FormTabId = "library" | "fill" | "submissions";

export const FORM_TABS: ReadonlyArray<{ id: FormTabId; label: string }> = [
  { id: "library", label: "Forms" },
  { id: "fill", label: "Fill out" },
  { id: "submissions", label: "Submissions" },
];

export const FORM_TAB_META: Record<FormTabId, { label: string; description: string }> = {
  library: {
    label: "Forms",
    description: "Form templates you can fill out, including imported definitions.",
  },
  fill: {
    label: "Fill out",
    description: "Complete a form or edit an existing submission.",
  },
  submissions: {
    label: "Submissions",
    description: "Saved form records — open any row to edit and re-save.",
  },
};

export const FORMS_API = "/api/v1/industrial/forms";
export const FORM_SUBMISSIONS_API = "/api/v1/industrial/form-submissions";

const DEFAULT_FIELDS: FormField[] = [
  { id: "submittedBy", label: "Submitted by", type: "text", required: true },
  { id: "location", label: "Location", type: "text" },
  { id: "recordDate", label: "Date", type: "date", required: true },
  { id: "notes", label: "Notes", type: "textarea" },
];

const TYPE_MAP: Record<string, FormFieldType> = {
  text: "text",
  string: "text",
  input: "text",
  textarea: "textarea",
  longtext: "textarea",
  notes: "textarea",
  number: "number",
  integer: "number",
  date: "date",
  datetime: "date",
  email: "email",
  tel: "tel",
  phone: "tel",
  select: "select",
  dropdown: "select",
  checkbox: "checkbox",
  boolean: "checkbox",
  radio: "radio",
  signature: "signature",
  signaturepad: "signature",
  sign: "signature",
  draw: "signature",
  ink: "signature",
  content: "content",
  html: "content",
  static: "content",
  info: "content",
  instructions: "content",
};

/** Labels that mean a drawable signature pad (not "signature date"). */
export function isSignatureLabel(label: string): boolean {
  const text = label.trim();
  if (text === "") return false;
  if (/\bsignature\s*date\b/i.test(text)) return false;
  if (/\bdate\s*(of\s+)?signature\b/i.test(text)) return false;
  return /\bsignature\b/i.test(text) || /^sign(\s+here)?$/i.test(text);
}

function fieldType(raw: unknown, label = ""): FormFieldType {
  const key = String(raw ?? "").trim().toLowerCase();
  const mapped = key ? TYPE_MAP[key] : undefined;
  // Explicit non-text types win. Plain "text"/blank still upgrades when the
  // label is clearly a signature capture field.
  if (mapped && mapped !== "text") return mapped;
  if (isSignatureLabel(label)) return "signature";
  return mapped ?? "text";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionList(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const options = raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const rec = asRecord(item);
        return String(rec?.label ?? rec?.value ?? rec?.name ?? "").trim();
      })
      .filter(Boolean);
    return options.length ? options : undefined;
  }
  if (typeof raw === "string" && raw.trim()) {
    const options = raw
      .split(/[\n,|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    return options.length ? options : undefined;
  }
  return undefined;
}

function normalizeField(raw: unknown, index: number): FormField | null {
  if (typeof raw === "string" && raw.trim()) {
    const label = raw.trim();
    return { id: `field-${index}`, label, type: fieldType(undefined, label) };
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = String(rec.id ?? rec.key ?? rec.name ?? rec.fieldId ?? `field-${index}`).trim();
  const label = String(
    rec.label ?? rec.title ?? rec.question ?? rec.name ?? rec.prompt ?? id,
  ).trim();
  if (!id && !label) return null;
  const required =
    rec.required === true ||
    rec.required === "true" ||
    rec.isRequired === true ||
    rec.mandatory === true;
  const options = optionList(rec.options ?? rec.choices ?? rec.values);
  const declaredType = rec.type ?? rec.inputType ?? rec.fieldType;
  // Explicit date/datetime wins over a "Signature date" label heuristic.
  const declaredKey = String(declaredType ?? "").trim().toLowerCase();
  const type =
    declaredKey === "date" || declaredKey === "datetime"
      ? ("date" as const)
      : fieldType(declaredType, label);
  const field: FormField = {
    id: id || `field-${index}`,
    label: label || id,
    type,
  };
  if (required) field.required = true;
  if (options) field.options = options;
  if (type === "content") {
    const content = String(
      rec.content ?? rec.body ?? rec.html ?? rec.placeholder ?? rec.text ?? "",
    ).trim();
    if (content) field.content = content;
  }
  return field;
}

function collectFieldArrays(root: unknown): unknown[] {
  const rec = asRecord(root);
  if (!rec) return [];
  const buckets = [
    rec.fields,
    rec.questions,
    rec.formFields,
    rec.items,
    rec.elements,
    rec.schema,
  ];
  const out: unknown[] = [];
  for (const bucket of buckets) {
    if (Array.isArray(bucket)) out.push(...bucket);
    const nested = asRecord(bucket);
    if (nested && Array.isArray(nested.fields)) out.push(...nested.fields);
    if (nested && Array.isArray(nested.questions)) out.push(...nested.questions);
  }
  if (Array.isArray(rec.sections)) {
    for (const section of rec.sections) {
      const sec = asRecord(section);
      if (sec && Array.isArray(sec.fields)) out.push(...sec.fields);
      if (sec && Array.isArray(sec.questions)) out.push(...sec.questions);
    }
  }
  return out;
}

export function extractFormFields(definition: Record<string, unknown>): FormField[] {
  const sources = [
    definition.schemaJson,
    definition.schema,
    definition.sourcePayload,
    definition,
  ];
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const source of sources) {
    for (const [index, raw] of collectFieldArrays(source).entries()) {
      const field = normalizeField(raw, index);
      if (!field || seen.has(field.id)) continue;
      seen.add(field.id);
      fields.push(field);
    }
    if (fields.length > 0) break;
  }
  const base = fields.length > 0 ? fields : DEFAULT_FIELDS;
  return applyIssuingStateDropdown(applyProducersMvrPolicy(base, definition));
}

function isIssuingStateField(field: FormField): boolean {
  if (field.id === ISSUING_STATE_FIELD_ID) return true;
  return /^issuing\s+state$/i.test(field.label.trim());
}

/** Force Issuing State fields to a 50-state dropdown. */
export function applyIssuingStateDropdown(fields: FormField[]): FormField[] {
  return fields.map((field) => {
    if (!isIssuingStateField(field)) return field;
    return {
      ...field,
      type: "select",
      options: [...US_STATE_SELECT_OPTIONS],
    };
  });
}

/** Ensure the PRM MVR consent policy block is always present with hardcoded text. */
export function applyProducersMvrPolicy(
  fields: FormField[],
  definition: Record<string, unknown>,
): FormField[] {
  if (!isProducersMvrConsentForm(definition)) return fields;
  let found = false;
  const next = fields.map((field) => {
    const isPolicy =
      field.id === PRODUCERS_MVR_POLICY_FIELD_ID ||
      /\bpolicy\b/i.test(field.label) ||
      /\bemployee agreement\b/i.test(field.label);
    if (!isPolicy) return field;
    found = true;
    return {
      ...field,
      type: "content" as const,
      label: field.label || "Policy & Employee Agreement",
      content: PRODUCERS_MVR_POLICY_TEXT,
    };
  });
  if (found) return next;
  return [
    {
      id: PRODUCERS_MVR_POLICY_FIELD_ID,
      label: "Policy & Employee Agreement",
      type: "content",
      content: PRODUCERS_MVR_POLICY_TEXT,
    },
    ...next,
  ];
}

export function parseFormFieldsInput(raw: string): FormField[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelPart, typePart, ...rest] = line.split("|").map((part) => part.trim());
      const label = labelPart || `Field ${index + 1}`;
      const type = fieldType(typePart, label);
      const options = optionList(rest.join("|"));
      return {
        id: `field-${index + 1}`,
        label,
        type,
        ...(options ? { options } : {}),
      };
    });
}

/** Hydrate pad/input state from a stored submission answers object. */
export function hydrateFormAnswers(
  answers: unknown,
  fields: readonly FormField[],
): Record<string, string> {
  const source = asRecord(answers) ?? {};
  const next: Record<string, string> = {};
  const ids = new Set(fields.map((field) => field.id));
  for (const field of fields) {
    const raw = source[field.id];
    if (field.type === "checkbox") {
      next[field.id] = raw === true || raw === "true" || raw === 1 || raw === "1" ? "true" : "";
      continue;
    }
    if (raw == null) {
      next[field.id] = "";
      continue;
    }
    const asText = String(raw);
    next[field.id] =
      field.type === "select" && isIssuingStateField(field)
        ? normalizeUsStateSelectValue(asText)
        : asText;
  }
  // Keep extra keys from imported submissions whose schema drifted.
  for (const [key, raw] of Object.entries(source)) {
    if (ids.has(key) || raw == null) continue;
    next[key] = typeof raw === "boolean" ? (raw ? "true" : "") : String(raw);
  }
  return next;
}

/** Build the API answers payload from fill-form state. */
export function buildFormAnswersPayload(
  answers: Record<string, string>,
  fields: readonly FormField[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "content") continue;
    const value = answers[field.id];
    if (field.type === "checkbox") {
      payload[field.id] = value === "true";
      continue;
    }
    if (value?.trim()) payload[field.id] = value.trim();
  }
  return payload;
}

export function formStatusBadgeClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "SUBMITTED" || normalized === "COMPLETED" || normalized === "ACTIVE") {
    return "bg-label-success";
  }
  if (normalized === "DRAFT") return "bg-label-warning";
  if (normalized === "ARCHIVED") return "bg-label-secondary";
  return "bg-label-info";
}

export function parseFormTab(raw: string | null | undefined): FormTabId {
  if (raw === "fill" || raw === "submissions" || raw === "library") return raw;
  return "library";
}
