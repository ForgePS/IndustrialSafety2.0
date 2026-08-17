/**
 * Incidents module — type tabs, process tabs (workflow / evaluation / RCA),
 * summary tiles, and helpers matching the legacy Safety Reports Incidents screen.
 */

import { extractBodyLocationsFromPayload, parseBodyLocations } from "@/lib/incident-body-map";

export type IncidentCategory =
  | "injuries"
  | "near-misses"
  | "medical-refusals"
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
    description: "Record when an employee declines offered medical treatment or evaluation.",
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
  { id: "training", label: "Employee training records checked" },
  { id: "jsa", label: "Applicable SOPs/JSA reviewed" },
  { id: "specialist", label: "Specialist/expert notified" },
  { id: "medical", label: "Medical evaluation offered (as appropriate)" },
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
  fiveWhys: string[];
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
  createdAt: string;
  updatedAt: string;
  /** OSHA body-part region ids marked on the body map (front/back). */
  bodyLocations: string[];
  lifecycle: IncidentLifecycleData | null;
  evaluationChecklist: EvaluationChecklist | null;
  rootCauseAnalysis: RootCauseAnalysis | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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
    fiveWhys: Array.isArray(r.fiveWhys)
      ? r.fiveWhys.filter((w): w is string => typeof w === "string")
      : ["", "", "", "", ""],
    correctiveActions,
    conductedBy: typeof r.conductedBy === "string" ? r.conductedBy : "",
    conductedAt: typeof r.conductedAt === "string" ? r.conductedAt : "",
    participantsInvolved: Array.isArray(r.participantsInvolved)
      ? r.participantsInvolved.filter((p): p is string => typeof p === "string")
      : [],
    eventDate: typeof r.eventDate === "string" ? r.eventDate : "",
  };
}

export function toIncidentRecord(row: unknown): IncidentRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const text = (key: string) => (typeof r[key] === "string" ? (r[key] as string) : "");
  return {
    id,
    title: text("title") || text("displayName") || "Untitled incident",
    status: text("status") || "open",
    category: text("category") || text("incidentCategory"),
    severity: text("severity"),
    location: text("location") || text("site"),
    description: text("description"),
    reportedBy: text("reportedBy"),
    createdAt: text("createdAt"),
    updatedAt: text("updatedAt"),
    bodyLocations: extractBodyLocationsFromPayload(r),
    lifecycle: parseLifecycle(r.lifecycle),
    evaluationChecklist: parseEvaluationChecklist(r.evaluationChecklist),
    rootCauseAnalysis: parseRootCauseAnalysis(r.rootCauseAnalysis),
  };
}

export function toIncidentRecords(rows: unknown[]): IncidentRecord[] {
  return rows.map(toIncidentRecord).filter((r): r is IncidentRecord => r !== null);
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

export type IncidentCreatePayload = {
  title: string;
  category: IncidentCategory;
  status: string;
  severity: string;
  location: string;
  description: string;
  reportedBy: string;
  dateOccurred: string;
  bodyLocations: string[];
};

export function buildIncidentCreatePayload(
  form: Record<string, string>,
  category: IncidentCategory,
  bodyLocations: readonly string[] = [],
): IncidentCreatePayload {
  const locations = parseBodyLocations([...bodyLocations]);
  return {
    title: (form.title ?? "").trim(),
    category,
    status: (form.status ?? "open").trim() || "open",
    severity: (form.severity ?? "").trim(),
    location: (form.location ?? "").trim(),
    description: (form.description ?? "").trim(),
    reportedBy: (form.reportedBy ?? "").trim(),
    dateOccurred: (form.dateOccurred ?? "").trim(),
    bodyLocations: locations,
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
  if (incident.evaluationChecklist) {
    return {
      ...incident.evaluationChecklist,
      items: incident.evaluationChecklist.items.map((item) => ({ ...item })),
    };
  }
  return createDefaultEvaluationChecklist();
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
    correctiveActions: [emptyCorrectiveAction()],
    conductedBy: "",
    conductedAt: "",
    participantsInvolved: [""],
    eventDate: "",
  };
}

export function ensureRootCauseAnalysis(incident: IncidentRecord): RootCauseAnalysis {
  if (incident.rootCauseAnalysis) {
    const rca = incident.rootCauseAnalysis;
    return {
      ...rca,
      contributingFactors: rca.contributingFactors.length ? [...rca.contributingFactors] : [""],
      fiveWhys: rca.fiveWhys.length === 5 ? [...rca.fiveWhys] : ["", "", "", "", ""],
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
  const when = incident.createdAt ? ` · ${incident.createdAt.slice(0, 10)}` : "";
  return `${incident.title}${cat}${when}`;
}
