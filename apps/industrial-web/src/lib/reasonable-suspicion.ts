/**
 * Reasonable-suspicion observation record for Incidents → Drug/Alcohol.
 * Supervisor documentation of the specific, contemporaneous signs that led to
 * drug and/or alcohol testing. Consent and test results live in the
 * drug & alcohol consent forms on the same incident.
 */

export const REASONABLE_SUSPICION_INDICATOR_GROUPS = [
  {
    id: "appearance",
    label: "Appearance",
    options: [
      { id: "bloodshot-eyes", label: "Bloodshot, watery, or glassy eyes" },
      { id: "pupils", label: "Dilated or constricted pupils" },
      { id: "flushed-pale", label: "Flushed or unusually pale face" },
      { id: "disheveled", label: "Disheveled or unkempt appearance" },
      { id: "sweating", label: "Excessive sweating" },
    ],
  },
  {
    id: "behavior",
    label: "Behavior",
    options: [
      { id: "drowsy", label: "Drowsy, sleeping, or difficult to wake" },
      { id: "confused", label: "Confused or disoriented" },
      { id: "aggressive", label: "Aggressive, combative, or argumentative" },
      { id: "mood-swings", label: "Unusual mood swings or agitation" },
      { id: "paranoid", label: "Paranoid, anxious, or hyperactive" },
    ],
  },
  {
    id: "speech",
    label: "Speech",
    options: [
      { id: "slurred-speech", label: "Slurred or incoherent speech" },
      { id: "rapid-speech", label: "Unusually rapid or slow speech" },
    ],
  },
  {
    id: "coordination",
    label: "Coordination and balance",
    options: [
      { id: "unsteady-gait", label: "Unsteady gait, stumbling, or swaying" },
      { id: "poor-coordination", label: "Poor coordination or fumbling" },
      { id: "tremors", label: "Hand tremors" },
    ],
  },
  {
    id: "odor",
    label: "Odor",
    options: [
      { id: "odor-alcohol", label: "Odor of alcohol" },
      { id: "odor-marijuana", label: "Odor of marijuana" },
    ],
  },
  {
    id: "conduct",
    label: "Conduct and evidence",
    options: [
      { id: "observed-use", label: "Observed using drugs or alcohol" },
      { id: "possession", label: "Possession of drugs, alcohol, or paraphernalia" },
      { id: "unsafe-work", label: "Unsafe work practices or near miss" },
      { id: "performance", label: "Sudden decline in work performance" },
    ],
  },
] as const;

export const REASONABLE_SUSPICION_TRANSPORT_OPTIONS = [
  { id: "company-escort", label: "Company representative escorted employee" },
  { id: "rideshare", label: "Taxi / rideshare arranged by company" },
  { id: "family", label: "Family member or friend picked up employee" },
  { id: "ems", label: "Emergency medical services" },
  { id: "refused", label: "Employee refused transportation" },
  { id: "other", label: "Other" },
] as const;

export type ReasonableSuspicionIndicatorId =
  (typeof REASONABLE_SUSPICION_INDICATOR_GROUPS)[number]["options"][number]["id"];
export type ReasonableSuspicionTransportId =
  (typeof REASONABLE_SUSPICION_TRANSPORT_OPTIONS)[number]["id"] | "";

export type ReasonableSuspicionObservation = {
  observedAt: string;
  indicators: ReasonableSuspicionIndicatorId[];
  indicatorsOther: string;
  /** Specific, contemporaneous description of what the observer saw, heard, or smelled. */
  observationNarrative: string;
  /** Employee is a DOT-covered driver (49 CFR Part 382 rules apply). */
  dotCovered: boolean | null;
  observerName: string;
  observerTitle: string;
  /** Observer completed reasonable-suspicion supervisor training. */
  observerTrained: boolean;
  observerSignature: string;
  observerSignedAt: string;
  secondObserverName: string;
  secondObserverTitle: string;
  secondObserverSignature: string;
  removedFromDuty: boolean;
  removedFromDutyAt: string;
  transportation: ReasonableSuspicionTransportId;
  transportationOther: string;
  employeeStatement: string;
  followUpNotes: string;
};

