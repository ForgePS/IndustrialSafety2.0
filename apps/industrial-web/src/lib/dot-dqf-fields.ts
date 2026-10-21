import { PRODUCERS_RICE_MILL_TENANT_SLUG } from "./producers-mvr-policy";

export type DotDqfFieldType = "text" | "date" | "select" | "file" | "yesno";

export type DotDqfFieldDef = {
  id: string;
  label: string;
  type: DotDqfFieldType;
  placeholder?: string;
  description?: string;
  options?: readonly string[];
  required?: boolean;
  accept?: string;
};

const YES_NO = ["Yes", "No"] as const;
const YES_NO_NA = ["Yes", "No", "N/A"] as const;

export const driverDqfFieldGroups = {
  profile: [
    "locationDepartment",
    "employeeNumber",
    "hireDate",
    "workerClassification",
    "driverLicenseClass",
    "phone",
    "driverRestrictions",
    "employmentStatus",
    "cdlIssuingState",
  ],
  cdl: ["cdlNumber", "cdlExpiry", "driversLicenseOnFile", "driversLicenseCopy"],
  documents: [
    "driversApplicationForEmployment",
    "driversApplicationCopy",
    "employmentEligibilityI9",
    "consentDrugAlcoholTest",
    "drugScreenCompleted",
    "safetyPerformanceHistoryRequest",
    "previousEmployerSafetyPerformance",
    "drugAlcoholClearinghouseConsent",
    "drugAlcoholClearinghouseCompleted",
    "mvrReleaseForm",
    "mvrAnnual",
    "mvrCompleted",
    "medicalCertExpiry",
    "medicalCertCopy",
    "nationalRegistryNumber",
    "medicalExaminerRegistrationNumber",
    "medicalExaminationReportMer",
    "medicalExaminerNationalRegistryVerification",
    "medicalExaminerNationalRegistryVerificationStatus",
    "diabeticEyeExamExpiry",
    "diabeticEyeExamCopy",
    "cdlSelfCertificationAffidavitAr",
    "cdlSelfCertificationAffidavitMs",
    "drugAlcoholTestConsentForm",
    "documentationRefusalToTest",
    "observedBehaviorReasonableSuspicion",
    "drugAlcoholRecordkeepingLog",
    "certificationOfRoadTest",
    "certificationOfRoadTestDriverSignature",
    "certificationOfRoadTestPreceptorSignature",
    "certificationComplianceOnFile",
    "certificationComplianceDriverLicense",
    "certificationComplianceEvaluatorName",
    "dqfReviews",
    "driverStatementOnDutyHours",
    "drugAlcoholTestRandom",
    "preEmploymentDrugAlcoholStatement",
    "drugAlcoholRecordsRequest",
    "drugAlcoholEmployeeCertifiedReceipt",
    "drugAlcoholTestNotification",
    "documentationActualKnowledgeViolation",
  ],
} as const;

export const driverDqfGroupLabels: Record<keyof typeof driverDqfFieldGroups, string> = {
  profile: "DRIVER Information",
  cdl: "License Information",
  documents: "DQF Documents",
};

export const driverDqfGroupDescriptions: Partial<Record<keyof typeof driverDqfFieldGroups, string>> = {
  cdl: "Upload a photo of the DRIVER'S license and track its expiration. CDL DRIVERS also need CDL number; Non-CDL DRIVERS still keep license photo and expiry on file.",
  documents:
    "Enter the date each document was placed in the DRIVER qualification file and upload a copy (PDF or picture).",
};

