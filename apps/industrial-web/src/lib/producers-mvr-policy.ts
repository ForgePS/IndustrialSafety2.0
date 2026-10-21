/**
 * Hardcoded Policy & Employee Agreement for the Producers Rice Mill
 * "Acknowledgement for Driving Company Vehicles (MVR Consent)" form.
 * Kept concise so the printable fits on one letter page.
 */
export const PRODUCERS_MVR_POLICY_TEXT = [
  "Producers Rice Mill Inc. works with its liability insurers to balance coverage cost with company needs. Any EMPLOYEE who drives a company vehicle must complete Motor Vehicle Record (MVR) review and license approval. Insurance covers only approved DRIVERS.",
  "EMPLOYEES must be at least 21 years old to operate a company vehicle. No EMPLOYEE under 21 may drive a company vehicle for any reason. An EMPLOYEE whose license is suspended may not drive.",
  "By signing this acknowledgement, I authorize Producers Rice Mill Inc. to obtain and review my MVR at any time during employment, including initial insurance approval and later checks the company deems necessary.",
  "EMPLOYEE Agreement: I understand the age restriction and driving approval process. I will not drive a company vehicle until approved. I will notify my supervisor and the Safety Department if my license is suspended. If directed to drive while not approved, I will remind management that I am not approved.",
].join("\n\n");

export const PRODUCERS_MVR_FORM_SOURCE_ID = "z8DdbRny93Oi7TkWNQ3M";
export const PRODUCERS_MVR_POLICY_FIELD_ID = "policy-text";
export const PRODUCERS_RICE_MILL_TENANT_SLUG = "producers-rice-mill";

/** True when the active tenant is Producers Rice Mill (slug or display name). */
export function isProducersRiceMillTenant(
  slug?: string | null,
  displayName?: string | null,
): boolean {
  const hay = [slug, displayName].filter(Boolean).join(" ").trim().toLowerCase();
  if (!hay) return false;
  return /producers[-_\s]?rice/.test(hay);
}

export function isProducersMvrConsentForm(definition: Record<string, unknown> | null | undefined): boolean {
  if (!definition) return false;
  const title = String(definition.title ?? definition.name ?? "").toLowerCase();
  const formKey = String(definition.formKey ?? "").toLowerCase();
  const sourceId = String(definition.sourceDocumentId ?? "").trim();
  if (sourceId === PRODUCERS_MVR_FORM_SOURCE_ID) return true;
  if (title.includes("acknowledgement for driving company vehicles")) return true;
  if (title.includes("mvr consent")) return true;
  if (formKey.includes("mvr") && title.includes("acknowledgement")) return true;
  return false;
}

/** First matching MVR consent template from a forms list response. */
export function findProducersMvrConsentForm(
  definitions: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  for (const row of definitions) {
    if (isProducersMvrConsentForm(row)) return row;
  }
  return null;
}

export function producersMvrConsentFormTitle(
  definition: Record<string, unknown> | null | undefined,
): string {
  if (!definition) return "MVR consent form";
  const title = String(definition.title ?? definition.name ?? "").trim();
  return title || "MVR consent form";
}

/** Deep link into Forms fill view; optional personnel attaches the submission. */
export function producersMvrConsentFormFillHref(
  formId: string,
  personnelId?: string | null,
): string {
  const id = formId.trim();
  if (!id) return "/modules/forms/";
  const params = new URLSearchParams({ tab: "fill", form: id });
  const subject = personnelId?.trim();
  if (subject) params.set("personnel", subject);
  return `/modules/forms/?${params.toString()}`;
}
