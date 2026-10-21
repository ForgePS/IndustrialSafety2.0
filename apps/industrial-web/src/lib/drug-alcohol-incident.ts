/**
 * Drug & alcohol consent and test fields for every Incident category.
 * One consent form per employee involved; post-accident and reasonable-suspicion
 * testing documentation on the incident report.
 */

export const DRUG_ALCOHOL_CONSENT_INTRO = [
  "Following a workplace incident, the company may require drug and/or alcohol testing consistent with company policy and applicable law (including DOT rules when the employee is a covered driver).",
  "I acknowledge that I have been informed of the reason for testing, the type of test requested, and that refusing a required test may result in disciplinary action up to and including termination, subject to applicable policy and law.",
  "I authorize the collection of specimens (urine, breath, saliva, or other methods as directed) and the release of test results to authorized company representatives for safety and compliance purposes.",
] as const;

export const DRUG_ALCOHOL_CONSENT_OPTIONS = [
  {
    id: "informed",
    label: "I have been informed why drug and/or alcohol testing is being requested.",
  },
  {
    id: "voluntaryConsent",
    label: "I voluntarily consent to the testing described above (or acknowledge a required test under company/DOT policy).",
  },
  {
    id: "understandsRefusal",
    label:
      "I understand that refusing a required test, adulterating a specimen, or failing to cooperate may be treated as a policy violation.",
  },
  {
    id: "authorizesResults",
    label:
      "I authorize release of test results to authorized company safety, HR, and/or DOT compliance representatives.",
  },
  {
    id: "mayAskQuestions",
    label: "I have had the opportunity to ask questions about the testing process.",
  },
] as const;

export const DRUG_ALCOHOL_REASON_OPTIONS = [
  { id: "post-accident", label: "Post-accident" },
  { id: "reasonable-suspicion", label: "Reasonable suspicion" },
  { id: "random", label: "Random" },
  { id: "follow-up", label: "Follow-up" },
  { id: "return-to-duty", label: "Return-to-duty" },
  { id: "other", label: "Other" },
] as const;

