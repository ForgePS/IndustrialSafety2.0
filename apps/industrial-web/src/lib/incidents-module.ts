/**
 * Incidents module — type tabs, process tabs (workflow / evaluation / RCA),
 * summary tiles, and helpers matching the legacy Safety Reports Incidents screen.
 */

import {
  bodyLocationSummaryLabel,
  bodyLocationsToLegacyFields,
  extractBodyLocationsFromPayload,
  parseBodyLocations,
} from "@/lib/incident-body-map";
import {
  parseIncidentAttachments,
  type IncidentAttachment,
} from "@/lib/incident-attachments";
import {
  EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
  medicalRefusalAcknowledgmentHasContent,
  parseMedicalRefusalAcknowledgment,
  type MedicalRefusalAcknowledgment,
} from "@/lib/medical-refusal-acknowledgment";
import {
  drugAlcoholIncidentHasContent,
  parseDrugAlcoholConsents,
  type DrugAlcoholIncidentSection,
} from "@/lib/drug-alcohol-incident";
import {
  cloneEmptyReasonableSuspicion,
  parseReasonableSuspicion,
  reasonableSuspicionHasContent,
  type ReasonableSuspicionObservation,
} from "@/lib/reasonable-suspicion";
import { matchesSearchTokens } from "@/lib/search-text";

export type {
  IncidentAttachment,
  MedicalRefusalAcknowledgment,
  DrugAlcoholIncidentSection,
  ReasonableSuspicionObservation,
};

export type IncidentCategory =
  | "injuries"
  | "near-misses"
  | "medical-refusals"
  | "drug-alcohol"
  | "property-damage"
  | "automotive";

export type IncidentProcessTab =
  | "incident-workflow"
  | "evaluation-checklist"
  | "root-cause-analysis"
  | "body-map";

export type IncidentWorkspaceTab = IncidentCategory | IncidentProcessTab;

export type IncidentTypeTab = IncidentCategory;

export const INCIDENT_TYPE_TABS: ReadonlyArray<{
  id: IncidentTypeTab;
  label: string;
  description: string;
}> = [
  {
    id: "injuries",
    label: "Injuries",
    description:
      "Document and track workplace injuries, workers' compensation status, body part affected, and OSHA recordability.",
  },
  {
    id: "near-misses",
    label: "Near Misses",
    description: "Report events that could have caused harm but did not result in injury.",
  },
  {
    id: "medical-refusals",
    label: "Medical Refusals",
    description: "Record when an EMPLOYEE declines offered medical treatment or evaluation, including the Treatment Refusal Acknowledgment.",
  },
  {
    id: "drug-alcohol",
    label: "Drug/Alcohol",
    description:
      "Document reasonable-suspicion drug and/or alcohol testing: supervisor observations, removal from duty, employee consent, and test results.",
  },
  {
    id: "property-damage",
    label: "Property Damage",
    description: "Document damage to company or client property, equipment, materials, and structures.",
  },
  {
    id: "automotive",
    label: "Automotive",
    description: "Report fleet and vehicle incidents including collisions, damage, and roadside events.",
  },
];

export const INCIDENT_PROCESS_TABS: ReadonlyArray<{
  id: IncidentProcessTab;
  label: string;
  description: string;
}> = [
  {
    id: "incident-workflow",
    label: "Incident Workflow",
    description:
      "Track each incident through identification, logging, prioritization, response, resolution, root cause analysis, and closure.",
  },
  {
    id: "evaluation-checklist",
    label: "Evaluation Checklist",
    description:
      "Complete a thorough evaluation after an incident to ensure all required steps are documented.",
  },
  {
    id: "root-cause-analysis",
    label: "Root Cause Analysis",
    description:
      "Investigate and identify root causes, then draft corrective and preventive action items to follow.",
  },
  {
    id: "body-map",
    label: "Injury Map",
    description:
      "See where injuries have happened on the body across all reported incidents, front and back.",
  },
];

export const INCIDENT_WORKSPACE_TABS = [...INCIDENT_TYPE_TABS, ...INCIDENT_PROCESS_TABS] as const;

export type IncidentSummary = {
  injuries: number;
  nearMisses: number;
  medicalRefusals: number;
  drugAlcohol: number;
  propertyDamage: number;
  automotive: number;
  open: number;
  inWorkflow: number;
  evaluations: number;
  rcas: number;
  total: number;
};

export const EMPTY_INCIDENT_SUMMARY: IncidentSummary = {
  injuries: 0,
  nearMisses: 0,
  medicalRefusals: 0,
  drugAlcohol: 0,
  propertyDamage: 0,
  automotive: 0,
  open: 0,
  inWorkflow: 0,
  evaluations: 0,
  rcas: 0,
  total: 0,
};

/** Sneat label tone used for the tile avatar. */
export type IncidentTileTone = "primary" | "info" | "success" | "warning" | "danger" | "secondary";

export type IncidentSummaryTile = {
  id: string;
  label: string;
  value: number;
  /** When set, clicking the tile switches to that workspace tab. */
  tab?: IncidentWorkspaceTab;
  tone: IncidentTileTone;
  /** Boxicons class name (Sneat icon set). */
  icon: string;
};

export function incidentSummaryTiles(summary: IncidentSummary): IncidentSummaryTile[] {
  return [
    {
      id: "injuries",
      label: "Injuries",
      value: summary.injuries,
      tab: "injuries",
      tone: "danger",
      icon: "bx-first-aid",
    },
    {
      id: "near-misses",
      label: "Near Misses",
      value: summary.nearMisses,
      tab: "near-misses",
      tone: "warning",
      icon: "bx-error",
    },
    {
      id: "medical-refusals",
      label: "Medical Refusals",
      value: summary.medicalRefusals,
      tab: "medical-refusals",
      tone: "info",
      icon: "bx-user-x",
    },
    {
      id: "drug-alcohol",
      label: "Drug/Alcohol",
      value: summary.drugAlcohol,
      tab: "drug-alcohol",
      tone: "warning",
      icon: "bx-test-tube",
    },
    {
      id: "property-damage",
      label: "Property Damage",
      value: summary.propertyDamage,
      tab: "property-damage",
      tone: "secondary",
      icon: "bx-buildings",
    },
    {
      id: "automotive",
      label: "Automotive",
      value: summary.automotive,
      tab: "automotive",
      tone: "primary",
      icon: "bx-car",
    },
    { id: "open", label: "Open", value: summary.open, tone: "danger", icon: "bx-folder-open" },
    {
      id: "in-workflow",
      label: "In Workflow",
      value: summary.inWorkflow,
      tab: "incident-workflow",
      tone: "warning",
      icon: "bx-transfer",
    },
    {
      id: "evaluations",
      label: "Evaluations",
      value: summary.evaluations,
      tab: "evaluation-checklist",
      tone: "success",
      icon: "bx-list-check",
    },
    {
      id: "rcas",
      label: "RCAs",
      value: summary.rcas,
      tab: "root-cause-analysis",
      tone: "primary",
      icon: "bx-search-alt",
    },
  ];
}

export function toIncidentSummary(raw: unknown): IncidentSummary {
  if (!raw || typeof raw !== "object") return { ...EMPTY_INCIDENT_SUMMARY };
  const r = raw as Record<string, unknown>;
  const num = (key: keyof IncidentSummary) =>
    typeof r[key] === "number" && Number.isFinite(r[key]) ? (r[key] as number) : 0;
  return {
    injuries: num("injuries"),
    nearMisses: num("nearMisses"),
    medicalRefusals: num("medicalRefusals"),
    drugAlcohol: num("drugAlcohol"),
    propertyDamage: num("propertyDamage"),
    automotive: num("automotive"),
    open: num("open"),
    inWorkflow: num("inWorkflow"),
    evaluations: num("evaluations"),
    rcas: num("rcas"),
    total: num("total"),
  };
}

export type LifecycleStepStatus = "pending" | "in-progress" | "complete";

export type IncidentLifecycleStageId =
  | "identification"
  | "logging-categorization"
  | "prioritization"
  | "response-investigation-mitigation"
  | "resolution"
  | "post-incident-review"
  | "closure";

export type IncidentLifecycleStep = {
  stageId: IncidentLifecycleStageId;
  status: LifecycleStepStatus;
  notes: string;
  completedAt?: string;
  completedBy?: string;
};

export type IncidentLifecycleData = {
  currentStage: IncidentLifecycleStageId;
  ticketId: string;
  subCategory: string;
  priority: string;
  impact: string;
  urgency: string;
  workaround: string;
  resolutionSummary: string;
  userConfirmed: boolean;
  knowledgeBaseNotes: string;
  steps: IncidentLifecycleStep[];
};

