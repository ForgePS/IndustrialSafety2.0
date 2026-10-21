/** Allowed reprint reasons — keep in sync with `reprintJobInputSchema` in @forge/contracts. */
export const PRINT_REPRINT_REASONS = [
  "Damaged Label",
  "Lost Label",
  "Unreadable Label",
  "Incorrect Placement",
  "Replacement",
  "Printer Issue",
  "Other",
] as const;

export type PrintReprintReason = (typeof PRINT_REPRINT_REASONS)[number];

/**
 * Prompt for a tracked reprint reason. Returns null if the user cancels
 * or enters a value that is not in the allowed set.
 */
export function promptReprintReason(): PrintReprintReason | null {
  const list = PRINT_REPRINT_REASONS.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const raw = window.prompt(
    `Reprint reason (enter number or exact text):\n${list}`,
    "1",
  );
  if (raw == null) return null;
  const trimmed = raw.trim();
  const byIndex = Number.parseInt(trimmed, 10);
  if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= PRINT_REPRINT_REASONS.length) {
    return PRINT_REPRINT_REASONS[byIndex - 1]!;
  }
  const match = PRINT_REPRINT_REASONS.find((r) => r.toLowerCase() === trimmed.toLowerCase());
  return match ?? null;
}

/**
 * Prompt for reprint copy count (1–100). Returns null if cancelled.
 * Empty / invalid input defaults to `fallback`.
 */
export function promptReprintCopies(fallback = 1): number | null {
  const raw = window.prompt("Number of copies to reprint (1–100):", String(fallback));
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return Math.min(100, Math.max(1, Math.round(fallback) || 1));
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return Math.min(100, Math.max(1, Math.round(fallback) || 1));
  return Math.min(100, Math.max(1, Math.round(n)));
}
