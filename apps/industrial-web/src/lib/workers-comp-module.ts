/**
 * Workers' compensation module helpers for the Incident & Claims workspace.
 */

import {
  accommodationsHasContent,
  parseWorkersCompAccommodations,
  type WorkersCompAccommodations,
} from "@/lib/wc-restrictions-accommodations";

export type { WorkersCompAccommodations };

export const WC_API = "/api/v1/industrial/workers-comp";

export const WC_CASE_STATUSES = ["", "ACTIVE", "CLOSED", "ARCHIVED"] as const;

export const WC_SEVERITY_OPTIONS = [
  {
    value: "minor",
    label: "Minor → Non-Recordable (First Aid)",
    help: "Not recordable. First aid only as listed in OSHA 1904.7(b)(5)(ii): cleaning minor wounds, bandages, ice packs. Does not go on the OSHA 300 log.",
  },
  {
    value: "moderate",
    label: "Moderate → Recordable (Medical Treatment Only)",
    help: "Medical treatment beyond first aid (prescription medication, stitches, physical therapy). Employee returns to full, unrestricted duties on the next scheduled shift.",
  },
  {
    value: "restricted",
    label: "Restricted → Recordable (Job Transfer or Restriction)",
    help: "Healthcare professional keeps the employee from performing one or more routine job functions, or from working a full standard shift.",
  },
  {
    value: "lost_time",
    label: "Lost Time → Recordable (Days Away From Work)",
    help: "Healthcare professional recommends the employee cannot work at all for one or more scheduled shifts.",
  },
] as const;

/** Maps stored severity text (e.g. "Minor", "lost time") onto a dropdown value when it matches. */
export function wcNormalizeSeverity(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  const key = value.toLowerCase().replace(/[\s-]+/g, "_");
  return WC_SEVERITY_OPTIONS.some((o) => o.value === key) ? key : value;
}

export function wcSeverityOptions(
  current?: string | null,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = WC_SEVERITY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const value = wcNormalizeSeverity(current);
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: `${value} (legacy)` });
  }
  return options;
}

export function wcSeverityHelp(current?: string | null): string {
  const value = wcNormalizeSeverity(current);
  return WC_SEVERITY_OPTIONS.find((o) => o.value === value)?.help ?? "";
}

/** Selectable case statuses, keeping a retired value (e.g. OPEN, LOST_TIME) visible on older cases. */
export function wcCaseStatusOptions(
  current?: string | null,
): Array<{ value: string; label: string }> {
  const options = WC_CASE_STATUSES.filter(Boolean).map((value) => ({
    value: value as string,
    label: wcEnumLabel(value),
  }));
  const value = (current ?? "").trim();
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: `${wcEnumLabel(value)} (legacy)` });
  }
  return options;
}

export const WC_WORKFLOW_STAGES = [
  "INTAKE",
  "INVESTIGATION",
  "MEDICAL_REVIEW",
  "TREATMENT",
  "RETURN_TO_WORK",
  "CLAIM_ADMIN",
  "CLOSED",
] as const;

export const WC_WORK_STATUS_OPTIONS = [
  "FULL_DUTY",
  "RESTRICTED",
  "LOST_TIME",
  "OFF_WORK",
  "RETURNED",
  "N/A",
  "No Change",
] as const;

/** Top-level Workers' Comp module sections (matches product IA). */
export type WcModuleTab =
  | "dashboard"
  | "cases"
  | "weekly-updates"
  | "employees"
  | "return-to-work"
  | "medical"
  | "claims"
  | "costs"
  | "osha"
  | "documents"
  | "reports"
  | "settings";

