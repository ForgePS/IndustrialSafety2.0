import { apiGet, apiSend } from "@forge/web-kit";
import {
  checklistFileSourceId,
  checklistToImportPayload,
  parseChecklistUploadFile,
} from "./form-checklist-import";
import {
  isYesNoField,
  yesNoNotesFieldId,
  normalizeYesNoAnswer,
  YES_NO_NA_OPTIONS,
} from "./form-yesno";
import {
  isProducersMvrConsentForm,
  PRODUCERS_MVR_POLICY_FIELD_ID,
  PRODUCERS_MVR_POLICY_TEXT,
} from "./producers-mvr-policy";
import { US_STATE_SELECT_OPTIONS, normalizeUsStateSelectValue } from "./us-states";
import { canonicalEmployeeNumber } from "./employee-number";

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
  | "yesno"
  | "content"
  | "label"
  | "location"
  | "employeeNumber";

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
  yesno: "yesno",
  yesnona: "yesno",
  checklist: "yesno",
  content: "content",
  html: "content",
  static: "content",
  info: "content",
  instructions: "content",
  label: "label",
  heading: "label",
  group: "label",
  section: "label",
  "section heading": "label",
  location: "location",
  site: "location",
  facility: "location",
  employeenumber: "employeeNumber",
  employee_number: "employeeNumber",
  "employee number": "employeeNumber",
  "employee #": "employeeNumber",
  empnumber: "employeeNumber",
  emp_number: "employeeNumber",
  personnel: "employeeNumber",
  personnelnumber: "employeeNumber",
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
      label: field.label || "Policy & EMPLOYEE Agreement",
      content: PRODUCERS_MVR_POLICY_TEXT,
    };
  });
  if (found) return next;
  return [
    {
      id: PRODUCERS_MVR_POLICY_FIELD_ID,
      label: "Policy & EMPLOYEE Agreement",
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
      const parts = line.split("|").map((part) => part.trim());
      let cursor = 0;
      let id = `field-${index + 1}`;
      const typeAt = (part: string | undefined) => {
        const key = String(part ?? "").trim().toLowerCase();
        return Boolean(key && TYPE_MAP[key]);
      };
      if (parts.length >= 3 && parts[0] && !typeAt(parts[1])) {
        id = parts[0]!;
        cursor = 1;
      }
      const label = parts[cursor] || `Field ${index + 1}`;
      const typePart = parts[cursor + 1];
      const tail = parts.slice(cursor + 2);
      const required = tail.includes("required");
      const optionSource = tail.filter((part) => part !== "required").join("|");
      const type = fieldType(typePart, label);
      const options = optionList(optionSource);
      const field: FormField = {
        id,
        label,
        type,
      };
      if (required) field.required = true;
      if (options) field.options = options;
      return field;
    });
}

/** Serialize form fields for the template editor (preserves field ids). */
export function formatFormFieldsForEditor(fields: readonly FormField[]): string {
  return fields
    .map((field) => {
      const parts = [field.id, field.label, field.type];
      if (field.required) parts.push("required");
      if (field.options?.length) parts.push(field.options.join(","));
      return parts.join("|");
    })
    .join("\n");
}

export async function fetchFormDefinitionPrintable(formId: string): Promise<{ html: string; title?: string }> {
  return apiGet<{ html: string; title?: string }>(
    `${FORMS_API}/${encodeURIComponent(formId)}/printable`,
  );
}

export async function updateFormDefinition(
  formId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(`${FORMS_API}/${encodeURIComponent(formId)}`, "PATCH", body);
}

export async function archiveFormDefinition(formId: string): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(
    `${FORMS_API}/${encodeURIComponent(formId)}/archive`,
    "POST",
    {},
  );
}

