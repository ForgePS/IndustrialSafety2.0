import { createLogger } from "@forge/observability";

/** CloudWatch / EMF metric names for AI Narrative (never log full narrative/source). */
export const AI_NARRATIVE_METRICS = {
  Requests: "AiNarrativeRequests",
  Success: "AiNarrativeSuccess",
  Failure: "AiNarrativeFailure",
  Latency: "AiNarrativeLatency",
  ProviderTimeout: "AiNarrativeProviderTimeout",
  RejectedOutput: "AiNarrativeRejectedOutput",
  QuotaExceeded: "AiNarrativeQuotaExceeded",
  SensitiveDataBlocked: "AiNarrativeSensitiveDataBlocked",
  Accepted: "AiNarrativeAccepted",
  Rejected: "AiNarrativeRejected",
  EstimatedCost: "AiNarrativeEstimatedCost",
} as const;

export function createAiNarrativeLogger(environment: string, correlationId?: string) {
  return createLogger({
    service: "ai-narrative-api",
    environment,
    ...(correlationId ? { correlationId } : {}),
  });
}

export type AiNarrativeMetricEvent = {
  metric: (typeof AI_NARRATIVE_METRICS)[keyof typeof AI_NARRATIVE_METRICS];
  value?: number;
  tenantId?: string;
  product?: string;
  outcome?: string;
};

/** Structured metric line — safe fields only (no narrative body, no source payload). */
export function emitAiNarrativeMetric(event: AiNarrativeMetricEvent): void {
  process.stdout.write(
    `${JSON.stringify({
      _aws: { Timestamp: Date.now(), CloudWatchMetrics: [] },
      service: "ai-narrative",
      metric: event.metric,
      value: event.value ?? 1,
      tenantId: event.tenantId,
      product: event.product,
      outcome: event.outcome,
    })}\n`,
  );
}
