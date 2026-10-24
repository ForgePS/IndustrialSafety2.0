import type { CadMatchOutcome } from "@forge/cad-contracts";

export type CadMatchSignalScores = {
  exactExistingSourceIncidentLink: number;
  exactSourceIncidentId: number;
  exactSourceIncidentNumberAndDate: number;
  matchingLocationAndDispatchWindow: number;
  matchingCoordinatesAndUnits: number;
  matchingAddressAndCallType: number;
  partialAddressTimeMatch: number;
};

export const DEFAULT_CAD_MATCH_SIGNAL_SCORES: CadMatchSignalScores = {
  exactExistingSourceIncidentLink: 100,
  exactSourceIncidentId: 100,
  exactSourceIncidentNumberAndDate: 95,
  matchingLocationAndDispatchWindow: 80,
  matchingCoordinatesAndUnits: 75,
  matchingAddressAndCallType: 65,
  partialAddressTimeMatch: 45,
};

export type CadMatchThresholds = {
  automaticMatchThreshold: number;
  possibleDuplicateThreshold: number;
  timeWindowMinutes: number;
  coordinateRadiusMeters: number;
  normalizedAddressWeight: number;
  unitOverlapWeight: number;
  callTypeWeight: number;
};

export const DEFAULT_CAD_MATCH_THRESHOLDS: CadMatchThresholds = {
  automaticMatchThreshold: 90,
  possibleDuplicateThreshold: 70,
  timeWindowMinutes: 30,
  coordinateRadiusMeters: 150,
  normalizedAddressWeight: 1,
  unitOverlapWeight: 1,
  callTypeWeight: 1,
};

export type CadMatchDecision = {
  outcome: CadMatchOutcome;
  score: number;
  candidateIncidentIds: string[];
  signals: string[];
  conflictingSourceIds: boolean;
  reason: string;
};

/**
 * Deterministic score → outcome mapping. Ambiguous high scores with multiple
 * candidates force REQUIRES_REVIEW — never silent merge.
 */
export function decideMatchOutcome(input: {
  score: number;
  candidateIncidentIds: string[];
  conflictingSourceIds: boolean;
  thresholds: CadMatchThresholds;
  hasExactLink: boolean;
}): CadMatchDecision {
  const { score, candidateIncidentIds, conflictingSourceIds, thresholds, hasExactLink } = input;

  if (conflictingSourceIds) {
    return {
      outcome: "REQUIRES_REVIEW",
      score,
      candidateIncidentIds,
      signals: ["conflicting_source_ids"],
      conflictingSourceIds: true,
      reason: "Conflicting source incident identifiers require human review",
    };
  }

  if (hasExactLink && candidateIncidentIds.length === 1) {
    return {
      outcome: "UPDATE_EXISTING",
      score: Math.max(score, 100),
      candidateIncidentIds,
      signals: ["exact_existing_link"],
      conflictingSourceIds: false,
      reason: "Exact existing CAD incident link",
    };
  }

  if (candidateIncidentIds.length > 1 && score >= thresholds.possibleDuplicateThreshold) {
    return {
      outcome:
        score >= thresholds.automaticMatchThreshold ? "REQUIRES_REVIEW" : "POSSIBLE_DUPLICATE",
      score,
      candidateIncidentIds,
      signals: ["multiple_candidates"],
      conflictingSourceIds: false,
      reason: "Multiple candidate incidents — ambiguous match must not auto-merge",
    };
  }

  if (candidateIncidentIds.length === 1 && score >= thresholds.automaticMatchThreshold) {
    return {
      outcome: "UPDATE_EXISTING",
      score,
      candidateIncidentIds,
      signals: ["automatic_threshold"],
      conflictingSourceIds: false,
      reason: "Single candidate above automatic match threshold",
    };
  }

  if (candidateIncidentIds.length === 1 && score >= thresholds.possibleDuplicateThreshold) {
    return {
      outcome: "POSSIBLE_DUPLICATE",
      score,
      candidateIncidentIds,
      signals: ["possible_duplicate_threshold"],
      conflictingSourceIds: false,
      reason: "Single candidate in possible-duplicate band",
    };
  }

  if (candidateIncidentIds.length === 0) {
    return {
      outcome: "CREATE_NEW",
      score,
      candidateIncidentIds: [],
      signals: ["no_candidates"],
      conflictingSourceIds: false,
      reason: "No matching candidates — create new incident when intake mode allows",
    };
  }

  return {
    outcome: "REQUIRES_REVIEW",
    score,
    candidateIncidentIds,
    signals: ["below_threshold"],
    conflictingSourceIds: false,
    reason: "Match score below actionable thresholds",
  };
}

