import { describe, expect, it } from "vitest";
import { emitEmfMetric } from "./metrics.js";

describe("emitEmfMetric", () => {
  it("writes CloudWatch EMF JSON to stdout", () => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      emitEmfMetric({
        dimensions: {
          Service: "worker-service",
          Environment: "development",
          EventType: "platform.tenant.created.v1",
        },
        metrics: {
          EventProcessingSuccess: 1,
          EventProcessingDurationMs: 12,
        },
        units: { EventProcessingDurationMs: "Milliseconds" },
      });
    } finally {
      process.stdout.write = original;
    }

    const payload = JSON.parse(chunks.join("").trim());
    expect(payload._aws.CloudWatchMetrics[0].Namespace).toBe("ForgePlatform/Worker");
    expect(payload.EventProcessingSuccess).toBe(1);
    expect(payload.EventProcessingDurationMs).toBe(12);
  });
});
