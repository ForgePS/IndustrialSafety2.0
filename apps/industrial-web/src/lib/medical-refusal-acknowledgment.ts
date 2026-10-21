/**
 * Medical Evaluation / Treatment Refusal Acknowledgment fields
 * for Incidents → Medical Refusals.
 */

export const MEDICAL_REFUSAL_INTRO = [
  "I acknowledge that following a workplace injury, illness, exposure, or other medical-related event, I was offered the opportunity to receive appropriate medical evaluation, treatment, first aid, and/or transportation to a medical facility.",
  "I voluntarily decline the medical evaluation, treatment, and/or transportation offered to me at this time.",
  "I understand that some injuries or medical conditions may not be immediately apparent and may worsen after the incident. I understand that refusing medical evaluation or treatment could result in delayed diagnosis or treatment of an injury or medical condition.",
  "I have been advised to immediately notify my supervisor, Safety/EHS representative, or other appropriate company representative if my condition changes, symptoms develop or worsen, or I decide that I would like medical evaluation or treatment.",
  "I understand that I may seek medical attention at any time if I believe it is necessary, including contacting emergency medical services for an emergency.",
] as const;

export const MEDICAL_REFUSAL_EMERGENCY_NOTICE =
  "Emergency Notice: If the employee experiences worsening pain, difficulty breathing, chest pain, altered mental status, uncontrolled bleeding, loss of consciousness, severe allergic reaction, or other signs of a medical emergency, emergency medical services should be contacted immediately.";

export const MEDICAL_REFUSAL_EMPLOYEE_STATEMENT =
  "I have read, or have had explained to me, the information above. I understand the potential consequences of refusing medical evaluation, treatment, and/or transportation and voluntarily choose to decline the services identified above.";

export const MEDICAL_REFUSAL_WITNESS_STATEMENT =
  "I witnessed the employee's refusal and, to the best of my knowledge, the employee appeared able to understand the information provided and voluntarily made the decision documented above.";

export const MEDICAL_REFUSAL_CONFIRMATION_OPTIONS = [
  {
    id: "voluntary",
    label: "I am making this decision voluntarily and without coercion.",
  },
  {
    id: "askedQuestions",
    label: "I have had the opportunity to ask questions regarding the medical care or evaluation offered.",
  },
  {
    id: "understandsRisks",
    label: "I understand the potential risks associated with declining medical evaluation or treatment.",
  },
  {
    id: "documentsDecision",
    label:
      "I understand that signing this acknowledgment documents my decision to decline the medical services offered at this time.",
  },
  {
    id: "mayRequestLater",
    label:
      "I understand that this refusal does not prevent me from reporting additional symptoms or requesting medical attention later.",
  },
  {
    id: "doesNotWaiveRights",
    label:
      "I understand that this acknowledgment does not waive any rights or benefits available to me under applicable workers' compensation, occupational safety, employment, or other applicable laws.",
  },
] as const;

export const MEDICAL_SERVICES_OFFERED_OPTIONS = [
  { id: "first-aid", label: "First Aid" },
  { id: "on-site", label: "On-Site Medical Evaluation" },
  { id: "clinic", label: "Occupational Health / Clinic Evaluation" },
  { id: "ems", label: "EMS Evaluation" },
  { id: "ambulance", label: "Ambulance Transportation" },
  { id: "emergency-department", label: "Emergency Department Evaluation" },
  { id: "other", label: "Other" },
] as const;

export const MEDICAL_REFUSAL_DECISION_OPTIONS = [
  {
    id: "decline-all",
    label: "I decline all medical evaluation and treatment offered at this time.",
  },
  {
    id: "accepted-first-aid",
    label: "I accepted limited first aid but decline additional medical evaluation or treatment.",
  },
  {
    id: "decline-ambulance",
    label: "I decline ambulance transportation and intend to seek medical evaluation by another means.",
  },
  { id: "other", label: "Other" },
] as const;

export type MedicalRefusalConfirmationId =
  (typeof MEDICAL_REFUSAL_CONFIRMATION_OPTIONS)[number]["id"];
export type MedicalServiceOfferedId =
  (typeof MEDICAL_SERVICES_OFFERED_OPTIONS)[number]["id"];
export type MedicalRefusalDecisionId =
  (typeof MEDICAL_REFUSAL_DECISION_OPTIONS)[number]["id"] | "";

