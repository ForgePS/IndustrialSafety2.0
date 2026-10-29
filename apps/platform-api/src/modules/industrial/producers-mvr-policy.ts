/**
 * Hardcoded Policy & Employee Agreement for the Producers Rice Mill
 * "Acknowledgement for Driving Company Vehicles (MVR Consent)" form.
 * Kept concise so the printable fits on one letter page.
 */
export const PRODUCERS_MVR_POLICY_TEXT = [
  "Producers Rice Mill Inc. works with its liability insurers to balance coverage cost with company needs. Any employee who drives a company vehicle must complete Motor Vehicle Record (MVR) review and license approval. Insurance covers only approved drivers.",
  "Employees must be at least 21 years old to operate a company vehicle. No employee under 21 may drive a company vehicle for any reason. An employee whose license is suspended may not drive.",
  "By signing this acknowledgement, I authorize Producers Rice Mill Inc. to obtain and review my MVR at any time during employment, including initial insurance approval and later checks the company deems necessary.",
  "Employee Agreement: I understand the age restriction and driving approval process. I will not drive a company vehicle until approved. I will notify my supervisor and the Safety Department if my license is suspended. If directed to drive while not approved, I will remind management that I am not approved.",
].join("\n\n");

export const PRODUCERS_MVR_FORM_SOURCE_ID = "z8DdbRny93Oi7TkWNQ3M";
export const PRODUCERS_MVR_POLICY_FIELD_ID = "policy-text";

export function isProducersMvrConsentForm(
  definition: {
    title?: string | null;
    name?: string | null;
    formKey?: string | null;
    sourceDocumentId?: string | null;
  } | null,
): boolean {
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
