"use client";

import { configureApiClient, registerForgeBrowserCleanup } from "@forge/web-kit";
import { purgeFieldForgeBrowserState } from "@/lib/forge-browser-purge";

const allowDevPrincipal = process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";

configureApiClient({
  // Empty NEXT_PUBLIC_API_URL → same-origin `/api` (CF proxy / Next rewrite).
  baseUrl:
    process.env.NEXT_PUBLIC_API_URL !== undefined
      ? process.env.NEXT_PUBLIC_API_URL
      : "http://localhost:4000",
  ...(allowDevPrincipal && process.env.NEXT_PUBLIC_DEV_PRINCIPAL
    ? { devPrincipalEnv: process.env.NEXT_PUBLIC_DEV_PRINCIPAL }
    : {}),
});

// RG-09: wipe Forge-owned field offline/IDB/cache state on logout and tenant switch.
registerForgeBrowserCleanup((reason) => purgeFieldForgeBrowserState(reason));

export function ApiBootstrap({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
