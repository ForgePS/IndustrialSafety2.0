import { findProducersMvrConsentForm, isProducersMvrConsentForm } from "./producers-mvr-policy";

/** Stable template names from the Producers / Firebase forms catalog. */
export const DQF_FORM_TEMPLATE_NAMES = {
  mvrConsent: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
  clearinghouseConsent: "FMCSA Clearinghouse Query Consent",
  drugAlcoholConsent: "Consent for Drug and/or Alcohol Testing",
  drugAlcoholConsentDot: "DOT Drug & Alcohol Consent for Testing",
  drugAlcoholLog: "DOT Drug & Alcohol Test Record Log",
  safetyPerformanceHistory: "Safety Performance History Records Request",
  roadTest: "Driver Evaluation Road Test Form",
  observedBehaviorReasonableSuspicion: "Observed Behavior Reasonable Suspicion Record",
  annualDqfReview: "Annual DQF Form",
  medicalExaminerNationalRegistryVerification:
    "Medical Examiner's National Registry Verification Form",
} as const;

/** DQF worksheet field id → seeded form template title. */
export const DQF_LINKED_FORM_TEMPLATES: Record<string, string> = {
  drugAlcoholClearinghouseConsent: DQF_FORM_TEMPLATE_NAMES.clearinghouseConsent,
  mvrReleaseForm: DQF_FORM_TEMPLATE_NAMES.mvrConsent,
  drugAlcoholRecordkeepingLog: DQF_FORM_TEMPLATE_NAMES.drugAlcoholLog,
  consentDrugAlcoholTest: DQF_FORM_TEMPLATE_NAMES.drugAlcoholConsent,
  drugAlcoholTestConsentForm: DQF_FORM_TEMPLATE_NAMES.drugAlcoholConsentDot,
  previousEmployerSafetyPerformance: DQF_FORM_TEMPLATE_NAMES.safetyPerformanceHistory,
  /** Same Firebase form covers the previous-employer request packet. */
  safetyPerformanceHistoryRequest: DQF_FORM_TEMPLATE_NAMES.safetyPerformanceHistory,
  certificationOfRoadTest: DQF_FORM_TEMPLATE_NAMES.roadTest,
  observedBehaviorReasonableSuspicion: DQF_FORM_TEMPLATE_NAMES.observedBehaviorReasonableSuspicion,
  certificationComplianceDriverLicense: DQF_FORM_TEMPLATE_NAMES.annualDqfReview,
  medicalExaminerNationalRegistryVerification:
    DQF_FORM_TEMPLATE_NAMES.medicalExaminerNationalRegistryVerification,
};

export function normalizeFormTemplateTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formFieldCount(row: Record<string, unknown>): number {
  const schema = row.schemaJson ?? row.schema_json;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return 0;
  const fields = (schema as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function preferRicherForm(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Record<string, unknown> {
  return formFieldCount(a) >= formFieldCount(b) ? a : b;
}

export function findDqfFormDefinition(
  definitions: readonly Record<string, unknown>[],
  templateName: string,
): Record<string, unknown> | null {
  const target = normalizeFormTemplateTitle(templateName);
  if (!target) return null;

  let bestExact: Record<string, unknown> | null = null;
  for (const row of definitions) {
    if (isProducersMvrConsentForm(row) && target.includes("mvr")) return row;
    const title = normalizeFormTemplateTitle(String(row.title ?? row.name ?? ""));
    if (title !== target) continue;
    bestExact = bestExact ? preferRicherForm(bestExact, row) : row;
  }
  if (bestExact) return bestExact;

  let bestFuzzy: Record<string, unknown> | null = null;
  for (const row of definitions) {
    const title = normalizeFormTemplateTitle(String(row.title ?? row.name ?? ""));
    if (!title) continue;
    if (!(title.includes(target) || target.includes(title))) continue;
    bestFuzzy = bestFuzzy ? preferRicherForm(bestFuzzy, row) : row;
  }

  return bestFuzzy;
}

export function buildDqfFormIdMap(
  definitions: readonly Record<string, unknown>[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [fieldId, templateName] of Object.entries(DQF_LINKED_FORM_TEMPLATES)) {
    const match = findDqfFormDefinition(definitions, templateName);
    if (match?.id) map[fieldId] = String(match.id);
  }
  const mvr = findProducersMvrConsentForm(definitions);
  if (mvr?.id) map.mvrReleaseForm = String(mvr.id);
  return map;
}

export function dqfFormFillHref(opts: {
  formId: string;
  personnelId?: string | null;
  dotRecordId?: string | null;
}): string {
  const formId = opts.formId.trim();
  if (!formId) return "/modules/forms/?tab=library";
  const params = new URLSearchParams({ tab: "fill", form: formId });
  const personnelId = opts.personnelId?.trim();
  if (personnelId) params.set("personnel", personnelId);
  const dotRecordId = opts.dotRecordId?.trim();
  if (dotRecordId) params.set("dotRecord", dotRecordId);
  return `/modules/forms/?${params.toString()}`;
}

export function dqfFormPrintHref(formId: string, personnelId?: string | null): string {
  const fill = dqfFormFillHref(personnelId !== undefined ? { formId, personnelId } : { formId });
  return `${fill}${fill.includes("?") ? "&" : "?"}print=1`;
}
