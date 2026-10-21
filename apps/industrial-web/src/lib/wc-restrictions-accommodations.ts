/**
 * Restrictions / Work Accommodations fields for Workers' Comp cases
 * (Stand/Walk, Sit, lifting levels, extremities, transitional work).
 */

export const WC_STAND_WALK_OPTIONS = [
  { id: "none", label: "None or At No Time" },
  { id: "1-4", label: "1-4 Hours" },
  { id: "4-6", label: "4-6 Hours" },
  { id: "6-8", label: "6-8 Hours" },
  { id: "8-12", label: "8-12 Hours" },
  { id: "12-16", label: "12-16 Hours" },
] as const;

export const WC_SIT_OPTIONS = [
  { id: "unlimited", label: "Unlimited" },
  { id: "1-3", label: "1-3 Hours" },
  { id: "3-5", label: "3-5 Hours" },
  { id: "5-8", label: "5-8 Hours" },
] as const;

export const WC_LIFTING_OPTIONS = [
  {
    id: "sedentary",
    label: "Sedentary – Sit Down Work Only",
    detail:
      "lifting no more than 10 lbs. maximum at any time, all work must be performed seated.",
  },
  {
    id: "minimal-light",
    label: "Minimal Light Work",
    detail:
      "lifting 10 lbs. maximum & occasionally lifting and/or carrying such articles as files, ledgers & small tools.",
  },
  {
    id: "light",
    label: "Light Work",
    detail:
      "lifting 20 lbs. maximum with frequent lifting and or carrying of objects weighing up to 10 lbs.",
  },
  {
    id: "light-medium",
    label: "Light Medium Work",
    detail:
      "lifting 30 lbs. maximum with frequent lifting and/or carrying objects weighing up to 10 lbs.",
  },
  {
    id: "medium",
    label: "Medium Work",
    detail:
      "lifting 50 lbs. maximum with frequent lifting and/or carrying objects weighing up to 40 lbs.",
  },
  {
    id: "light-heavy",
    label: "Light Heavy Work",
    detail:
      "lifting 75 lbs. maximum with frequent lifting and/or carrying of objects weighing up to 40 lbs.",
  },
  {
    id: "heavy",
    label: "Heavy Work",
    detail:
      "lifting 100 lbs. maximum with frequent lifting and/or carrying of objects weighing up to 40 lbs.",
  },
] as const;

export const WC_INJURY_SIDE_OPTIONS = [
  { id: "right", label: "Right" },
  { id: "left", label: "Left" },
] as const;

export const WC_INJURY_PART_OPTIONS = [
  { id: "hand", label: "Hand" },
  { id: "arm", label: "Arm" },
  { id: "leg", label: "Leg" },
  { id: "foot", label: "Foot" },
  { id: "other", label: "Other" },
] as const;

export const WC_UPPER_EXTREMITY_OPTIONS = [
  {
    id: "no-repetitive-gripping",
    label: "No repetitive gripping, grasping, pinching, squeezing",
  },
  {
    id: "no-vibratory",
    label: "No operation of vibratory machinery/equipment",
  },
  { id: "no-lift-above-shoulder", label: "No lifting above shoulder level" },
  {
    id: "no-lift-floor-shoulder",
    label: "No lifting from floor to shoulder level",
  },
  { id: "no-lift-floor-waist", label: "No lifting from floor to waist level" },
  {
    id: "limit-push-pull",
    label: "Limiting Push/Pull activities to ___ lbs. and under",
  },
  {
    id: "no-use-affected-arm-hand",
    label:
      "NO USE OF EFFECTED Arm/Hand and/or Keep in sling or brace at all times",
  },
] as const;

export const WC_LOWER_EXTREMITY_OPTIONS = [
  { id: "no-squatting-kneeling", label: "No squatting or kneeling" },
  { id: "no-stairs", label: "No standing on or climbing of stairs" },
  { id: "no-ladders", label: "No standing on or climbing of ladders" },
  {
    id: "no-foot-pedal",
    label: "No use of foot pedal operated machinery",
  },
  { id: "no-stooping-bending", label: "No stooping or bending at the waist" },
] as const;

export const WC_TRANSITIONAL_HOUR_OPTIONS = [
  { id: "2", label: "2 hours" },
  { id: "4", label: "4 hours" },
  { id: "6", label: "6 hours" },
  { id: "8", label: "8 hours" },
] as const;

