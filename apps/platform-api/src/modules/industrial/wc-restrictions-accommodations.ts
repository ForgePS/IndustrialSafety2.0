/**
 * Server-side parse/summarize for WC restriction accommodations stored in source_payload.
 * Keep option ids aligned with industrial-web wc-restrictions-accommodations.ts.
 */

const STAND_WALK = new Set(["none", "1-4", "4-6", "6-8", "8-12", "12-16"]);
const SIT = new Set(["unlimited", "1-3", "3-5", "5-8"]);
const LIFTING = new Set([
  "sedentary",
  "minimal-light",
  "light",
  "light-medium",
  "medium",
  "light-heavy",
  "heavy",
]);
const INJURY_SIDES = new Set(["right", "left"]);
const INJURY_PARTS = new Set(["hand", "arm", "leg", "foot", "other"]);
const UPPER = new Set([
  "no-repetitive-gripping",
  "no-vibratory",
  "no-lift-above-shoulder",
  "no-lift-floor-shoulder",
  "no-lift-floor-waist",
  "limit-push-pull",
  "no-use-affected-arm-hand",
]);
const LOWER = new Set([
  "no-squatting-kneeling",
  "no-stairs",
  "no-ladders",
  "no-foot-pedal",
  "no-stooping-bending",
]);
const TRANSITIONAL_HOURS = new Set(["2", "4", "6", "8"]);

export type WorkersCompAccommodationsPayload = {
  standWalk: string;
  sit: string;
  liftingLevel: string;
  injurySides: string[];
  injuryParts: string[];
  injuryOther: string;
  upperExtremities: string[];
  pushPullLimitLbs: string;
  lowerExtremities: string[];
  transitionalNotApplicable: boolean;
  transitionalHours: string;
  transitionalWeeks: string;
  transitionalAbleRemaining: string;
  transitionalEffectiveDate: string;
  notes: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickIds(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = asText(entry);
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function emptyWorkersCompAccommodations(): WorkersCompAccommodationsPayload {
  return {
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
}

export function parseWorkersCompAccommodationsPayload(
  raw: unknown,
): WorkersCompAccommodationsPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyWorkersCompAccommodations();
  }
  const row = raw as Record<string, unknown>;
  const standWalk = asText(row.standWalk);
  const sit = asText(row.sit);
  const liftingLevel = asText(row.liftingLevel);
  const transitionalHours = asText(row.transitionalHours);
  const able = asText(row.transitionalAbleRemaining).toLowerCase();
  return {
    standWalk: STAND_WALK.has(standWalk) ? standWalk : "",
    sit: SIT.has(sit) ? sit : "",
    liftingLevel: LIFTING.has(liftingLevel) ? liftingLevel : "",
    injurySides: pickIds(row.injurySides, INJURY_SIDES),
    injuryParts: pickIds(row.injuryParts, INJURY_PARTS),
    injuryOther: asText(row.injuryOther),
    upperExtremities: pickIds(row.upperExtremities, UPPER),
    pushPullLimitLbs: asText(row.pushPullLimitLbs),
    lowerExtremities: pickIds(row.lowerExtremities, LOWER),
    transitionalNotApplicable:
      row.transitionalNotApplicable === true ||
      String(row.transitionalNotApplicable ?? "").toLowerCase() === "true",
    transitionalHours: TRANSITIONAL_HOURS.has(transitionalHours) ? transitionalHours : "",
    transitionalWeeks: asText(row.transitionalWeeks),
    transitionalAbleRemaining: able === "yes" || able === "no" ? able : "",
    transitionalEffectiveDate: asText(row.transitionalEffectiveDate).slice(0, 10),
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function accommodationsPayloadHasContent(
  value: WorkersCompAccommodationsPayload,
): boolean {
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

export function summarizeWorkersCompAccommodationsPayload(
  value: WorkersCompAccommodationsPayload,
): string {
  const parts: string[] = [];
  if (value.standWalk) parts.push(`Stand/Walk: ${value.standWalk}`);
  if (value.sit) parts.push(`Sit: ${value.sit}`);
  if (value.liftingLevel) parts.push(`Lifting: ${value.liftingLevel}`);
  if (value.injurySides.length || value.injuryParts.length || value.injuryOther) {
    parts.push(
      `Injury: ${[...value.injurySides, ...value.injuryParts, value.injuryOther]
        .filter(Boolean)
        .join(", ")}`,
    );
  }
  if (value.upperExtremities.length) {
    parts.push(`Upper: ${value.upperExtremities.length} limit(s)`);
  }
  if (value.lowerExtremities.length) {
    parts.push(`Lower: ${value.lowerExtremities.length} limit(s)`);
  }
  if (value.transitionalNotApplicable) parts.push("Transitional: N/A");
  else if (value.transitionalHours) {
    parts.push(`Transitional: ${value.transitionalHours}h unrestricted`);
  }
  if (value.notes.trim()) parts.push("Notes recorded");
  return parts.join(" · ") || "Work accommodations";
}

export function readAccommodationsFromSourcePayload(
  sourcePayload: unknown,
): WorkersCompAccommodationsPayload {
  if (!sourcePayload || typeof sourcePayload !== "object" || Array.isArray(sourcePayload)) {
    return emptyWorkersCompAccommodations();
  }
  const root = sourcePayload as Record<string, unknown>;
  if (root.accommodations != null) {
    return parseWorkersCompAccommodationsPayload(root.accommodations);
  }
  // Legacy create stored the whole body; recover if fields are at the root.
  if (
    root.standWalk != null ||
    root.sit != null ||
    root.liftingLevel != null ||
    root.upperExtremities != null
  ) {
    return parseWorkersCompAccommodationsPayload(root);
  }
  return emptyWorkersCompAccommodations();
}