export const WC_MODULE_TABS: ReadonlyArray<{ id: WcModuleTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "cases", label: "Cases" },
  { id: "weekly-updates", label: "Weekly updates" },
  { id: "employees", label: "EMPLOYEES" },
  { id: "return-to-work", label: "Return to Work" },
  { id: "medical", label: "Medical and Restrictions" },
  { id: "claims", label: "Claims and Carriers" },
  { id: "costs", label: "Costs and Reserves" },
  { id: "osha", label: "OSHA Recordkeeping" },
  { id: "documents", label: "Documents" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;

export const WC_MODULE_TAB_META: Record<WcModuleTab, { label: string; description: string }> = {
  dashboard: {
    label: "Dashboard",
    description: "Live KPIs, trends, and action panels for workers' compensation cases.",
  },
  cases: {
    label: "Cases",
    description: "Claim cases linked to incidents and personnel — search, filter, and open detail.",
  },
  "weekly-updates": {
    label: "Weekly updates",
    description: "Required Thursday status notes for every open workers' compensation case.",
  },
  employees: {
    label: "EMPLOYEES",
    description: "Injured workers with open or historical workers' compensation cases.",
  },
  "return-to-work": {
    label: "Return to Work",
    description: "Restricted duty and lost-time cases progressing toward full duty.",
  },
  medical: {
    label: "Medical and Restrictions",
    description: "Medical encounters and work restrictions across active cases.",
  },
  claims: {
    label: "Claims and Carriers",
    description: "Carrier directory and claim numbers on open cases.",
  },
  costs: {
    label: "Costs and Reserves",
    description: "Days away, restricted days, and reserve tracking for open claims.",
  },
  osha: {
    label: "OSHA Recordkeeping",
    description:
      "Mark recordable cases here to autofill OSHA Form 300, then print the official log from the OSHA module.",
  },
  documents: {
    label: "Documents",
    description: "Claim packets, medical releases, and case attachments.",
  },
  reports: {
    label: "Reports",
    description: "Case volume, severity, and return-to-work performance reports.",
  },
  settings: {
    label: "Settings",
    description: "Weekly status email recipients and module defaults.",
  },
};

/** Active claim tabs. Legacy `work-status` / `restrictions` remain for dead panel
 *  branches until those sections are fully folded into Overview. */
export type WcDetailTab =
  "overview" | "medical" | "carrier" | "forms" | "work-status" | "restrictions";

export type WcNextActionPriority = "HIGH" | "MEDIUM" | "LOW";

export type WorkersCompNextAction = {
  id: string;
  caseId: string;
  title: string;
  priority: WcNextActionPriority;
  overdue: boolean;
  /** Whole days past the due date (0 when not overdue). */
  daysOverdue: number;
  /** Plain-language explanation of why this was flagged and how the due date was set. */
  reason: string;
  claimNumber: string;
  employee: string;
  dueDate: string | null;
};
export type WorkersCompClaimSummary = {
  carrierId: string;
  carrierName: string;
  claimNumber: string;
  adjuster: string;
  dateOfInjury: string;
  bodyParts: string;
  notes: string;
  lostTimeStart: string;
  lostTimeEnd: string;
};

export const EMPTY_WC_CLAIM: WorkersCompClaimSummary = {
  carrierId: "",
  carrierName: "",
  claimNumber: "",
  adjuster: "",
  dateOfInjury: "",
  bodyParts: "",
  notes: "",
  lostTimeStart: "",
  lostTimeEnd: "",
};

export type WorkersCompCase = {
  id: string;
  title: string;
  caseNumber: string;
  status: string;
  severity: string;
  workflowStage: string;
  personnelId: string | null;
  incidentId: string | null;
  siteId: string | null;
  departmentId: string | null;
  reportedAt: string | null;
  daysAway: number | null;
  restrictedDays: number | null;
  claimSummary: WorkersCompClaimSummary;
  workerName: string;
  dateOfBirth: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  gender: string;
  locationText: string;
  notes: string;
  /** When true, WC inputs autofill / sync the linked OSHA Form 300 case. */
  oshaRecordable: boolean;
  oshaPrivacyCase: boolean;
  oshaCaseId: string | null;
  oshaJobTitle: string;
  oshaIllnessCategory: string;
  oshaCaseOutcome: string;
  nextAction?: { label: string; dueDate: string; owner: string; priority: string } | null;
  medicalAllowed?: boolean;
  medicalDeniedReason?: string | undefined;
  medical?: WorkersCompMedical[] | undefined;
  workStatus?: WorkersCompWorkStatus[] | undefined;
  restrictions?: WorkersCompRestriction[] | undefined;
  createdAt: string;
  updatedAt: string;
};

export type WorkersCompWorkStatus = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdByUserId?: string | null;
  canEditNotes?: boolean;
};

export type WorkersCompRestriction = {
  id: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  accommodations?: WorkersCompAccommodations;
};

export type WorkersCompMedical = {
  id: string;
  appointmentDate: string | null;
  provider: string | null;
  providerSpecialty: string | null;
  diagnosis: string | null;
  treatment: string | null;
  medication: string | null;
  examFindings: string | null;
  assessment: string | null;
  symptoms: string | null;
  notes: string | null;
  accommodations?: WorkersCompAccommodations;
  workStatus?: {
    status: string;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  };
  restrictionId?: string | null;
  workStatusPeriodId?: string | null;
  createdByUserId?: string | null;
  canEditNotes?: boolean;
};

export type WorkersCompCarrier = {
  id: string;
  name: string;
  status: string;
  contact: Record<string, unknown>;
};