export const INCIDENT_LIFECYCLE_STAGES: ReadonlyArray<{
  id: IncidentLifecycleStageId;
  step: number;
  title: string;
  description: string;
}> = [
  {
    id: "identification",
    step: 1,
    title: "Identification",
    description: "Initial detection and reporting of the incident.",
  },
  {
    id: "logging-categorization",
    step: 2,
    title: "Logging and Categorization",
    description: "Record details and assign category / sub-category for routing.",
  },
  {
    id: "prioritization",
    step: 3,
    title: "Prioritization",
    description: "Evaluate impact and urgency to set severity / priority.",
  },
  {
    id: "response-investigation-mitigation",
    step: 4,
    title: "Response, Investigation, and Mitigation",
    description: "Diagnose causes and apply workarounds or fixes.",
  },
  {
    id: "resolution",
    step: 5,
    title: "Resolution",
    description: "Implement the solution and restore normal operations.",
  },
  {
    id: "post-incident-review",
    step: 6,
    title: "Root Cause Analysis (Closure Prep)",
    description: "Document root cause and preventive steps for major incidents.",
  },
  {
    id: "closure",
    step: 7,
    title: "Closure",
    description: "Confirm the fix, update knowledge base, and close the ticket.",
  },
];

export type EvaluationChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  notes: string;
  photos?: string[];
};

export type EvaluationChecklist = {
  completedBy: string;
  completedAt: string;
  overallNotes: string;
  items: EvaluationChecklistItem[];
};

/** Matches the legacy Post-Incident Evaluation Checklist labels. */
export const EVALUATION_CHECKLIST_TEMPLATE: ReadonlyArray<
  Omit<EvaluationChecklistItem, "checked" | "notes" | "photos">
> = [
  { id: "witnesses-interviewed", label: "Incident witness identified and interviewed" },
  { id: "witness-statements", label: "Witness statements collected" },
  { id: "photos", label: "Photos documentation taken of scene" },
  { id: "equipment", label: "Equipment/tools involved identified and tagged" },
  { id: "ppe", label: "PPE use verified and documented" },
  { id: "training", label: "EMPLOYEE training records checked" },
  { id: "jsa", label: "Applicable SOPs/JSA reviewed" },
  { id: "specialist", label: "Specialist/expert notified" },
  { id: "medical", label: "Medical evaluation offered (as appropriate)" },
  { id: "drug-alcohol-consent", label: "Drug & alcohol consent obtained (if required)" },
  { id: "drug-alcohol-test", label: "Drug & alcohol test ordered / completed (if required)" },
  { id: "osha", label: "OSHA recordability determination made" },
  { id: "corrective", label: "Immediate corrective actions implemented" },
  { id: "authorities", label: "Communication with local authorities (if applicable)" },
];

export type CorrectiveAction = {
  id: string;
  action: string;
  assignedTo: string;
  dueDate: string;
  status: string;
};

export type RootCauseAnalysis = {
  incidentSummary: string;
  immediateActions: string;
  contributingFactors: string[];
  rootCause: string;
  /** Answer for each of the 5 whys (index-aligned with fiveWhyQuestions). */
  fiveWhys: string[];
  fiveWhyQuestions: string[];
  correctiveActions: CorrectiveAction[];
  conductedBy: string;
  conductedAt: string;
  participantsInvolved: string[];
  eventDate: string;
};