const driverDqfDocumentDateFields: DotDqfFieldDef[] = [
  { id: "employmentEligibilityI9", label: "Employment Eligibility Verification Form I-9", type: "date" },
  { id: "consentDrugAlcoholTest", label: "Pre-Employment Drug Screen Consent", type: "date" },
  { id: "drugScreenCompleted", label: "Pre-Employment Drug Screen — Completed", type: "date" },
  { id: "safetyPerformanceHistoryRequest", label: "Previous Employer Record Request", type: "date" },
  {
    id: "previousEmployerSafetyPerformance",
    label: "Previous Employer Safety Performance Worksheet",
    type: "date",
  },
  { id: "drugAlcoholClearinghouseConsent", label: "FMCSA Clearinghouse Query Consent", type: "date" },
  { id: "drugAlcoholClearinghouseCompleted", label: "FMCSA Clearinghouse Query Completed", type: "date" },
  { id: "mvrReleaseForm", label: "MVR Consent / Acknowledgement for Driving Company Vehicles", type: "date" },
  { id: "mvrAnnual", label: "MVR (Annual)", type: "date" },
  { id: "mvrCompleted", label: "MVR completed / pulled date", type: "date" },
  { id: "medicalExaminationReportMer", label: "Medical Examination Report (MER) Form", type: "date" },
  {
    id: "medicalExaminerNationalRegistryVerification",
    label: "Medical Examiner's National Registry Verification Form",
    type: "date",
  },
  { id: "cdlSelfCertificationAffidavitAr", label: "CDL Self-Certification Affidavit (Arkansas)", type: "date" },
  {
    id: "cdlSelfCertificationAffidavitMs",
    label: "CDL Medical Self-Certification Affidavit (Mississippi)",
    type: "date",
  },
  { id: "drugAlcoholTestConsentForm", label: "Drug and Alcohol Test Consent Form", type: "date" },
  { id: "documentationRefusalToTest", label: "Documentation of Refusal to Test Form", type: "date" },
  {
    id: "observedBehaviorReasonableSuspicion",
    label: "Observed Behavior Reasonable Suspicion Record",
    type: "date",
  },
  { id: "drugAlcoholRecordkeepingLog", label: "Drug & Alcohol Record Log", type: "date" },
  { id: "certificationOfRoadTest", label: "Certificate of Road Test", type: "date" },
  { id: "certificationComplianceDriverLicense", label: "DQF Review", type: "date" },
  { id: "driverStatementOnDutyHours", label: "DRIVER'S Statement of On-Duty Hours and Log Use", type: "date" },
  {
    id: "preEmploymentDrugAlcoholStatement",
    label: "Previous Pre-Employment Drug and Alcohol Test Statement",
    type: "date",
  },
  { id: "drugAlcoholRecordsRequest", label: "Drug and Alcohol Records Request", type: "date" },
  {
    id: "drugAlcoholEmployeeCertifiedReceipt",
    label: "Drug and Alcohol EMPLOYEE'S Certified Receipt",
    type: "date",
  },
  {
    id: "documentationActualKnowledgeViolation",
    label: "Documentation of Actual Knowledge of DOT Drug or Alcohol Violation Form",
    type: "date",
  },
];

function copyField(dateField: DotDqfFieldDef): DotDqfFieldDef {
  return {
    id: `${dateField.id}Copy`,
    label: `${dateField.label} Copy`,
    type: "file",
    accept: "image/*,application/pdf",
  };
}

const driverDqfDocumentCopyFields = driverDqfDocumentDateFields.map(copyField);

