import { ApiError } from "@forge/web-kit";

/** Surface API codes when the platform returns a generic internal message. */
export function formatApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  const message = err.message.trim();
  if (message && message !== "An unexpected error occurred.") {
    return message;
  }
  const parts = [fallback];
  if (err.code) parts.push(`(${err.code})`);
  if (err.status) parts.push(`[HTTP ${err.status}]`);
  return parts.join(" ");
}
