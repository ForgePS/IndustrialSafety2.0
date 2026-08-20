/**
 * Hardcoded Policy & Employee Agreement for the Producers Rice Mill
 * "Acknowledgement for Driving Company Vehicles (MVR Consent)" form.
 */
export const PRODUCERS_MVR_POLICY_TEXT = [
  "Producers Rice Mill Inc. works with our liability insurers to determine appropriate guidelines and practices to follow in an effort to balance cost of insurance coverage with the insurance needs of the company. As part of this agreement, any employee driving any company vehicle needs to go through a process in which a Motor Vehicle Record (MVR) is requested, and his/her driver's license information is presented for review and approval for coverage. Our insurance will only cover those employees who are approved to drive a company vehicle.",
  "As part of the terms of our agreement, an employee needs to be a minimum of 21 years of age to operate a company vehicle. No employee under the age of 21 should drive any company vehicle at any time for any reason. Furthermore, any employee who has his drivers' license suspended is not allowed to drive.",
  "By signing this acknowledgement, I authorize Producers Rice Mill Inc. to obtain and review my Motor Vehicle Record (MVR) at any time, for any reason, during my employment, including the initial review for insurance approval and any subsequent checks the company deems necessary.",
  "Employee Agreement: Understanding that I have accepted a position with Producers Rice Mill in an area where use of a company vehicle may occur, I understand the age restriction and driving approval process used for insurance purposes. I agree to not drive a company vehicle until such time that I obtain approval to do so. I also agree to notify my supervisor and the Safety Department should my license be suspended. Should I be directed to drive by a supervisor or management, I will remind them that I am not approved to drive a company vehicle.",
].join("\n\n");

export const PRODUCERS_MVR_FORM_SOURCE_ID = "z8DdbRny93Oi7TkWNQ3M";
export const PRODUCERS_MVR_POLICY_FIELD_ID = "policy-text";

export function isProducersMvrConsentForm(definition: {
  title?: string | null;
  name?: string | null;
  formKey?: string | null;
  sourceDocumentId?: string | null;
} | null): boolean {
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
