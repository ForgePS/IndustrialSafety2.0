import { describe, expect, it } from "vitest";
import { PrintSupplyAlertLevel } from "@forge/contracts";
import {
  averageMs,
  computePrintFailureRate,
  computePrintRetryRate,
  dayBucketUtc,
  monthBucketUtc,
  parseAnalyticsRange,
} from "./industrial-print-analytics.js";
import {
  applyEstimatedSupplyConsumption,
  computeSupplyAlertLevel,
  supplyAlertLevelWorsened,
  supplyPercentRemaining,
} from "./industrial-print-supplies.js";

describe("print supply estimates", () => {
  it("computes NONE / LOW / CRITICAL / EMPTY from thresholds", () => {
    expect(
      computeSupplyAlertLevel({
        estimatedRemaining: 200,
        warningThreshold: 50,
        criticalThreshold: 15,
      }),
    ).toBe(PrintSupplyAlertLevel.NONE);
    expect(
      computeSupplyAlertLevel({
        estimatedRemaining: 40,
        warningThreshold: 50,
        criticalThreshold: 15,
      }),
    ).toBe(PrintSupplyAlertLevel.LOW);
    expect(
      computeSupplyAlertLevel({
        estimatedRemaining: 10,
        warningThreshold: 50,
        criticalThreshold: 15,
      }),
    ).toBe(PrintSupplyAlertLevel.CRITICAL);
    expect(
      computeSupplyAlertLevel({
        estimatedRemaining: 0,
        warningThreshold: 50,
        criticalThreshold: 15,
      }),
    ).toBe(PrintSupplyAlertLevel.EMPTY);
  });

  it("decrements remaining and notifies only when alert worsens", () => {
    const first = applyEstimatedSupplyConsumption({
      estimatedRemaining: 20,
      unitsConsumed: 980,
      warningThreshold: 50,
      criticalThreshold: 15,
      lastAlertLevel: PrintSupplyAlertLevel.LOW,
      unitsUsed: 6,
    });
    expect(first.estimatedRemaining).toBe(14);
    expect(first.unitsConsumed).toBe(986);
    expect(first.alertLevel).toBe(PrintSupplyAlertLevel.CRITICAL);
    expect(first.shouldNotify).toBe(true);

    const same = applyEstimatedSupplyConsumption({
      estimatedRemaining: 14,
      unitsConsumed: 986,
      warningThreshold: 50,
      criticalThreshold: 15,
      lastAlertLevel: PrintSupplyAlertLevel.CRITICAL,
      unitsUsed: 1,
    });
    expect(same.alertLevel).toBe(PrintSupplyAlertLevel.CRITICAL);
    expect(same.shouldNotify).toBe(false);
  });

  it("ranks alert levels for worsening checks", () => {
    expect(supplyAlertLevelWorsened("NONE", "LOW")).toBe(true);
    expect(supplyAlertLevelWorsened("CRITICAL", "LOW")).toBe(false);
    expect(supplyAlertLevelWorsened("CRITICAL", "EMPTY")).toBe(true);
  });

  it("reports percent remaining as estimate of starting stock", () => {
    expect(supplyPercentRemaining(1000, 188)).toBe(19);
    expect(supplyPercentRemaining(0, 10)).toBeNull();
  });
});

describe("print analytics helpers", () => {
  it("computes failure and retry rates", () => {
    expect(computePrintFailureRate(0, 0)).toBe(0);
    expect(computePrintFailureRate(100, 7)).toBe(7);
    expect(computePrintRetryRate(50, 5)).toBe(10);
  });

  it("averages duration samples", () => {
    expect(averageMs([100, 200, 300])).toBe(200);
    expect(averageMs([null, undefined, -1])).toBeNull();
  });

  it("buckets dates and parses ranges", () => {
    const d = new Date("2026-09-13T15:00:00.000Z");
    expect(dayBucketUtc(d)).toBe("2026-09-13");
    expect(monthBucketUtc(d)).toBe("2026-09");
    const range = parseAnalyticsRange({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-13T00:00:00.000Z",
    });
    expect(range.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });
});
