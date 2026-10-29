/**
 * Left-nav logos follow the selected tenant and active light/dark theme.
 * Settings branding assets win when present; known pilots keep bundled
 * light/dark fallbacks so the switcher still works without uploads.
 */

import { pickThemeLogoUrl } from "@forge/contracts";
import { sameOriginBrandingLogoUrl } from "@/lib/branding-logo-url";

export type TenantNavLogo = {
  src: string;
  label: string;
};

type BundledMark = {
  test: RegExp;
  srcLight: string;
  srcDark?: string;
  label: string;
};

const BUNDLED: ReadonlyArray<BundledMark> = [
  {
    test: /producers[-_\s]?rice/i,
    srcLight: "/branding/producers-rice-mill.png",
    srcDark: "/branding/producers-rice-mill-dark.png",
    label: "Producers Rice Mill",
  },
  {
    test: /forge[-_\s]?(platform|industrial)/i,
    srcLight: "/branding/forge-industrial-safety.png",
    srcDark: "/branding/forge-industrial-safety.png",
    label: "Forge Industrial Safety",
  },
];

export function tenantNavHaystack(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
): string {
  return [slug, displayName].filter(Boolean).join(" ");
}

/** Bundled logo for a known tenant slug or display name (theme-aware). */
export function bundledNavLogoForTenant(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
  theme: "light" | "dark" = "light",
): TenantNavLogo | null {
  const hay = tenantNavHaystack(slug, displayName);
  if (!hay.trim()) return null;
  for (const row of BUNDLED) {
    if (!row.test.test(hay)) continue;
    const src = theme === "dark" ? row.srcDark?.trim() || row.srcLight : row.srcLight;
    return { src, label: row.label };
  }
  return null;
}

/**
 * Logo shown in the left nav for the active tenant.
 * Priority: Settings/config theme logos → theme-aware bundled mark.
 */
export function navLogoForTenant(opts: {
  slug?: string | null | undefined;
  displayName?: string | null | undefined;
  theme?: "light" | "dark";
  logoLightUrl?: string | null | undefined;
  logoDarkUrl?: string | null | undefined;
  brandingLogoUrl?: string | null | undefined;
}): TenantNavLogo | null {
  const theme = opts.theme === "dark" ? "dark" : "light";
  const branded = pickThemeLogoUrl({
    theme,
    logoLightUrl: sameOriginBrandingLogoUrl(opts.logoLightUrl) || null,
    logoDarkUrl: sameOriginBrandingLogoUrl(opts.logoDarkUrl) || null,
    fallbackUrl: sameOriginBrandingLogoUrl(opts.brandingLogoUrl) || null,
  });
  if (branded) {
    return { src: branded, label: opts.displayName?.trim() || "Logo" };
  }
  return bundledNavLogoForTenant(opts.slug, opts.displayName, theme);
}
