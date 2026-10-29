function normalizePath(path: string | null | undefined): string {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

/**
 * Routes that must render without Cognito employee login
 * (public QR stickers, auth callbacks, etc.).
 */
export function isPublicAppRoute(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  if (path.startsWith("/auth/callback")) return true;
  if (path.startsWith("/auth/forgot-password")) return true;
  if (path.startsWith("/auth/reset-password")) return true;
  // LOTO (and other) public QR stickers open without employee login.
  if (path.startsWith("/scan")) return true;
  return false;
}
