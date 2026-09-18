/**
 * Bundled login branding for vanity hosts when the public API is unavailable
 * or tenant Configuration Studio branding has not been published yet.
 *
 * tenantId here is client-bundled for post-auth tenant preference only — the
 * public login-branding API must not return tenant UUIDs (FIS-L01).
 */

export type VanityLoginBranding = {
  /** Bundled tenant preference for post-auth switch; not from the public API. */
  tenantId: string;
  login: {
    logoUrl: string;
    logoDarkUrl?: string;
    brandLabel: string;
    headline: string;
    body: string;
    statusText: string;
    buttonLabel: string;
  };
};

const PRODUCERS_PRODUCTION_TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const PRODUCERS_LOGO = "/branding/producers-rice-mill.png";
const PRODUCERS_LOGO_DARK = "/branding/producers-rice-mill-dark.png";

const PRODUCERS_LOGIN: VanityLoginBranding["login"] = {
  logoUrl: PRODUCERS_LOGO,
  logoDarkUrl: PRODUCERS_LOGO_DARK,
  brandLabel: "Producers Rice Mill",
  headline: "Welcome to Producers Rice Mill",
  body: "Sign in is required to continue.",
  statusText: "",
  buttonLabel: "Sign in",
};

/** Hostname → bundled branding (lowercase, no port). */
const VANITY_HOSTS: Readonly<Record<string, VanityLoginBranding>> = {
  "producersrice.forgepublicsafety.com": {
    tenantId: PRODUCERS_PRODUCTION_TENANT_ID,
    login: PRODUCERS_LOGIN,
  },
  // Legacy alias: CF 301s to producersrice (FIS-L02); keep map for pre-redirect caches.
  "producers-rice-mill.forgepublicsafety.com": {
    tenantId: PRODUCERS_PRODUCTION_TENANT_ID,
    login: PRODUCERS_LOGIN,
  },
};

export function vanityLoginBrandingForHost(
  rawHost: string | undefined | null,
): VanityLoginBranding | null {
  const host = rawHost?.trim().toLowerCase();
  if (!host) return null;
  return VANITY_HOSTS[host] ?? null;
}
