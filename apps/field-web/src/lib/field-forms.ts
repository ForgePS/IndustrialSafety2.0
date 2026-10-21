/**
 * Forge Safety - Field Version form engine types + helpers.
 * Schema parsing mirrors industrial-web forms-module without desktop-only policy packs.
 */

export type FieldFormFieldType =
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
  | "division"
  | "department"
  | "employeeNumber"
  | "photo"
  | "multiselect";

export type FieldFormVisibleWhen = {
  fieldId: string;
  equals: string | string[];
};

export type FieldFormField = {
  id: string;
  label: string;
  type: FieldFormFieldType;
  required?: boolean;
  options?: string[];
  content?: string;
  section?: string;
  visibleWhen?: FieldFormVisibleWhen;
};

export type FieldFormDefinition = {
  id: string;
  title: string;
  status?: string | null;
  formKey?: string | null;
  version?: number | null;
  schemaJson?: Record<string, unknown> | null;
  siteId?: string | null;
  departmentId?: string | null;
};

export type FieldFormSubmission = {
  id: string;
  title?: string | null;
  status?: string | null;
  formDefinitionId?: string | null;
  answers?: Record<string, unknown> | null;
  submittedAt?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
};

export type FieldFormAnswers = Record<string, string>;

export type FieldFormPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  caption?: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
  markupDocument?: unknown;
};

const TYPE_MAP: Record<string, FieldFormFieldType> = {
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
  section: "label",
  location: "location",
  site: "location",
  facility: "location",
  division: "division",
  department: "department",
  employeenumber: "employeeNumber",
  employee_number: "employeeNumber",
  photo: "photo",
  image: "photo",
  camera: "photo",
  attachment: "photo",
  attachments: "photo",
  multiselect: "multiselect",
  "multi-select": "multiselect",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isSignatureLabel(label: string): boolean {
  const text = label.trim();
  if (!text) return false;
  if (/\bsignature\s*date\b/i.test(text)) return false;
  return /\bsignature\b/i.test(text) || /^sign(\s+here)?$/i.test(text);
}

function fieldType(raw: unknown, label = ""): FieldFormFieldType {
  const key = String(raw ?? "").trim().toLowerCase();
  const mapped = key ? TYPE_MAP[key] : undefined;
  if (mapped && mapped !== "text") return mapped;
  if (isSignatureLabel(label)) return "signature";
  if (/\b(photo|picture|image|camera)\b/i.test(label)) return "photo";
  if (/^division$/i.test(label.trim())) return "division";
  if (/^department$/i.test(label.trim())) return "department";
  return mapped ?? "text";
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

function parseVisibleWhen(raw: unknown): FieldFormVisibleWhen | undefined {
  const rec = asRecord(raw);
  if (!rec) return undefined;
  const fieldId = String(rec.fieldId ?? rec.field ?? rec.id ?? "").trim();
  if (!fieldId) return undefined;
  if (Array.isArray(rec.equals)) {
    const equals = rec.equals.map((v) => String(v)).filter(Boolean);
    return equals.length ? { fieldId, equals } : undefined;
  }
  if (rec.equals != null) return { fieldId, equals: String(rec.equals) };
  if (rec.value != null) return { fieldId, equals: String(rec.value) };
  return undefined;
}

function normalizeField(raw: unknown, index: number): FieldFormField | null {
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
  const declaredKey = String(declaredType ?? "").trim().toLowerCase();
  const type =
    declaredKey === "date" || declaredKey === "datetime"
      ? ("date" as const)
      : fieldType(declaredType, label);
  const field: FieldFormField = {
    id: id || `field-${index}`,
    label: label || id,
    type,
  };
  if (required) field.required = true;
  if (options) field.options = options;
  const section = String(rec.section ?? rec.group ?? rec.category ?? "").trim();
  if (section) field.section = section;
  const visibleWhen = parseVisibleWhen(rec.visibleWhen ?? rec.showIf ?? rec.when);
  if (visibleWhen) field.visibleWhen = visibleWhen;
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
  const buckets = [rec.fields, rec.questions, rec.formFields, rec.items, rec.elements, rec.schema];
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
      if (!sec) continue;
      const sectionLabel = String(sec.title ?? sec.label ?? sec.name ?? "").trim();
      if (Array.isArray(sec.fields)) {
        for (const field of sec.fields) {
          const fr = asRecord(field);
          if (fr && sectionLabel && !fr.section) out.push({ ...fr, section: sectionLabel });
          else out.push(field);
        }
      }
      if (Array.isArray(sec.questions)) out.push(...sec.questions);
    }
  }
  return out;
}

