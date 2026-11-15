import { describe, expect, it, vi } from "vitest";
import {
  CONFIG_METRICS,
  emitConfigMetric,
  isRlsDenialError,
} from "./modules/configuration/configuration-metrics.js";

describe("configuration metrics", () => {
  it("emits EMF-shaped stdout lines", () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    emitConfigMetric(CONFIG_METRICS.AuthorizationDenials, 1, { environment: "development" });
    spy.mockRestore();
    expect(chunks.length).toBe(1);
    const parsed = JSON.parse(chunks[0]!);
    expect(parsed._aws.CloudWatchMetrics[0].Namespace).toBe("Forge/Configuration");
    expect(parsed.ConfigAuthorizationDenials).toBe(1);
    expect(parsed.Environment).toBe("development");
  });

  it("detects RLS denial messages", () => {
    expect(isRlsDenialError(new Error("new row violates row-level security policy"))).toBe(true);
    expect(isRlsDenialError(new Error("other"))).toBe(false);
  });
});