export type MedicalRefusalConfirmations = Record<MedicalRefusalConfirmationId, boolean>;

export type MedicalRefusalAcknowledgment = {
  confirmations: MedicalRefusalConfirmations;
  servicesOffered: MedicalServiceOfferedId[];
  servicesOther: string;
  employeeDecision: MedicalRefusalDecisionId;
  employeeDecisionOther: string;
  employeeStatementAck: boolean;
  employeeSignature: string;
  employeeSignedAt: string;
  witnessName: string;
  witnessTitle: string;
  witnessSignature: string;
  witnessSignedAt: string;
  additionalComments: string;
};

function emptyConfirmations(): MedicalRefusalConfirmations {
  return {
    voluntary: false,
    askedQuestions: false,
    understandsRisks: false,
    documentsDecision: false,
    mayRequestLater: false,
    doesNotWaiveRights: false,
  };
}

export const EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT: MedicalRefusalAcknowledgment = {
  confirmations: emptyConfirmations(),
  servicesOffered: [],
  servicesOther: "",
  employeeDecision: "",
  employeeDecisionOther: "",
  employeeStatementAck: false,
  employeeSignature: "",
  employeeSignedAt: "",
  witnessName: "",
  witnessTitle: "",
  witnessSignature: "",
  witnessSignedAt: "",
  additionalComments: "",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickIds<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = asText(entry).trim();
    if (!(allowed as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as T);
  }
  return out;
}

const SERVICE_IDS = MEDICAL_SERVICES_OFFERED_OPTIONS.map((o) => o.id);
const DECISION_IDS = MEDICAL_REFUSAL_DECISION_OPTIONS.map((o) => o.id);
const CONFIRMATION_IDS = MEDICAL_REFUSAL_CONFIRMATION_OPTIONS.map((o) => o.id);

export function parseMedicalRefusalAcknowledgment(
  raw: unknown,
): MedicalRefusalAcknowledgment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT, confirmations: emptyConfirmations() };
  }
  const row = raw as Record<string, unknown>;
  const confRaw =
    row.confirmations && typeof row.confirmations === "object" && !Array.isArray(row.confirmations)
      ? (row.confirmations as Record<string, unknown>)
      : {};
  const confirmations = emptyConfirmations();
  for (const id of CONFIRMATION_IDS) {
    confirmations[id] =
      confRaw[id] === true || String(confRaw[id] ?? "").toLowerCase() === "true";
  }
  const decision = asText(row.employeeDecision).trim();
  return {
    confirmations,
    servicesOffered: pickIds(row.servicesOffered, SERVICE_IDS),
    servicesOther: asText(row.servicesOther).trim(),
    employeeDecision: (DECISION_IDS as readonly string[]).includes(decision)
      ? (decision as MedicalRefusalDecisionId)
      : "",
    employeeDecisionOther: asText(row.employeeDecisionOther).trim(),
    employeeStatementAck:
      row.employeeStatementAck === true ||
      String(row.employeeStatementAck ?? "").toLowerCase() === "true",
    employeeSignature: asText(row.employeeSignature),
    employeeSignedAt: asText(row.employeeSignedAt).trim(),
    witnessName: asText(row.witnessName).trim(),
    witnessTitle: asText(row.witnessTitle).trim(),
    witnessSignature: asText(row.witnessSignature),
    witnessSignedAt: asText(row.witnessSignedAt).trim(),
    additionalComments: asText(row.additionalComments),
  };
}

export function medicalRefusalAcknowledgmentHasContent(
  value: MedicalRefusalAcknowledgment,
): boolean {
  return Boolean(
    Object.values(value.confirmations).some(Boolean) ||
      value.servicesOffered.length ||
      value.servicesOther ||
      value.employeeDecision ||
      value.employeeDecisionOther ||
      value.employeeStatementAck ||
      value.employeeSignature.trim() ||
      value.employeeSignedAt ||
      value.witnessName ||
      value.witnessTitle ||
      value.witnessSignature.trim() ||
      value.witnessSignedAt ||
      value.additionalComments.trim(),
  );
}

