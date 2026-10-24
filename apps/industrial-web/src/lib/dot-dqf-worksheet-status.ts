import {
  dotDateExpiryState,
  isMedicalExaminerNationalRegistryOnFile,
  isWorksheetDocumentOnFile,
  worksheetDocumentFields,
} from "./dot-dqf-attention";
import {
  DQF_WORKSHEET_DOCUMENT_ORDER,
  dotDqfField,
  driverDocumentCopyFieldId,
  driverDocumentDateFields,
  filterDriverDqfDocumentFields,
  formatDqfDisplayDate,
  isOptionalDqfDocumentKey,
} from "./dot-dqf-fields";
import { dotFileStatusLabel, isOpenableDotFile, parseDotFileValues } from "./dot-dqf-files";
import { isDriverDiabeticEyeExamRequired, isDriverMecRequired } from "./dot-dqf-mec-rules";

export type DqfWorksheetItemTone = "ok" | "critical" | "pending";

export type DqfWorksheetItemStatus = {
  tone: DqfWorksheetItemTone;
  label: string;
  badgeClassName: string;
  itemClassName: string;
};

function hasDate(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasOpenableCopy(value: string | undefined): boolean {
  return parseDotFileValues(value).some(isOpenableDotFile);
}

function worksheetOnFile(details: Record<string, string>, key: string): boolean {
  if (key === "medicalExaminerNationalRegistryVerification") {
    return isMedicalExaminerNationalRegistryOnFile(details);
  }
  const fields = worksheetDocumentFields(key);
  if (hasDate(details[fields.dateId])) return true;
  if (fields.copyId && hasOpenableCopy(details[fields.copyId])) return true;
  if (fields.yesNoId && details[fields.yesNoId]?.trim().toLowerCase() === "yes") return true;
  if (fields.reviewsId && details[fields.reviewsId]?.trim()) return true;
  return false;
}

function toneStatus(tone: DqfWorksheetItemTone, label: string): DqfWorksheetItemStatus {
  switch (tone) {
    case "critical":
      return {
        tone,
        label,
        badgeClassName: "bg-label-danger",
        itemClassName: "dqf-worksheet-item-critical",
      };
    case "pending":
      return {
        tone,
        label,
        badgeClassName: "bg-label-pink",
        itemClassName: "dqf-worksheet-item-pending",
      };
    default:
      return {
        tone: "ok",
        label,
        badgeClassName: "bg-label-success",
        itemClassName: "",
      };
  }
}

function statusFromExpiryAndOnFile(
  expiryDate: string,
  onFile: boolean,
  today?: string,
): DqfWorksheetItemStatus {
  const expiry = dotDateExpiryState(expiryDate, today);
  if (expiry === "expired") {
    return toneStatus(
      "critical",
      expiryDate ? `Expired ${formatDqfDisplayDate(expiryDate)}` : "Expired",
    );
  }
  if (!onFile) {
    return toneStatus("critical", "Missing");
  }
  if (expiry === "expiring") {
    return toneStatus(
      "pending",
      expiryDate ? `Expiring ${formatDqfDisplayDate(expiryDate)}` : "Expiring soon",
    );
  }
  if (expiryDate) {
    return toneStatus("ok", formatDqfDisplayDate(expiryDate));
  }
  return toneStatus("ok", "On file");
}

export function dqfWorksheetLicenseStatus(
  details: Record<string, string>,
  today?: string,
): DqfWorksheetItemStatus {
  const date = details.cdlExpiry?.trim() ?? "";
  const copyOnFile = hasOpenableCopy(details.driversLicenseCopy);
  const onFile = hasDate(date) || copyOnFile;
  const status = statusFromExpiryAndOnFile(date, onFile, today);
  if (status.tone === "ok" && copyOnFile) {
    return toneStatus("ok", dotFileStatusLabel(details.driversLicenseCopy));
  }
  if (status.tone === "ok" && hasDate(date)) {
    return toneStatus("ok", formatDqfDisplayDate(date));
  }
  return status;
}

export function dqfWorksheetDocumentStatus(
  key: (typeof DQF_WORKSHEET_DOCUMENT_ORDER)[number] | "driversLicense",
  details: Record<string, string>,
  opts?: { tenantSlug?: string | null; today?: string },
): DqfWorksheetItemStatus {
  if (key === "driversLicense") {
    return dqfWorksheetLicenseStatus(details, opts?.today);
  }

  const mecRequired = isDriverMecRequired(details);
  if (key === "medicalCert" && !mecRequired) {
    return toneStatus("ok", "N/A");
  }

  if (key === "medicalCert" || key === "mvrAnnual") {
    const fields = worksheetDocumentFields(key);
    const date =
      key === "mvrAnnual"
        ? (details.mvrAnnual?.trim() ?? "")
        : (details[fields.dateId]?.trim() ?? "");
    const copyId = fields.copyId ?? driverDocumentCopyFieldId(key);
    const onFile = worksheetOnFile(details, key);
    const status = statusFromExpiryAndOnFile(date, onFile, opts?.today);
    if (status.tone === "ok") {
      if (date) return toneStatus("ok", formatDqfDisplayDate(date));
      const copyValue = copyId ? details[copyId] : "";
      if (hasOpenableCopy(copyValue)) {
        return toneStatus("ok", dotFileStatusLabel(copyValue));
      }
      if (key === "mvrAnnual" && !date) {
        return toneStatus("critical", "Expiration not set");
      }
    }
    return status;
  }

  if (key === "diabeticEyeExam") {
    const date = details.diabeticEyeExamExpiry?.trim() ?? "";
    const copyOnFile = hasOpenableCopy(details.diabeticEyeExamCopy);
    const required = isDriverDiabeticEyeExamRequired(details);
    if (!required && !date && !copyOnFile) {
      return toneStatus("ok", "Optional");
    }
    const status = statusFromExpiryAndOnFile(date, required ? copyOnFile : true, opts?.today);
    if (status.tone !== "ok") return status;
    if (required && !date) return toneStatus("critical", "Expiration not set");
    if (date) return toneStatus("ok", formatDqfDisplayDate(date));
    return toneStatus("ok", dotFileStatusLabel(details.diabeticEyeExamCopy));
  }

  const visibleDateIds = new Set(
    filterDriverDqfDocumentFields(driverDocumentDateFields(), opts?.tenantSlug).map(
      (field) => field.id,
    ),
  );
  if (
    key !== "driversApplication" &&
    key !== "dqfReview" &&
    key !== "medicalExaminerNationalRegistryVerification" &&
    key !== "certificationOfRoadTest" &&
    !visibleDateIds.has(key)
  ) {
    return toneStatus("ok", "N/A");
  }

  const onFile = worksheetOnFile(details, key);
  if (!onFile) {
    if (isOptionalDqfDocumentKey(key)) {
      return toneStatus("ok", "Optional");
    }
    return toneStatus("critical", "Missing");
  }

  const fields = worksheetDocumentFields(key);
  if (fields.copyId && hasOpenableCopy(details[fields.copyId])) {
    return toneStatus("ok", dotFileStatusLabel(details[fields.copyId]));
  }
  if (fields.dateId && hasDate(details[fields.dateId])) {
    return toneStatus("ok", formatDqfDisplayDate(details[fields.dateId]));
  }
  if (key === "dqfReview") {
    const onFileLabel = details.certificationComplianceOnFile?.trim() || "On file";
    return toneStatus("ok", onFileLabel);
  }
  if (key === "medicalExaminerNationalRegistryVerification") {
    if (fields.copyId && hasOpenableCopy(details[fields.copyId])) {
      return toneStatus("ok", dotFileStatusLabel(details[fields.copyId]));
    }
    if (fields.dateId && hasDate(details[fields.dateId])) {
      return toneStatus("ok", formatDqfDisplayDate(details[fields.dateId]));
    }
    if (details.medicalExaminerRegistrationNumber?.trim()) {
      return toneStatus("ok", details.medicalExaminerRegistrationNumber.trim());
    }
    const label = details.medicalExaminerNationalRegistryVerificationStatus?.trim() || "On file";
    return toneStatus("ok", label);
  }
  return toneStatus("ok", "On file");
}

export function dqfWorksheetFieldToneClass(tone: DqfWorksheetItemTone | undefined): string {
  if (tone === "critical") return "dqf-worksheet-field-critical";
  if (tone === "pending") return "dqf-worksheet-field-pending";
  return "";
}
