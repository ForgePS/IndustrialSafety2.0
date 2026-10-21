import { describe, expect, it } from "vitest";
import {
  defaultProjectedRuntimeMs,
  formatWalkthroughClock,
  projectedRuntimeWarning,
  sanitizeExportFilename,
  walkthroughContentFingerprint,
} from "./utils";

describe("executive walkthrough utils", () => {
  it("formats clock", () => {
    expect(formatWalkthroughClock(0)).toBe("0:00");
    expect(formatWalkthroughClock(65_000)).toBe("1:05");
  });

  it("estimates under ten minutes", () => {
    expect(defaultProjectedRuntimeMs()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("warns when over 9:30", () => {
    expect(projectedRuntimeWarning(9 * 60 * 1000)).toBeNull();
    expect(projectedRuntimeWarning(10 * 60 * 1000)).toMatch(/exceeds 9:30/);
  });

  it("sanitizes filenames", () => {
    expect(sanitizeExportFilename("Forge Industrial Safety!.mp4")).toBe(
      "Forge_Industrial_Safety_.mp4",
    );
  });

  it("fingerprints content stably", () => {
    const a = walkthroughContentFingerprint({ voiceId: "Joanna", narrationSpeed: 100 });
    const b = walkthroughContentFingerprint({ voiceId: "Joanna", narrationSpeed: 100 });
    expect(a).toBe(b);
  });
});
