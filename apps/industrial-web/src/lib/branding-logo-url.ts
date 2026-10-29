/**
 * Prefer same-origin /branding/… paths so vanity hosts do not load logos from a
 * stale absolute host after the industrialsafety cutover.
 */
export function sameOriginBrandingLogoUrl(url: string | undefined | null): string {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/branding/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith("/branding/")) return parsed.pathname;
  } catch {
    // not an absolute URL
  }
  const legacy = trimmed.match(/^https?:\/\/[^/]+(\/branding\/[^?#]+)/i);
  if (legacy?.[1]) return legacy[1];
  return trimmed;
}
