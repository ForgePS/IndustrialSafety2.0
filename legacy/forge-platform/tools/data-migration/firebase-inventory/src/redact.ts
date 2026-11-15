/** Redact customer PII from sample/report values. */

const SENSITIVE_KEY =
  /(email|phone|ssn|social|password|token|secret|address|dob|birth|medical|license|name|first|last|display)/i;

export function isSensitiveFieldName(field: string): boolean {
  return SENSITIVE_KEY.test(field);
}

export function redactValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isSensitiveFieldName(field)) {
    if (typeof value === "string") return value.length ? "[REDACTED]" : "";
    if (typeof value === "number") return 0;
    if (Array.isArray(value)) return ["[REDACTED]"];
    if (typeof value === "object") return { redacted: true };
    return "[REDACTED]";
  }
  if (typeof value === "string" && value.includes("@") && value.includes(".")) {
    return "[REDACTED_EMAIL]";
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((v, i) => redactValue(String(i), v));
  }
  return value;
}
