import type { DuplicateAction } from "../types.js";

export const MATCH_ALGORITHMS = ["exact", "weighted", "fuzzy", "composite"] as const;
export type MatchAlgorithm = (typeof MATCH_ALGORITHMS)[number];

export const CONFIDENCE_BANDS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export const DUPLICATE_REVIEW_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"] as const;
export type DuplicateReviewStatus = (typeof DUPLICATE_REVIEW_STATUSES)[number];

export type DuplicateFieldRule = {
  field: string;
  weight: number;
  strategy: MatchAlgorithm;
  /** Required for composite; ignored for others */
  required?: boolean;
};

export type DuplicateRulesConfig = {
  algorithms: MatchAlgorithm[];
  fields: DuplicateFieldRule[];
  thresholds: {
    high: number;
    medium: number;
  };
  fuzzyMaxDistance?: number;
  recommend: {
    highAction: DuplicateAction;
    mediumAction: DuplicateAction;
    lowAction: DuplicateAction;
  };
};

export const DEFAULT_DUPLICATE_RULES: DuplicateRulesConfig = {
  algorithms: ["exact", "weighted", "fuzzy", "composite"],
  fields: [
    { field: "externalId", weight: 1, strategy: "exact", required: true },
    { field: "email", weight: 0.45, strategy: "exact" },
    { field: "name", weight: 0.35, strategy: "fuzzy" },
    { field: "phone", weight: 0.2, strategy: "exact" },
  ],
  thresholds: { high: 0.9, medium: 0.65 },
  fuzzyMaxDistance: 2,
  recommend: {
    highAction: "UPDATE",
    mediumAction: "MERGE_REVIEW",
    lowAction: "CREATE",
  },
};

export type ExistingRecord = {
  entityId: string;
  entityType?: string;
  fields: Record<string, unknown>;
};

export type IncomingRecord = {
  sourceRowKey: string;
  fields: Record<string, unknown>;
};

export type MatchReason = {
  field: string;
  algorithm: MatchAlgorithm;
  score: number;
  detail: string;
};

export type FieldConflict = {
  field: string;
  incoming: unknown;
  existing: unknown;
  conflict: boolean;
};

export type MergeCandidate = {
  existingEntityId: string;
  existingEntityType?: string;
  incomingSourceRowKey: string;
  confidence: number;
  confidenceBand: ConfidenceBand;
  matchAlgorithm: MatchAlgorithm;
  matchReasons: MatchReason[];
  fieldComparisons: FieldConflict[];
  conflictFields: string[];
  explanation: string;
  recommendedAction: DuplicateAction;
};

