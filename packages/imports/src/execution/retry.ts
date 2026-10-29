import type { FailureClass } from "./adapter.js";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  jitterRatio: 0.2,
};

export function shouldRetryFailure(
  failureClass: FailureClass,
  attempt: number,
  policy = DEFAULT_RETRY_POLICY,
): boolean {
  if (failureClass !== "RETRIABLE") return false;
  return attempt < policy.maxAttempts;
}

export function computeExecutionRetryDelayMs(
  attempt: number,
  policy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exp * policy.jitterRatio * random();
  return Math.min(policy.maxDelayMs, Math.floor(exp + jitter));
}

export function classifyErrorMessage(message: string): FailureClass {
  const lower = message.toLowerCase();
  if (
    lower.includes("timeout") ||
    lower.includes("throttl") ||
    lower.includes("temporarily") ||
    lower.includes("econnreset") ||
    lower.includes("connection")
  ) {
    return "RETRIABLE";
  }
  if (
    lower.includes("tenant") ||
    lower.includes("rls") ||
    lower.includes("unauthorized") ||
    lower.includes("tamper")
  ) {
    return "SECURITY_FAILURE";
  }
  if (lower.includes("adapter") || lower.includes("mapping") || lower.includes("corrupt")) {
    return "NON_RETRIABLE_JOB";
  }
  return "NON_RETRIABLE_ROW";
}
