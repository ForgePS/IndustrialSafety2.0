export const SENSITIVE_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "SENSITIVE",
  "HIGHLY_SENSITIVE",
  "SECRET",
  "CREDENTIAL",
  "GOVERNMENT_IDENTIFIER",
  "FINANCIAL",
  "HEALTH",
  "BIOMETRIC",
  "PERSONALLY_IDENTIFIABLE",
] as const;
export type SensitiveClassification = (typeof SENSITIVE_CLASSIFICATIONS)[number];

/** Never returned in full, even with import.sensitive. */
export const NEVER_UNMASK: ReadonlySet<SensitiveClassification> = new Set(["SECRET", "CREDENTIAL"]);

export type MaskingPolicy = {
  allowUnmask: boolean;
  fieldRules?: Record<string, SensitiveClassification>;
};

export type MaskingContext = {
  policy: MaskingPolicy;
  path?: string[];
};

const NAME_HINTS: Array<{ pattern: RegExp; classification: SensitiveClassification }> = [
  { pattern: /(ssn|social.?security)/i, classification: "GOVERNMENT_IDENTIFIER" },
  {
    pattern: /(password|passwd|secret|api.?key|access.?token|refresh.?token)/i,
    classification: "CREDENTIAL",
  },
  { pattern: /(dob|date.?of.?birth|birth.?date)/i, classification: "PERSONALLY_IDENTIFIABLE" },
  { pattern: /(email)/i, classification: "PERSONALLY_IDENTIFIABLE" },
  { pattern: /(phone|mobile|tel)/i, classification: "PERSONALLY_IDENTIFIABLE" },
  { pattern: /(bank|account.?number|routing|iban|card.?number)/i, classification: "FINANCIAL" },
  { pattern: /(license|dl.?number|driver)/i, classification: "GOVERNMENT_IDENTIFIER" },
  { pattern: /(fema.?sid|sid)/i, classification: "GOVERNMENT_IDENTIFIER" },
  { pattern: /(address|street|zip.?code)/i, classification: "PERSONALLY_IDENTIFIABLE" },
  { pattern: /(medical|diagnosis|health)/i, classification: "HEALTH" },
];

export function classifyFieldName(
  fieldName: string,
  rules?: Record<string, SensitiveClassification>,
): SensitiveClassification {
  const key = fieldName.toLowerCase();
  if (rules?.[fieldName]) return rules[fieldName]!;
  if (rules?.[key]) return rules[key]!;
  for (const hint of NAME_HINTS) {
    if (hint.pattern.test(fieldName)) return hint.classification;
  }
  return "INTERNAL";
}

export function requiresMasking(classification: SensitiveClassification): boolean {
  return (
    classification !== "PUBLIC" &&
    classification !== "INTERNAL" &&
    classification !== "CONFIDENTIAL"
  );
}

export function maskValue(
  value: unknown,
  classification: SensitiveClassification,
  policy: MaskingPolicy,
): unknown {
  if (value == null) return value;
  if (!requiresMasking(classification) && !NEVER_UNMASK.has(classification)) {
    return value;
  }
  if (policy.allowUnmask && !NEVER_UNMASK.has(classification)) {
    return value;
  }
  if (typeof value !== "string") {
    return "[REDACTED]";
  }
  switch (classification) {
    case "GOVERNMENT_IDENTIFIER": {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return `***-**-${digits.slice(-4)}`;
      return "[REDACTED]";
    }
    case "PERSONALLY_IDENTIFIABLE": {
      if (value.includes("@")) {
        const [user, domain] = value.split("@");
        const initial = user?.[0] ?? "*";
        return `${initial}***@${domain ?? "example.com"}`;
      }
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return `(***) ***-${digits.slice(-4)}`;
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return `****-**-${value.slice(-2)}`;
      return "[REDACTED]";
    }
    case "FINANCIAL": {
      const digits = value.replace(/\D/g, "");
      if (digits.length >= 4) return `********${digits.slice(-4)}`;
      return "[REDACTED]";
    }
    case "CREDENTIAL":
    case "SECRET":
      return "********";
    default:
      return "[REDACTED]";
  }
}

export function sanitizeObject(value: unknown, context: MaskingContext): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeObject(item, {
        ...context,
        path: [...(context.path ?? []), String(index)],
      }),
    );
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const classification = classifyFieldName(key, context.policy.fieldRules);
      if (requiresMasking(classification) || NEVER_UNMASK.has(classification)) {
        out[key] = maskValue(child, classification, context.policy);
      } else if (child && typeof child === "object") {
        out[key] = sanitizeObject(child, {
          ...context,
          path: [...(context.path ?? []), key],
        });
      } else {
        out[key] = child;
      }
    }
    return out;
  }
  return value;
}

export interface ImportSensitiveDataMasker {
  classifyField(
    fieldName: string,
    rules?: Record<string, SensitiveClassification>,
  ): SensitiveClassification;
  maskValue(
    value: unknown,
    classification: SensitiveClassification,
    policy: MaskingPolicy,
  ): unknown;
  sanitizeObject(value: unknown, context: MaskingContext): unknown;
}

export const defaultImportSensitiveDataMasker: ImportSensitiveDataMasker = {
  classifyField: classifyFieldName,
  maskValue,
  sanitizeObject,
};

const LOG_REDACT_KEYS =
  /password|token|secret|authorization|cookie|ssn|presigned|raw_json|mapped_json|api.?key/i;

export function redactLogFields(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (LOG_REDACT_KEYS.test(key)) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactLogFields(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}
