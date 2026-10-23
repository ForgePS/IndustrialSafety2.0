/**
 * Producers paper forms on workers' comp cases (Employee Injury Guidelines acknowledgment and
 * HIPAA Authorization). The API stores signed forms and renders PDFs: "blank" is the original
 * paper form, "signed" is the saved answers drawn onto that same page.
 */
import { apiFetchRaw, apiGet, apiSend } from "@forge/web-kit";

export const WC_FORMS_API = "/api/v1/industrial/workers-comp-forms";

export type WcFormKey = "INJURY_GUIDELINES_ACK" | "HIPAA_AUTHORIZATION";

export const WC_FORM_TITLES: Record<WcFormKey, string> = {
  INJURY_GUIDELINES_ACK: "Employee Injury Guidelines",
  HIPAA_AUTHORIZATION: "HIPAA Authorization",
};

export const WC_FORM_DESCRIPTIONS: Record<WcFormKey, string> = {
  INJURY_GUIDELINES_ACK:
    "Employee copy of the injury guidelines. The employee signs to acknowledge they received it.",
  HIPAA_AUTHORIZATION:
    "Authorizes the employee's provider to disclose protected health information to Producers Rice Mill.",
};

export type HipaaInitialKey = "releaseRecords" | "sensitiveInformation" | "postalOrFax" | "unencryptedEmail";

/** The four initialed lines, worded as on the paper form. */
export const HIPAA_INITIAL_LINES: Array<{ key: HipaaInitialKey; text: string }> = [
  {
    key: "releaseRecords",
    text: "I authorize the release of all clinical notes, test results, after visit summary and billing records for the current episode and all previous clinical notes and test results on file related to my on-the-job injury.",
  },
  {
    key: "sensitiveInformation",
    text: "I understand my records may include information related to mental healthcare, communicable diseases and drug/alcohol use. I authorize disclosure of this information.",
  },
  { key: "postalOrFax", text: "I authorize my records to be delivered by postal mail and/or fax." },
  {
    key: "unencryptedEmail",
    text: "I authorize my records to be delivered by unencrypted email. I understand unencrypted email does not provide any assurance for the privacy of my information and it may be opened and read by someone who is not authorized to receive it.",
  },
];

export const HIPAA_STATEMENTS = [
  "The purpose of this request is to allow my employer to pay my bill and/or refer my claim to the workers compensation carrier for payment. This authorization shall be in force and in effect for one (1) year.",
  "I understand that I have the right to revoke this authorization, in writing, at any time by contacting the medical records department. I understand that a revocation is not effective to the extent that any person or entity has already acted in reliance on my authorization or if my authorization was obtained as condition of obtaining insurance coverage and the insurer has a legal right to contest a claim.",
  "I understand that information used or disclosed pursuant to this authorization may be disclosed by Producers Rice Mill, Inc. and may no longer be protected by federal or state law.",
];

export type WcFormAccess = { read: boolean; act: boolean };

export type WcSignedForm = {
  id: string;
  caseId: string;
  formKey: WcFormKey;
  title: string;
  status: "SIGNED" | "VOIDED";
  signerName: string;
  signerRelationship: string | null;
  signedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  emailCount: number;
  lastEmailedAt: string | null;
  data?: Record<string, unknown>;
};

export type WcFormsOverview = {
  available: boolean;
  permissions: { guidelines: WcFormAccess; hipaa: WcFormAccess };
  prefill: { employeeName: string; dateOfBirth: string };
  caseArchived: boolean;
  forms: WcSignedForm[];
};

export type WcFormRecipient = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  departmentName: string | null;
};

export type WcFormEmailResult = {
  sent: number;
  failed: Array<{ email: string; name: string | null; accepted: boolean; detail?: string }>;
  skipped: Array<{ personnelId: string; name: string | null; reason: string }>;
};

export type GuidelinesDraft = { employeeName: string; signedDate: string; signatureDataUrl: string };

export type HipaaDraft = {
  patientName: string;
  dateOfBirth: string;
  providerName: string;
  initials: Record<HipaaInitialKey, string>;
  signerName: string;
  signerRelationship: string;
  signedDate: string;
  signatureDataUrl: string;
};