export type WcStandWalk = (typeof WC_STAND_WALK_OPTIONS)[number]["id"] | "";
export type WcSit = (typeof WC_SIT_OPTIONS)[number]["id"] | "";
export type WcLiftingLevel = (typeof WC_LIFTING_OPTIONS)[number]["id"] | "";
export type WcInjurySide = (typeof WC_INJURY_SIDE_OPTIONS)[number]["id"];
export type WcInjuryPart = (typeof WC_INJURY_PART_OPTIONS)[number]["id"];
export type WcUpperExtremity = (typeof WC_UPPER_EXTREMITY_OPTIONS)[number]["id"];
export type WcLowerExtremity = (typeof WC_LOWER_EXTREMITY_OPTIONS)[number]["id"];
export type WcTransitionalHours =
  | (typeof WC_TRANSITIONAL_HOUR_OPTIONS)[number]["id"]
  | "";

export type WorkersCompAccommodations = {
  standWalk: WcStandWalk;
  sit: WcSit;
  liftingLevel: WcLiftingLevel;
  injurySides: WcInjurySide[];
  injuryParts: WcInjuryPart[];
  injuryOther: string;
  upperExtremities: WcUpperExtremity[];
  pushPullLimitLbs: string;
  lowerExtremities: WcLowerExtremity[];
  transitionalNotApplicable: boolean;
  transitionalHours: WcTransitionalHours;
  transitionalWeeks: string;
  transitionalAbleRemaining: "" | "yes" | "no";
  transitionalEffectiveDate: string;
  notes: string;
};

export const EMPTY_WC_ACCOMMODATIONS: WorkersCompAccommodations = {
  standWalk: "",
  sit: "",
  liftingLevel: "",
  injurySides: [],
  injuryParts: [],
  injuryOther: "",
  upperExtremities: [],
  pushPullLimitLbs: "",
  lowerExtremities: [],
  transitionalNotApplicable: false,
  transitionalHours: "",
  transitionalWeeks: "",
  transitionalAbleRemaining: "",
  transitionalEffectiveDate: "",
  notes: "",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickId<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  const raw = asText(value);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : "";
}

function pickIds<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = pickId(entry, allowed);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const STAND_IDS = WC_STAND_WALK_OPTIONS.map((o) => o.id);
const SIT_IDS = WC_SIT_OPTIONS.map((o) => o.id);
const LIFT_IDS = WC_LIFTING_OPTIONS.map((o) => o.id);
const SIDE_IDS = WC_INJURY_SIDE_OPTIONS.map((o) => o.id);
const PART_IDS = WC_INJURY_PART_OPTIONS.map((o) => o.id);
const UPPER_IDS = WC_UPPER_EXTREMITY_OPTIONS.map((o) => o.id);
const LOWER_IDS = WC_LOWER_EXTREMITY_OPTIONS.map((o) => o.id);
const HOUR_IDS = WC_TRANSITIONAL_HOUR_OPTIONS.map((o) => o.id);