export function workersCompCarrierContact(carrier: Pick<WorkersCompCarrier, "contact">): {
  phone: string;
  email: string;
} {
  const contact = carrier.contact && typeof carrier.contact === "object" ? carrier.contact : {};
  return {
    phone: typeof contact.phone === "string" ? contact.phone : "",
    email: typeof contact.email === "string" ? contact.email : "",
  };
}

/** Active catalog carriers for claim dropdowns (admin-managed list). */
/** Built-in carrier for claims the employer pays directly (not billed to insurance). */
export const WC_SELF_PAY_CARRIER_ID = "self-pay";
export const WC_SELF_PAY_CARRIER_NAME = "Self Pay";

export function isWorkersCompSelfPay(claim: { carrierId?: string; carrierName?: string }): boolean {
  return (
    (claim.carrierId ?? "").trim().toLowerCase() === WC_SELF_PAY_CARRIER_ID ||
    (claim.carrierName ?? "").trim().toLowerCase() === WC_SELF_PAY_CARRIER_NAME.toLowerCase()
  );
}

export function activeWorkersCompCarriers(
  carriers: readonly WorkersCompCarrier[],
): WorkersCompCarrier[] {
  return carriers.filter((carrier) => {
    const status = (carrier.status || "ACTIVE").trim().toUpperCase();
    return status === "ACTIVE" || status === "";
  });
}

export type WorkersCompSummary = {
  total: number;
  open: number;
  restricted: number;
  lostTime: number;
  closed: number;
};

export const EMPTY_WC_SUMMARY: WorkersCompSummary = {
  total: 0,
  open: 0,
  restricted: 0,
  lostTime: 0,
  closed: 0,
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asNullableId(value: unknown): string | null {
  const text = asText(value);
  return text || null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseWorkersCompClaimSummary(raw: unknown): WorkersCompClaimSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_WC_CLAIM };
  const row = raw as Record<string, unknown>;
  return {
    carrierId: asText(row.carrierId),
    carrierName: asText(row.carrierName),
    claimNumber: asText(row.claimNumber),
    adjuster: asText(row.adjuster),
    dateOfInjury: asText(row.dateOfInjury).slice(0, 10),
    bodyParts: asText(row.bodyParts),
    notes: asText(row.notes),
    lostTimeStart: asText(row.lostTimeStart).slice(0, 10),
    lostTimeEnd: asText(row.lostTimeEnd).slice(0, 10),
  };
}

