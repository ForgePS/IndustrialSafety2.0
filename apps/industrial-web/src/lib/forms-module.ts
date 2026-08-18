/** Forms module — extract fillable fields from definitions and normalize answers. */

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "email"
  | "tel"
  | "select"
  | "checkbox"
  | "radio";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  options?: string[];
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
    description: "Complete a form and submit it to the tenant record.",
  },
  submissions: {
    label: "Submissions",
    description: "Completed form records, filterable by template.",
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
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fieldType(raw: unknown): FormFieldType {
  const key = String(raw ?? "text").trim().toLowerCase();
  return TYPE_MAP[key] ?? "text";
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
    return { id: `field-${index}`, label: raw.trim(), type: "text" };
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
  const field: FormField = {
    id: id || `field-${index}`,
    label: label || id,
    type: fieldType(rec.type ?? rec.inputType ?? rec.fieldType),
  };
  if (required) field.required = true;
  if (options) field.options = options;
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
  return fields.length > 0 ? fields : DEFAULT_FIELDS;
}

export function parseFormFieldsInput(raw: string): FormField[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [labelPart, typePart, ...rest] = line.split("|").map((part) => part.trim());
      const label = labelPart || `Field ${index + 1}`;
      const type = fieldType(typePart);
      const options = optionList(rest.join("|"));
      return {
        id: `field-${index + 1}`,
        label,
        type,
        ...(options ? { options } : {}),
      };
    });
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