export function parseWorkersCompAccommodations(raw: unknown): WorkersCompAccommodations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_WC_ACCOMMODATIONS };
  }
  const row = raw as Record<string, unknown>;
  const able = asText(row.transitionalAbleRemaining).toLowerCase();
  return {
    standWalk: pickId(row.standWalk, STAND_IDS),
    sit: pickId(row.sit, SIT_IDS),
    liftingLevel: pickId(row.liftingLevel, LIFT_IDS),
    injurySides: pickIds(row.injurySides, SIDE_IDS),
    injuryParts: pickIds(row.injuryParts, PART_IDS),
    injuryOther: asText(row.injuryOther),
    upperExtremities: pickIds(row.upperExtremities, UPPER_IDS),
    pushPullLimitLbs: asText(row.pushPullLimitLbs),
    lowerExtremities: pickIds(row.lowerExtremities, LOWER_IDS),
    transitionalNotApplicable:
      row.transitionalNotApplicable === true ||
      String(row.transitionalNotApplicable ?? "").toLowerCase() === "true",
    transitionalHours: pickId(row.transitionalHours, HOUR_IDS),
    transitionalWeeks: asText(row.transitionalWeeks),
    transitionalAbleRemaining: able === "yes" || able === "no" ? able : "",
    transitionalEffectiveDate: asText(row.transitionalEffectiveDate).slice(0, 10),
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function accommodationsHasContent(value: WorkersCompAccommodations): boolean {
  return Boolean(
    value.standWalk ||
      value.sit ||
      value.liftingLevel ||
      value.injurySides.length ||
      value.injuryParts.length ||
      value.injuryOther ||
      value.upperExtremities.length ||
      value.pushPullLimitLbs ||
      value.lowerExtremities.length ||
      value.transitionalNotApplicable ||
      value.transitionalHours ||
      value.transitionalWeeks ||
      value.transitionalAbleRemaining ||
      value.transitionalEffectiveDate ||
      value.notes.trim(),
  );
}

export function summarizeWorkersCompAccommodations(
  value: WorkersCompAccommodations,
): string {
  const parts: string[] = [];
  const stand = WC_STAND_WALK_OPTIONS.find((o) => o.id === value.standWalk);
  if (stand) parts.push(`Stand/Walk: ${stand.label}`);
  const sit = WC_SIT_OPTIONS.find((o) => o.id === value.sit);
  if (sit) parts.push(`Sit: ${sit.label}`);
  const lift = WC_LIFTING_OPTIONS.find((o) => o.id === value.liftingLevel);
  if (lift) parts.push(lift.label);
  if (value.injurySides.length || value.injuryParts.length || value.injuryOther) {
    const loc = [
      ...value.injurySides.map((id) => WC_INJURY_SIDE_OPTIONS.find((o) => o.id === id)?.label),
      ...value.injuryParts
        .filter((id) => id !== "other")
        .map((id) => WC_INJURY_PART_OPTIONS.find((o) => o.id === id)?.label),
      value.injuryOther ? `Other: ${value.injuryOther}` : null,
    ].filter(Boolean);
    if (loc.length) parts.push(`Injury: ${loc.join(", ")}`);
  }
  if (value.upperExtremities.length) {
    parts.push(`Upper: ${value.upperExtremities.length} limit(s)`);
  }
  if (value.lowerExtremities.length) {
    parts.push(`Lower: ${value.lowerExtremities.length} limit(s)`);
  }
  if (value.transitionalNotApplicable) {
    parts.push("Transitional work: N/A");
  } else if (value.transitionalHours) {
    const hours = WC_TRANSITIONAL_HOUR_OPTIONS.find((o) => o.id === value.transitionalHours);
    parts.push(
      `Transitional: ${hours?.label ?? value.transitionalHours} unrestricted` +
        (value.transitionalWeeks ? ` for ${value.transitionalWeeks} week(s)` : ""),
    );
  }
  if (value.notes.trim()) parts.push("Notes recorded");
  return parts.join(" · ") || "Work accommodations";
}

export function formatAccommodationsDetailLines(
  value: WorkersCompAccommodations,
): string[] {
  const lines: string[] = [];
  const stand = WC_STAND_WALK_OPTIONS.find((o) => o.id === value.standWalk);
  if (stand) lines.push(`Stand / Walk: ${stand.label}`);
  const sit = WC_SIT_OPTIONS.find((o) => o.id === value.sit);
  if (sit) lines.push(`Sit: ${sit.label}`);
  const lift = WC_LIFTING_OPTIONS.find((o) => o.id === value.liftingLevel);
  if (lift) lines.push(`Lifting: ${lift.label} — ${lift.detail}`);
  if (value.injurySides.length || value.injuryParts.length || value.injuryOther) {
    const loc = [
      ...value.injurySides.map((id) => WC_INJURY_SIDE_OPTIONS.find((o) => o.id === id)?.label),
      ...value.injuryParts
        .filter((id) => id !== "other")
        .map((id) => WC_INJURY_PART_OPTIONS.find((o) => o.id === id)?.label),
      value.injuryOther ? `Other: ${value.injuryOther}` : null,
    ].filter(Boolean);
    lines.push(`Location of injury: ${loc.join(", ")}`);
  }
  for (const id of value.upperExtremities) {
    const opt = WC_UPPER_EXTREMITY_OPTIONS.find((o) => o.id === id);
    if (!opt) continue;
    if (id === "limit-push-pull") {
      lines.push(
        `Upper: Limiting Push/Pull activities to ${value.pushPullLimitLbs || "—"} lbs. and under`,
      );
    } else {
      lines.push(`Upper: ${opt.label}`);
    }
  }
  for (const id of value.lowerExtremities) {
    const opt = WC_LOWER_EXTREMITY_OPTIONS.find((o) => o.id === id);
    if (opt) lines.push(`Lower: ${opt.label}`);
  }
  if (value.transitionalNotApplicable) {
    lines.push("Transitional work: Not applicable");
  } else if (value.transitionalHours) {
    const hours = WC_TRANSITIONAL_HOUR_OPTIONS.find((o) => o.id === value.transitionalHours);
    lines.push(
      `Transitional: ${hours?.label ?? value.transitionalHours} unrestricted work per day` +
        (value.transitionalWeeks ? ` for ${value.transitionalWeeks} week(s)` : "") +
        (value.transitionalAbleRemaining
          ? `; able to work remaining schedule: ${value.transitionalAbleRemaining.toUpperCase()}`
          : "") +
        (value.transitionalEffectiveDate
          ? `; effective ${value.transitionalEffectiveDate}`
          : ""),
    );
  }
  if (value.notes.trim()) lines.push(`Notes: ${value.notes.trim()}`);
  return lines;
}
