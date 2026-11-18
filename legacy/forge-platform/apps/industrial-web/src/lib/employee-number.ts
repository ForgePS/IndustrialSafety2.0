export const EMPLOYEE_NUMBER_PREFIX = "EMP-";

/** Canonical EMP-#### form stored on personnel records. */
export function canonicalEmployeeNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const withoutPrefix = upper.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(withoutPrefix)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${String(Number(withoutPrefix))}`;
  }
  if (/^EMP[-_\s]*/i.test(upper)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${withoutPrefix}`;
  }
  if (/^\d+$/.test(upper)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${String(Number(upper))}`;
  }
  return upper;
}

/** Digits-only value for onboarding inputs (prefix shown separately). */
export function employeeNumberDigitsForInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.toUpperCase().replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(withoutPrefix)) return String(Number(withoutPrefix));
  return withoutPrefix.replace(/\D/g, "");
}

export function sanitizeEmployeeNumberDigitsInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12);
}

export function formatEmployeeNumberFromDigits(digits: string): string {
  const cleaned = sanitizeEmployeeNumberDigitsInput(digits);
  if (!cleaned) return "";
  return canonicalEmployeeNumber(cleaned);
}
