/**
 * Production-hardening guards for malware scanner providers (S8).
 * reference-malware@1 is development/test only — never enable for production-like envs.
 */

export const REFERENCE_MALWARE_PROVIDER_KEY = "reference-malware" as const;

/** GuardDuty Malware Protection for S3 — production-grade provider key. */
export const AWS_GUARDDUTY_MALWARE_PROVIDER_KEY = "aws-guardduty-malware-protection" as const;

/** Environments where untrusted file imports require a production-grade scanner. */
export const PRODUCTION_LIKE_APP_ENVS = new Set([
  "staging",
  "production",
  "govcloud-staging",
  "govcloud-production",
]);

export function isProductionLikeAppEnv(appEnv: string | null | undefined): boolean {
  if (!appEnv) return false;
  return PRODUCTION_LIKE_APP_ENVS.has(appEnv);
}

export function isReferenceMalwareProvider(providerKey: string | null | undefined): boolean {
  return providerKey === REFERENCE_MALWARE_PROVIDER_KEY;
}

export function isProductionGradeMalwareProvider(providerKey: string | null | undefined): boolean {
  return providerKey === AWS_GUARDDUTY_MALWARE_PROVIDER_KEY;
}

/** Resolve configured provider; empty/missing → reference (dev default). */
export function resolveImportMalwareProviderKey(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : REFERENCE_MALWARE_PROVIDER_KEY;
}

/**
 * Fail closed: reference scanner is blocked in production-like environments.
 * There is no administrator bypass.
 */
export function assertScannerAllowedForEnvironment(input: {
  appEnv: string;
  providerKey: string;
}): { ok: true } | { ok: false; code: "IMPORT_SCANNER_PROVIDER_UNAVAILABLE"; message: string } {
  if (isProductionLikeAppEnv(input.appEnv) && isReferenceMalwareProvider(input.providerKey)) {
    return {
      ok: false,
      code: "IMPORT_SCANNER_PROVIDER_UNAVAILABLE",
      message:
        "Untrusted file imports are blocked in this environment until a production-grade malware scanner is configured. The reference scanner is development/test only.",
    };
  }
  return { ok: true };
}

/**
 * Job statuses monitored for stuck detection.
 * Note: PREVIEW_GENERATING and CANCELLATION_REQUESTED are not discrete job statuses in the
 * shared model; READY_FOR_PREVIEW covers preview generation waits, and cancellation completes
 * to CANCELLED (or remains PROCESSING until safe cancel boundary).
 */
export type StuckImportJobState =
  "SCANNING" | "VALIDATING" | "READY_FOR_PREVIEW" | "QUEUED" | "PROCESSING" | "ROLLBACK_PENDING";

export const STUCK_JOB_THRESHOLDS_MS: Record<StuckImportJobState, number> = {
  SCANNING: 15 * 60_000,
  VALIDATING: 30 * 60_000,
  READY_FOR_PREVIEW: 30 * 60_000,
  QUEUED: 30 * 60_000,
  PROCESSING: 2 * 60 * 60_000,
  ROLLBACK_PENDING: 24 * 60 * 60_000,
};

export function isStuckImportJob(input: {
  status: string;
  updatedAt: Date | string;
  now?: Date;
}): boolean {
  const threshold = STUCK_JOB_THRESHOLDS_MS[input.status as StuckImportJobState];
  if (!threshold) return false;
  const updated = input.updatedAt instanceof Date ? input.updatedAt : new Date(input.updatedAt);
  const now = input.now ?? new Date();
  return now.getTime() - updated.getTime() >= threshold;
}

/** Evidence-based batch defaults (S8). Tunable via request within min/max. */
export const S8_BATCH_RECOMMENDATION = {
  default: 50,
  minimum: 1,
  maximum: 500,
  recommendedRange: [50, 250] as const,
  rationale:
    "Default 50 balances Aurora transaction duration, lock hold time, and retry granularity. Cap 500 prevents oversized transactions under concurrent tenants.",
} as const;
