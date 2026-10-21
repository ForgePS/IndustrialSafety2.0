/**
 * Parse and normalize form template / submission payloads for tenant import.
 * Supports Firebase freeze rows and direct JSON definitions.
 */
import { unwrapJsonRecord } from "./form-print.js";

export type FormCatalogImportSummary = {
  dryRun: boolean;
  templatesInSource: number;
  submissionsInSource: number;
  definitionsUpserted: number;
  submissionsUpserted: number;
  submissionsUnlinked: number;
  skipped: number;
};

export type ParsedFormTemplate = {
  sourceDocumentId: string;
  sourceCollection: string;
  sourcePath: string | null;
  title: string;
  formKey: string;
  schemaJson: Record<string, unknown>;
  sourcePayload: Record<string, unknown>;
  /** Firebase template id used to link submissions (templateId). */
  linkId: string;
};

export type ParsedFormSubmission = {
  sourceDocumentId: string;
  sourceCollection: string;
  sourcePath: string | null;
  title: string;
  status: string;
  submittedAt: string | null;
  answers: Record<string, unknown>;
  sourcePayload: Record<string, unknown>;
  templateLinkId: string | null;
};

function normalizeImportFields(fields: unknown): unknown[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((field, index) => {
    if (typeof field === "string" && field.trim()) {
      return { id: `field-${index + 1}`, label: field.trim(), type: "text" };
    }
    const rec = unwrapJsonRecord(field);
    const id = String(rec.id ?? rec.key ?? rec.name ?? `field-${index + 1}`).trim();
    const label = String(rec.label ?? rec.title ?? rec.name ?? id).trim();
    const type = String(rec.type ?? rec.inputType ?? "text").trim() || "text";
    const out: Record<string, unknown> = { id, label, type };
    if (type === "yesno" || type === "yes_no_na" || type === "checklist") {
      out.type = "yesno";
      out.options = ["Yes", "No", "N/A"];
      out.required = true;
    } else if (Array.isArray(rec.options)) {
      out.options = rec.options;
    }
    if (rec.required === true) out.required = true;
    if (typeof rec.content === "string" && rec.content.trim()) out.content = rec.content.trim();
    return out;
  });
}

function fieldsFromRecord(rec: Record<string, unknown>): unknown[] {
  const schema = unwrapJsonRecord(rec.schemaJson ?? rec.schema);
  if (Array.isArray(schema.fields)) return normalizeImportFields(schema.fields);
  if (Array.isArray(rec.fields)) return normalizeImportFields(rec.fields);
  if (Array.isArray(rec.questions)) return normalizeImportFields(rec.questions);
  return [];
}

function parseTemplateRow(raw: unknown, index: number): ParsedFormTemplate | null {
  const rec = unwrapJsonRecord(raw);
  const nested = unwrapJsonRecord(rec.data);
  const data = Object.keys(nested).length > 0 ? nested : rec;

  const sourceDocumentId = String(
    rec.sourceDocumentId ?? data.id ?? data.templateId ?? `import-template-${index + 1}`,
  ).trim();
  if (!sourceDocumentId) return null;

  const sourceCollection = String(rec.sourceCollection ?? "formTemplates").trim() || "formTemplates";
  const title = String(data.name ?? data.title ?? rec.title ?? rec.name ?? "Form").trim() || "Form";
  const formKey = String(data.seedKey ?? data.category ?? data.formKey ?? title)
    .trim()
    .slice(0, 120);
  const fields = fieldsFromRecord(data);
  const schemaJson: Record<string, unknown> = {
    fields,
    category: data.category ?? null,
    description: data.description ?? null,
  };
  const linkId = String(
    data.id ?? data.templateId ?? rec.sourceDocumentId ?? sourceDocumentId,
  ).trim();

  return {
    sourceDocumentId,
    sourceCollection,
    sourcePath: typeof rec.sourcePath === "string" ? rec.sourcePath : null,
    title,
    formKey,
    schemaJson,
    sourcePayload: data,
    linkId,
  };
}

function parseSubmissionRow(raw: unknown, index: number): ParsedFormSubmission | null {
  const rec = unwrapJsonRecord(raw);
  const nested = unwrapJsonRecord(rec.data);
  const data = Object.keys(nested).length > 0 ? nested : rec;

  const sourceDocumentId = String(rec.sourceDocumentId ?? data.id ?? `import-submission-${index + 1}`).trim();
  if (!sourceDocumentId) return null;

  const sourceCollection = String(rec.sourceCollection ?? "formSubmissions").trim() || "formSubmissions";
  const templateLinkId = String(
    data.templateId ?? data.formTemplateId ?? data.formDefinitionId ?? "",
  ).trim();
  const title =
    String(data.templateName ?? data.title ?? data.name ?? "Form submission").trim() ||
    "Form submission";
  const status = String(data.status ?? "SUBMITTED").trim().toUpperCase() || "SUBMITTED";
  const submittedRaw = data.submittedAt ?? data.createdAt ?? null;
  const submittedAt =
    submittedRaw != null && !Number.isNaN(new Date(String(submittedRaw)).getTime())
      ? new Date(String(submittedRaw)).toISOString()
      : null;

  return {
    sourceDocumentId,
    sourceCollection,
    sourcePath: typeof rec.sourcePath === "string" ? rec.sourcePath : null,
    title,
    status,
    submittedAt,
    answers: {}, // filled by caller via flattenFormResponses
    sourcePayload: data,
    templateLinkId: templateLinkId || null,
  };
}

export function parseFormCatalogImportPayload(body: Record<string, unknown>): {
  templates: ParsedFormTemplate[];
  submissions: ParsedFormSubmission[];
  includeSubmissions: boolean;
  dryRun: boolean;
} {
  const dryRun = body.dryRun === true || body.preview === true;
  const includeSubmissions =
    body.includeSubmissions === true ||
    body.importSubmissions === true ||
    Array.isArray(body.formSubmissions) ||
    Array.isArray(body.submissions);

  const templateBuckets: unknown[] = [];
  if (Array.isArray(body.formTemplates)) templateBuckets.push(...body.formTemplates);
  if (Array.isArray(body.templates)) templateBuckets.push(...body.templates);
  if (Array.isArray(body.definitions)) templateBuckets.push(...body.definitions);
  if (templateBuckets.length === 0 && (body.fields || body.schemaJson || body.title || body.name)) {
    templateBuckets.push(body);
  }

  const submissionBuckets: unknown[] = [];
  if (includeSubmissions) {
    if (Array.isArray(body.formSubmissions)) submissionBuckets.push(...body.formSubmissions);
    if (Array.isArray(body.submissions)) submissionBuckets.push(...body.submissions);
  }

  const templates: ParsedFormTemplate[] = [];
  for (const [index, row] of templateBuckets.entries()) {
    const parsed = parseTemplateRow(row, index);
    if (parsed) templates.push(parsed);
  }

  const submissions: ParsedFormSubmission[] = [];
  for (const [index, row] of submissionBuckets.entries()) {
    const parsed = parseSubmissionRow(row, index);
    if (parsed) submissions.push(parsed);
  }

  return { templates, submissions, includeSubmissions, dryRun };
}

export function emptyFormCatalogImportSummary(dryRun: boolean): FormCatalogImportSummary {
  return {
    dryRun,
    templatesInSource: 0,
    submissionsInSource: 0,
    definitionsUpserted: 0,
    submissionsUpserted: 0,
    submissionsUnlinked: 0,
    skipped: 0,
  };
}
