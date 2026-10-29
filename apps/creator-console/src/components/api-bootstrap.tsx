"use client";

import { configureApiClient, getApiBaseUrl } from "@forge/web-kit";

const allowDevPrincipal = process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";
// Empty string is valid: same-origin relative `/api/...` via CloudFront proxy.
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (configuredApiUrl === undefined) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is required. Set it for local development or resolve it via sync-static-site for deployed builds (empty string = same-origin /api proxy).",
  );
}

const apiBaseUrl: string = configuredApiUrl;

// Configure synchronously at module load so AuthProvider's first /auth/me
// call does not race against a useEffect and hit an unconfigured client.
// Production contamination checks live in scripts/sync-static-site.mjs (build-time).
configureApiClient({
  baseUrl: apiBaseUrl,
  ...(allowDevPrincipal && process.env.NEXT_PUBLIC_DEV_PRINCIPAL
    ? { devPrincipalEnv: process.env.NEXT_PUBLIC_DEV_PRINCIPAL }
    : {}),
});

export function ApiBootstrap({ children }: { children: React.ReactNode }) {
  // Re-assert at render time in case another client module reset the default.
  if (getApiBaseUrl() !== apiBaseUrl) {
    configureApiClient({ baseUrl: apiBaseUrl });
  }
  return <>{children}</>;
}