export function toWorkersCompCase(raw: unknown): WorkersCompCase | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = asText(row.id);
  if (!id) return null;
  const caseNumber = asText(row.caseNumber);
  const claimSummary = parseWorkersCompClaimSummary(row.claimSummary);
  const syncedClaim = {
    ...claimSummary,
    claimNumber: caseNumber || claimSummary.claimNumber,
  };
  return {
    id,
    title: asText(row.title) || caseNumber || id,
    caseNumber,
    status: asText(row.status) || "OPEN",
    severity: asText(row.severity),
    workflowStage: asText(row.workflowStage),
    personnelId: asNullableId(row.personnelId),
    incidentId: asNullableId(row.incidentId),
    siteId: asNullableId(row.siteId),
    departmentId: asNullableId(row.departmentId),
    reportedAt: asNullableId(row.reportedAt),
    daysAway: asNumber(row.daysAway),
    restrictedDays: asNumber(row.restrictedDays),
    claimSummary: syncedClaim,
    workerName: asText(row.workerName),
    dateOfBirth: asText(row.dateOfBirth).slice(0, 10),
    street: asText(row.street),
    city: asText(row.city),
    state: asText(row.state),
    zip: asText(row.zip),
    gender: (() => {
      const raw = asText(row.gender).toUpperCase();
      if (raw === "M" || raw === "MALE") return "MALE";
      if (raw === "F" || raw === "FEMALE") return "FEMALE";
      return "";
    })(),
    locationText: asText(row.locationText),
    notes: asText(row.notes),
    oshaRecordable:
      row.oshaRecordable === true ||
      row.oshaRecordable === "true" ||
      row.oshaRecordable === 1 ||
      row.oshaRecordable === "1",
    oshaPrivacyCase:
      row.oshaPrivacyCase === true ||
      row.oshaPrivacyCase === "true" ||
      row.oshaPrivacyCase === 1 ||
      row.oshaPrivacyCase === "1",
    oshaCaseId: asNullableId(row.oshaCaseId),
    oshaJobTitle: asText(row.oshaJobTitle),
    oshaIllnessCategory: asText(row.oshaIllnessCategory) || "1",
    oshaCaseOutcome: asText(row.oshaCaseOutcome),
    nextAction: (() => {
      const next = row.nextAction;
      if (!next || typeof next !== "object" || Array.isArray(next)) return null;
      const n = next as Record<string, unknown>;
      const label = asText(n.label);
      const dueDate = asText(n.dueDate).slice(0, 10);
      if (!label && !dueDate) return null;
      return {
        label,
        dueDate,
        owner: asText(n.owner),
        priority: asText(n.priority) || "MEDIUM",
      };
    })(),
    medicalAllowed: row.medicalAllowed === true,
    medicalDeniedReason: asText(row.medicalDeniedReason) || undefined,
    medical: (() => {
      if (!Array.isArray(row.medical)) return undefined;
      const out: WorkersCompMedical[] = [];
      for (const m of row.medical) {
        if (!m || typeof m !== "object") continue;
        const item = m as Record<string, unknown>;
        const mid = asText(item.id);
        if (!mid) continue;
        const parsedAccommodations = parseWorkersCompAccommodations(item.accommodations);
        const workStatusRaw =
          item.workStatus && typeof item.workStatus === "object"
            ? (item.workStatus as Record<string, unknown>)
            : null;
        out.push({
          id: mid,
          appointmentDate: asNullableId(item.appointmentDate),
          provider: asNullableId(item.provider),
          providerSpecialty: asNullableId(item.providerSpecialty),
          diagnosis: asNullableId(item.diagnosis),
          treatment: asNullableId(item.treatment),
          medication: asNullableId(item.medication),
          examFindings: asNullableId(item.examFindings),
          assessment: asNullableId(item.assessment),
          symptoms: asNullableId(item.symptoms),
          notes: asNullableId(item.notes),
          ...(accommodationsHasContent(parsedAccommodations)
            ? { accommodations: parsedAccommodations }
            : {}),
          ...(workStatusRaw && asText(workStatusRaw.status)
            ? {
                workStatus: {
                  status: asText(workStatusRaw.status),
                  startDate: asNullableId(workStatusRaw.startDate),
                  endDate: asNullableId(workStatusRaw.endDate),
                  notes: asNullableId(workStatusRaw.notes),
                },
              }
            : {}),
          restrictionId: asNullableId(item.restrictionId),
          workStatusPeriodId: asNullableId(item.workStatusPeriodId),
          createdByUserId: asNullableId(item.createdByUserId),
          canEditNotes: item.canEditNotes === true,
        });
      }
      return out;
    })(),
    workStatus: (() => {
      if (!Array.isArray(row.workStatus)) return undefined;
      const out: WorkersCompWorkStatus[] = [];
      for (const m of row.workStatus) {
        if (!m || typeof m !== "object") continue;
        const item = m as Record<string, unknown>;
        const mid = asText(item.id);
        if (!mid) continue;
        out.push({
          id: mid,
          status: asText(item.status),
          startDate: asNullableId(item.startDate),
          endDate: asNullableId(item.endDate),
          notes: asNullableId(item.notes),
          createdByUserId: asNullableId(item.createdByUserId),
          canEditNotes: item.canEditNotes === true,
        });
      }
      return out;
    })(),
    restrictions: (() => {
      if (!Array.isArray(row.restrictions)) return undefined;
      const out: WorkersCompRestriction[] = [];
      for (const m of row.restrictions) {
        if (!m || typeof m !== "object") continue;
        const item = m as Record<string, unknown>;
        const mid = asText(item.id);
        if (!mid) continue;
        const parsedAccommodations = parseWorkersCompAccommodations(item.accommodations);
        out.push({
          id: mid,
          description: asNullableId(item.description),
          startDate: asNullableId(item.startDate),
          endDate: asNullableId(item.endDate),
          status: asText(item.status) || "ACTIVE",
          ...(accommodationsHasContent(parsedAccommodations)
            ? { accommodations: parsedAccommodations }
            : {}),
        });
      }
      return out;
    })(),
    createdAt: asText(row.createdAt),
    updatedAt: asText(row.updatedAt),
  };
}

export function toWorkersCompCases(items: unknown): WorkersCompCase[] {
  if (!Array.isArray(items)) return [];
  return items.map(toWorkersCompCase).filter((c): c is WorkersCompCase => c != null);
}

export function toWorkersCompSummary(raw: unknown): WorkersCompSummary {
  if (!raw || typeof raw !== "object") return { ...EMPTY_WC_SUMMARY };
  const row = raw as Record<string, unknown>;
  return {
    total: asNumber(row.total) ?? 0,
    open: asNumber(row.open) ?? 0,
    restricted: asNumber(row.restricted) ?? 0,
    lostTime: asNumber(row.lostTime) ?? 0,
    closed: asNumber(row.closed) ?? 0,
  };
}

