import { DOT_DQF_ALL_FIELD_IDS, deriveDotDqfTitle, dotDqfField } from "./dot-dqf-fields";
import { slimDotFileFieldValue } from "./dot-dqf-files";

function asText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

function serializeFieldValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function slimDetailValue(fieldId: string, value: string): string {
  const field = dotDqfField(fieldId);
  if (field?.type === "file") return slimDotFileFieldValue(value);
  return value;
}

/** Flatten a DOT driver record into the DQF worksheet details map. */
export function dotDqfDetailsFromRecord(record: Record<string, unknown>): Record<string, string> {
  const details: Record<string, string> = {};
  const nested = record.details;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      const text = serializeFieldValue(value);
      if (text) details[key] = text;
    }
  }

  for (const fieldId of DOT_DQF_ALL_FIELD_IDS) {
    const text = serializeFieldValue(record[fieldId]);
    if (text) details[fieldId] = text;
  }

  if (!details.cdlNumber && record.licenseNumber) details.cdlNumber = asText(record.licenseNumber);
  if (!details.cdlExpiry && record.licenseExpiryDate) {
    details.cdlExpiry = asText(record.licenseExpiryDate).slice(0, 10);
  }
  if (!details.medicalCertExpiry && record.medicalCardExpiry) {
    details.medicalCertExpiry = asText(record.medicalCardExpiry).slice(0, 10);
  }
  if (!details.mvrAnnual && record.nextMvrDueDate) {
    details.mvrAnnual = asText(record.nextMvrDueDate).slice(0, 10);
  }
  if (!details.mvrCompleted && record.lastMvrDate) {
    details.mvrCompleted = asText(record.lastMvrDate).slice(0, 10);
  }
  if (!details.mvrReleaseForm && record.mvrReleaseDate) {
    details.mvrReleaseForm = asText(record.mvrReleaseDate).slice(0, 10);
  }
  if (!details.locationDepartment) {
    details.locationDepartment =
      asText(record.locationDepartment) ||
      asText(record.locationText) ||
      asText(record.siteName) ||
      "";
  }
  if (!details.employeeNumber) details.employeeNumber = asText(record.employeeNumber);
  if (!details.hireDate) details.hireDate = asText(record.hireDate).slice(0, 10);
  if (!details.phone) details.phone = asText(record.phone);
  if (!details.driverRestrictions) details.driverRestrictions = asText(record.driverRestrictions);
  if (!details.driversLicenseCopy) {
    const copy = serializeFieldValue(record.driversLicenseCopy);
    if (copy) details.driversLicenseCopy = copy;
  }
  if (!details.medicalCertCopy) {
    const copy = serializeFieldValue(record.medicalCard);
    if (copy) details.medicalCertCopy = copy;
  }

  return details;
}

/** Merge worksheet details back into a DOT PATCH payload. */
export function dotDqfPatchFromDetails(
  details: Record<string, string>,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const slimmedDetails: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    slimmedDetails[key] = slimDetailValue(key, value);
  }

  const patch: Record<string, unknown> = {
    category: "drivers",
    dqf: true,
    details: { ...slimmedDetails },
  };

  for (const [key, value] of Object.entries(slimmedDetails)) {
    patch[key] = value === "" ? null : value;
  }

  patch.licenseNumber = slimmedDetails.cdlNumber || null;
  patch.licenseExpiryDate = slimmedDetails.cdlExpiry || null;
  patch.medicalCardExpiry = slimmedDetails.medicalCertExpiry || null;
  patch.lastMvrDate = slimmedDetails.mvrCompleted || null;
  patch.nextMvrDueDate = slimmedDetails.mvrAnnual || null;
  patch.mvrReleaseDate = slimmedDetails.mvrReleaseForm || null;
  patch.initialMvrDate = slimmedDetails.mvrReleaseForm || slimmedDetails.mvrCompleted || null;
  patch.locationText = slimmedDetails.locationDepartment || null;
  patch.siteName = slimmedDetails.locationDepartment || null;
  patch.employeeNumber = slimmedDetails.employeeNumber || null;
  patch.hireDate = slimmedDetails.hireDate || null;
  patch.phone = slimmedDetails.phone || null;
  patch.driverRestrictions = slimmedDetails.driverRestrictions || null;
  patch.dueDate = deriveDueDateFromDetails(slimmedDetails);

  const recordId = asText(record.id);
  const existingTitle = asText(record.title);
  const titleMissing = !existingTitle || (recordId !== "" && existingTitle === recordId);
  const name =
    asText(record.driverName) ||
    asText(record.workerName) ||
    asText(record.personnelName) ||
    [asText(record.firstName), asText(record.lastName)].filter(Boolean).join(" ");
  if (name) {
    patch.driverName = name;
    patch.workerName = name;
    patch.personnelName = name;
  }
  if (titleMissing) {
    const derivedTitle = deriveDotDqfTitle({ ...record, ...slimmedDetails });
    if (derivedTitle) patch.title = derivedTitle;
  } else if (!name && existingTitle) {
    patch.title = existingTitle;
  }

  return patch;
}

/** Patch a single DQF field without resending the whole worksheet. */
export function dotDqfPatchForField(fieldId: string, value: string): Record<string, unknown> {
  const slimmed = slimDetailValue(fieldId, value);
  return {
    category: "drivers",
    dqf: true,
    [fieldId]: slimmed === "" ? null : slimmed,
    details: { [fieldId]: slimmed },
  };
}

function deriveDueDateFromDetails(details: Record<string, string>): string | null {
  const fields = ["cdlExpiry", "medicalCertExpiry", "mvrAnnual", "diabeticEyeExamExpiry"];
  const dates = fields
    .map((fieldId) => details[fieldId]?.trim() ?? "")
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates[0] ?? null;
}
