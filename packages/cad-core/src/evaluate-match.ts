import type { CadNormalizedEvent } from "@forge/cad-contracts";
import {
  decideMatchOutcome,
  DEFAULT_CAD_MATCH_SIGNAL_SCORES,
  DEFAULT_CAD_MATCH_THRESHOLDS,
  type CadMatchDecision,
  type CadMatchSignalScores,
  type CadMatchThresholds,
} from "./matching.js";

export type CadMatchCandidate = {
  incidentId: string;
  incidentNumber?: string | null;
  incidentDate?: string | null;
  status?: string | null;
  primaryIncidentTypeCode?: string | null;
  dispatchDescription?: string | null;
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  alarmAt?: string | null;
  existingSourceIncidentId?: string | null;
  existingLinkConnectionId?: string | null;
  unitSourceIds?: string[];
};

export type CadMatchEvaluationInput = {
  event: CadNormalizedEvent;
  connectionId: string;
  candidates: CadMatchCandidate[];
  thresholds?: CadMatchThresholds;
  scores?: CadMatchSignalScores;
  /** When true (HYBRID), prefer LINK_TO_MANUAL over UPDATE for manual-only shells. */
  hybridMode?: boolean;
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeAddress(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withinMinutes(a?: string | null, b?: string | null, windowMinutes?: number): boolean {
  if (!a || !b || windowMinutes == null) return false;
  const am = Date.parse(a);
  const bm = Date.parse(b);
  if (Number.isNaN(am) || Number.isNaN(bm)) return false;
  return Math.abs(am - bm) <= windowMinutes * 60_000;
}

/**
 * Score candidates against a normalized CAD event using deterministic signals.
 * Does not perform fuzzy-only matching; address compare is normalized exact/contains.
 */
export function evaluateCadMatch(input: CadMatchEvaluationInput): CadMatchDecision & {
  perCandidate: Array<{ incidentId: string; score: number; signals: string[] }>;
} {
  const thresholds = input.thresholds ?? DEFAULT_CAD_MATCH_THRESHOLDS;
  const scores = input.scores ?? DEFAULT_CAD_MATCH_SIGNAL_SCORES;
  const sourceIncidentId = input.event.source.incidentId;
  const sourceIncidentNumber = input.event.source.incidentNumber;
  const eventTs = input.event.source.timestamp;
  const eventAddress = normalizeAddress(input.event.location?.fullAddress);
  const eventLat = input.event.location?.latitude;
  const eventLon = input.event.location?.longitude;
  const eventCallType = input.event.incident.callType?.toLowerCase();
  const eventUnits = new Set((input.event.units ?? []).map((u) => u.sourceUnitId));

  const perCandidate = input.candidates.map((candidate) => {
    let score = 0;
    const signals: string[] = [];

    if (
      sourceIncidentId &&
      candidate.existingSourceIncidentId === sourceIncidentId &&
      candidate.existingLinkConnectionId === input.connectionId
    ) {
      score = Math.max(score, scores.exactExistingSourceIncidentLink);
      signals.push("exact_existing_link");
    }

    if (sourceIncidentId && candidate.existingSourceIncidentId === sourceIncidentId) {
      score = Math.max(score, scores.exactSourceIncidentId);
      signals.push("exact_source_incident_id");
    }

    if (
      sourceIncidentNumber &&
      candidate.incidentNumber &&
      sourceIncidentNumber === candidate.incidentNumber &&
      candidate.incidentDate &&
      eventTs &&
      candidate.incidentDate === eventTs.slice(0, 10)
    ) {
      score = Math.max(score, scores.exactSourceIncidentNumberAndDate);
      signals.push("exact_number_and_date");
    }

    const candidateAddress = normalizeAddress(candidate.fullAddress);
    const addressMatch =
      eventAddress.length > 0 &&
      candidateAddress.length > 0 &&
      (eventAddress === candidateAddress ||
        eventAddress.includes(candidateAddress) ||
        candidateAddress.includes(eventAddress));

    if (
      addressMatch &&
      withinMinutes(eventTs, candidate.alarmAt ?? null, thresholds.timeWindowMinutes)
    ) {
      score = Math.max(score, scores.matchingLocationAndDispatchWindow);
      signals.push("location_and_dispatch_window");
    }

    if (
      eventLat != null &&
      eventLon != null &&
      candidate.latitude != null &&
      candidate.longitude != null
    ) {
      const meters = haversineMeters(eventLat, eventLon, candidate.latitude, candidate.longitude);
      const unitOverlap = (candidate.unitSourceIds ?? []).some((id) => eventUnits.has(id));
      if (meters <= thresholds.coordinateRadiusMeters && unitOverlap) {
        score = Math.max(score, scores.matchingCoordinatesAndUnits);
        signals.push("coordinates_and_units");
      }
    }

    if (
      addressMatch &&
      eventCallType &&
      candidate.primaryIncidentTypeCode?.toLowerCase() === eventCallType
    ) {
      score = Math.max(score, scores.matchingAddressAndCallType);
      signals.push("address_and_call_type");
    }

    if (
      addressMatch &&
      withinMinutes(eventTs, candidate.alarmAt ?? null, thresholds.timeWindowMinutes * 2)
    ) {
      score = Math.max(score, scores.partialAddressTimeMatch);
      signals.push("partial_address_time");
    }

    return { incidentId: candidate.incidentId, score, signals };
  });

  const ranked = [...perCandidate].sort((a, b) => b.score - a.score);
  const bestScore = ranked[0]?.score ?? 0;
  const top = ranked.filter((c) => c.score === bestScore && bestScore > 0);
  const candidateIncidentIds = top.map((c) => c.incidentId);

  let conflictingSourceIds = false;
  if (sourceIncidentId) {
    const linkedElsewhere = input.candidates.filter(
      (c) =>
        c.existingSourceIncidentId === sourceIncidentId &&
        c.existingLinkConnectionId === input.connectionId &&
        !candidateIncidentIds.includes(c.incidentId),
    );
    if (linkedElsewhere.length > 0 && candidateIncidentIds.length > 0) {
      conflictingSourceIds = true;
    }
  }

  const hasExactLink = perCandidate.some((c) => c.signals.includes("exact_existing_link"));
  const decision = decideMatchOutcome({
    score: bestScore,
    candidateIncidentIds,
    conflictingSourceIds,
    thresholds,
    hasExactLink,
  });

  if (
    input.hybridMode &&
    decision.outcome === "UPDATE_EXISTING" &&
    candidateIncidentIds.length === 1 &&
    !hasExactLink
  ) {
    return {
      ...decision,
      outcome: "LINK_TO_MANUAL",
      reason: "HYBRID mode links CAD event to existing manual incident",
      perCandidate,
    };
  }

  return { ...decision, perCandidate };
}
