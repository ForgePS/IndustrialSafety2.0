export interface EmfMetricInput {
  namespace?: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
  units?: Record<string, string>;
}

export function emitEmfMetric(input: EmfMetricInput): void {
  const namespace = input.namespace ?? "ForgePlatform/Worker";
  const dimensionKeys = Object.keys(input.dimensions);
  const metricEntries = Object.entries(input.metrics).map(([name]) => ({
    Name: name,
    Unit: input.units?.[name] ?? "Count",
  }));

  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimensionKeys],
          Metrics: metricEntries,
        },
      ],
    },
    ...input.dimensions,
    ...input.metrics,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