export type ScoredDuplicate = MergeCandidate & {
  matchFields: Record<string, unknown>;
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

/** Deterministic Levenshtein distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

export function bandForConfidence(
  confidence: number,
  thresholds: DuplicateRulesConfig["thresholds"],
): ConfidenceBand {
  if (confidence >= thresholds.high) return "HIGH";
  if (confidence >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

export function actionForBand(
  band: ConfidenceBand,
  recommend: DuplicateRulesConfig["recommend"],
): DuplicateAction {
  if (band === "HIGH") return recommend.highAction;
  if (band === "MEDIUM") return recommend.mediumAction;
  return recommend.lowAction;
}

function exactScore(a: unknown, b: unknown): number {
  const left = normalizeValue(a);
  const right = normalizeValue(b);
  if (!left || !right) return 0;
  return left === right ? 1 : 0;
}

function fuzzyScore(a: unknown, b: unknown, maxDistance: number): number {
  const left = normalizeValue(a);
  const right = normalizeValue(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  if (distance > maxDistance) return 0;
  return Math.max(0, 1 - distance / (maxDistance + 1));
}

function scoreField(
  rule: DuplicateFieldRule,
  incoming: unknown,
  existing: unknown,
  maxDistance: number,
): { score: number; algorithm: MatchAlgorithm; detail: string } {
  switch (rule.strategy) {
    case "exact": {
      const score = exactScore(incoming, existing);
      return {
        score,
        algorithm: "exact",
        detail: score === 1 ? "exact equality" : "no exact match",
      };
    }
    case "fuzzy": {
      const score = fuzzyScore(incoming, existing, maxDistance);
      return {
        score,
        algorithm: "fuzzy",
        detail: `fuzzy score=${score.toFixed(4)}`,
      };
    }
    case "weighted": {
      const score = exactScore(incoming, existing);
      return {
        score,
        algorithm: "weighted",
        detail: score === 1 ? "weighted exact hit" : "weighted miss",
      };
    }
    case "composite": {
      const score = exactScore(incoming, existing);
      return {
        score,
        algorithm: "composite",
        detail: score === 1 ? "composite key part matched" : "composite key part missed",
      };
    }
    default:
      return { score: 0, algorithm: "exact", detail: "unknown strategy" };
  }
}

function pickPrimaryAlgorithm(reasons: MatchReason[]): MatchAlgorithm {
  if (reasons.some((r) => r.algorithm === "composite" && r.score === 1)) return "composite";
  if (reasons.some((r) => r.algorithm === "exact" && r.score === 1)) return "exact";
  if (reasons.some((r) => r.algorithm === "weighted" && r.score > 0)) return "weighted";
  return "fuzzy";
}

/**
 * Pure, deterministic duplicate detection engine.
 * Adapters supply existing records; this package never commits entities.
 */
export function detectDuplicates(input: {
  incoming: IncomingRecord[];
  existing: ExistingRecord[];
  rules?: Partial<DuplicateRulesConfig>;
}): ScoredDuplicate[] {
  const rules: DuplicateRulesConfig = {
    ...DEFAULT_DUPLICATE_RULES,
    ...input.rules,
    fields: input.rules?.fields ?? DEFAULT_DUPLICATE_RULES.fields,
    thresholds: {
      ...DEFAULT_DUPLICATE_RULES.thresholds,
      ...(input.rules?.thresholds ?? {}),
    },
    recommend: {
      ...DEFAULT_DUPLICATE_RULES.recommend,
      ...(input.rules?.recommend ?? {}),
    },
  };
  const maxDistance = rules.fuzzyMaxDistance ?? 2;
  const results: ScoredDuplicate[] = [];

  for (const row of input.incoming) {
    let best: ScoredDuplicate | null = null;

    for (const entity of input.existing) {
      const reasons: MatchReason[] = [];
      let weightedSum = 0;
      let weightTotal = 0;
      let compositeOk = true;
      let hasComposite = false;

      for (const rule of rules.fields) {
        if (!rules.algorithms.includes(rule.strategy) && rule.strategy !== "composite") {
          continue;
        }
        const incomingVal = row.fields[rule.field];
        const existingVal = entity.fields[rule.field];
        const scored = scoreField(rule, incomingVal, existingVal, maxDistance);
        reasons.push({
          field: rule.field,
          algorithm: scored.algorithm,
          score: scored.score,
          detail: scored.detail,
        });
        if (rule.strategy === "composite" || rule.required) {
          hasComposite = true;
          if (scored.score < 1) compositeOk = false;
        }
        const weight = Math.max(0, rule.weight);
        weightedSum += scored.score * weight;
        weightTotal += weight;
      }

      let confidence = weightTotal > 0 ? weightedSum / weightTotal : 0;
      if (hasComposite && compositeOk) {
        confidence = Math.max(confidence, 1);
      } else if (hasComposite && !compositeOk && rules.fields.some((f) => f.required)) {
        // Required composite miss caps confidence unless other strong exact hits exist.
        const exactHits = reasons.filter((r) => r.algorithm === "exact" && r.score === 1);
        if (exactHits.length === 0) confidence = Math.min(confidence, 0.49);
      }

      confidence = Math.round(confidence * 10000) / 10000;
      if (confidence <= 0) continue;

      const band = bandForConfidence(confidence, rules.thresholds);
      const algorithm = pickPrimaryAlgorithm(reasons);
      const fieldComparisons: FieldConflict[] = Object.keys({
        ...row.fields,
        ...entity.fields,
      }).map((field) => {
        const incoming = row.fields[field];
        const existing = entity.fields[field];
        const conflict =
          normalizeValue(incoming) !== "" &&
          normalizeValue(existing) !== "" &&
          normalizeValue(incoming) !== normalizeValue(existing);
        return { field, incoming, existing, conflict };
      });
      const conflictFields = fieldComparisons.filter((c) => c.conflict).map((c) => c.field);
      const candidate: ScoredDuplicate = {
        existingEntityId: entity.entityId,
        ...(entity.entityType ? { existingEntityType: entity.entityType } : {}),
        incomingSourceRowKey: row.sourceRowKey,
        confidence,
        confidenceBand: band,
        matchAlgorithm: algorithm,
        matchReasons: reasons,
        fieldComparisons,
        conflictFields,
        explanation: `Matched via ${algorithm} with confidence ${confidence} (${band})`,
        recommendedAction: actionForBand(band, rules.recommend),
        matchFields: Object.fromEntries(
          reasons.filter((r) => r.score > 0).map((r) => [r.field, row.fields[r.field]]),
        ),
      };

      if (!best || candidate.confidence > best.confidence) {
        best = candidate;
      }
    }

    if (best && best.confidence > 0) {
      results.push(best);
    }
  }

  return results.sort(
    (a, b) =>
      b.confidence - a.confidence || a.incomingSourceRowKey.localeCompare(b.incomingSourceRowKey),
  );
}

export function buildMergeCandidate(score: ScoredDuplicate): MergeCandidate {
  const { matchFields: _omit, ...rest } = score;
  return rest;
}