export function todayLocalIso(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyHipaaDraft(prefill: WcFormsOverview["prefill"], today = todayLocalIso()): HipaaDraft {
  return {
    patientName: prefill.employeeName,
    dateOfBirth: prefill.dateOfBirth,
    providerName: "",
    initials: { releaseRecords: "", sensitiveInformation: "", postalOrFax: "", unencryptedEmail: "" },
    signerName: prefill.employeeName,
    signerRelationship: "Self",
    signedDate: today,
    signatureDataUrl: "",
  };
}

/** Mirrors the server checks so people see problems before submitting. */
export function guidelinesDraftError(draft: GuidelinesDraft, today = todayLocalIso()): string | null {
  if (!draft.employeeName.trim()) return "Enter the employee's name.";
  if (!draft.signedDate) return "Enter the date signed.";
  if (draft.signedDate > today) return "The date signed cannot be in the future.";
  if (!draft.signatureDataUrl) return "The employee needs to sign.";
  return null;
}

export function hipaaDraftError(draft: HipaaDraft, today = todayLocalIso()): string | null {
  if (!draft.patientName.trim()) return "Enter the patient's name.";
  if (!draft.dateOfBirth || draft.dateOfBirth >= today) return "Enter a valid date of birth.";
  if (!draft.providerName.trim()) return "Enter the provider being authorized to disclose records.";
  const initials = Object.values(draft.initials).map((v) => v.trim());
  if (!initials.some(Boolean)) return "Initial at least one authorization line.";
  if (initials.some((v) => v && !/^[A-Za-z][A-Za-z.\- ]{0,5}$/.test(v))) {
    return "Initials should be letters only, like JM.";
  }
  if (!draft.signedDate) return "Enter the date signed.";
  if (draft.signedDate > today) return "The date signed cannot be in the future.";
  if (!draft.signatureDataUrl) return "The patient or their representative needs to sign.";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split typed outside addresses (comma, semicolon, space or new line) and flag bad ones. */
export function parseOutsideEmails(raw: string): { emails: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const emails = [...new Set(parts)];
  return { emails: emails.filter((e) => EMAIL_RE.test(e)), invalid: emails.filter((e) => !EMAIL_RE.test(e)) };
}

export function getWcForms(caseId: string) {
  return apiGet<WcFormsOverview>(`${WC_FORMS_API}/cases/${encodeURIComponent(caseId)}`);
}

/** One key per fill dialog, so a double click or a retried request never signs the form twice. */
export function signWcForm(caseId: string, formKey: WcFormKey, draft: GuidelinesDraft | HipaaDraft, idempotencyKey: string) {
  return apiSend<WcSignedForm>(
    `${WC_FORMS_API}/cases/${encodeURIComponent(caseId)}`,
    "POST",
    { formKey, ...draft },
    { idempotencyKey },
  );
}

export function voidWcForm(formId: string, reason: string) {
  return apiSend<WcSignedForm>(`${WC_FORMS_API}/${encodeURIComponent(formId)}/void`, "POST", { reason });
}

export function getWcFormRecipients() {
  return apiGet<WcFormRecipient[]>(`${WC_FORMS_API}/recipients`);
}

export function emailWcForm(formId: string, body: { personnelIds: string[]; emails: string[]; message: string }) {
  return apiSend<WcFormEmailResult>(`${WC_FORMS_API}/${encodeURIComponent(formId)}/email`, "POST", body);
}

export function wcFormEmailSummary(result: WcFormEmailResult): { tone: "success" | "warning" | "danger"; text: string } {
  const failed = result.failed.length;
  const skipped = result.skipped.length;
  if (!result.sent) return { tone: "danger", text: "The email could not be sent. Check the addresses and try again." };
  const parts = [`Sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"}.`];
  if (failed) parts.push(`${failed} could not be delivered: ${result.failed.map((f) => f.email).join(", ")}.`);
  if (skipped) parts.push(`${skipped} skipped: ${result.skipped.map((s) => `${s.name ?? "Unknown"} (${s.reason})`).join(", ")}.`);
  return { tone: failed || skipped ? "warning" : "success", text: parts.join(" ") };
}

async function fetchPdf(path: string): Promise<{ bytes: Uint8Array; filename: string }> {
  const res = await apiFetchRaw(path);
  if (!res.ok) {
    let message = `Could not open the form (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string }; message?: string };
      message = body?.error?.message || body?.message || message;
    } catch {
      // Non-JSON error body.
    }
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "form.pdf";
  return { bytes: new Uint8Array(await res.arrayBuffer()), filename };
}

export function fetchBlankWcFormPdf(formKey: WcFormKey) {
  return fetchPdf(`${WC_FORMS_API}/templates/${formKey}/blank`);
}

export function fetchSignedWcFormPdf(formId: string) {
  return fetchPdf(`${WC_FORMS_API}/${encodeURIComponent(formId)}/pdf`);
}

/** Save the PDF to the device. */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
