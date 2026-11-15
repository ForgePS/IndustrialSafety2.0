import type { SafeApiError } from "./types.js";

export function formatImportError(error: unknown): SafeApiError {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string;
      status?: number;
      correlationId?: string;
      body?: { error?: { message?: string; code?: string; correlationId?: string } };
    };
    const bodyErr = e.body?.error;
    return {
      message: bodyErr?.message ?? e.message ?? "Request failed",
      ...(bodyErr?.code || e.code ? { code: bodyErr?.code ?? e.code } : {}),
      ...(bodyErr?.correlationId || e.correlationId
        ? { correlationId: bodyErr?.correlationId ?? e.correlationId }
        : {}),
      ...(e.status != null ? { status: e.status } : {}),
    };
  }
  return { message: error instanceof Error ? error.message : "Request failed" };
}

/** Never include secrets, paths, or import values in UI error copy. */
export function isUnsafeErrorText(text: string): boolean {
  return /password|token|secret|s3:\/\//i.test(text) || /\/tenants\//i.test(text);
}

export function sanitizeErrorMessage(message: string): string {
  if (isUnsafeErrorText(message)) {
    return "A secure operation failed. Contact support with the correlation ID.";
  }
  return message;
}
