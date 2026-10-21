function normalizePath(path: string | null | undefined): string {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

/**
 * Routes that must render without Forge Cognito sign-in (employee portal, public scan, etc.).
 */
export function isPublicAppRoute(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  if (path === "/health") return true;
  if (path.startsWith("/auth/callback")) return true;
  if (path.startsWith("/auth/forgot-password")) return true;
  if (path.startsWith("/auth/reset-password")) return true;
  if (path.startsWith("/closeout")) return true;
  if (path.startsWith("/observation-followup")) return true;
  if (path.startsWith("/dvir")) return true;
  if (path.startsWith("/training")) return true;
  if (path.startsWith("/scan")) return true;
  if (path.startsWith("/walkthrough")) return true;
  if (path.startsWith("/w/")) return true;
  if (path.startsWith("/safety-supplies/request")) return true;
  return false;
}
