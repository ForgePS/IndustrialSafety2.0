import type { ImportJobStatus } from "../types.js";
import { isAcceptableMalwareVerdict, isQuarantineVerdict, type MalwareVerdict } from "./malware.js";

export const S6_MALWARE_TRANSITIONS: Record<string, ReadonlyArray<ImportJobStatus>> = {
  malware_start: ["UPLOADED"],
  malware_clean: ["SCANNING"],
  malware_quarantine: ["SCANNING"],
  malware_fail: ["SCANNING"],
  rescan_start: ["SCAN_FAILED", "QUARANTINED"],
  cancel_quarantine: ["QUARANTINED"],
};

export function assertS6MalwareTransition(
  action: keyof typeof S6_MALWARE_TRANSITIONS,
  current: ImportJobStatus,
): void {
  const allowed = S6_MALWARE_TRANSITIONS[action] ?? [];
  if (!allowed.includes(current)) {
    const error = new Error(`Import job status '${current}' does not allow action '${action}'`);
    (error as Error & { code: string }).code = "IMPORT_INVALID_STATE_TRANSITION";
    throw error;
  }
}

export function nextStatusForS6MalwareAction(
  action: keyof typeof S6_MALWARE_TRANSITIONS,
  current: ImportJobStatus,
): ImportJobStatus {
  assertS6MalwareTransition(action, current);
  switch (action) {
    case "malware_start":
    case "rescan_start":
      return "SCANNING";
    case "malware_clean":
      // Remain SCANNING so format detection can run next; READY_FOR_MAPPING is detection_pass.
      return "SCANNING";
    case "malware_quarantine":
      return "QUARANTINED";
    case "malware_fail":
      return "SCAN_FAILED";
    case "cancel_quarantine":
      return "CANCELLED";
    default:
      return current;
  }
}

export function jobStatusForVerdict(verdict: MalwareVerdict): ImportJobStatus {
  if (isAcceptableMalwareVerdict(verdict)) return "SCANNING";
  if (isQuarantineVerdict(verdict)) return "QUARANTINED";
  return "SCAN_FAILED";
}

export type MalwareGateResult =
  { ok: true; verdict: string } | { ok: false; code: string; message: string };

export function assertMalwareGate(input: {
  verdict: string | null | undefined;
  securityHold?: boolean | null;
  contentHash?: string | null;
  verdictHash?: string | null;
  quarantineStatus?: string | null;
}): MalwareGateResult {
  if (input.securityHold) {
    return {
      ok: false,
      code: "IMPORT_SECURITY_HOLD",
      message: "Import is under a security hold.",
    };
  }
  if (input.quarantineStatus === "QUARANTINED") {
    return {
      ok: false,
      code: "IMPORT_FILE_QUARANTINED",
      message: "Import file is quarantined.",
    };
  }
  if (!input.verdict || input.verdict === "NOT_SUBMITTED") {
    return {
      ok: false,
      code: "IMPORT_SCAN_REQUIRED",
      message: "Malware scan is required before this action.",
    };
  }
  if (input.verdict === "SUBMITTED" || input.verdict === "SCANNING") {
    return {
      ok: false,
      code: "IMPORT_SCAN_PENDING",
      message: "Malware scan is still pending.",
    };
  }
  if (input.verdict === "INFECTED") {
    return { ok: false, code: "IMPORT_SCAN_INFECTED", message: "File failed malware scanning." };
  }
  if (input.verdict === "SUSPICIOUS") {
    return {
      ok: false,
      code: "IMPORT_SCAN_SUSPICIOUS",
      message: "File was marked suspicious by malware scanning.",
    };
  }
  if (input.verdict === "SCAN_TIMEOUT") {
    return { ok: false, code: "IMPORT_SCAN_TIMEOUT", message: "Malware scan timed out." };
  }
  if (input.verdict === "SCAN_FAILED" || input.verdict === "UNSUPPORTED") {
    return { ok: false, code: "IMPORT_SCAN_FAILED", message: "Malware scan failed." };
  }
  if (
    input.contentHash &&
    input.verdictHash &&
    input.contentHash.toLowerCase() !== input.verdictHash.toLowerCase()
  ) {
    return {
      ok: false,
      code: "IMPORT_SCAN_HASH_MISMATCH",
      message: "File content hash does not match the scanned content.",
    };
  }
  if (!isAcceptableMalwareVerdict(input.verdict)) {
    return {
      ok: false,
      code: "IMPORT_SCAN_STALE_VERDICT",
      message: "Malware verdict is not acceptable for processing.",
    };
  }
  return { ok: true, verdict: input.verdict };
}