export async function createFormDefinition(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(FORMS_API, "POST", body);
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
    if (isYesNoField(field)) {
      const answer = normalizeYesNoAnswer(String(raw ?? ""));
      next[field.id] = answer ?? "";
      const notesKey = yesNoNotesFieldId(field.id);
      const notesRaw = source[notesKey];
      next[notesKey] = typeof notesRaw === "string" ? notesRaw : "";
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

export function isEmployeeNumberField(field: Pick<FormField, "type" | "id" | "label">): boolean {
  if (field.type === "employeeNumber") return true;
  const id = field.id.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (
    id === "employeenumber" ||
    id === "employee_number" ||
    id === "empnumber" ||
    id === "emp_number" ||
    id === "employee_no"
  ) {
    return true;
  }
  return /\bemployee\s*(#|no\.?|number)\b/i.test(field.label);
}

/**
 * Subject personnel UUID from URL, answers, or a resolved Employee # lookup map.
 * Prefer explicit URL / answers.personnelId, then field lookups.
 */
export function resolveFormSubjectPersonnelId(input: {
  urlPersonnelId?: string | null;
  answers: Record<string, string>;
  fields: readonly FormField[];
  resolvedByFieldId?: Record<string, string | null | undefined>;
}): string | null {
  const fromUrl = (input.urlPersonnelId ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(fromUrl)) return fromUrl;

  const fromAnswers = (input.answers.personnelId ?? input.answers.personnel_id ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(fromAnswers)) return fromAnswers;

  for (const field of input.fields) {
    if (!isEmployeeNumberField(field)) continue;
    const resolved = (input.resolvedByFieldId?.[field.id] ?? "").trim();
    if (/^[0-9a-f-]{36}$/i.test(resolved)) return resolved;
  }
  return null;
}

/** Build the API answers payload from fill-form state. */
export function buildFormAnswersPayload(
  answers: Record<string, string>,
  fields: readonly FormField[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "content" || field.type === "label") continue;
    const value = answers[field.id];
    if (field.type === "checkbox") {
      payload[field.id] = value === "true";
      continue;
    }
    if (isYesNoField(field)) {
      const answer = normalizeYesNoAnswer(value ?? "");
      if (answer) payload[field.id] = answer;
      const notes = answers[yesNoNotesFieldId(field.id)]?.trim();
      if (notes) payload[yesNoNotesFieldId(field.id)] = notes;
      continue;
    }
    if (isEmployeeNumberField(field)) {
      const emp = canonicalEmployeeNumber(value ?? "");
      if (emp) {
        payload[field.id] = emp;
        // Canonical keys so personnel profile subject matching always finds the #.
        payload.employeeNumber = emp;
      }
      continue;
    }
    if (value?.trim()) payload[field.id] = value.trim();
  }
  const personnelId = (answers.personnelId ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(personnelId)) {
    payload.personnelId = personnelId;
  }
  return payload;
}

export function resolveFormLocationLabel(
  siteId: string,
  locations: ReadonlyArray<{ id: string; name: string }>,
): string {
  const trimmed = siteId.trim();
  if (!trimmed) return "";
  return locations.find((site) => site.id === trimmed)?.name ?? trimmed;
}

export function formStatusBadgeClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "SUBMITTED" || normalized === "COMPLETED" || normalized === "ACTIVE") {
    return "bg-label-success";
  }
  if (normalized === "PENDING_SIGNATURE") return "bg-label-warning";
  if (normalized === "DRAFT") return "bg-label-warning";
  if (normalized === "ARCHIVED") return "bg-label-secondary";
  return "bg-label-info";
}

export function parseFormTab(raw: string | null | undefined): FormTabId {
  if (raw === "fill" || raw === "submissions" || raw === "library") return raw;
  return "library";
}

export type FormsSort = "type" | "name" | "updated" | "status";

export const FORMS_SORT_OPTIONS: ReadonlyArray<{ value: FormsSort; label: string }> = [
  { value: "type", label: "Type / category" },
  { value: "name", label: "Name (A–Z)" },
  { value: "updated", label: "Recently updated" },
  { value: "status", label: "Status" },
];

export const DEFAULT_FORMS_SORT: FormsSort = "type";

export function parseFormsSort(raw: string | null | undefined): FormsSort {
  if (raw === "type" || raw === "name" || raw === "updated" || raw === "status") return raw;
  return DEFAULT_FORMS_SORT;
}

