import { describe, expect, it } from "vitest";
import {
  assertMalwareGate,
  classifyFieldName,
  createImportMalwareScanMessage,
  isAcceptableMalwareVerdict,
  isRetentionEligible,
  maskValue,
  nextStatusForS6MalwareAction,
  ReferenceMalwareScanner,
  sanitizeObject,
  validateImportMalwareScanMessage,
} from "./index.js";

describe("S6 malware verdicts and gate", () => {
  it("transitions malware lifecycle", () => {
    expect(nextStatusForS6MalwareAction("malware_start", "UPLOADED")).toBe("SCANNING");
    expect(nextStatusForS6MalwareAction("malware_clean", "SCANNING")).toBe("SCANNING");
    expect(nextStatusForS6MalwareAction("malware_quarantine", "SCANNING")).toBe("QUARANTINED");
    expect(nextStatusForS6MalwareAction("malware_fail", "SCANNING")).toBe("SCAN_FAILED");
  });

  it("fails closed without acceptable verdict", () => {
    expect(assertMalwareGate({ verdict: null }).ok).toBe(false);
    expect(assertMalwareGate({ verdict: "SCANNING" }).ok).toBe(false);
    expect(assertMalwareGate({ verdict: "INFECTED" }).code).toBe("IMPORT_SCAN_INFECTED");
    expect(assertMalwareGate({ verdict: "CLEAN", contentHash: "a", verdictHash: "b" }).code).toBe(
      "IMPORT_SCAN_HASH_MISMATCH",
    );
    expect(assertMalwareGate({ verdict: "CLEAN", contentHash: "a", verdictHash: "a" }).ok).toBe(
      true,
    );
    expect(isAcceptableMalwareVerdict("OVERRIDE_APPROVED")).toBe(true);
  });

  it("reference scanner marks EICAR path infected", async () => {
    const scanner = new ReferenceMalwareScanner();
    const submitted = await scanner.submitScan({
      tenantId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
      fileId: "33333333-3333-4333-8333-333333333333",
      s3Bucket: "b",
      s3Key: "tenants/t/imports/j/eicar.com",
      sha256: "abc",
      byteSize: 68,
      correlationId: "c",
    });
    const verdict = await scanner.getVerdict(submitted.scanReference);
    expect(verdict.verdict).toBe("INFECTED");
  });

  it("validates malware scan messages", () => {
    const msg = createImportMalwareScanMessage({
      jobId: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      fileId: "33333333-3333-4333-8333-333333333333",
      correlationId: "corr",
      requestedBy: null,
    });
    expect(validateImportMalwareScanMessage(msg).ok).toBe(true);
    expect(validateImportMalwareScanMessage({}).ok).toBe(false);
  });
});

describe("S6 masking and retention", () => {
  it("masks government identifiers and credentials", () => {
    expect(classifyFieldName("ssn")).toBe("GOVERNMENT_IDENTIFIER");
    expect(maskValue("123-45-6789", "GOVERNMENT_IDENTIFIER", { allowUnmask: false })).toBe(
      "***-**-6789",
    );
    expect(maskValue("super-secret", "CREDENTIAL", { allowUnmask: true })).toBe("********");
    const sanitized = sanitizeObject(
      { name: "Ada", ssn: "123-45-6789", nested: { password: "x" } },
      { policy: { allowUnmask: false } },
    ) as Record<string, unknown>;
    expect(sanitized.name).toBe("Ada");
    expect(sanitized.ssn).toBe("***-**-6789");
  });

  it("blocks retention under security hold", () => {
    expect(
      isRetentionEligible({
        kind: "quarantine",
        securityHold: true,
        jobActive: false,
        retentionDeleteAt: new Date(0),
      }),
    ).toBe(false);
    expect(
      isRetentionEligible({
        kind: "source",
        securityHold: false,
        jobActive: false,
        retentionDeleteAt: new Date(0),
      }),
    ).toBe(true);
  });
});