export type WorkersCompWeeklyStatusSettings = {
  enabled: boolean;
  recipients: string[];
  lastSentAt: string | null;
};

export const EMPTY_WC_WEEKLY_STATUS_SETTINGS: WorkersCompWeeklyStatusSettings = {
  enabled: false,
  recipients: [],
  lastSentAt: null,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeWcEmailAddress(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** Split a draft into validated emails (comma, semicolon, or newline separated). */
export function parseWcEmailRecipients(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\n]+/)) {
    const email = normalizeWcEmailAddress(part);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function toWorkersCompWeeklyStatusSettings(raw: unknown): WorkersCompWeeklyStatusSettings {
  if (!raw || typeof raw !== "object") return { ...EMPTY_WC_WEEKLY_STATUS_SETTINGS };
  const row = raw as Record<string, unknown>;
  const recipients = Array.isArray(row.recipients)
    ? row.recipients
        .map((entry) => (typeof entry === "string" ? normalizeWcEmailAddress(entry) : null))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  return {
    enabled: row.enabled === true,
    recipients: [...new Set(recipients)],
    lastSentAt:
      typeof row.lastSentAt === "string" && row.lastSentAt.trim() ? row.lastSentAt.trim() : null,
  };
}

export function wcStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "CLOSED" || s === "ARCHIVED") return "bg-label-secondary";
  if (s === "LOST_TIME") return "bg-label-danger";
  if (s === "RESTRICTED") return "bg-label-warning";
  if (s === "OPEN" || s === "ACTIVE") return "bg-label-primary";
  return "bg-label-info";
}

/** Human-readable label for workers' comp enum values shown in the UI. */
export function wcEnumLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const known: Record<string, string> = {
    DRAFT: "Draft",
    OPEN: "Open",
    ACTIVE: "Active",
    RESTRICTED: "Restricted",
    LOST_TIME: "Lost time",
    CLOSED: "Closed",
    ARCHIVED: "Archived",
    INTAKE: "Intake",
    INVESTIGATION: "Investigation",
    MEDICAL_REVIEW: "Medical review",
    TREATMENT: "Treatment",
    RETURN_TO_WORK: "Return to work",
    CLAIM_ADMIN: "Claim admin",
    FULL_DUTY: "Full duty",
    OFF_WORK: "Off work",
    RETURNED: "Returned",
  };
  const key = value.toUpperCase();
  if (known[key]) return known[key];
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function wcModuleHref(view: WcModuleTab, extras: Record<string, string> = {}): string {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(extras)) {
    if (value) params.set(key, value);
  }
  return `/modules/workers-comp/?${params.toString()}`;
}

export function wcCaseHref(id: string, detailTab: WcDetailTab = "overview"): string {
  return wcModuleHref("cases", { id, tab: detailTab });
}

export function incidentHref(incidentId: string): string {
  return `/modules/incidents/?incident=${encodeURIComponent(incidentId)}`;
}

export function personnelFileHref(personnelId: string): string {
  return `/modules/personnel/person/?id=${encodeURIComponent(personnelId)}`;
}

export function parseWcModuleTab(raw: string | null | undefined): WcModuleTab {
  if (raw && WC_MODULE_TABS.some((tab) => tab.id === raw)) return raw as WcModuleTab;
  return "dashboard";
}

/** YYYY-MM-DD in local calendar. */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Thursday of the calendar week containing `date` (local timezone).
 * Sunday–Wednesday target the upcoming Thursday; Thursday–Saturday use that week's Thursday.
 */
export function thursdayWeekOf(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() + (4 - day));
  return toLocalIsoDate(local);
}

export function parseIsoDateLocal(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function normalizeThursdayWeekOf(raw: unknown, now: Date = new Date()): string {
  if (typeof raw === "string" && raw.trim()) {
    const parsed = parseIsoDateLocal(raw.trim().slice(0, 10));
    if (parsed) return thursdayWeekOf(parsed);
  }
  return thursdayWeekOf(now);
}

export type WcWeeklyUpdateRowStatus = "complete" | "due" | "overdue";

export function weeklyUpdateRowStatus(
  weekOf: string,
  hasUpdate: boolean,
  now: Date = new Date(),
): WcWeeklyUpdateRowStatus {
  if (hasUpdate) return "complete";
  const thursday = parseIsoDateLocal(weekOf);
  if (!thursday) return "due";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getTime() >= thursday.getTime()) return "overdue";
  return "due";
}

