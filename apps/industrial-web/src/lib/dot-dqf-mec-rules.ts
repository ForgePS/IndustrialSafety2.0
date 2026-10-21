export const DRIVER_WORKER_CLASSIFICATIONS = [
  "Full Time",
  "Part Time",
  "Seasonal",
  "Temporary",
  "Other",
] as const;

export const DRIVER_LICENSE_CLASSES = ["CDL DRIVER", "Non-CDL DRIVER"] as const;

export function isSeasonalDqfDriver(details: Record<string, string | undefined>): boolean {
  return details.workerClassification?.trim().toLowerCase() === "seasonal";
}

export function isNonCdlDqfDriver(details: Record<string, string | undefined>): boolean {
  const value = details.driverLicenseClass?.trim().toLowerCase() ?? "";
  return value === "non-cdl driver" || value === "non-cdl";
}

export function isDriverMecRequired(details: Record<string, string | undefined>): boolean {
  return !isSeasonalDqfDriver(details);
}

export function isDriverCdlRequired(details: Record<string, string | undefined>): boolean {
  return !isNonCdlDqfDriver(details);
}

/** Diabetic eye exam is required when DRIVER restrictions / notes mention diabetes. */
export function isDriverDiabeticEyeExamRequired(
  details: Record<string, string | undefined>,
): boolean {
  return /diabet/i.test(details.driverRestrictions ?? "");
}
