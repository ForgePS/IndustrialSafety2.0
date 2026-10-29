/** Display helper: EMPLOYEE / DRIVER / MEMBER names always render in ALL CAPS. */
export function personNameDisplay(value: string | null | undefined, fallback = ""): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.toLocaleUpperCase("en-US");
}