export const DRUG_ALCOHOL_TEST_STATUS_OPTIONS = [
  { id: "not-started", label: "Not started" },
  { id: "ordered", label: "Ordered / scheduled" },
  { id: "in-progress", label: "Collection in progress" },
  { id: "completed", label: "Completed" },
  { id: "refused", label: "Refused" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export const DRUG_ALCOHOL_SUBSTANCE_OPTIONS = [
  { id: "drug", label: "Drug" },
  { id: "alcohol", label: "Alcohol" },
] as const;

export type DrugAlcoholConsentId = (typeof DRUG_ALCOHOL_CONSENT_OPTIONS)[number]["id"];
export type DrugAlcoholReasonId = (typeof DRUG_ALCOHOL_REASON_OPTIONS)[number]["id"] | "";
export type DrugAlcoholTestStatusId =
  (typeof DRUG_ALCOHOL_TEST_STATUS_OPTIONS)[number]["id"];
export type DrugAlcoholSubstanceId =
  (typeof DRUG_ALCOHOL_SUBSTANCE_OPTIONS)[number]["id"];

export type DrugAlcoholConsentFlags = Record<DrugAlcoholConsentId, boolean>;

export type DrugAlcoholIncidentSection = {
  /** Stable client id so list edits/removals keep the right form. */
  id: string;
  /** Employee the consent form is for. */
  employeeName: string;
  personnelId: string;
  testingRequired: boolean;
  reason: DrugAlcoholReasonId;
  reasonOther: string;
  consent: DrugAlcoholConsentFlags;
  employeeSignature: string;
  employeeSignedAt: string;
  witnessName: string;
  witnessSignature: string;
  witnessSignedAt: string;
  testStatus: DrugAlcoholTestStatusId;
  substances: DrugAlcoholSubstanceId[];
  collectionSite: string;
  orderedAt: string;
  completedAt: string;
  resultNotes: string;
  additionalComments: string;
};

function emptyConsent(): DrugAlcoholConsentFlags {
  return {
    informed: false,
    voluntaryConsent: false,
    understandsRefusal: false,
    authorizesResults: false,
    mayAskQuestions: false,
  };
}

export const EMPTY_DRUG_ALCOHOL_INCIDENT: DrugAlcoholIncidentSection = {
  id: "",
  employeeName: "",
  personnelId: "",
  testingRequired: false,
  reason: "",
  reasonOther: "",
  consent: emptyConsent(),
  employeeSignature: "",
  employeeSignedAt: "",
  witnessName: "",
  witnessSignature: "",
  witnessSignedAt: "",
  testStatus: "not-started",
  substances: [],
  collectionSite: "",
  orderedAt: "",
  completedAt: "",
  resultNotes: "",
  additionalComments: "",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function isReasonId(value: string): value is Exclude<DrugAlcoholReasonId, ""> {
  return DRUG_ALCOHOL_REASON_OPTIONS.some((opt) => opt.id === value);
}

function isTestStatusId(value: string): value is DrugAlcoholTestStatusId {
  return DRUG_ALCOHOL_TEST_STATUS_OPTIONS.some((opt) => opt.id === value);
}

function isSubstanceId(value: string): value is DrugAlcoholSubstanceId {
  return DRUG_ALCOHOL_SUBSTANCE_OPTIONS.some((opt) => opt.id === value);
}

function newConsentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `da-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseDrugAlcoholIncident(raw: unknown): DrugAlcoholIncidentSection {
  const r = asRecord(raw);
  if (!r) {
    return cloneEmptyDrugAlcoholIncident();
  }
  const consentRaw = asRecord(r.consent) ?? {};
  const consent = emptyConsent();
  for (const opt of DRUG_ALCOHOL_CONSENT_OPTIONS) {
    consent[opt.id] = consentRaw[opt.id] === true;
  }
  const reasonRaw = String(r.reason ?? "").trim();
  const statusRaw = String(r.testStatus ?? "not-started").trim();
  const substancesRaw = Array.isArray(r.substances) ? r.substances : [];
  const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : newConsentId();
  return {
    id,
    employeeName: typeof r.employeeName === "string" ? r.employeeName : "",
    personnelId: typeof r.personnelId === "string" ? r.personnelId : "",
    testingRequired: r.testingRequired === true,
    reason: isReasonId(reasonRaw) ? reasonRaw : "",
    reasonOther: typeof r.reasonOther === "string" ? r.reasonOther : "",
    consent,
    employeeSignature: typeof r.employeeSignature === "string" ? r.employeeSignature : "",
    employeeSignedAt: typeof r.employeeSignedAt === "string" ? r.employeeSignedAt : "",
    witnessName: typeof r.witnessName === "string" ? r.witnessName : "",
    witnessSignature: typeof r.witnessSignature === "string" ? r.witnessSignature : "",
    witnessSignedAt: typeof r.witnessSignedAt === "string" ? r.witnessSignedAt : "",
    testStatus: isTestStatusId(statusRaw) ? statusRaw : "not-started",
    substances: substancesRaw
      .map((item) => String(item))
      .filter((item): item is DrugAlcoholSubstanceId => isSubstanceId(item)),
    collectionSite: typeof r.collectionSite === "string" ? r.collectionSite : "",
    orderedAt: typeof r.orderedAt === "string" ? r.orderedAt : "",
    completedAt: typeof r.completedAt === "string" ? r.completedAt : "",
    resultNotes: typeof r.resultNotes === "string" ? r.resultNotes : "",
    additionalComments:
      typeof r.additionalComments === "string" ? r.additionalComments : "",
  };
}

export function drugAlcoholIncidentHasContent(value: DrugAlcoholIncidentSection): boolean {
  if (value.testingRequired) return true;
  if (value.employeeName.trim()) return true;
  if (value.reason) return true;
  if (value.employeeSignature.trim() || value.witnessSignature.trim()) return true;
  if (value.testStatus !== "not-started") return true;
  if (value.substances.length || value.collectionSite.trim() || value.resultNotes.trim()) {
    return true;
  }
  return Object.values(value.consent).some(Boolean);
}

/** When testing is flagged required, consent + reason must be complete. */
export function drugAlcoholValidationMessage(
  value: DrugAlcoholIncidentSection,
): string | null {
  if (!value.testingRequired) return null;
  if (!value.reason) {
    return "Select a reason for drug and/or alcohol testing.";
  }
  if (value.reason === "other" && !value.reasonOther.trim()) {
    return "Describe the other reason for testing.";
  }
  if (value.testStatus === "refused") {
    return value.substances.length
      ? null
      : "Select whether drug, alcohol, or both tests were refused.";
  }
  for (const opt of DRUG_ALCOHOL_CONSENT_OPTIONS) {
    if (!value.consent[opt.id]) {
      return "Complete all drug & alcohol consent acknowledgments.";
    }
  }
  if (!value.employeeSignature.trim()) {
    return "Employee signature is required for drug & alcohol consent.";
  }
  if (!value.substances.length) {
    return "Select whether drug, alcohol, or both tests are required.";
  }
  return null;
}

export function cloneEmptyDrugAlcoholIncident(): DrugAlcoholIncidentSection {
  return {
    ...EMPTY_DRUG_ALCOHOL_INCIDENT,
    id: newConsentId(),
    consent: emptyConsent(),
    substances: [],
  };
}

/** New consent form added from the incident editor (testing is implied by adding one). */
export function newDrugAlcoholConsent(
  employee: { employeeName?: string; personnelId?: string } = {},
): DrugAlcoholIncidentSection {
  return {
    ...cloneEmptyDrugAlcoholIncident(),
    testingRequired: true,
    reason: "post-accident",
    employeeName: employee.employeeName?.trim() ?? "",
    personnelId: employee.personnelId?.trim() ?? "",
  };
}

/**
 * Read consent forms from an incident payload.
 * Prefers `drugAlcoholConsents` (one per employee); falls back to the legacy
 * single `drugAlcohol` object, attributing it to the person affected.
 */
export function parseDrugAlcoholConsents(
  record: Record<string, unknown>,
  fallbackEmployee: { employeeName?: string; personnelId?: string } = {},
): DrugAlcoholIncidentSection[] {
  if (Array.isArray(record.drugAlcoholConsents)) {
    return record.drugAlcoholConsents
      .map((row) => parseDrugAlcoholIncident(row))
      .filter(drugAlcoholIncidentHasContent);
  }
  const legacy = parseDrugAlcoholIncident(record.drugAlcohol);
  if (!drugAlcoholIncidentHasContent(legacy)) return [];
  return [
    {
      ...legacy,
      employeeName: legacy.employeeName || fallbackEmployee.employeeName?.trim() || "",
      personnelId: legacy.personnelId || fallbackEmployee.personnelId?.trim() || "",
    },
  ];
}

/** Validate every consent form; messages name the employee so multi-form errors are findable. */
export function drugAlcoholConsentsValidationMessage(
  consents: readonly DrugAlcoholIncidentSection[],
): string | null {
  for (const [index, consent] of consents.entries()) {
    const label = consent.employeeName.trim() || `Consent form ${index + 1}`;
    if (!consent.employeeName.trim()) {
      return `Consent form ${index + 1}: select or enter the employee.`;
    }
    const message = drugAlcoholValidationMessage(consent);
    if (message) return `${label}: ${message}`;
  }
  return null;
}