export type IncidentRecord = {
  id: string;
  title: string;
  status: string;
  category: string;
  severity: string;
  location: string;
  description: string;
  reportedBy: string;
  reportedByTitle: string;
  reportedByPhone: string;
  reportedByDate: string;
  createdAt: string;
  updatedAt: string;
  dateOccurred: string;
  personAffected: string;
  /** Linked Employee Profile id when Person affected was picked from search. */
  personnelId: string;
  incidentTypeName: string;
  division: string;
  community: string;
  witnessNames: string;
  departmentName: string;
  workDayDetails: string;
  submittedAt: string;
  injuriesFront: string;
  injuriesBack: string;
  /** OSHA body-part region ids marked on the body map (front/back). */
  bodyLocations: string[];
  siteId: string;
  departmentId: string;
  locationDetail: string;
  /** Employee hire date copied from the linked profile when available. */
  hireDate: string;
  /** Employee date of birth copied from the linked profile when available. */
  dateOfBirth: string;
  /** Time employee began work / shift start (OSHA Form 301 field 12). HH:MM. */
  shiftStartTime: string;
  /** OSHA Form 301 — physician / treatment (seeded into OSHA cases). */
  physicianName: string;
  treatmentFacility: string;
  treatmentStreet: string;
  treatmentCity: string;
  treatmentState: string;
  treatmentZip: string;
  treatedInEr: boolean | null;
  hospitalizedOvernight: boolean | null;
  /** OSHA Form 301 — completed-by block (seeded into OSHA cases). */
  completedBy: string;
  completedByTitle: string;
  completedByPhone: string;
  completedByDate: string;
  workersCompRelevant: boolean;
  workersCompNotes: string;
  /** Linked workers' comp case id when a case was opened from this incident. */
  workersCompCaseId: string;
  /** Linked OSHA Form 300/301 case id when OSHA info was entered for this incident. */
  oshaCaseId: string;
  /** Attached documents (forgeDocuments refs). */
  attachments: IncidentAttachment[];
  /** Medical Evaluation / Treatment Refusal Acknowledgment (medical-refusals). */
  medicalRefusalAcknowledgment: MedicalRefusalAcknowledgment | null;
  /** Supervisor reasonable-suspicion observation (drug-alcohol). */
  reasonableSuspicion: ReasonableSuspicionObservation | null;
  /** Drug & alcohol consent + test documentation, one per employee involved. */
  drugAlcoholConsents: DrugAlcoholIncidentSection[];
  lifecycle: IncidentLifecycleData | null;
  evaluationChecklist: EvaluationChecklist | null;
  rootCauseAnalysis: RootCauseAnalysis | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstText(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function parseLifecycle(raw: unknown): IncidentLifecycleData | null {
  const r = asRecord(raw);
  if (!r) return null;
  const stepsRaw = Array.isArray(r.steps) ? r.steps : [];
  const steps = stepsRaw
    .map((step): IncidentLifecycleStep | null => {
      const s = asRecord(step);
      if (!s) return null;
      const stageId = String(s.stageId ?? "") as IncidentLifecycleStageId;
      if (!INCIDENT_LIFECYCLE_STAGES.some((stage) => stage.id === stageId)) return null;
      const statusRaw = String(s.status ?? "pending").toLowerCase();
      const status: LifecycleStepStatus =
        statusRaw === "complete" || statusRaw === "in-progress" ? statusRaw : "pending";
      return {
        stageId,
        status,
        notes: typeof s.notes === "string" ? s.notes : "",
        ...(typeof s.completedAt === "string" ? { completedAt: s.completedAt } : {}),
        ...(typeof s.completedBy === "string" ? { completedBy: s.completedBy } : {}),
      };
    })
    .filter((s): s is IncidentLifecycleStep => s !== null);
  if (steps.length === 0) return null;
  const currentStage = String(r.currentStage ?? steps[0]?.stageId ?? "identification") as IncidentLifecycleStageId;
  return {
    currentStage: INCIDENT_LIFECYCLE_STAGES.some((s) => s.id === currentStage)
      ? currentStage
      : "identification",
    ticketId: typeof r.ticketId === "string" ? r.ticketId : "",
    subCategory: typeof r.subCategory === "string" ? r.subCategory : "",
    priority: typeof r.priority === "string" ? r.priority : "P3",
    impact: typeof r.impact === "string" ? r.impact : "",
    urgency: typeof r.urgency === "string" ? r.urgency : "",
    workaround: typeof r.workaround === "string" ? r.workaround : "",
    resolutionSummary: typeof r.resolutionSummary === "string" ? r.resolutionSummary : "",
    userConfirmed: Boolean(r.userConfirmed),
    knowledgeBaseNotes: typeof r.knowledgeBaseNotes === "string" ? r.knowledgeBaseNotes : "",
    steps,
  };
}

function parseEvaluationChecklist(raw: unknown): EvaluationChecklist | null {
  const r = asRecord(raw);
  if (!r) return null;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items = itemsRaw
    .map((item): EvaluationChecklistItem | null => {
      const i = asRecord(item);
      if (!i || typeof i.id !== "string" || typeof i.label !== "string") return null;
      const photos = Array.isArray(i.photos)
        ? i.photos.filter((p): p is string => typeof p === "string")
        : undefined;
      return {
        id: i.id,
        label: i.label,
        checked: Boolean(i.checked),
        notes: typeof i.notes === "string" ? i.notes : "",
        ...(photos ? { photos } : {}),
      };
    })
    .filter((i): i is EvaluationChecklistItem => i !== null);
  if (items.length === 0) return null;
  return {
    completedBy: typeof r.completedBy === "string" ? r.completedBy : "",
    completedAt: typeof r.completedAt === "string" ? r.completedAt : "",
    overallNotes: typeof r.overallNotes === "string" ? r.overallNotes : "",
    items,
  };
}

/** Exactly 5 string slots; keeps saved entries in order and pads or trims the rest. */
export function padFiveWhys(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map((w) => (typeof w === "string" ? w : "")) : [];
  return Array.from({ length: 5 }, (_, i) => list[i] ?? "");
}

function parseRootCauseAnalysis(raw: unknown): RootCauseAnalysis | null {
  const r = asRecord(raw);
  if (!r) return null;
  const correctiveActions = Array.isArray(r.correctiveActions)
    ? r.correctiveActions
        .map((action) => {
          const a = asRecord(action);
          if (!a) return null;
          return {
            id: typeof a.id === "string" ? a.id : `ca-${Date.now()}`,
            action: typeof a.action === "string" ? a.action : "",
            assignedTo: typeof a.assignedTo === "string" ? a.assignedTo : "",
            dueDate: typeof a.dueDate === "string" ? a.dueDate : "",
            status: typeof a.status === "string" ? a.status : "pending",
          };
        })
        .filter((a): a is CorrectiveAction => a !== null)
    : [];
  return {
    incidentSummary: typeof r.incidentSummary === "string" ? r.incidentSummary : "",
    immediateActions: typeof r.immediateActions === "string" ? r.immediateActions : "",
    contributingFactors: Array.isArray(r.contributingFactors)
      ? r.contributingFactors.filter((f): f is string => typeof f === "string")
      : [],
    rootCause: typeof r.rootCause === "string" ? r.rootCause : "",
    fiveWhys: padFiveWhys(r.fiveWhys),
    fiveWhyQuestions: padFiveWhys(r.fiveWhyQuestions),
    correctiveActions,
    conductedBy: typeof r.conductedBy === "string" ? r.conductedBy : "",
    conductedAt: typeof r.conductedAt === "string" ? r.conductedAt : "",
    participantsInvolved: Array.isArray(r.participantsInvolved)
      ? r.participantsInvolved.filter((p): p is string => typeof p === "string")
      : [],
    eventDate: typeof r.eventDate === "string" ? r.eventDate : "",
  };
}

function parseIncidentYesNo(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "true" || text === "yes" || text === "y") return true;
  if (text === "false" || text === "no" || text === "n") return false;
  return null;
}

export function toIncidentRecord(row: unknown): IncidentRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const text = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  const personAffected = text("personAffected") || firstText(r, ["PersonAffected", "Person"]);
  const personnelId = text("personnelId");
  const dateOccurred =
    text("dateOccurred") || firstText(r, ["IncidentDateTime", "DTStamp", "reportDateTime"]);
  const community = text("community") || firstText(r, ["Community"]);
  const division = text("division") || firstText(r, ["Division"]);
  const location =
    text("location") ||
    text("site") ||
    firstText(r, ["IncidentLocationName", "LocationDetail"]);
  const locationDetail = text("locationDetail") || firstText(r, ["LocationDetail"]);
  const departmentName = text("departmentName") || firstText(r, ["DepartmentName", "department"]);
  const siteId = text("siteId");
  const departmentId = text("departmentId");
  const hireDate = text("hireDate") || firstText(r, ["HireDate", "hire_date"]);
  const dateOfBirth =
    text("dateOfBirth") || firstText(r, ["DateOfBirth", "date_of_birth", "dob", "birthDate"]);
  const shiftStartRaw =
    text("shiftStartTime") ||
    firstText(r, ["ShiftStartTime", "timeBeganWork", "workStartTime", "TimeBeganWork"]);
  const shiftStartTime = normalizeIncidentShiftStartTime(shiftStartRaw);
  const physicianName =
    text("physicianName") || firstText(r, ["physician", "doctor", "PhysicianName"]);
  const treatmentFacility =
    text("treatmentFacility") || firstText(r, ["facility", "clinic", "TreatmentFacility"]);
  const treatmentStreet =
    text("treatmentStreet") || firstText(r, ["facilityStreet", "TreatmentStreet"]);
  const treatmentCity = text("treatmentCity") || firstText(r, ["facilityCity", "TreatmentCity"]);
  const treatmentState =
    text("treatmentState") || firstText(r, ["facilityState", "TreatmentState"]);
  const treatmentZip =
    text("treatmentZip") || firstText(r, ["facilityZip", "TreatmentZip"]);
  const treatedInEr = parseIncidentYesNo(r.treatedInEr ?? r.emergencyRoom);
  const hospitalizedOvernight = parseIncidentYesNo(
    r.hospitalizedOvernight ?? r.hospitalized ?? r.inpatient,
  );
  const completedBy =
    text("completedBy") || firstText(r, ["CompletedBy", "submittedBy", "SubmittedBy"]);
  const reportedByTitle =
    text("reportedByTitle") || firstText(r, ["ReportedByTitle"]);
  const reportedByPhone =
    text("reportedByPhone") || firstText(r, ["ReportedByPhone"]);
  const reportedByDateRaw =
    text("reportedByDate") || firstText(r, ["ReportedByDate"]);
  const reportedByDate = /^\d{4}-\d{2}-\d{2}/.test(reportedByDateRaw)
    ? reportedByDateRaw.slice(0, 10)
    : formatIncidentHireDateForInput(reportedByDateRaw);
  const completedByTitle =
    text("completedByTitle") || firstText(r, ["CompletedByTitle", "Title"]);
  const completedByPhone =
    text("completedByPhone") ||
    firstText(r, ["CompletedByPhone", "Phone"]) ||
    reportedByPhone;
  const completedByDateRaw =
    text("completedByDate") || firstText(r, ["CompletedByDate", "reportDate", "submittedAt"]);
  const completedByDate = /^\d{4}-\d{2}-\d{2}/.test(completedByDateRaw)
    ? completedByDateRaw.slice(0, 10)
    : formatIncidentHireDateForInput(completedByDateRaw);
  const workersCompCaseId = text("workersCompCaseId");
  const oshaCaseId = text("oshaCaseId");
  const workersCompRelevant =
    r.workersCompRelevant === true ||
    String(r.workersCompRelevant ?? "").toLowerCase() === "true" ||
    Boolean(workersCompCaseId);
  const workersCompNotes = text("workersCompNotes");
  const attachments = parseIncidentAttachments(r.attachments);
  const refusalParsed = parseMedicalRefusalAcknowledgment(r.medicalRefusalAcknowledgment);
  const medicalRefusalAcknowledgment = medicalRefusalAcknowledgmentHasContent(refusalParsed)
    ? refusalParsed
    : null;
  const suspicionParsed = parseReasonableSuspicion(r.reasonableSuspicion);
  const reasonableSuspicion = reasonableSuspicionHasContent(suspicionParsed)
    ? suspicionParsed
    : null;
  const drugAlcoholConsents = parseDrugAlcoholConsents(r, {
    employeeName: personAffected,
    personnelId,
  });
  const rawTitle = text("title") || text("displayName") || text("IncidentName") || "";
  return {
    id,
    title: deriveIncidentTitle({
      title: rawTitle,
      dateOccurred,
      personAffected,
      community,
      division,
      location,
      locationDetail,
      departmentName,
    }),
    status: text("status") || "open",
    category: text("category") || text("incidentCategory"),
    severity: text("severity"),
    location,
    description:
      text("description") ||
      firstText(r, ["IncidentDescription", "WorkDayDetails", "InjuryTypeDesc"]),
    reportedBy: text("reportedBy") || firstText(r, ["SubmittedBy", "Person"]),
    reportedByTitle,
    reportedByPhone,
    reportedByDate,
    createdAt: text("createdAt"),
    updatedAt: text("updatedAt"),
    dateOccurred,
    personAffected,
    personnelId,
    incidentTypeName: text("incidentTypeName") || firstText(r, ["IncidentTypeName"]),
    division,
    community,
    witnessNames: text("witnessNames") || firstText(r, ["WitnessNames", "witnessName"]),
    departmentName,
    workDayDetails: text("workDayDetails") || firstText(r, ["WorkDayDetails"]),
    submittedAt:
      text("submittedAt") || firstText(r, ["IncidentSubmitted", "reportDateTime", "DTStamp"]),
    injuriesFront: text("injuriesFront") || firstText(r, ["InjuriesFront"]),
    injuriesBack: text("injuriesBack") || firstText(r, ["InjuriesBack"]),
    bodyLocations: extractBodyLocationsFromPayload(r),
    siteId,
    departmentId,
    locationDetail,
    hireDate: /^\d{4}-\d{2}-\d{2}/.test(hireDate) ? hireDate.slice(0, 10) : hireDate,
    dateOfBirth: /^\d{4}-\d{2}-\d{2}/.test(dateOfBirth)
      ? dateOfBirth.slice(0, 10)
      : dateOfBirth,
    shiftStartTime,
    physicianName,
    treatmentFacility,
    treatmentStreet,
    treatmentCity,
    treatmentState,
    treatmentZip,
    treatedInEr,
    hospitalizedOvernight,
    completedBy:
      completedBy || text("reportedBy") || firstText(r, ["SubmittedBy", "Person"]),
    completedByTitle,
    completedByPhone,
    completedByDate,
    workersCompRelevant,
    workersCompNotes,
    workersCompCaseId,
    oshaCaseId,
    attachments,
    medicalRefusalAcknowledgment,
    reasonableSuspicion,
    drugAlcoholConsents,
    lifecycle: parseLifecycle(r.lifecycle),
    evaluationChecklist: parseEvaluationChecklist(r.evaluationChecklist),
    rootCauseAnalysis: parseRootCauseAnalysis(r.rootCauseAnalysis),
  };
}

export function toIncidentRecords(rows: unknown[]): IncidentRecord[] {
  return rows.map(toIncidentRecord).filter((r): r is IncidentRecord => r !== null);
}