export const EMPTY_REASONABLE_SUSPICION: ReasonableSuspicionObservation = {
  observedAt: "",
  indicators: [],
  indicatorsOther: "",
  observationNarrative: "",
  dotCovered: null,
  observerName: "",
  observerTitle: "",
  observerTrained: false,
  observerSignature: "",
  observerSignedAt: "",
  secondObserverName: "",
  secondObserverTitle: "",
  secondObserverSignature: "",
  removedFromDuty: false,
  removedFromDutyAt: "",
  transportation: "",
  transportationOther: "",
  employeeStatement: "",
  followUpNotes: "",
};

const INDICATOR_OPTIONS = REASONABLE_SUSPICION_INDICATOR_GROUPS.flatMap((group) => [
  ...group.options,
]);
const INDICATOR_IDS: readonly string[] = INDICATOR_OPTIONS.map((opt) => opt.id);
const TRANSPORT_IDS: readonly string[] = REASONABLE_SUSPICION_TRANSPORT_OPTIONS.map(
  (opt) => opt.id,
);

export function cloneEmptyReasonableSuspicion(): ReasonableSuspicionObservation {
  return { ...EMPTY_REASONABLE_SUSPICION, indicators: [] };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFlag(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function asYesNo(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "true" || text === "yes") return true;
  if (text === "false" || text === "no") return false;
  return null;
}

export function parseReasonableSuspicion(raw: unknown): ReasonableSuspicionObservation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return cloneEmptyReasonableSuspicion();
  }
  const row = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const indicators = (Array.isArray(row.indicators) ? row.indicators : [])
    .map((item) => asText(item).trim())
    .filter((id): id is ReasonableSuspicionIndicatorId => {
      if (!INDICATOR_IDS.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const transport = asText(row.transportation).trim();
  return {
    observedAt: asText(row.observedAt).trim(),
    indicators,
    indicatorsOther: asText(row.indicatorsOther).trim(),
    observationNarrative: asText(row.observationNarrative),
    dotCovered: asYesNo(row.dotCovered),
    observerName: asText(row.observerName).trim(),
    observerTitle: asText(row.observerTitle).trim(),
    observerTrained: asFlag(row.observerTrained),
    observerSignature: asText(row.observerSignature),
    observerSignedAt: asText(row.observerSignedAt).trim(),
    secondObserverName: asText(row.secondObserverName).trim(),
    secondObserverTitle: asText(row.secondObserverTitle).trim(),
    secondObserverSignature: asText(row.secondObserverSignature),
    removedFromDuty: asFlag(row.removedFromDuty),
    removedFromDutyAt: asText(row.removedFromDutyAt).trim(),
    transportation: TRANSPORT_IDS.includes(transport)
      ? (transport as ReasonableSuspicionTransportId)
      : "",
    transportationOther: asText(row.transportationOther).trim(),
    employeeStatement: asText(row.employeeStatement),
    followUpNotes: asText(row.followUpNotes),
  };
}

export function reasonableSuspicionHasContent(value: ReasonableSuspicionObservation): boolean {
  return Boolean(
    value.observedAt ||
    value.indicators.length ||
    value.indicatorsOther ||
    value.observationNarrative.trim() ||
    value.dotCovered !== null ||
    value.observerName ||
    value.observerTitle ||
    value.observerTrained ||
    value.observerSignature.trim() ||
    value.secondObserverName ||
    value.removedFromDuty ||
    value.transportation ||
    value.employeeStatement.trim() ||
    value.followUpNotes.trim(),
  );
}

export function reasonableSuspicionValidationMessage(
  value: ReasonableSuspicionObservation,
): string | null {
  if (!value.observedAt.trim()) {
    return "Enter the date and time the employee was observed.";
  }
  if (value.indicators.length === 0 && !value.indicatorsOther.trim()) {
    return "Select at least one observed sign (or describe Other signs).";
  }
  if (!value.observationNarrative.trim()) {
    return "Describe the specific observations that led to reasonable suspicion.";
  }
  if (value.dotCovered === null) {
    return "Indicate whether the employee is a DOT-covered driver.";
  }
  if (!value.observerName.trim()) {
    return "Enter the observing supervisor's name.";
  }
  if (!value.observerSignature.trim()) {
    return "The observing supervisor must sign the observation.";
  }
  if (value.transportation === "other" && !value.transportationOther.trim()) {
    return "Describe the Other transportation arrangement.";
  }
  return null;
}

function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Testing windows measured from the observation (DOT 49 CFR 382.307):
 * alcohol within 2 hours, stop attempting after 8 hours; drug within 32 hours.
 */
export function reasonableSuspicionTestDeadlines(observedAt: string): {
  alcoholBy: string;
  alcoholCutoff: string;
  drugBy: string;
} | null {
  const start = parseLocalDateTime(observedAt);
  if (!start) return null;
  const hours = (n: number) => formatLocalDateTime(new Date(start.getTime() + n * 3_600_000));
  return { alcoholBy: hours(2), alcoholCutoff: hours(8), drugBy: hours(32) };
}

export function reasonableSuspicionIndicatorLabels(
  value: ReasonableSuspicionObservation,
): string[] {
  const labels = value.indicators
    .map((id): string | undefined => INDICATOR_OPTIONS.find((opt) => opt.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  if (value.indicatorsOther.trim()) labels.push(`Other: ${value.indicatorsOther.trim()}`);
  return labels;
}

function observerLabel(name: string, title: string): string {
  return title ? `${name} (${title})` : name;
}

export function formatReasonableSuspicionDetailLines(
  value: ReasonableSuspicionObservation,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (value.observedAt) rows.push({ label: "Observed", value: value.observedAt });
  const indicators = reasonableSuspicionIndicatorLabels(value);
  if (indicators.length) rows.push({ label: "Observed signs", value: indicators.join("; ") });
  if (value.observationNarrative.trim()) {
    rows.push({ label: "Observations", value: value.observationNarrative.trim() });
  }
  if (value.dotCovered !== null) {
    rows.push({ label: "DOT-covered driver", value: value.dotCovered ? "Yes" : "No" });
  }
  if (value.observerName) {
    rows.push({
      label: "Observing supervisor",
      value: `${observerLabel(value.observerName, value.observerTitle)}${
        value.observerTrained ? " - reasonable-suspicion trained" : ""
      }`,
    });
  }
  if (value.observerSignedAt) {
    rows.push({ label: "Supervisor signed", value: value.observerSignedAt });
  }
  if (value.secondObserverName) {
    rows.push({
      label: "Second observer",
      value: observerLabel(value.secondObserverName, value.secondObserverTitle),
    });
  }
  if (value.removedFromDuty) {
    rows.push({
      label: "Removed from duty",
      value: value.removedFromDutyAt ? `Yes - ${value.removedFromDutyAt}` : "Yes",
    });
  }
  if (value.transportation) {
    const option = REASONABLE_SUSPICION_TRANSPORT_OPTIONS.find(
      (opt) => opt.id === value.transportation,
    );
    rows.push({
      label: "Transportation",
      value:
        value.transportation === "other" && value.transportationOther
          ? value.transportationOther
          : (option?.label ?? value.transportation),
    });
  }
  if (value.employeeStatement.trim()) {
    rows.push({ label: "Employee statement", value: value.employeeStatement.trim() });
  }
  if (value.followUpNotes.trim()) {
    rows.push({ label: "Follow-up", value: value.followUpNotes.trim() });
  }
  return rows;
}