export function weeklyUpdateStatusBadgeClass(status: WcWeeklyUpdateRowStatus): string {
  if (status === "complete") return "bg-label-success";
  if (status === "overdue") return "bg-label-danger";
  return "bg-label-warning";
}

export function weeklyUpdateStatusLabel(status: WcWeeklyUpdateRowStatus): string {
  if (status === "complete") return "Complete";
  if (status === "overdue") return "Overdue";
  return "Due";
}

export type WorkersCompWeeklyUpdateRow = {
  caseId: string;
  workerName: string;
  caseNumber: string | null;
  claimNumber: string;
  caseStatus: string;
  weekOf: string;
  notes: string;
  updateId: string | null;
  updatedAt: string | null;
  priorNotes: string;
  priorWeekOf: string | null;
  needsUpdate: boolean;
  status: WcWeeklyUpdateRowStatus;
};

export type WorkersCompWeeklyUpdatesPayload = {
  weekOf: string;
  summary: {
    total: number;
    complete: number;
    due: number;
    overdue: number;
    remaining: number;
  };
  items: WorkersCompWeeklyUpdateRow[];
};

export function toWorkersCompWeeklyUpdatesPayload(raw: unknown): WorkersCompWeeklyUpdatesPayload {
  const empty: WorkersCompWeeklyUpdatesPayload = {
    weekOf: thursdayWeekOf(),
    summary: { total: 0, complete: 0, due: 0, overdue: 0, remaining: 0 },
    items: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const row = raw as Record<string, unknown>;
  const summaryRaw =
    row.summary && typeof row.summary === "object" && !Array.isArray(row.summary)
      ? (row.summary as Record<string, unknown>)
      : {};
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: WorkersCompWeeklyUpdateRow[] = itemsRaw
    .map((entry): WorkersCompWeeklyUpdateRow | null => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const caseId = asText(e.caseId);
      if (!caseId) return null;
      const statusRaw = asText(e.status).toLowerCase();
      const status: WcWeeklyUpdateRowStatus =
        statusRaw === "complete" || statusRaw === "overdue" || statusRaw === "due"
          ? statusRaw
          : e.needsUpdate === false
            ? "complete"
            : "due";
      return {
        caseId,
        workerName: asText(e.workerName) || "Unknown",
        caseNumber: asText(e.caseNumber) || null,
        claimNumber: asText(e.claimNumber) || asText(e.caseNumber) || "Pending",
        caseStatus: asText(e.caseStatus) || "OPEN",
        weekOf: asText(e.weekOf).slice(0, 10) || thursdayWeekOf(),
        notes: asText(e.notes),
        updateId: asText(e.updateId) || null,
        updatedAt: asText(e.updatedAt) || null,
        priorNotes: asText(e.priorNotes),
        priorWeekOf: asText(e.priorWeekOf).slice(0, 10) || null,
        needsUpdate: e.needsUpdate !== false && status !== "complete",
        status,
      };
    })
    .filter((item): item is WorkersCompWeeklyUpdateRow => item != null);

  const weekOf = asText(row.weekOf).slice(0, 10) || thursdayWeekOf();
  const complete =
    Number(summaryRaw.complete) || items.filter((i) => i.status === "complete").length;
  const due = Number(summaryRaw.due) || items.filter((i) => i.status === "due").length;
  const overdue = Number(summaryRaw.overdue) || items.filter((i) => i.status === "overdue").length;
  return {
    weekOf,
    summary: {
      total: Number(summaryRaw.total) || items.length,
      complete,
      due,
      overdue,
      remaining: Number(summaryRaw.remaining) || due + overdue,
    },
    items,
  };
}

export function parseWcDetailTab(raw: string | null): WcDetailTab {
  // Legacy work-status / restrictions tabs moved onto Overview / claim.
  if (raw === "work-status" || raw === "restrictions") {
    return "overview";
  }
  if (raw === "medical" || raw === "carrier" || raw === "forms" || raw === "overview") {
    return raw;
  }
  return "overview";
}

export function wcSummaryTiles(summary: WorkersCompSummary) {
  return [
    { id: "open", label: "Open cases", value: summary.open, tone: "primary" },
    { id: "restricted", label: "Restricted", value: summary.restricted, tone: "warning" },
    { id: "lostTime", label: "Lost time", value: summary.lostTime, tone: "danger" },
    { id: "closed", label: "Closed", value: summary.closed, tone: "secondary" },
  ] as const;
}

function isClosedStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === "CLOSED" || s === "ARCHIVED";
}