export const DOT_DQF_DRIVER_FIELDS: DotDqfFieldDef[] = [
  {
    id: "locationDepartment",
    label: "Location / Department",
    type: "text",
    placeholder: "e.g. Greenville, Stutt-Warehouse",
  },
  { id: "employeeNumber", label: "EMPLOYEE Number", type: "text" },
  { id: "hireDate", label: "Date of Hire", type: "date" },
  {
    id: "workerClassification",
    label: "Worker Classification",
    type: "select",
    options: ["Full Time", "Part Time", "Seasonal", "Temporary", "Other"],
  },
  {
    id: "driverLicenseClass",
    label: "DRIVER License Class",
    type: "select",
    options: ["CDL DRIVER", "Non-CDL DRIVER"],
  },
  {
    id: "phone",
    label: "DRIVER Phone",
    type: "text",
    placeholder: "Mobile or primary contact number",
  },
  {
    id: "driverRestrictions",
    label: "DRIVER Restrictions / Notes",
    type: "text",
    placeholder: "Restricted, Diabetic, Self-Cert required, etc.",
  },
  {
    id: "employmentStatus",
    label: "Employment Status",
    type: "select",
    options: ["Active", "Inactive", "Suspended", "Terminated"],
  },
  { id: "cdlIssuingState", label: "State", type: "text", placeholder: "e.g. AR" },
  { id: "cdlNumber", label: "CDL / License Number", type: "text", required: true },
  { id: "cdlExpiry", label: "License Expiration Date", type: "date", required: true },
  { id: "driversLicenseOnFile", label: "On file", type: "yesno", options: YES_NO_NA },
  {
    id: "driversLicenseCopy",
    label: "DRIVER'S License Photo / Copy",
    type: "file",
    accept: "image/*,application/pdf",
    description: "Take a photo or upload PDF · expiration tracked above",
  },
  {
    id: "driversApplicationForEmployment",
    label: "Date placed in DQF",
    type: "date",
  },
  {
    id: "driversApplicationCopy",
    label: "DOT Application for Employment",
    type: "file",
    accept: "image/*,application/pdf",
  },
  {
    id: "medicalCertExpiry",
    label: "MEC Expiration Date",
    type: "date",
    required: true,
  },
  {
    id: "medicalCertCopy",
    label: "Medical Examiner's Certificate (MEC)",
    type: "file",
    accept: "image/*,application/pdf",
  },
  { id: "nationalRegistryNumber", label: "National Registry Number", type: "text" },
  {
    id: "medicalExaminerRegistrationNumber",
    label: "Medical Examiner's Registration Number",
    type: "text",
  },
  {
    id: "medicalExaminerNationalRegistryVerificationStatus",
    label: "Medical Examiner's National Registry Verification — On file",
    type: "yesno",
    options: YES_NO,
  },
  {
    id: "diabeticEyeExamExpiry",
    label: "Diabetic Eye Exam Expiration Date",
    type: "date",
  },
  {
    id: "diabeticEyeExamCopy",
    label: "Diabetic Eye Exam",
    type: "file",
    accept: "image/*,application/pdf",
  },
  {
    id: "certificationOfRoadTestDriverSignature",
    label: "Certificate of Road Test — DRIVER signature",
    type: "text",
  },
  {
    id: "certificationOfRoadTestPreceptorSignature",
    label: "Certificate of Road Test — Preceptor signature",
    type: "text",
  },
  { id: "certificationComplianceOnFile", label: "DQF Review — On file", type: "yesno", options: YES_NO },
  { id: "certificationComplianceEvaluatorName", label: "DQF Review — Evaluator Name", type: "text" },
  { id: "dqfReviews", label: "DQF Review entries", type: "text" },
  ...driverDqfDocumentDateFields,
  ...driverDqfDocumentCopyFields,
];

export const DOT_DQF_FIELD_BY_ID = new Map(DOT_DQF_DRIVER_FIELDS.map((field) => [field.id, field]));

export const DOT_DQF_ALL_FIELD_IDS = new Set([
  ...Object.values(driverDqfFieldGroups).flat(),
  ...driverDqfDocumentCopyFields.map((field) => field.id),
]);

export function driverDocumentCopyFieldId(dateFieldId: string): string {
  return `${dateFieldId}Copy`;
}

export function driverDocumentDateFields(): DotDqfFieldDef[] {
  return driverDqfDocumentDateFields;
}

export const PRODUCERS_RICE_HIDDEN_DQF_DOCUMENT_IDS = new Set([
  "driverStatementOnDutyHours",
  "preEmploymentDrugAlcoholStatement",
  "drugAlcoholRecordsRequest",
  "drugAlcoholEmployeeCertifiedReceipt",
  "documentationActualKnowledgeViolation",
]);

export const DISABLED_DQF_DOCUMENT_IDS = new Set([
  "drugAlcoholTestRandom",
  "drugAlcoholTestNotification",
  "cdlSelfCertificationAffidavitAr",
  "cdlSelfCertificationAffidavitMs",
  "employmentEligibilityI9",
]);

/** Worksheet keys that remain visible but do not count as missing when empty. */
export const OPTIONAL_DQF_DOCUMENT_KEYS = new Set([
  "documentationRefusalToTest",
  "observedBehaviorReasonableSuspicion",
  "dqfReview",
]);

export function isOptionalDqfDocumentKey(key: string): boolean {
  return OPTIONAL_DQF_DOCUMENT_KEYS.has(key);
}

