/** MVR Consent follow-up for company-driver roster rows. */

export const COMPANY_DRIVER_MVR_CONSENT_NOTIFICATION_TYPE =
  "industrial.company-driver.mvr-consent";

function uploadCount(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.filter((entry) => !!entry && typeof entry === "object" && !Array.isArray(entry))
    .length;
}

export function companyDriverMvrConsentOnFile(payload: Record<string, unknown>): boolean {
  const date = String(payload.mvrReleaseDate ?? "").trim();
  return uploadCount(payload.mvrReleaseUploads) > 0 || Boolean(date);
}

export function fleetDriverMissingMvrConsent(args: {
  status?: string | null;
  payload: Record<string, unknown>;
}): boolean {
  const status = String(args.payload.status ?? args.status ?? "")
    .trim()
    .toLowerCase();
  if (status === "removed") return false;
  return !companyDriverMvrConsentOnFile(args.payload);
}
