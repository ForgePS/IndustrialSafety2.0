import { describe, expect, it } from "vitest";
import {
  computeNextCronRun,
  computeNextCronRunAfter,
  isValidCronExpression,
} from "./reporting-cron.js";

describe("reporting-cron", () => {
  it("validates 5-field expressions", () => {
    expect(isValidCronExpression("0 8 * * 1")).toBe(true);
    expect(isValidCronExpression("0 8 * *")).toBe(false);
  });

  it("finds next Monday 08:00 UTC", () => {
    // Friday 2026-09-04 13:00 UTC → next Monday 08:00
    const from = new Date("2026-09-04T13:00:00.000Z");
    const next = computeNextCronRun("0 8 * * 1", from);
    expect(next?.toISOString()).toBe("2026-09-07T08:00:00.000Z");
  });

  it("skips the current minute when using After", () => {
    const from = new Date("2026-09-07T08:00:00.000Z");
    const next = computeNextCronRunAfter("0 8 * * 1", from);
    expect(next?.toISOString()).toBe("2026-09-14T08:00:00.000Z");
  });
});
