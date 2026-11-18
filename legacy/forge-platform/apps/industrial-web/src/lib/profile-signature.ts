/**
 * Whether a form signature pad should offer "Use my signature" from the
 * signed-in user's profile (linked personnel signatureUrl).
 */
export function canImportProfileSignature(
  profileSignature: string | null | undefined,
  currentValue: string,
): boolean {
  const src = (profileSignature ?? "").trim();
  if (src === "") return false;
  return src !== currentValue.trim();
}