export const DQF_FORM_LINK_FIELD_IDS = new Set([
  "consentDrugAlcoholTest",
  "drugAlcoholTestConsentForm",
  "safetyPerformanceHistoryRequest",
  "previousEmployerSafetyPerformance",
  "drugAlcoholClearinghouseConsent",
  "mvrReleaseForm",
  "drugAlcoholRecordkeepingLog",
  "observedBehaviorReasonableSuspicion",
  "certificationOfRoadTest",
  "certificationComplianceDriverLicense",
  "medicalExaminerNationalRegistryVerification",
]);

export const DQF_WORKSHEET_DOCUMENT_ORDER = [
  "driversApplication",
  "employmentEligibilityI9",
  "consentDrugAlcoholTest",
  "drugScreenCompleted",
  "safetyPerformanceHistoryRequest",
  "previousEmployerSafetyPerformance",
  "drugAlcoholClearinghouseConsent",
  "drugAlcoholClearinghouseCompleted",
  "mvrReleaseForm",
  "mvrAnnual",
  "medicalCert",
  "medicalExaminationReportMer",
  "medicalExaminerNationalRegistryVerification",
  "diabeticEyeExam",
  "drugAlcoholTestConsentForm",
  "documentationRefusalToTest",
  "observedBehaviorReasonableSuspicion",
  "drugAlcoholRecordkeepingLog",
  "certificationOfRoadTest",
  "dqfReview",
  "driverStatementOnDutyHours",
  "preEmploymentDrugAlcoholStatement",
  "drugAlcoholRecordsRequest",
  "drugAlcoholEmployeeCertifiedReceipt",
  "documentationActualKnowledgeViolation",
] as const;

export function filterDriverDqfDocumentFields(
  fields: DotDqfFieldDef[],
  tenantSlug?: string | null,
): DotDqfFieldDef[] {
  return fields.filter((field) => {
    if (DISABLED_DQF_DOCUMENT_IDS.has(field.id)) return false;
    if (
      field.id.endsWith("Copy") &&
      DISABLED_DQF_DOCUMENT_IDS.has(field.id.slice(0, -4))
    ) {
      return false;
    }
    if (tenantSlug === PRODUCERS_RICE_MILL_TENANT_SLUG && PRODUCERS_RICE_HIDDEN_DQF_DOCUMENT_IDS.has(field.id)) {
      return false;
    }
    return true;
  });
}

export function dotDqfField(id: string): DotDqfFieldDef {
  return (
    DOT_DQF_FIELD_BY_ID.get(id) ?? {
      id,
      label: id,
      type: "text",
    }
  );
}

export function deriveDqfDueDate(details: Record<string, string | undefined>): string {
  const fields = ["cdlExpiry", "medicalCertExpiry", "mvrAnnual", "diabeticEyeExamExpiry"];
  const dates = fields
    .map((fieldId) => details[fieldId]?.trim() ?? "")
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates[0] ?? "";
}

export function formatDqfDisplayDate(value: string | undefined): string {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return text || "—";
  const [year, month, day] = text.slice(0, 10).split("-");
  return `${month}/${day}/${year}`;
}

function dqfText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Uppercase display title used for DQF driver records (matches seeded production data). */
export function formatDotDqfDisplayTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dqfTitleSource(source: Record<string, unknown>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const text = dqfText(value);
    if (text) merged[key] = text;
  }
  const nested = source.details;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      const text = dqfText(value);
      if (text) merged[key] = text;
    }
  }
  return merged;
}

/**
 * Build a DQF driver title from worker/name fields, then profile fields
 * (employee #, location, license #) when no name is available.
 */
export function deriveDotDqfTitle(source: Record<string, unknown>): string {
  const fields = dqfTitleSource(source);
  const name =
    fields.driverName ||
    fields.workerName ||
    fields.personnelName ||
    fields.displayName ||
    [fields.firstName, fields.lastName].filter(Boolean).join(" ");
  if (name) return formatDotDqfDisplayTitle(name);

  const employeeNumber = fields.employeeNumber;
  const location =
    fields.locationDepartment || fields.locationText || fields.siteName;
  if (employeeNumber && location) {
    return formatDotDqfDisplayTitle(`${employeeNumber} · ${location}`);
  }
  if (employeeNumber) return `EMPLOYEE #${employeeNumber}`;
  if (location) return formatDotDqfDisplayTitle(location);

  const license = fields.cdlNumber || fields.licenseNumber;
  if (license) return `CDL ${license}`;

  return "";
}
