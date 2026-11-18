import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|ssn|social_security|fema_sid|driver_license|bank_account|routing_number|medical|apikey|api_key|apiKey|signingSecret|rawKey)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function redactSensitive<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(nested, seen);
  }
  return output;
}

export function safeSerializeError(
  error: unknown,
  options: { includeStack?: boolean } = {},
): Record<string, unknown> {
  if (typeof error === "string") {
    return redactSensitive({ message: error });
  }
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (options.includeStack) {
      payload.stack = error.stack;
    }
    return redactSensitive(payload);
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return redactSensitive({ message });
    }
  }
  return { message: "Unknown error" };
}

export function createCorrelationId(): string {
  return randomBytes(16).toString("hex");
}

export function createSecureId(prefix = "id"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    const digest = createHash("sha256").update(left).digest();
    timingSafeEqual(digest, digest);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  return (
    base
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "file"
  );
}

const DEFAULT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
  "application/json",
]);

export function isAllowedMimeType(
  mimeType: string,
  allowList: ReadonlySet<string> = DEFAULT_ALLOWED_MIME,
): boolean {
  return allowList.has(mimeType.toLowerCase());
}

/** Opaque secret hash (API keys, invitation tokens). Never log the input. */
export function hashOpaqueSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type GeneratedApiKey = {
  /** Full secret — return to caller once; never persist or log. */
  rawKey: string;
  prefix: string;
  /** Short UI hint (non-secret), e.g. forge_live_ab12… */
  displayHint: string;
  keyHash: string;
};

/**
 * Server-generated API key. Persist only `keyHash` (+ prefix/hint metadata).
 */
export function generateApiKey(options: { prefix?: string } = {}): GeneratedApiKey {
  const prefix = options.prefix ?? "forge_live_";
  const body = randomBytes(24).toString("base64url");
  const rawKey = `${prefix}${body}`;
  const displayHint = `${prefix}${body.slice(0, 8)}…`;
  return {
    rawKey,
    prefix,
    displayHint,
    keyHash: hashOpaqueSecret(rawKey),
  };
}

export function generateWebhookSigningSecret(prefix = "whsec_"): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/** Outbound webhook signature header value: `sha256=<hex>`. */
export function signWebhookPayload(payload: string | Buffer, secret: string): string {
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = signWebhookPayload(payload, secret);
  return constantTimeEqual(expected, signatureHeader.trim());
}