const DEFAULT_FIELDS: FieldFormField[] = [
  { id: "submittedBy", label: "Submitted by", type: "text", required: true },
  { id: "division", label: "Division", type: "division" },
  { id: "location", label: "Location", type: "location" },
  { id: "department", label: "Department", type: "department" },
  { id: "recordDate", label: "Date", type: "date", required: true },
  { id: "notes", label: "Notes", type: "textarea" },
];

export function extractFormFields(definition: Record<string, unknown>): FieldFormField[] {
  const sources = [definition.schemaJson, definition.schema, definition.sourcePayload, definition];
  const seen = new Set<string>();
  const fields: FieldFormField[] = [];
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

export function yesNoNotesFieldId(fieldId: string): string {
  return `${fieldId}__notes`;
}

export function normalizeYesNoAnswer(raw: string): "YES" | "NO" | "NA" | null {
  const upper = raw.trim().toUpperCase();
  if (upper === "YES" || upper === "Y") return "YES";
  if (upper === "NO" || upper === "N") return "NO";
  if (upper === "NA" || upper === "N/A") return "NA";
  return null;
}

export function isAnswerableField(field: FieldFormField): boolean {
  return field.type !== "content" && field.type !== "label";
}

export function isFieldVisible(field: FieldFormField, answers: FieldFormAnswers): boolean {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const current = answers[rule.fieldId] ?? "";
  const expected = Array.isArray(rule.equals) ? rule.equals : [rule.equals];
  return expected.some((value) => String(value) === current);
}

export function visibleFields(
  fields: readonly FieldFormField[],
  answers: FieldFormAnswers,
): FieldFormField[] {
  return fields.filter((field) => isFieldVisible(field, answers));
}

export function hydrateFormAnswers(
  answers: unknown,
  fields: readonly FieldFormField[],
): FieldFormAnswers {
  const source = asRecord(answers) ?? {};
  const next: FieldFormAnswers = {};
  for (const field of fields) {
    const raw = source[field.id];
    if (field.type === "checkbox") {
      next[field.id] = raw === true || raw === "true" || raw === 1 || raw === "1" ? "true" : "";
      continue;
    }
    if (field.type === "yesno") {
      next[field.id] = normalizeYesNoAnswer(String(raw ?? "")) ?? "";
      const notesKey = yesNoNotesFieldId(field.id);
      next[notesKey] = typeof source[notesKey] === "string" ? String(source[notesKey]) : "";
      continue;
    }
    if (field.type === "photo" || field.type === "multiselect") {
      next[field.id] = typeof raw === "string" ? raw : raw != null ? JSON.stringify(raw) : "";
      continue;
    }
    next[field.id] = raw == null ? "" : String(raw);
  }
  return next;
}

export function buildFormAnswersPayload(
  answers: FieldFormAnswers,
  fields: readonly FieldFormField[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (!isAnswerableField(field)) continue;
    if (!isFieldVisible(field, answers)) continue;
    const value = answers[field.id];
    if (field.type === "checkbox") {
      payload[field.id] = value === "true";
      continue;
    }
    if (field.type === "yesno") {
      const answer = normalizeYesNoAnswer(value ?? "");
      if (answer) payload[field.id] = answer;
      const notes = answers[yesNoNotesFieldId(field.id)]?.trim();
      if (notes) payload[yesNoNotesFieldId(field.id)] = notes;
      continue;
    }
    if (field.type === "photo" || field.type === "multiselect") {
      if (!value?.trim()) continue;
      try {
        payload[field.id] = JSON.parse(value) as unknown;
      } catch {
        payload[field.id] = value.trim();
      }
      continue;
    }
    if (value?.trim()) payload[field.id] = value.trim();
  }
  return payload;
}

export function validateFormAnswers(
  fields: readonly FieldFormField[],
  answers: FieldFormAnswers,
): { ok: true } | { ok: false; message: string; fieldId?: string } {
  for (const field of visibleFields(fields, answers)) {
    if (!isAnswerableField(field) || !field.required) {
      if (field.type === "yesno") {
        const answer = normalizeYesNoAnswer(answers[field.id] ?? "");
        if (answer === "NO" && !(answers[yesNoNotesFieldId(field.id)] ?? "").trim()) {
          return {
            ok: false,
            message: `Add notes for “${field.label}” when the answer is No.`,
            fieldId: field.id,
          };
        }
      }
      continue;
    }
    if (field.type === "yesno") {
      const answer = normalizeYesNoAnswer(answers[field.id] ?? "");
      if (!answer) {
        return { ok: false, message: `Answer Yes, No, or N/A for “${field.label}”.`, fieldId: field.id };
      }
      if (answer === "NO" && !(answers[yesNoNotesFieldId(field.id)] ?? "").trim()) {
        return {
          ok: false,
          message: `Add notes for “${field.label}” when the answer is No.`,
          fieldId: field.id,
        };
      }
      continue;
    }
    if (field.type === "checkbox") {
      if (answers[field.id] !== "true") {
        return { ok: false, message: `Confirm “${field.label}”.`, fieldId: field.id };
      }
      continue;
    }
    if (!(answers[field.id] ?? "").trim()) {
      return { ok: false, message: `“${field.label}” is required.`, fieldId: field.id };
    }
  }
  return { ok: true };
}

export function answeredProgress(
  fields: readonly FieldFormField[],
  answers: FieldFormAnswers,
): { answered: number; total: number; percent: number } {
  const visible = visibleFields(fields, answers).filter(isAnswerableField);
  let answered = 0;
  for (const field of visible) {
    if (field.type === "checkbox") {
      if (answers[field.id] === "true") answered += 1;
      continue;
    }
    if (field.type === "yesno") {
      if (normalizeYesNoAnswer(answers[field.id] ?? "")) answered += 1;
      continue;
    }
    if ((answers[field.id] ?? "").trim()) answered += 1;
  }
  const total = visible.length;
  return {
    answered,
    total,
    percent: total ? Math.round((answered / total) * 100) : 0,
  };
}

const DRAFT_PREFIX = "forge.field.form.draft.v1:";

export type FieldFormDraft = {
  definitionId: string;
  submissionId?: string | null;
  answers: FieldFormAnswers;
  savedAt: string;
};

export function saveFormDraft(definitionId: string, draft: Omit<FieldFormDraft, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${definitionId}`,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // ignore quota
  }
}

export function loadFormDraft(definitionId: string): FieldFormDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${definitionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FieldFormDraft;
    if (!parsed?.answers || typeof parsed.answers !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFormDraft(definitionId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${DRAFT_PREFIX}${definitionId}`);
}

export async function compressImageFile(
  file: File,
  maxDim = 1600,
  quality = 0.72,
): Promise<FieldFormPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      id: crypto.randomUUID(),
      fileName: file.name || "photo.jpg",
      contentType: file.type || "image/jpeg",
      dataUrl,
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  return {
    id: crypto.randomUUID(),
    fileName: file.name || "photo.jpg",
    contentType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", quality),
  };
}

export function parsePhotoAnswer(raw: string): FieldFormPhoto[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item?.dataUrl))
      .map((item) => ({
        id: String(item.id ?? crypto.randomUUID()),
        fileName: String(item.fileName ?? "photo.jpg"),
        contentType: String(item.contentType ?? "image/jpeg"),
        dataUrl: String(item.dataUrl),
        ...(typeof item.caption === "string" ? { caption: item.caption } : {}),
      }));
  } catch {
    return [];
  }
}