/** Active case statuses shown ahead of closed/archived in the cases list. */
export function isOpenWorkersCompStatus(status: string): boolean {
  return !isClosedStatus(status);
}

function caseSortDate(c: WorkersCompCase): string {
  return (c.claimSummary.dateOfInjury || c.reportedAt || c.updatedAt || c.createdAt || "").slice(
    0,
    10,
  );
}

/**
 * Open/active cases first, then closed/archived; within each group newest date first.
 * Makes the Cases list easier to navigate when scanning case files.
 */
export function sortWorkersCompCasesForList(cases: WorkersCompCase[]): WorkersCompCase[] {
  return [...cases].sort((a, b) => {
    const aOpen = isOpenWorkersCompStatus(a.status) ? 0 : 1;
    const bOpen = isOpenWorkersCompStatus(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const byDate = caseSortDate(b).localeCompare(caseSortDate(a));
    if (byDate !== 0) return byDate;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatWcDueDate(iso: string | null): string {
  return formatDisplayDate(iso);
}

export function wcClaimNumber(
  c: Pick<WorkersCompCase, "caseNumber" | "claimSummary" | "id">,
): string {
  return c.caseNumber || c.claimSummary.claimNumber || "Pending";
}

/** Safe download filename for a WC claim printable HTML packet. */
export function workersCompPrintFilename(
  c: Pick<WorkersCompCase, "caseNumber" | "claimSummary" | "workerName" | "id">,
): string {
  const claim =
    wcClaimNumber(c)
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 40) || "claim";
  const worker = (c.workerName || "worker").replace(/[^\w.-]+/g, "_").slice(0, 40);
  return `workers-comp-${claim}-${worker}.html`;
}

/** Due-date rules behind dashboard Next Actions, shown to users as the overdue legend. */
export const WC_NEXT_ACTION_RULES: ReadonlyArray<{ title: string; rule: string }> = [
  {
    title: "Case follow-up",
    rule: "Uses the follow-up due date set on the case (7 days after the report date if none was set). Clears once the case reaches Treatment.",
  },
  {
    title: "Claim number missing",
    rule: "No claim number recorded. Due 3 days after the report date.",
  },
  {
    title: "Claim classification review",
    rule: "Case is still in Intake. Due 5 days after the report date.",
  },
  {
    title: "Lost-time medical review",
    rule: "Status is Lost Time or days away are recorded. Due 7 days after the report date. Clears once the case reaches Treatment.",
  },
  {
    title: "Pending medical review",
    rule: "Case is in Investigation or Medical review. Due 10 days after the report date.",
  },
  {
    title: "Return-to-work follow-up",
    rule: "Worker is Restricted. Due 14 days after the report date. Clears once the case reaches Treatment.",
  },
];

function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T12:00:00.000Z`);
  const to = Date.parse(`${toIso}T12:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Derive dashboard Next Actions from case list rows (no extra API).
 * Priority / overdue rules mirror claim follow-up queues.
 */
export function buildWorkersCompNextActions(
  cases: WorkersCompCase[],
  now = new Date(),
): WorkersCompNextAction[] {
  const today = now.toISOString().slice(0, 10);
  const actions: WorkersCompNextAction[] = [];

  for (const c of cases) {
    if (isClosedStatus(c.status)) continue;

    const claimNumber = wcClaimNumber(c);
    const employee = (c.workerName || "Unknown EMPLOYEE").toUpperCase();
    const baseDate = (c.reportedAt || c.createdAt || c.updatedAt).slice(0, 10) || today;
    const reported = formatDisplayDate(baseDate);
    const severity = wcNormalizeSeverity(c.severity).toLowerCase();
    const stage = c.workflowStage.toUpperCase();
    const status = c.status.toUpperCase();
    const stageIndex = (WC_WORKFLOW_STAGES as readonly string[]).indexOf(stage);
    const inTreatmentOrLater = stageIndex >= WC_WORKFLOW_STAGES.indexOf("TREATMENT");

    const push = (
      key: string,
      title: string,
      priority: WcNextActionPriority,
      dueDate: string,
      reason: string,
    ) => {
      const overdue = Boolean(dueDate && dueDate < today);
      actions.push({
        id: `${c.id}:${key}`,
        caseId: c.id,
        title,
        priority,
        overdue,
        daysOverdue: overdue ? daysBetweenIso(dueDate, today) : 0,
        reason,
        claimNumber,
        employee,
        dueDate: dueDate || null,
      });
    };

    if (!inTreatmentOrLater && c.nextAction && (c.nextAction.label || c.nextAction.dueDate)) {
      const dueDate = c.nextAction.dueDate || addDaysIso(baseDate, 7);
      const priorityRaw = (c.nextAction.priority || "MEDIUM").toUpperCase();
      const priority: WcNextActionPriority =
        priorityRaw === "HIGH" || priorityRaw === "LOW" ? priorityRaw : "MEDIUM";
      push(
        "source-next",
        c.nextAction.label || "Follow-up required",
        priority,
        dueDate,
        c.nextAction.dueDate
          ? "Follow-up due date set on the case. Complete it or update the due date to clear."
          : `Follow-up on the case has no due date, so it defaults to 7 days after the report date (${reported}).`,
      );
      continue;
    }

    if (!c.caseNumber && !c.claimSummary.claimNumber) {
      push(
        "claim-number",
        "Claim number missing",
        "HIGH",
        addDaysIso(baseDate, 3),
        `No claim number recorded. Due 3 days after the report date (${reported}). Add the carrier claim number to clear.`,
      );
    }

    if (stage === "INTAKE" || stage === "") {
      push(
        "classification",
        "Claim classification review",
        severity === "high" ||
          severity === "critical" ||
          severity === "lost_time" ||
          status === "LOST_TIME"
          ? "HIGH"
          : "MEDIUM",
        addDaysIso(baseDate, 5),
        `Case is still in Intake. Classification is due 5 days after the report date (${reported}). Move the case to the next stage to clear.`,
      );
    }

    if (!inTreatmentOrLater && (status === "RESTRICTED" || severity === "restricted")) {
      push(
        "rtw",
        "Return-to-work follow-up",
        "MEDIUM",
        addDaysIso(baseDate, 14),
        `Worker is on restricted duty. Follow-up is due 14 days after the report date (${reported}). Move the case to Treatment or a later stage to clear.`,
      );
    }

    if (
      !inTreatmentOrLater &&
      (status === "LOST_TIME" || severity === "lost_time" || (c.daysAway != null && c.daysAway > 0))
    ) {
      push(
        "lost-time",
        "Lost-time medical review",
        "HIGH",
        addDaysIso(baseDate, 7),
        `Lost time recorded${c.daysAway ? ` (${c.daysAway} day${c.daysAway === 1 ? "" : "s"} away)` : ""}. Medical review is due 7 days after the report date (${reported}).`,
      );
    }

    if (stage === "MEDICAL_REVIEW" || stage === "INVESTIGATION") {
      push(
        "medical-review",
        c.claimSummary.carrierName && !isWorkersCompSelfPay(c.claimSummary)
          ? `Pending medical review from ${c.claimSummary.carrierName}`
          : "Pending medical review",
        "MEDIUM",
        addDaysIso(baseDate, 10),
        `Case is in ${stage === "MEDICAL_REVIEW" ? "Medical review" : "Investigation"}. Medical review is due 10 days after the report date (${reported}). Move the case to Treatment or a later stage to clear.`,
      );
    }
  }

  const rank = (a: WorkersCompNextAction) =>
    (a.overdue ? 0 : 1) * 10 + (a.priority === "HIGH" ? 0 : a.priority === "MEDIUM" ? 1 : 2);

  return actions.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

export function uniqueWorkersFromCases(cases: WorkersCompCase[]) {
  const map = new Map<
    string,
    { key: string; name: string; personnelId: string | null; openCases: number; totalCases: number }
  >();
  for (const c of cases) {
    const key = c.personnelId || c.workerName || c.id;
    const existing = map.get(key);
    const open = isClosedStatus(c.status) ? 0 : 1;
    if (!existing) {
      map.set(key, {
        key,
        name: c.workerName || "Unknown EMPLOYEE",
        personnelId: c.personnelId,
        openCases: open,
        totalCases: 1,
      });
    } else {
      existing.openCases += open;
      existing.totalCases += 1;
      if (!existing.personnelId && c.personnelId) existing.personnelId = c.personnelId;
      if (!existing.name && c.workerName) existing.name = c.workerName;
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function returnToWorkCases(cases: WorkersCompCase[]) {
  return cases.filter((c) => {
    if (isClosedStatus(c.status)) return false;
    const status = c.status.toUpperCase();
    const stage = c.workflowStage.toUpperCase();
    return (
      status === "RESTRICTED" ||
      status === "LOST_TIME" ||
      stage === "RETURN_TO_WORK" ||
      stage === "TREATMENT"
    );
  });
}

export function wcPriorityBadgeClass(priority: WcNextActionPriority): string {
  if (priority === "HIGH") return "bg-label-danger";
  if (priority === "MEDIUM") return "bg-label-warning";
  return "bg-label-secondary";
}