/** Labeled rows for the printable / on-screen incident report. */
export function incidentReportDetailRows(
  incident: IncidentRecord,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Status", value: incident.status },
    { label: "Type", value: incident.incidentTypeName || incident.category || "" },
    { label: "Severity", value: incident.severity },
    { label: "Person affected", value: incident.personAffected },
    { label: "Reported by", value: incident.reportedBy },
    { label: "Reporter title", value: incident.reportedByTitle },
    { label: "Reporter phone", value: incident.reportedByPhone },
    { label: "Reported date", value: incident.reportedByDate },
    { label: "Witnesses", value: incident.witnessNames },
    { label: "Occurred", value: incident.dateOccurred },
    { label: "Hire date", value: incident.hireDate },
    { label: "Date of birth", value: incident.dateOfBirth },
    {
      label: "Shift start time",
      value: formatIncidentShiftStartTimeDisplay(incident.shiftStartTime),
    },
    { label: "Physician / health care professional", value: incident.physicianName },
    { label: "Treatment facility", value: incident.treatmentFacility },
    {
      label: "Treatment address",
      value: [
        incident.treatmentStreet,
        [incident.treatmentCity, incident.treatmentState, incident.treatmentZip]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: "Treated in emergency room",
      value:
        incident.treatedInEr === true ? "Yes" : incident.treatedInEr === false ? "No" : "",
    },
    {
      label: "Hospitalized overnight",
      value:
        incident.hospitalizedOvernight === true
          ? "Yes"
          : incident.hospitalizedOvernight === false
            ? "No"
            : "",
    },
    { label: "Completed by", value: incident.completedBy },
    { label: "Title", value: incident.completedByTitle },
    { label: "Phone", value: incident.completedByPhone },
    { label: "Date completed", value: incident.completedByDate },
    { label: "Submitted", value: incident.submittedAt },
    { label: "Location", value: incident.location },
    { label: "Body part", value: bodyLocationSummaryLabel(incident.bodyLocations) },
    { label: "Department", value: incident.departmentName },
    { label: "Division", value: incident.division },
    { label: "Area / community", value: incident.community },
    { label: "Injuries (front)", value: incident.injuriesFront },
    { label: "Injuries (back)", value: incident.injuriesBack },
  ];
  const multipleConsents = incident.drugAlcoholConsents.length > 1;
  for (const [index, da] of incident.drugAlcoholConsents.entries()) {
    const prefix = multipleConsents
      ? `D&A (${da.employeeName || `employee ${index + 1}`})`
      : "D&A";
    rows.push(
      ...(multipleConsents ? [] : [{ label: "D&A employee", value: da.employeeName }]),
      { label: `${prefix} testing required`, value: da.testingRequired ? "Yes" : "No" },
    );
    if (!da.testingRequired) continue;
    rows.push(
      {
        label: `${prefix} reason`,
        value:
          da.reason === "other"
            ? da.reasonOther || "Other"
            : da.reason.replace(/-/g, " "),
      },
      { label: `${prefix} consent signed`, value: da.employeeSignature ? "Yes" : "" },
      { label: `${prefix} test status`, value: da.testStatus.replace(/-/g, " ") },
      { label: `${prefix} substances`, value: da.substances.join(", ") },
      { label: `${prefix} collection site`, value: da.collectionSite },
      { label: `${prefix} result notes`, value: da.resultNotes },
    );
  }
  return rows.filter((row) => row.value.trim() !== "");
}

export function isIncidentCategoryTab(tab: IncidentWorkspaceTab): tab is IncidentCategory {
  return INCIDENT_TYPE_TABS.some((t) => t.id === tab);
}

export function isIncidentProcessTab(tab: IncidentWorkspaceTab): tab is IncidentProcessTab {
  return INCIDENT_PROCESS_TABS.some((t) => t.id === tab);
}

export function parseIncidentTab(raw: string | null | undefined): IncidentTypeTab {
  if (
    raw === "near-misses" ||
    raw === "medical-refusals" ||
    raw === "drug-alcohol" ||
    raw === "property-damage" ||
    raw === "automotive"
  ) {
    return raw;
  }
  return "injuries";
}

export function parseIncidentWorkspaceTab(raw: string | null | undefined): IncidentWorkspaceTab {
  if (
    raw === "near-misses" ||
    raw === "medical-refusals" ||
    raw === "drug-alcohol" ||
    raw === "property-damage" ||
    raw === "automotive" ||
    raw === "incident-workflow" ||
    raw === "evaluation-checklist" ||
    raw === "root-cause-analysis" ||
    raw === "body-map"
  ) {
    return raw;
  }
  return "injuries";
}

/** Build Incidents module URL with optional tab, report, and body-map region. */
export function incidentWorkspaceHref(
  tab: IncidentWorkspaceTab = "injuries",
  extras: { incident?: string; region?: string } = {},
): string {
  const params = new URLSearchParams();
  if (tab !== "injuries") params.set("tab", tab);
  if (extras.incident) params.set("incident", extras.incident);
  if (extras.region) params.set("region", extras.region);
  const qs = params.toString();
  return qs ? `/modules/incidents/?${qs}` : "/modules/incidents/";
}

/** Deep link into the Incidents module for a specific report. */
export function incidentReportHref(incident: {
  id: string;
  category?: string | null;
}): string {
  const parsed = parseIncidentWorkspaceTab(incident.category ?? null);
  const tab = isIncidentCategoryTab(parsed) ? parsed : "injuries";
  const params = new URLSearchParams({
    tab,
    incident: incident.id,
  });
  return `/modules/incidents/?${params.toString()}`;
}

export function incidentTabLabel(tab: IncidentWorkspaceTab): string {
  return INCIDENT_WORKSPACE_TABS.find((t) => t.id === tab)?.label ?? tab;
}

export function incidentTabDescription(tab: IncidentWorkspaceTab): string {
  return INCIDENT_WORKSPACE_TABS.find((t) => t.id === tab)?.description ?? "";
}

export function statusBadgeClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key === "open" || key === "active") return "bg-label-danger";
  if (key.includes("review") || key.includes("workflow")) return "bg-label-warning";
  if (key === "closed" || key === "resolved") return "bg-label-success";
  return "bg-label-secondary";
}

/** Sneat label badge for a workflow step status. */
export function lifecycleStepBadgeClass(status: LifecycleStepStatus): string {
  if (status === "complete") return "bg-label-success";
  if (status === "in-progress") return "bg-label-warning";
  return "bg-label-secondary";
}

export function lifecycleStepLabel(status: LifecycleStepStatus): string {
  if (status === "complete") return "Complete";
  if (status === "in-progress") return "In progress";
  return "Pending";
}

export type IncidentCreateFormState = {
  title: string;
  severity: string;
  location: string;
  locationDetail: string;
  description: string;
  reportedBy: string;
  reportedByTitle: string;
  reportedByPhone: string;
  reportedByDate: string;
  dateOccurred: string;
  status: string;
  personAffected: string;
  personnelId: string;
  witnessNames: string;
  correctiveActions: string;
  division: string;
  community: string;
  siteId: string;
  departmentId: string;
  incidentTypeName: string;
  hireDate: string;
  dateOfBirth: string;
  shiftStartTime: string;
  physicianName: string;
  treatmentFacility: string;
  treatmentStreet: string;
  treatmentCity: string;
  treatmentState: string;
  treatmentZip: string;
  treatedInEr: boolean | null;
  hospitalizedOvernight: boolean | null;
  completedBy: string;
  completedByTitle: string;
  completedByPhone: string;
  completedByDate: string;
  workersCompRelevant: boolean;
  workersCompNotes: string;
  medicalRefusalAcknowledgment: MedicalRefusalAcknowledgment;
  reasonableSuspicion: ReasonableSuspicionObservation;
  drugAlcoholConsents: DrugAlcoholIncidentSection[];
};

export const INCIDENT_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-review", label: "In review" },
  { value: "in-workflow", label: "In workflow" },
  { value: "closed", label: "Closed" },
] as const;

export const INCIDENT_SEVERITY_OPTIONS = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "serious", label: "Serious" },
  { value: "critical", label: "Critical" },
] as const;

/** Injury type picklist for new/edit injury reports. */
export const INJURY_TYPE_OPTIONS = [
  "No Injury",
  "Abrasion / Scrape",
  "Amputation",
  "Avulsion",
  "Bite",
  "Blister",
  "Bruise / Contusion",
  "Burn – Chemical",
  "Burn – Electrical",
  "Burn – Thermal / Heat",
  "Burn – Other",
  "Chemical Exposure",
  "Concussion",
  "Crush Injury",
  "Cut / Laceration",
  "Dislocation",
  "Electric Shock",
  "Eye Injury",
  "Foreign Body",
  "Fracture",
  "Frostbite / Cold Injury",
  "Hearing Injury / Hearing Loss",
  "Heat Exhaustion",
  "Heat Stroke",
  "Hernia",
  "Inhalation Injury",
  "Internal Injury",
  "Loss of Consciousness",
  "Musculoskeletal Injury",
  "Needle Stick / Sharps Injury",
  "Nerve Injury",
  "Puncture Wound",
  "Respiratory Irritation",
  "Skin Irritation / Dermatitis",
  "Sprain",
  "Strain",
  "Tendon / Ligament Injury",
  "Traumatic Brain Injury",
  "Other Injury",
] as const;

