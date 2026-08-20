/**
 * Bundled login branding for vanity hosts when the public API is unavailable
 * or tenant Configuration Studio branding has not been published yet.
 */

export type VanityLoginBranding = {
  tenantId: string;
  login: {
    logoUrl: string;
    brandLabel: string;
    headline: string;
    body: string;
    statusText: string;
    buttonLabel: string;
  };
};

const PRODUCERS_PRODUCTION_TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";
const PRODUCERS_LOGO = "/branding/producers-rice-mill.png";

const PRODUCERS_LOGIN: VanityLoginBranding["login"] = {
  logoUrl: PRODUCERS_LOGO,
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
