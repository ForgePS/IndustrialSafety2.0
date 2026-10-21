import { describe, expect, it } from "vitest";
import {
  assertScannerAllowedForEnvironment,
  isProductionLikeAppEnv,
  isStuckImportJob,
  S8_BATCH_RECOMMENDATION,
  STUCK_JOB_THRESHOLDS_MS,
} from "./index.js";

describe("S8 production scanner guards", () => {
  it("allows reference scanner in development and testing", () => {
    expect(
      assertScannerAllowedForEnvironment({
        appEnv: "development",
        providerKey: "reference-malware",
      }).ok,
    ).toBe(true);
    expect(
      assertScannerAllowedForEnvironment({
        appEnv: "testing",
        providerKey: "reference-malware",
      }).ok,
    ).toBe(true);
  });

  it("blocks reference scanner in production-like environments", () => {
    for (const appEnv of ["staging", "production", "govcloud-production"]) {
      const result = assertScannerAllowedForEnvironment({
        appEnv,
        providerKey: "reference-malware",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("IMPORT_SCANNER_PROVIDER_UNAVAILABLE");
      }
    }
    expect(isProductionLikeAppEnv("production")).toBe(true);
    expect(isProductionLikeAppEnv("development")).toBe(false);
  });

  it("allows non-reference providers in production", () => {
    expect(
      assertScannerAllowedForEnvironment({
        appEnv: "production",
        providerKey: "aws-guardduty-malware-protection",
      }).ok,
    ).toBe(true);
  });

  it("resolves empty provider key to reference", async () => {
    const { resolveImportMalwareProviderKey, AWS_GUARDDUTY_MALWARE_PROVIDER_KEY } =
      await import("./index.js");
    expect(resolveImportMalwareProviderKey(undefined)).toBe("reference-malware");
    expect(resolveImportMalwareProviderKey("  ")).toBe("reference-malware");
    expect(resolveImportMalwareProviderKey(AWS_GUARDDUTY_MALWARE_PROVIDER_KEY)).toBe(
      AWS_GUARDDUTY_MALWARE_PROVIDER_KEY,
    );
  });
});

describe("S8 stuck job detection", () => {
  it("flags SCANNING jobs older than threshold", () => {
    const now = new Date("2026-07-29T18:00:00.000Z");
    const updatedAt = new Date(
      now.getTime() - STUCK_JOB_THRESHOLDS_MS.SCANNING - 1_000,
    );
    expect(isStuckImportJob({ status: "SCANNING", updatedAt, now })).toBe(true);
    expect(
      isStuckImportJob({
        status: "SCANNING",
        updatedAt: now,
        now,
      }),
    ).toBe(false);
    expect(isStuckImportJob({ status: "COMPLETED", updatedAt, now })).toBe(false);
  });
});

describe("S8 batch recommendation", () => {
  it("documents evidence-based defaults", () => {
    expect(S8_BATCH_RECOMMENDATION.default).toBe(50);
    expect(S8_BATCH_RECOMMENDATION.maximum).toBe(500);
  });
});