export const INCIDENTS_API = "/api/v1/industrial/incidents";

export function formatIncidentDateForInput(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  const hasTime = /T\d{2}:\d{2}|\d{1,2}:\d{2}\s*[AaPp][Mm]/.test(raw);
  if (hasTime) return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  return `${yyyy}-${mm}-${dd}`;
}

/** Split stored `dateOccurred` into date (`yyyy-mm-dd`) and time (`HH:mm`) for form inputs. */
export function splitIncidentDateOccurred(value?: string | null): {
  date: string;
  time: string;
} {
  const normalized = formatIncidentDateForInput(value);
  if (!normalized) return { date: "", time: "" };
  if (normalized.includes("T")) {
    const [datePart, timePart = ""] = normalized.split("T");
    return { date: datePart ?? "", time: timePart.slice(0, 5) };
  }
  return { date: normalized.slice(0, 10), time: "" };
}

/** Join date + time inputs back into stored `dateOccurred` (`yyyy-mm-dd` or `yyyy-mm-ddTHH:mm`). */
export function joinIncidentDateOccurred(date: string, time: string): string {
  const d = date.trim().slice(0, 10);
  const t = time.trim().slice(0, 5);
  if (!d) return "";
  if (!t) return d;
  return `${d}T${t}`;
}

/** Local `yyyy-mm-ddTHH:mm` for datetime defaults (create / missing edit date). */
export function defaultIncidentDateOccurred(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function incidentRecordToCreateFormState(
  incident: IncidentRecord,
  defaultReporter = "",
): IncidentCreateFormState {
  const corrective =
    incident.workDayDetails.trim() &&
    incident.workDayDetails.trim() !== incident.description.trim()
      ? incident.workDayDetails
      : incident.workDayDetails.trim();
  const dateOccurred =
    formatIncidentDateForInput(incident.dateOccurred) || defaultIncidentDateOccurred();
  const existingTitle = incident.title.trim();
  const title =
    existingTitle ||
    suggestIncidentTitle({
      dateOccurred,
      personAffected: incident.personAffected,
      location: resolveIncidentTitleLocation({
        location: incident.location,
        community: incident.community,
        division: incident.division,
        locationDetail: incident.locationDetail,
      }),
    });
  return {
    title,
    severity: incident.severity || "moderate",
    location: incident.location,
    locationDetail: incident.locationDetail,
    description: incident.description,
    reportedBy: incident.reportedBy || defaultReporter,
    reportedByTitle: incident.reportedByTitle,
    reportedByPhone: incident.reportedByPhone,
    reportedByDate:
      formatIncidentHireDateForInput(incident.reportedByDate) ||
      dateOccurred.slice(0, 10),
    dateOccurred,
    status: incident.status || "open",
    personAffected: incident.personAffected,
    personnelId: incident.personnelId,
    witnessNames: incident.witnessNames,
    correctiveActions: corrective,
    division: incident.division,
    community: incident.community,
    siteId: incident.siteId,
    departmentId: incident.departmentId,
    incidentTypeName: incident.incidentTypeName,
    hireDate: formatIncidentHireDateForInput(incident.hireDate),
    dateOfBirth: formatIncidentHireDateForInput(incident.dateOfBirth),
    shiftStartTime: normalizeIncidentShiftStartTime(incident.shiftStartTime),
    physicianName: incident.physicianName,
    treatmentFacility: incident.treatmentFacility,
    treatmentStreet: incident.treatmentStreet,
    treatmentCity: incident.treatmentCity,
    treatmentState: incident.treatmentState,
    treatmentZip: incident.treatmentZip,
    treatedInEr: incident.treatedInEr,
    hospitalizedOvernight: incident.hospitalizedOvernight,
    completedBy: incident.completedBy || incident.reportedBy || defaultReporter,
    completedByTitle: incident.completedByTitle,
    completedByPhone: incident.completedByPhone || incident.reportedByPhone,
    completedByDate:
      formatIncidentHireDateForInput(incident.completedByDate) ||
      defaultIncidentDateOccurred().slice(0, 10),
    workersCompRelevant: incident.workersCompRelevant,
    workersCompNotes: incident.workersCompNotes,
    medicalRefusalAcknowledgment:
      incident.medicalRefusalAcknowledgment ??
      ({
        ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
        confirmations: { ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT.confirmations },
      } satisfies MedicalRefusalAcknowledgment),
    reasonableSuspicion: incident.reasonableSuspicion
      ? {
          ...incident.reasonableSuspicion,
          indicators: [...incident.reasonableSuspicion.indicators],
        }
      : cloneEmptyReasonableSuspicion(),
    drugAlcoholConsents: incident.drugAlcoholConsents.map((consent) => ({
      ...consent,
      consent: { ...consent.consent },
      substances: [...consent.substances],
    })),
  };
}

export function buildIncidentUpdatePayload(
  form: IncidentCreateFormState,
  category: IncidentCategory,
  bodyLocations: readonly string[] = [],
  extras: {
    siteLabel?: string;
    departmentLabel?: string;
    companyName?: string;
  } = {},
): IncidentCreatePayload {
  return buildIncidentCreatePayload(form, category, bodyLocations, extras);
}

export function emptyIncidentCreateForm(defaultReporter = ""): IncidentCreateFormState {
  const dateOccurred = defaultIncidentDateOccurred();
  return {
    title: suggestIncidentTitle({ dateOccurred }),
    severity: "moderate",
    location: "",
    locationDetail: "",
    description: "",
    reportedBy: defaultReporter,
    reportedByTitle: "",
    reportedByPhone: "",
    reportedByDate: dateOccurred.slice(0, 10),
    dateOccurred,
    status: "open",
    personAffected: "",
    personnelId: "",
    witnessNames: "",
    correctiveActions: "",
    division: "",
    community: "",
    siteId: "",
    departmentId: "",
    incidentTypeName: "",
    hireDate: "",
    dateOfBirth: "",
    shiftStartTime: "",
    physicianName: "",
    treatmentFacility: "",
    treatmentStreet: "",
    treatmentCity: "",
    treatmentState: "",
    treatmentZip: "",
    treatedInEr: null,
    hospitalizedOvernight: null,
    completedBy: defaultReporter,
    completedByTitle: "",
    completedByPhone: "",
    completedByDate: dateOccurred.slice(0, 10),
    workersCompRelevant: false,
    workersCompNotes: "",
    medicalRefusalAcknowledgment: {
      ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
      confirmations: { ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT.confirmations },
    },
    reasonableSuspicion: cloneEmptyReasonableSuspicion(),
    drugAlcoholConsents: [],
  };
}

/** Normalize hire date to `yyyy-mm-dd` for date inputs. */
export function formatIncidentHireDateForInput(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Normalize shift start to `HH:MM` for time inputs (24-hour). */
export function normalizeIncidentShiftStartTime(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (iso) {
    const hour = Number(iso[1]);
    const minute = Number(iso[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
      return "";
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const withAmPm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (withAmPm) {
    let hour = Number(withAmPm[1]);
    const minute = Number(withAmPm[2]);
    const amPm = withAmPm[3]!.toUpperCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute > 59) {
      return "";
    }
    if (amPm === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return "";
}

/** Display shift start as 12-hour clock when possible. */
export function formatIncidentShiftStartTimeDisplay(value?: string | null): string {
  const normalized = normalizeIncidentShiftStartTime(value);
  if (!normalized) return (value ?? "").trim();
  const [hRaw, m] = normalized.split(":");
  let hour = Number(hRaw);
  if (!Number.isFinite(hour)) return normalized;
  const amPm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${m} ${amPm}`;
}

export type IncidentPersonnelLinkFields = {
  personnelId: string;
  displayName: string;
  siteId?: string;
  siteLabel?: string;
  divisionName?: string;
  departmentId?: string;
  hireDate?: string;
  dateOfBirth?: string;
};

/** Fill person + org + hire date / DOB from a linked Employee Profile selection. */
export function applyPersonnelLinkToIncidentForm(
  prev: IncidentCreateFormState,
  selection: IncidentPersonnelLinkFields | null,
): IncidentCreateFormState {
  if (!selection) {
    return {
      ...prev,
      personnelId: "",
      personAffected: "",
    };
  }
  const siteId = (selection.siteId ?? "").trim();
  const siteLabel = (selection.siteLabel ?? "").trim();
  const division = (selection.divisionName ?? "").trim();
  const departmentId = (selection.departmentId ?? "").trim();
  const hireDate = formatIncidentHireDateForInput(selection.hireDate);
  const dateOfBirth = formatIncidentHireDateForInput(selection.dateOfBirth);
  return {
    ...prev,
    personnelId: selection.personnelId.trim(),
    personAffected: selection.displayName.trim(),
    ...(siteId ? { siteId } : {}),
    ...(siteLabel ? { location: siteLabel } : {}),
    ...(division ? { division } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(hireDate ? { hireDate } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
  };
}

/** Format date as yy-mm-dd for incident titles (local calendar day). */
export function formatIncidentTitleDate(input?: string | Date | null): string {
  let date = new Date();
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    date = input;
  } else if (typeof input === "string" && input.trim()) {
    const raw = input.trim();
    // Already yy-mm-dd / yy/mm/dd — avoid Date parsing timezone shifts.
    const compact = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Company / mill names are too broad for the title location slot. */
export function isGenericIncidentLocation(value: string): boolean {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return true;
  return (
    /producers\s+rice\s+mill/.test(cleaned) ||
    cleaned === "all locations" ||
    cleaned === "n/a" ||
    cleaned === "na"
  );
}

function firstUsefulLocation(...candidates: Array<string | undefined | null>): string {
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (value && !isGenericIncidentLocation(value)) return value;
  }
  return "";
}

/** Pull date / name / location out of an existing incident title when possible. */
export function parseIncidentTitleParts(title: string): {
  dateOccurred?: string;
  personAffected?: string;
  location?: string;
} {
  const existing = title.trim();
  if (!existing) return {};

  const dated = existing.match(/^(\d{2})[-/](\d{2})[-/](\d{2})\s+(.*)$/);
  const restRaw = dated ? dated[4]!.trim() : existing;
  const rest = restRaw.replace(/\b(Jr\.?|Sr\.?)\s*-/gi, "$1 - ");
  const dateOccurred = dated ? `20${dated[1]}-${dated[2]}-${dated[3]}` : undefined;
  const spaced = rest.split(/\s+-\s+/);
  if (spaced.length >= 2) {
    return {
      ...(dateOccurred ? { dateOccurred } : {}),
      personAffected: spaced[0]!.trim(),
      location: spaced.slice(1).join(" - ").trim(),
    };
  }
  return {
    ...(dateOccurred ? { dateOccurred } : {}),
    ...(rest ? { personAffected: rest } : {}),
  };
}

/**
 * Default incident title: `yy-mm-dd   Name - Location`
 *
 * Location rules for new reports:
 * - Area typed → `Department - Area` (department then area)
 * - No area → department only (department is last in the title)
 * Never use the mill / site name when department or area is available.
 */
export function suggestIncidentTitle(input: {
  dateOccurred?: string;
  personAffected?: string;
  location?: string;
}): string {
  const date = formatIncidentTitleDate(input.dateOccurred);
  const name = (input.personAffected ?? "").trim() || "Incident";
  const location = (input.location ?? "").trim();
  if (location) return `${date}   ${name} - ${location}`;
  return `${date}   ${name}`;
}

function cleanTitleLocationPart(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || isGenericIncidentLocation(trimmed)) return "";
  return trimmed;
}

/**
 * Build the title location segment.
 * - Area present → `Department - Area` (department then area)
 * - No area → department alone (department last in the title)
 */
export function composeIncidentTitleLocation(
  department?: string | null,
  area?: string | null,
): string {
  const dept = cleanTitleLocationPart(department);
  const zone = cleanTitleLocationPart(area);
  if (zone) {
    if (!dept) return zone;
    if (dept.toLowerCase() === zone.toLowerCase()) return dept;
    return `${dept} - ${zone}`;
  }
  return dept;
}

export function resolveIncidentTitleLocation(
  form: Pick<IncidentCreateFormState, "location" | "community" | "division" | "locationDetail">,
  extras: { siteLabel?: string; departmentLabel?: string } = {},
): string {
  const composed = composeIncidentTitleLocation(extras.departmentLabel, form.community);
  if (composed) return composed;
  // No department and no area — fall back, but never prefer site over division.
  return firstUsefulLocation(
    form.division,
    form.locationDetail,
    form.location,
    extras.siteLabel,
  );
}

/**
 * Where the incident happened, never the injured body part. Saved incidents put
 * body parts in `location` when body locations are marked.
 */
export function incidentPlaceLocation(incident: IncidentRecord): string {
  const bodyKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const bodyKeys = new Set(
    [
      bodyLocationsToLegacyFields(incident.bodyLocations).bodyParts,
      incident.bodyLocations.join(", "),
    ]
      .filter((v) => v.trim())
      .map(bodyKey),
  );
  const candidates = [
    composeIncidentTitleLocation(incident.departmentName, incident.community),
    incident.division,
    incident.locationDetail,
    parseIncidentTitleParts(incident.title).location,
    incident.bodyLocations.length > 0 ? "" : incident.location,
  ];
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (value && !bodyKeys.has(bodyKey(value))) return value;
  }
  return "";
}

/**
 * Rebuild list/report title to `yy-mm-dd   Name - Location`.
 * Keeps an existing title location when present; only fills location from
 * department/area/division/site when the title has no location segment yet.
 * Freeform titles without a person/date stay unchanged.
 */
export function deriveIncidentTitle(input: {
  title?: string;
  dateOccurred?: string;
  personAffected?: string;
  community?: string;
  division?: string;
  location?: string;
  locationDetail?: string;
  departmentName?: string;
}): string {
  const existing = (input.title ?? "").trim();
  const parsed = parseIncidentTitleParts(existing);
  const personField = (input.personAffected ?? "").trim();
  const hasDatedTitle = Boolean(parsed.dateOccurred);
  const dateField = (input.dateOccurred ?? "").trim();

  // Leave freeform titles alone when there is no person/date metadata to format.
  if (!personField && !hasDatedTitle && !dateField) {
    return existing || "Untitled incident";
  }

  const name = personField || (parsed.personAffected ?? "").trim() || "Incident";
  // Prefer location already encoded in the title so we do not replace
  // "Stuttgart" / "WR Supply" with a community/job-area value.
  const location = firstUsefulLocation(
    parsed.location,
    composeIncidentTitleLocation(input.departmentName, input.community),
    input.division,
    input.locationDetail,
    input.location,
  );
  // Prefer occurrence fields, but keep a dated title's own date when no field exists.
  const dateSource = dateField || (parsed.dateOccurred ?? "").trim() || undefined;

  return suggestIncidentTitle({
    ...(dateSource ? { dateOccurred: dateSource } : {}),
    personAffected: name,
    location,
  });
}

export type IncidentCreatePayload = {
  title: string;
  category: IncidentCategory;
  status: string;
  severity: string;
  location: string;
  description: string;
  reportedBy: string;
  reportedByTitle?: string;
  reportedByPhone?: string;
  reportedByDate?: string;
  dateOccurred: string;
  bodyLocations: string[];
  siteId?: string;
  personAffected?: string;
  personnelId?: string;
  division?: string;
  community?: string;
  witnessNames?: string;
  correctiveActions?: string;
  incidentTypeName?: string;
  workersCompRelevant?: boolean;
  workersCompNotes?: string;
  departmentId?: string;
  departmentName?: string;
  locationDetail?: string;
  companyName?: string;
  workDayDetails?: string;
  hireDate?: string;
  dateOfBirth?: string;
  shiftStartTime?: string;
  physicianName?: string;
  treatmentFacility?: string;
  treatmentStreet?: string;
  treatmentCity?: string;
  treatmentState?: string;
  treatmentZip?: string;
  treatedInEr?: boolean | null;
  hospitalizedOvernight?: boolean | null;
  completedBy?: string;
  completedByTitle?: string;
  completedByPhone?: string;
  completedByDate?: string;
  medicalRefusalAcknowledgment?: MedicalRefusalAcknowledgment;
  reasonableSuspicion?: ReasonableSuspicionObservation;
  drugAlcoholConsents: DrugAlcoholIncidentSection[];
};

export function buildIncidentCreatePayload(
  form: IncidentCreateFormState | Record<string, string>,
  category: IncidentCategory,
  bodyLocations: readonly string[] = [],
  extras: {
    siteLabel?: string;
    departmentLabel?: string;
    companyName?: string;
  } = {},
): IncidentCreatePayload {
  const normalized: IncidentCreateFormState =
    "personAffected" in form
      ? (form as IncidentCreateFormState)
      : {
          ...emptyIncidentCreateForm(),
          title: String(form.title ?? ""),
          severity: String(form.severity ?? "moderate"),
          location: String(form.location ?? ""),
          locationDetail: "",
          description: String(form.description ?? ""),
          reportedBy: String(form.reportedBy ?? ""),
          dateOccurred: String(form.dateOccurred ?? ""),
          status: String(form.status ?? "open"),
          personAffected: "",
          personnelId: "",
          witnessNames: "",
          correctiveActions: "",
          division: "",
          community: "",
          siteId: "",
          departmentId: "",
          incidentTypeName: "",
          hireDate: "",
          dateOfBirth: "",
          shiftStartTime: "",
          physicianName: "",
          treatmentFacility: "",
          treatmentStreet: "",
          treatmentCity: "",
          treatmentState: "",
          treatmentZip: "",
          treatedInEr: null,
          hospitalizedOvernight: null,
          completedBy: "",
          completedByTitle: "",
          completedByPhone: "",
          completedByDate: "",
          workersCompRelevant: false,
          workersCompNotes: "",
          medicalRefusalAcknowledgment: {
            ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
            confirmations: { ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT.confirmations },
          },
          reasonableSuspicion: cloneEmptyReasonableSuspicion(),
          drugAlcoholConsents: [],
        };

  const locations = parseBodyLocations([...bodyLocations]);
  const bodyLegacy =
    locations.length > 0 ? bodyLocationsToLegacyFields(locations) : null;
  const titleLocation = resolveIncidentTitleLocation(normalized, {
    ...(extras.siteLabel ? { siteLabel: extras.siteLabel } : {}),
    ...(extras.departmentLabel ? { departmentLabel: extras.departmentLabel } : {}),
  });
  const title =
    normalized.title.trim() ||
    suggestIncidentTitle({
      dateOccurred: normalized.dateOccurred,
      personAffected: normalized.personAffected,
      location: titleLocation,
    });
  const bodyPartLocation = bodyLegacy?.bodyParts ?? "";
  const location =
    bodyPartLocation ||
    normalized.location.trim() ||
    extras.siteLabel?.trim() ||
    normalized.locationDetail.trim();

  return {
    title,
    category,
    status: (normalized.status ?? "open").trim() || "open",
    severity: (normalized.severity ?? "").trim(),
    location,
    description: (normalized.description ?? "").trim(),
    reportedBy: (normalized.reportedBy ?? "").trim(),
    reportedByTitle: (normalized.reportedByTitle ?? "").trim(),
    reportedByPhone: (normalized.reportedByPhone ?? "").trim(),
    reportedByDate: (normalized.reportedByDate ?? "").trim().slice(0, 10),
    dateOccurred: (normalized.dateOccurred ?? "").trim(),
    bodyLocations: locations,
    ...(bodyLegacy
      ? {
          injuriesFront: bodyLegacy.injuriesFront,
          injuriesBack: bodyLegacy.injuriesBack,
          InjuriesFront: bodyLegacy.InjuriesFront,
          InjuriesBack: bodyLegacy.InjuriesBack,
          bodyParts: bodyLegacy.bodyParts,
        }
      : {}),
    ...(normalized.siteId ? { siteId: normalized.siteId } : {}),
    ...(normalized.personAffected.trim()
      ? { personAffected: normalized.personAffected.trim() }
      : {}),
    personnelId: (normalized.personnelId ?? "").trim(),
    ...(normalized.division.trim() ? { division: normalized.division.trim() } : {}),
    ...(normalized.community.trim() ? { community: normalized.community.trim() } : {}),
    ...(normalized.witnessNames.trim()
      ? { witnessNames: normalized.witnessNames.trim() }
      : {}),
    ...(normalized.correctiveActions.trim()
      ? {
          correctiveActions: normalized.correctiveActions.trim(),
          workDayDetails: normalized.correctiveActions.trim(),
        }
      : {}),
    ...(normalized.incidentTypeName.trim()
      ? { incidentTypeName: normalized.incidentTypeName.trim() }
      : {}),
    ...(normalized.workersCompRelevant
      ? {
          workersCompRelevant: true,
          workersCompNotes: normalized.workersCompNotes.trim(),
        }
      : { workersCompRelevant: false, workersCompNotes: "" }),
    ...(normalized.departmentId ? { departmentId: normalized.departmentId } : {}),
    ...(extras.departmentLabel?.trim()
      ? { departmentName: extras.departmentLabel.trim() }
      : {}),
    ...(normalized.locationDetail.trim()
      ? { locationDetail: normalized.locationDetail.trim() }
      : {}),
    ...(normalized.hireDate?.trim() ? { hireDate: normalized.hireDate.trim() } : {}),
    ...(normalized.dateOfBirth?.trim()
      ? { dateOfBirth: normalized.dateOfBirth.trim() }
      : {}),
    ...(normalizeIncidentShiftStartTime(normalized.shiftStartTime)
      ? { shiftStartTime: normalizeIncidentShiftStartTime(normalized.shiftStartTime) }
      : { shiftStartTime: "" }),
    ...(normalized.physicianName.trim()
      ? { physicianName: normalized.physicianName.trim() }
      : { physicianName: "" }),
    ...(normalized.treatmentFacility.trim()
      ? { treatmentFacility: normalized.treatmentFacility.trim() }
      : { treatmentFacility: "" }),
    ...(normalized.treatmentStreet.trim()
      ? { treatmentStreet: normalized.treatmentStreet.trim() }
      : { treatmentStreet: "" }),
    ...(normalized.treatmentCity.trim()
      ? { treatmentCity: normalized.treatmentCity.trim() }
      : { treatmentCity: "" }),
    ...(normalized.treatmentState.trim()
      ? { treatmentState: normalized.treatmentState.trim() }
      : { treatmentState: "" }),
    ...(normalized.treatmentZip.trim()
      ? { treatmentZip: normalized.treatmentZip.trim() }
      : { treatmentZip: "" }),
    treatedInEr: normalized.treatedInEr,
    hospitalizedOvernight: normalized.hospitalizedOvernight,
    completedBy: (normalized.completedBy ?? "").trim() || (normalized.reportedBy ?? "").trim(),
    completedByTitle: (normalized.completedByTitle ?? "").trim(),
    completedByPhone:
      (normalized.completedByPhone ?? "").trim() || (normalized.reportedByPhone ?? "").trim(),
    completedByDate: (normalized.completedByDate ?? "").trim().slice(0, 10),
    ...(extras.companyName?.trim() ? { companyName: extras.companyName.trim() } : {}),
    ...(category === "medical-refusals"
      ? { medicalRefusalAcknowledgment: normalized.medicalRefusalAcknowledgment }
      : {}),
    ...(category === "drug-alcohol" && normalized.reasonableSuspicion
      ? {
          reasonableSuspicion: {
            ...normalized.reasonableSuspicion,
            indicatorsOther: normalized.reasonableSuspicion.indicatorsOther.trim(),
            observerName: normalized.reasonableSuspicion.observerName.trim(),
            observerTitle: normalized.reasonableSuspicion.observerTitle.trim(),
            secondObserverName: normalized.reasonableSuspicion.secondObserverName.trim(),
            secondObserverTitle: normalized.reasonableSuspicion.secondObserverTitle.trim(),
            transportationOther: normalized.reasonableSuspicion.transportationOther.trim(),
          },
        }
      : {}),
    drugAlcoholConsents: (normalized.drugAlcoholConsents ?? [])
      .filter(drugAlcoholIncidentHasContent)
      .map((consent) => ({
        ...consent,
        employeeName: consent.employeeName.trim(),
        personnelId: consent.personnelId.trim(),
      })),
  };
}

export function createDefaultLifecycle(reportedBy = ""): IncidentLifecycleData {
  const now = new Date().toISOString();
  return {
    currentStage: "logging-categorization",
    ticketId: "",
    subCategory: "",
    priority: "P3",
    impact: "",
    urgency: "",
    workaround: "",
    resolutionSummary: "",
    userConfirmed: false,
    knowledgeBaseNotes: "",
    steps: INCIDENT_LIFECYCLE_STAGES.map((stage) => ({
      stageId: stage.id,
      status: stage.id === "identification" ? "complete" : "pending",
      notes: "",
      ...(stage.id === "identification"
        ? { completedAt: now, completedBy: reportedBy || "Reporter" }
        : {}),
    })),
  };
}

export function ensureLifecycle(incident: IncidentRecord): IncidentLifecycleData {
  if (incident.lifecycle) return incident.lifecycle;
  const lifecycle = createDefaultLifecycle(incident.reportedBy);
  lifecycle.ticketId = `INC-${incident.id.slice(-6).toUpperCase()}`;
  lifecycle.subCategory =
    incident.category === "injuries"
      ? "Injury / Illness"
      : incident.category === "near-misses"
        ? "Near Miss"
        : incident.category === "drug-alcohol"
          ? "Drug / Alcohol - Reasonable Suspicion"
          : incident.category === "property-damage"
            ? "Property Damage"
            : incident.category === "automotive"
              ? "Automotive / Fleet"
              : "Other";
  lifecycle.priority =
    incident.severity === "critical"
      ? "P1"
      : incident.severity === "serious"
        ? "P2"
        : incident.severity === "moderate"
          ? "P3"
          : "P4";
  return lifecycle;
}

export function lifecycleProgress(lifecycle: IncidentLifecycleData): number {
  if (!lifecycle.steps.length) return 0;
  const complete = lifecycle.steps.filter((s) => s.status === "complete").length;
  return Math.round((complete / lifecycle.steps.length) * 100);
}

export function setLifecycleStepStatus(
  lifecycle: IncidentLifecycleData,
  stageId: IncidentLifecycleStageId,
  status: LifecycleStepStatus,
  completedBy = "",
): IncidentLifecycleData {
  const now = new Date().toISOString();
  const steps = lifecycle.steps.map((step) => {
    if (step.stageId !== stageId) return step;
    return {
      ...step,
      status,
      ...(status === "complete"
        ? { completedAt: now, completedBy: completedBy || step.completedBy || "Responder" }
        : {}),
    };
  });
  const nextIncomplete = INCIDENT_LIFECYCLE_STAGES.find(
    (stage) => steps.find((s) => s.stageId === stage.id)?.status !== "complete",
  );
  return {
    ...lifecycle,
    steps,
    currentStage: nextIncomplete?.id ?? "closure",
  };
}

export function createDefaultEvaluationChecklist(): EvaluationChecklist {
  return {
    completedBy: "",
    completedAt: "",
    overallNotes: "",
    items: EVALUATION_CHECKLIST_TEMPLATE.map((item) => ({
      id: item.id,
      label: item.label,
      checked: false,
      notes: "",
      ...(item.id === "photos" ? { photos: [] as string[] } : {}),
    })),
  };
}

export function ensureEvaluationChecklist(incident: IncidentRecord): EvaluationChecklist {
  if (!incident.evaluationChecklist) {
    return createDefaultEvaluationChecklist();
  }
  const existingById = new Map(
    incident.evaluationChecklist.items.map((item) => [item.id, item] as const),
  );
  return {
    ...incident.evaluationChecklist,
    items: EVALUATION_CHECKLIST_TEMPLATE.map((template) => {
      const existing = existingById.get(template.id);
      if (existing) {
        return {
          ...existing,
          label: template.label,
          ...(template.id === "photos"
            ? { photos: Array.isArray(existing.photos) ? [...existing.photos] : [] }
            : {}),
        };
      }
      return {
        id: template.id,
        label: template.label,
        checked: false,
        notes: "",
        ...(template.id === "photos" ? { photos: [] as string[] } : {}),
      };
    }),
  };
}

export function emptyCorrectiveAction(): CorrectiveAction {
  return {
    id: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: "",
    assignedTo: "",
    dueDate: new Date().toISOString().slice(0, 10),
    status: "pending",
  };
}

export function createDefaultRootCauseAnalysis(incident?: IncidentRecord): RootCauseAnalysis {
  return {
    incidentSummary: incident?.description ?? "",
    immediateActions: "",
    contributingFactors: [""],
    rootCause: "",
    fiveWhys: ["", "", "", "", ""],
    fiveWhyQuestions: seedFiveWhyQuestions([], [], incident?.title ?? ""),
    correctiveActions: [emptyCorrectiveAction()],
    conductedBy: "",
    conductedAt: "",
    participantsInvolved: [""],
    eventDate: "",
  };
}

function clipWhyText(text: string, max = 120): string {
  const clean = text.trim().replace(/\s+/g, " ").replace(/[.?!]+$/, "");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Suggested question for a why: #1 from the incident title, later ones from the previous answer. */
export function fiveWhySeedQuestion(
  index: number,
  context: { incidentTitle?: string | undefined; previousAnswer?: string | undefined },
): string {
  if (index === 0) {
    const title = clipWhyText(context.incidentTitle ?? "");
    return title ? `Why did "${title}" occur?` : "Why did the incident occur?";
  }
  const previous = clipWhyText(context.previousAnswer ?? "");
  return previous ? `Why did "${previous}" happen?` : "Why did that happen?";
}

/** Fill blank questions with seeds; questions the user already wrote are kept. */
export function seedFiveWhyQuestions(
  questions: string[],
  answers: string[],
  incidentTitle: string,
): string[] {
  const q = padFiveWhys(questions);
  const a = padFiveWhys(answers);
  return q.map((question, index) =>
    question.trim()
      ? question
      : fiveWhySeedQuestion(index, { incidentTitle, previousAnswer: a[index - 1] }),
  );
}

export function ensureRootCauseAnalysis(incident: IncidentRecord): RootCauseAnalysis {
  if (incident.rootCauseAnalysis) {
    const rca = incident.rootCauseAnalysis;
    const fiveWhys = padFiveWhys(rca.fiveWhys);
    return {
      ...rca,
      contributingFactors: rca.contributingFactors.length ? [...rca.contributingFactors] : [""],
      fiveWhys,
      fiveWhyQuestions: seedFiveWhyQuestions(rca.fiveWhyQuestions, fiveWhys, incident.title),
      correctiveActions: rca.correctiveActions.length
        ? rca.correctiveActions.map((a) => ({ ...a }))
        : [emptyCorrectiveAction()],
      participantsInvolved: rca.participantsInvolved.length
        ? [...rca.participantsInvolved]
        : [""],
    };
  }
  return createDefaultRootCauseAnalysis(incident);
}

export function incidentOptionLabel(incident: IncidentRecord): string {
  const cat = incident.category ? ` · ${incident.category}` : "";
  return `${incident.title}${cat}`;
}

/** Safe filename stem for printable / PDF download of an incident report. */
export function incidentPrintFilename(incident: Pick<IncidentRecord, "title" | "id">): string {
  const stem = incident.title
    .trim()
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${stem || `incident-${incident.id.slice(0, 8)}`}.html`;
}

/** Best available occurrence date as `YYYY-MM-DD` (or empty). */
export function incidentOccurrenceDate(
  incident: Pick<IncidentRecord, "dateOccurred" | "title" | "createdAt">,
): string {
  const direct = (incident.dateOccurred ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(direct)) return direct.slice(0, 10);
  const fromTitle = parseIncidentTitleParts(incident.title).dateOccurred;
  if (fromTitle) return fromTitle;
  const created = (incident.createdAt ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10);
  return "";
}

/** True when no usable occurrence date can be derived from the record or title. */
export function incidentNeedsOccurrenceDate(
  incident: Pick<IncidentRecord, "dateOccurred" | "title" | "createdAt">,
): boolean {
  return !incidentOccurrenceDate(incident);
}

/** Calendar year for list grouping, or null when unknown. */
export function incidentListYear(
  incident: Pick<IncidentRecord, "dateOccurred" | "title" | "createdAt">,
): number | null {
  const date = incidentOccurrenceDate(incident);
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

/** Ascending chronological order (yy-mm-dd / occurrence date), then title. */
export function compareIncidentsNumerically(a: IncidentRecord, b: IncidentRecord): number {
  const dateA = incidentOccurrenceDate(a);
  const dateB = incidentOccurrenceDate(b);
  if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  const titleCmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  if (titleCmp !== 0) return titleCmp;
  return a.id.localeCompare(b.id);
}

export type IncidentListSort = "newest" | "oldest";

export const DEFAULT_INCIDENT_LIST_SORT: IncidentListSort = "newest";

export function parseIncidentListSort(raw: unknown): IncidentListSort {
  return raw === "oldest" ? "oldest" : "newest";
}

export function compareIncidentsByDate(
  a: IncidentRecord,
  b: IncidentRecord,
  sort: IncidentListSort = DEFAULT_INCIDENT_LIST_SORT,
): number {
  const dateA = incidentOccurrenceDate(a);
  const dateB = incidentOccurrenceDate(b);
  // Undated stays last in both directions.
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  if (!dateA && !dateB) {
    const titleCmp = a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  }
  if (dateA !== dateB) {
    const ascending = dateA < dateB ? -1 : 1;
    return sort === "oldest" ? ascending : -ascending;
  }
  const titleCmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  if (titleCmp !== 0) return sort === "oldest" ? titleCmp : -titleCmp;
  return sort === "oldest" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
}

/** Oldest → newest (legacy ascending sort). */
export function sortIncidentsNumerically(records: readonly IncidentRecord[]): IncidentRecord[] {
  return [...records].sort(compareIncidentsNumerically);
}

export function sortIncidentsByDate(
  records: readonly IncidentRecord[],
  sort: IncidentListSort = DEFAULT_INCIDENT_LIST_SORT,
): IncidentRecord[] {
  return [...records].sort((a, b) => compareIncidentsByDate(a, b, sort));
}

export type IncidentYearGroup = {
  year: number | null;
  label: string;
  items: IncidentRecord[];
};

/** Count undated rows in a filtered year-group list. */
export function countUndatedIncidents(groups: readonly IncidentYearGroup[]): number {
  return groups.reduce(
    (sum, group) => sum + (group.year == null ? group.items.length : 0),
    0,
  );
}

/**
 * Group incidents by occurrence year.
 * Year buckets follow sort (newest years first by default); undated last.
 * Items within each year stay in the caller’s order (use sortIncidentsByDate first).
 */
export function groupIncidentsByYear(
  records: readonly IncidentRecord[],
  sort: IncidentListSort = DEFAULT_INCIDENT_LIST_SORT,
): IncidentYearGroup[] {
  const byYear = new Map<number | null, IncidentRecord[]>();
  for (const record of records) {
    const year = incidentListYear(record);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(record);
    else byYear.set(year, [record]);
  }
  const years = [...byYear.keys()].sort((a, b) => {
    if (a == null) return 1;
    if (b == null) return -1;
    return sort === "newest" ? b - a : a - b;
  });
  return years.map((year) => ({
    year,
    label: year == null ? "Needs date" : String(year),
    items: byYear.get(year) ?? [],
  }));
}

/** Client-side list search across common incident fields. */
export function incidentMatchesSearch(incident: IncidentRecord, query: string): boolean {
  if (!query.trim()) return true;
  return matchesSearchTokens(
    [
      incident.title,
      incident.description,
      incident.personAffected,
      incident.reportedBy,
      incident.location,
      incident.status,
      incident.severity,
      incident.community,
      incident.division,
      incident.departmentName,
      incident.lifecycle?.ticketId ?? "",
      incident.dateOccurred,
    ],
    query,
  );
}

export function filterAndGroupIncidents(
  records: readonly IncidentRecord[],
  query: string,
  sort: IncidentListSort = DEFAULT_INCIDENT_LIST_SORT,
): IncidentYearGroup[] {
  const filtered = records.filter((row) => incidentMatchesSearch(row, query));
  return groupIncidentsByYear(sortIncidentsByDate(filtered, sort), sort);
}
