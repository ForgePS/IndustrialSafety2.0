/**
 * Helpers for the First Aid module "Add certification" form that links
 * CPR / First Aid copies and expiry dates to an existing personnel file.
 */

export type FirstAidAddCertificationDraft = {
  personnelId: string;
  tracksFirstAid: boolean;
  cprExpiresDate: string;
  firstAidExpiresDate: string;
  cprDocumentId: string;
  firstAidDocumentId: string;
};

export type FirstAidAssignPayload = {
  personnelId: string;
  tracksFirstAid: boolean;
  cprCertificationExpiresDate?: string;
  firstAidCertificationExpiresDate?: string;
  cprCertificationDocumentId?: string;
  firstAidCertificationDocumentId?: string;
};

export function validateFirstAidAddCertification(
  draft: FirstAidAddCertificationDraft,
): string | null {
  if (!draft.personnelId.trim()) {
    return "Select an employee personnel file.";
  }
  const hasCpr =
    Boolean(draft.cprExpiresDate.trim()) || Boolean(draft.cprDocumentId.trim());
  const hasFirstAid =
    Boolean(draft.firstAidExpiresDate.trim()) || Boolean(draft.firstAidDocumentId.trim());
  if (!hasCpr && !hasFirstAid) {
    return "Add a CPR or First Aid expiry date or certification copy.";
  }
  return null;
}

/** Build the assign API body from the add-certification form. */
export function buildFirstAidAssignPayload(
  draft: FirstAidAddCertificationDraft,
): FirstAidAssignPayload {
  const payload: FirstAidAssignPayload = {
    personnelId: draft.personnelId.trim(),
    tracksFirstAid: draft.tracksFirstAid,
  };
  if (draft.cprExpiresDate.trim()) {
    payload.cprCertificationExpiresDate = draft.cprExpiresDate.trim();
  }
  if (draft.firstAidExpiresDate.trim()) {
    payload.firstAidCertificationExpiresDate = draft.firstAidExpiresDate.trim();
  }
  if (draft.cprDocumentId.trim()) {
    payload.cprCertificationDocumentId = draft.cprDocumentId.trim();
  }
  if (draft.firstAidDocumentId.trim()) {
    payload.firstAidCertificationDocumentId = draft.firstAidDocumentId.trim();
  }
  return payload;
}

