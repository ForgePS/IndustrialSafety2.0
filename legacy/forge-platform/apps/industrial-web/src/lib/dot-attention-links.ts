import { dotFileHref } from "./dot-compliance-module";
import { personFileHref } from "./personnel-directory";
import { DQF_FORM_LINK_FIELD_IDS } from "./dot-dqf-fields";
import type { DotAttentionIssue, DotAttentionKind } from "./dot-dqf-attention";
import { dqfFormFillHref } from "./dot-dqf-form-links";
import { producersMvrConsentFormFillHref } from "./producers-mvr-policy";

export type DotAttentionHrefContext = {
  dqfFormIds: Record<string, string>;
  personnelId?: string | null;
  companyDriversHref?: string;
};

/** Map a DQF field id to the worksheet accordion / section anchor used for scroll-to. */
export function dqfWorksheetFocusKey(fieldId: string): string {
  const id = fieldId.trim();
  if (!id) return "";
  if (
    id === "cdlExpiry" ||
    id === "cdlNumber" ||
    id === "driversLicenseCopy" ||
    id === "driversLicenseOnFile"
  ) {
    return "cdl-section";
  }
  if (id === "medicalCertExpiry" || id === "medicalCertCopy") return "medicalCert";
  if (id === "diabeticEyeExamExpiry" || id === "diabeticEyeExamCopy") return "diabeticEyeExam";
  if (id === "driversApplicationForEmployment" || id === "driversApplicationCopy") {
    return "driversApplication";
  }
  if (
    id === "certificationComplianceDriverLicense" ||
    id === "certificationComplianceOnFile" ||
    id === "dqfReviews"
  ) {
    return "dqfReview";
  }
  if (id.endsWith("Copy")) {
    const dateId = id.slice(0, -4);
    if (dateId) return dateId;
  }
  return id;
}

function formFieldIdForAttention(fieldId: string): string {
  const id = fieldId.trim();
  if (!id) return "";
  if (DQF_FORM_LINK_FIELD_IDS.has(id)) return id;
  if (id.endsWith("Copy")) {
    const dateId = id.slice(0, -4);
    if (dateId && DQF_FORM_LINK_FIELD_IDS.has(dateId)) return dateId;
  }
  return "";
}

export function resolveDotAttentionHref(
  issue: DotAttentionIssue,
  ctx: DotAttentionHrefContext,
): string {
  const recordId = issue.recordId.trim();
  const personnelId = issue.personnelId?.trim() || ctx.personnelId?.trim() || "";

  if (issue.source === "fleet") {
    if (issue.kind === "pendingMvr" || issue.kind === "missingMvrConsent") {
      const mvrFormId = ctx.dqfFormIds.mvrReleaseForm?.trim();
      if (mvrFormId) {
        return producersMvrConsentFormFillHref(mvrFormId, personnelId || null);
      }
      return ctx.companyDriversHref ?? "/modules/personnel/?view=company-drivers";
    }
    if (personnelId) return personFileHref(personnelId);
    return ctx.companyDriversHref ?? "/modules/personnel/?view=company-drivers";
  }

  if (issue.kind === "pendingMvr" || issue.kind === "missingMvrConsent") {
    const mvrFormId = ctx.dqfFormIds.mvrReleaseForm?.trim();
    if (mvrFormId) {
      return producersMvrConsentFormFillHref(mvrFormId, personnelId || null);
    }
    return ctx.companyDriversHref ?? "/modules/personnel/?view=company-drivers";
  }

  if (issue.kind === "openDvirDefects" && recordId) {
    return dotFileHref(recordId);
  }

  const fieldId = issue.fieldId?.trim() ?? "";
  const formFieldId = formFieldIdForAttention(fieldId);
  const formId = formFieldId ? ctx.dqfFormIds[formFieldId]?.trim() : "";

  if (formId && formFieldId) {
    if (formFieldId === "mvrReleaseForm") {
      return producersMvrConsentFormFillHref(formId, personnelId || null);
    }
    return dqfFormFillHref({
      formId,
      personnelId: personnelId || null,
      dotRecordId: recordId || null,
    });
  }

  if (recordId && fieldId) {
    return dotFileHref(recordId, { focus: dqfWorksheetFocusKey(fieldId) });
  }

  if (recordId) return dotFileHref(recordId);
  return ctx.companyDriversHref ?? "/modules/dot-compliance/";
}

export function firstAttentionHrefForKind(
  kind: DotAttentionKind,
  issues: readonly DotAttentionIssue[],
  ctx: DotAttentionHrefContext,
): string | null {
  const match = issues.find((issue) => issue.kind === kind);
  return match ? resolveDotAttentionHref(match, ctx) : null;
}
