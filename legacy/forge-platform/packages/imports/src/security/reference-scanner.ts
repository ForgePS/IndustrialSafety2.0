import { createHash, randomUUID } from "node:crypto";
import {
  EICAR_SHA256,
  type ImportMalwareScanner,
  type MalwareScanSubmission,
  type MalwareScanSubmissionResult,
  type MalwareScanVerdictResult,
  type MalwareVerdict,
} from "./malware.js";

type StoredScan = {
  input: MalwareScanSubmission;
  verdict: MalwareVerdict;
  malwareFamily?: string;
};

/**
 * Development/reference scanner. Marks CLEAN unless content matches EICAR test hash
 * or object key / file id signals `eicar` / `__infected`.
 * No real malware is introduced into storage.
 */
export class ReferenceMalwareScanner implements ImportMalwareScanner {
  readonly providerKey = "reference-malware";
  readonly providerVersion = "1";
  private readonly scans = new Map<string, StoredScan>();

  async submitScan(input: MalwareScanSubmission): Promise<MalwareScanSubmissionResult> {
    const scanReference = `ref-scan:${randomUUID()}`;
    let verdict: MalwareVerdict = "CLEAN";
    let malwareFamily: string | undefined;
    const keyLower = input.s3Key.toLowerCase();
    if (
      input.sha256.toLowerCase() === EICAR_SHA256 ||
      keyLower.includes("eicar") ||
      keyLower.includes("__infected") ||
      input.fileId.toLowerCase().includes("eicar")
    ) {
      verdict = "INFECTED";
      malwareFamily = "EICAR-Test-File";
    } else if (keyLower.includes("__suspicious")) {
      verdict = "SUSPICIOUS";
      malwareFamily = "Heuristic.Suspicious";
    } else if (keyLower.includes("__scan_timeout")) {
      verdict = "SCAN_TIMEOUT";
    } else if (keyLower.includes("__scan_fail")) {
      verdict = "SCAN_FAILED";
    }
    this.scans.set(scanReference, {
      input,
      verdict,
      ...(malwareFamily ? { malwareFamily } : {}),
    });
    return {
      scanReference,
      providerKey: this.providerKey,
      providerVersion: this.providerVersion,
      accepted: true,
    };
  }

  async getVerdict(scanReference: string): Promise<MalwareScanVerdictResult> {
    const stored = this.scans.get(scanReference);
    if (!stored) {
      return {
        scanReference,
        verdict: "UNSUPPORTED",
        failureCode: "SCAN_REFERENCE_UNKNOWN",
        failureMessageSanitized: "Unknown scan reference",
        completedAt: new Date().toISOString(),
        providerKey: this.providerKey,
        providerVersion: this.providerVersion,
      };
    }
    return {
      scanReference,
      verdict: stored.verdict,
      malwareFamily: stored.malwareFamily ?? null,
      failureCode:
        stored.verdict === "SCAN_FAILED" || stored.verdict === "SCAN_TIMEOUT"
          ? stored.verdict
          : null,
      failureMessageSanitized:
        stored.verdict === "SCAN_FAILED"
          ? "Reference scanner simulated failure"
          : stored.verdict === "SCAN_TIMEOUT"
            ? "Reference scanner simulated timeout"
            : null,
      completedAt: new Date().toISOString(),
      providerKey: this.providerKey,
      providerVersion: this.providerVersion,
    };
  }
}

export function contentSha256(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