/** Minimum fields before saving a medical refusal acknowledgment. */
export function medicalRefusalAcknowledgmentIsComplete(
  value: MedicalRefusalAcknowledgment,
): boolean {
  const allConfirmations = MEDICAL_REFUSAL_CONFIRMATION_OPTIONS.every(
    (opt) => value.confirmations[opt.id],
  );
  const hasServices =
    value.servicesOffered.length > 0 || value.servicesOther.trim().length > 0;
  const hasDecision =
    Boolean(value.employeeDecision) &&
    (value.employeeDecision !== "other" || value.employeeDecisionOther.trim().length > 0);
  return (
    allConfirmations &&
    hasServices &&
    hasDecision &&
    value.employeeStatementAck &&
    Boolean(value.employeeSignature.trim()) &&
    Boolean(value.witnessName.trim())
  );
}

export function medicalRefusalValidationMessage(
  value: MedicalRefusalAcknowledgment,
): string | null {
  if (!MEDICAL_REFUSAL_CONFIRMATION_OPTIONS.every((opt) => value.confirmations[opt.id])) {
    return "Confirm each acknowledgment statement under “By signing below, I confirm that”.";
  }
  if (value.servicesOffered.length === 0 && !value.servicesOther.trim()) {
    return "Select the medical services offered (or enter Other).";
  }
  if (!value.employeeDecision) {
    return "Select the employee decision.";
  }
  if (value.employeeDecision === "other" && !value.employeeDecisionOther.trim()) {
    return "Describe the Other employee decision.";
  }
  if (!value.employeeStatementAck) {
    return "The employee must acknowledge the employee statement.";
  }
  if (!value.employeeSignature.trim()) {
    return "Employee signature is required.";
  }
  if (!value.witnessName.trim()) {
    return "Enter the company representative / witness name.";
  }
  return null;
}

export function summarizeMedicalRefusalAcknowledgment(
  value: MedicalRefusalAcknowledgment,
): string {
  const parts: string[] = [];
  if (value.employeeDecision) {
    const decision = MEDICAL_REFUSAL_DECISION_OPTIONS.find(
      (o) => o.id === value.employeeDecision,
    );
    parts.push(
      value.employeeDecision === "other" && value.employeeDecisionOther
        ? `Decision: ${value.employeeDecisionOther}`
        : decision?.label ?? value.employeeDecision,
    );
  }
  if (value.servicesOffered.length || value.servicesOther) {
    const services = value.servicesOffered
      .map((id) =>
        id === "other" && value.servicesOther
          ? `Other: ${value.servicesOther}`
          : MEDICAL_SERVICES_OFFERED_OPTIONS.find((o) => o.id === id)?.label,
      )
      .filter(Boolean);
    if (services.length) parts.push(`Services offered: ${services.join(", ")}`);
  }
  if (value.witnessName) parts.push(`Witness: ${value.witnessName}`);
  return parts.join(" · ");
}

export function formatMedicalRefusalDetailLines(
  value: MedicalRefusalAcknowledgment,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const confirmed = MEDICAL_REFUSAL_CONFIRMATION_OPTIONS.filter(
    (opt) => value.confirmations[opt.id],
  ).map((opt) => opt.label);
  if (confirmed.length) {
    rows.push({ label: "Confirmations", value: confirmed.join(" ") });
  }
  const services = value.servicesOffered
    .map((id) =>
      id === "other" && value.servicesOther
        ? `Other: ${value.servicesOther}`
        : MEDICAL_SERVICES_OFFERED_OPTIONS.find((o) => o.id === id)?.label,
    )
    .filter((label): label is string => Boolean(label));
  if (services.length) rows.push({ label: "Medical services offered", value: services.join(", ") });
  if (value.employeeDecision) {
    const decision = MEDICAL_REFUSAL_DECISION_OPTIONS.find(
      (o) => o.id === value.employeeDecision,
    );
    rows.push({
      label: "Employee decision",
      value:
        value.employeeDecision === "other" && value.employeeDecisionOther
          ? value.employeeDecisionOther
          : decision?.label ?? value.employeeDecision,
    });
  }
  if (value.employeeSignedAt) {
    rows.push({ label: "Employee signed", value: value.employeeSignedAt });
  }
  if (value.witnessName) {
    rows.push({
      label: "Witness",
      value: value.witnessTitle
        ? `${value.witnessName} (${value.witnessTitle})`
        : value.witnessName,
    });
  }
  if (value.witnessSignedAt) {
    rows.push({ label: "Witness signed", value: value.witnessSignedAt });
  }
  if (value.additionalComments.trim()) {
    rows.push({ label: "Additional comments", value: value.additionalComments.trim() });
  }
  return rows;
}
