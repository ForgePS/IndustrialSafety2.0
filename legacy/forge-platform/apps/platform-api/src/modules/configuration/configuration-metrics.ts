/**
 * Embedded Metric Format (EMF) emitters for Configuration Platform ops signals.
 * Safe fields only — no payloads, secrets, or PII.
 */

export const CONFIG_METRIC_NAMESPACE = "Forge/Configuration";

export const CONFIG_METRICS = {
  RlsDenials: "ConfigRlsDenials",
  AuthorizationDenials: "ConfigAuthorizationDenials",
  PublishFailures: "ConfigPublishFailures",
  RollbackFailures: "ConfigRollbackFailures",
  ValidationFailures: "ConfigValidationFailures",
} as const;

export type ConfigMetricName = (typeof CONFIG_METRICS)[keyof typeof CONFIG_METRICS];

export function emitConfigMetric(
  metric: ConfigMetricName,
  value = 1,
  dimensions: { environment?: string; outcome?: string } = {},
): void {
  const environment = dimensions.environment ?? process.env.APP_ENV ?? "development";
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: CONFIG_METRIC_NAMESPACE,
          Dimensions: [["Environment", "Service"]],
          Metrics: [{ Name: metric, Unit: "Count" }],
        },
      ],
    },
    Environment: environment,
    Service: "platform-api",
    [metric]: value,
    ...(dimensions.outcome ? { outcome: dimensions.outcome } : {}),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function isRlsDenialError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes("row-level security") ||
    lower.includes("row level security") ||
    lower.includes("violates row-level security policy") ||
    lower.includes("new row violates row-level security")
  );
}