/**
 * Deterministic idempotency key from available source identifiers.
 * Prefer the most specific identifier available.
 */
export function buildCadIdempotencyKey(parts: {
  tenantId: string;
  connectionId: string;
  sourceMessageId?: string | null;
  sourceEventId?: string | null;
  sourceIncidentId?: string | null;
  sourceSequence?: number | null;
  payloadHash: string;
}): string {
  const segments = [
    parts.tenantId,
    parts.connectionId,
    parts.sourceMessageId?.trim() || "",
    parts.sourceEventId?.trim() || "",
    parts.sourceIncidentId?.trim() || "",
    parts.sourceSequence != null ? String(parts.sourceSequence) : "",
    parts.payloadHash,
  ];
  return segments.join("|");
}

export type CadOutOfOrderAction =
  "APPLY" | "APPLY_WITH_WARNING" | "PRESERVE_ONLY" | "REQUIRES_REVIEW" | "REJECT_STALE";

export function decideOutOfOrderAction(input: {
  incomingSequence?: number | null;
  lastAppliedSequence?: number | null;
  incomingTimestamp?: string | null;
  lastAppliedTimestamp?: string | null;
  containsNewInformation: boolean;
}): CadOutOfOrderAction {
  const {
    incomingSequence,
    lastAppliedSequence,
    incomingTimestamp,
    lastAppliedTimestamp,
    containsNewInformation,
  } = input;

  if (
    incomingSequence != null &&
    lastAppliedSequence != null &&
    incomingSequence < lastAppliedSequence
  ) {
    if (containsNewInformation) {
      return "REQUIRES_REVIEW";
    }
    return "REJECT_STALE";
  }

  if (incomingTimestamp && lastAppliedTimestamp) {
    const incomingMs = Date.parse(incomingTimestamp);
    const lastMs = Date.parse(lastAppliedTimestamp);
    if (!Number.isNaN(incomingMs) && !Number.isNaN(lastMs) && incomingMs < lastMs) {
      if (containsNewInformation) {
        return "APPLY_WITH_WARNING";
      }
      return "PRESERVE_ONLY";
    }
  }

  return "APPLY";
}

export type CadOwnershipDecision =
  "APPLY_CAD" | "KEEP_FORGE" | "CREATE_CONFLICT" | "APPEND" | "SKIP";

export function decideFieldOwnership(input: {
  ownershipPolicy: string;
  forgeHasManualOverride: boolean;
  forgeIsFinalized: boolean;
  cadValuePresent: boolean;
}): CadOwnershipDecision {
  if (!input.cadValuePresent) {
    return "SKIP";
  }
  if (input.forgeIsFinalized) {
    return "CREATE_CONFLICT";
  }

  switch (input.ownershipPolicy) {
    case "CAD_AUTHORITATIVE":
      return input.forgeHasManualOverride ? "CREATE_CONFLICT" : "APPLY_CAD";
    case "MANUAL_AUTHORITATIVE":
      return input.forgeHasManualOverride ? "KEEP_FORGE" : "APPLY_CAD";
    case "CAD_UNTIL_MANUAL_EDIT":
      return input.forgeHasManualOverride ? "KEEP_FORGE" : "APPLY_CAD";
    case "CAD_UNTIL_REVIEW":
      return "APPLY_CAD";
    case "LATEST_TIMESTAMP":
      return "APPLY_CAD";
    case "APPEND_ONLY":
      return "APPEND";
    case "REQUIRES_RECONCILIATION":
      return "CREATE_CONFLICT";
    case "NEVER_OVERWRITE":
      return input.forgeHasManualOverride ? "KEEP_FORGE" : "APPLY_CAD";
    default:
      return "CREATE_CONFLICT";
  }
}