/** Human-readable form type used for grouping (category / formKey). */
export function formTypeLabel(row: Record<string, unknown> | null | undefined): string {
  if (!row) return "Uncategorized";
  for (const key of ["category", "formKey", "form_key", "type"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "Uncategorized";
}

function formTitle(row: Record<string, unknown>): string {
  for (const key of ["title", "name", "displayName"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "Untitled form";
}

function formTimestamp(row: Record<string, unknown>): number {
  for (const key of ["updatedAt", "submittedAt", "createdAt"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") {
      const time = Date.parse(value);
      if (!Number.isNaN(time)) return time;
    }
  }
  return 0;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortFormDefinitions(
  rows: readonly Record<string, unknown>[],
  sort: FormsSort,
): Record<string, unknown>[] {
  const next = [...rows];
  next.sort((left, right) => {
    if (sort === "type") {
      const byType = compareText(formTypeLabel(left), formTypeLabel(right));
      if (byType !== 0) return byType;
      return compareText(formTitle(left), formTitle(right));
    }
    if (sort === "name") return compareText(formTitle(left), formTitle(right));
    if (sort === "status") {
      const byStatus = compareText(String(left.status ?? ""), String(right.status ?? ""));
      if (byStatus !== 0) return byStatus;
      return compareText(formTitle(left), formTitle(right));
    }
    // updated — newest first
    const byTime = formTimestamp(right) - formTimestamp(left);
    if (byTime !== 0) return byTime;
    return compareText(formTitle(left), formTitle(right));
  });
  return next;
}

export function sortFormSubmissions(
  rows: readonly Record<string, unknown>[],
  definitionsById: ReadonlyMap<string, Record<string, unknown>>,
  sort: FormsSort,
): Record<string, unknown>[] {
  const next = [...rows];
  next.sort((left, right) => {
    const leftForm = definitionsById.get(String(left.formDefinitionId ?? ""));
    const rightForm = definitionsById.get(String(right.formDefinitionId ?? ""));
    if (sort === "type") {
      const byType = compareText(formTypeLabel(leftForm), formTypeLabel(rightForm));
      if (byType !== 0) return byType;
      const byForm = compareText(formTitle(leftForm ?? {}), formTitle(rightForm ?? {}));
      if (byForm !== 0) return byForm;
      return formTimestamp(right) - formTimestamp(left);
    }
    if (sort === "name") {
      const byTitle = compareText(formTitle(left), formTitle(right));
      if (byTitle !== 0) return byTitle;
      return compareText(formTitle(leftForm ?? {}), formTitle(rightForm ?? {}));
    }
    if (sort === "status") {
      const byStatus = compareText(String(left.status ?? ""), String(right.status ?? ""));
      if (byStatus !== 0) return byStatus;
      return formTimestamp(right) - formTimestamp(left);
    }
    const byTime = formTimestamp(right) - formTimestamp(left);
    if (byTime !== 0) return byTime;
    return compareText(formTitle(left), formTitle(right));
  });
  return next;
}

export type FormTypeGroup<T> = { type: string; items: T[] };

/** Keep type order stable after sortFormDefinitions / sortFormSubmissions. */
export function groupRowsByFormType<T extends Record<string, unknown>>(
  rows: readonly T[],
  typeFor: (row: T) => string,
): FormTypeGroup<T>[] {
  const groups: FormTypeGroup<T>[] = [];
  const indexByType = new Map<string, number>();
  for (const row of rows) {
    const type = typeFor(row) || "Uncategorized";
    const existing = indexByType.get(type);
    if (existing == null) {
      indexByType.set(type, groups.length);
      groups.push({ type, items: [row] });
    } else {
      groups[existing]!.items.push(row);
    }
  }
  return groups;
}

/** Unique type labels for the type filter dropdown. */
export function collectFormTypeOptions(
  definitions: readonly Record<string, unknown>[],
): string[] {
  const types = new Set<string>();
  for (const row of definitions) {
    const label = formTypeLabel(row);
    if (label !== "Uncategorized") types.add(label);
  }
  return [...types].sort((a, b) => compareText(a, b));
}

export type FormCatalogImportSummary = {
  dryRun: boolean;
  templatesInSource: number;
  submissionsInSource: number;
  definitionsUpserted: number;
  submissionsUpserted: number;
  submissionsUnlinked: number;
  skipped: number;
};

/** Example JSON admins can edit and upload to seed fillable forms. */
export const SAMPLE_FORM_IMPORT_JSON = {
  formTemplates: [
    {
      sourceDocumentId: "example-safety-checklist",
      sourceCollection: "formTemplates",
      data: {
        name: "Example safety checklist",
        category: "Safety",
        description: "Upload JSON like this to seed fillable forms in the library.",
        fields: [
          { id: "submittedBy", label: "Submitted by", type: "text", required: true },
          { id: "location", label: "Location", type: "text" },
          { id: "recordDate", label: "Date", type: "date", required: true },
        { id: "notes", label: "Notes", type: "textarea" },
        { id: "exampleItem", label: "Example checklist item", type: "yesno", options: [...YES_NO_NA_OPTIONS] },
      ],
      },
    },
  ],
};

export async function importFormCatalog(
  payload: Record<string, unknown>,
): Promise<FormCatalogImportSummary> {
  return apiSend<FormCatalogImportSummary>(`${FORMS_API}/import`, "POST", payload);
}

export async function importFormChecklistFile(input: {
  filename: string;
  contentBase64: string;
  title?: string;
  category?: string;
  dryRun?: boolean;
}): Promise<FormCatalogImportSummary> {
  return apiSend<FormCatalogImportSummary>(`${FORMS_API}/import-file`, "POST", input);
}

/** Parse Excel/CSV in the browser and seed via JSON import (avoids large base64 uploads). */
export async function importChecklistUploadFile(
  file: File,
  overrides?: { title?: string; category?: string },
): Promise<FormCatalogImportSummary> {
  const parsed = await parseChecklistUploadFile(file, overrides?.title);
  const payload = checklistToImportPayload(parsed, checklistFileSourceId(file), {
    ...(overrides?.title ? { title: overrides.title } : {}),
    ...(overrides?.category ? { category: overrides.category } : {}),
  });
  return importFormCatalog(payload);
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
