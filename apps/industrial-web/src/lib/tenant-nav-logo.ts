/**
 * Left-nav logos follow the selected tenant. Known pilots ship a bundled
 * asset so switching Tenant always swaps the brand even before Configuration
 * Studio has a published logoUrl.
 */

export type TenantNavLogo = {
  src: string;
  label: string;
};

const BUNDLED: ReadonlyArray<{ test: RegExp; src: string; label: string }> = [
  {
    test: /producers[-_\s]?rice/i,
    src: "/branding/producers-rice-mill.png",
    label: "Producers Rice Mill",
  },
  {
    test: /forge[-_\s]?platform/i,
    src: "/branding/forge-platform.svg",
    label: "Forge",
  },
];

export function tenantNavHaystack(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
): string {
  return [slug, displayName].filter(Boolean).join(" ");
}

/** Bundled logo for a known tenant slug or display name. */
export function bundledNavLogoForTenant(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
): TenantNavLogo | null {
  const hay = tenantNavHaystack(slug, displayName);
  if (!hay.trim()) return null;
  for (const row of BUNDLED) {
    if (row.test.test(hay)) return { src: row.src, label: row.label };
  }
  return null;
}

/**
 * Logo shown in the left nav for the active tenant.
 * Bundled tenant marks win so the switcher is deterministic; published
 * branding.logoUrl is the fallback for every other customer.
 */
export function navLogoForTenant(opts: {
  slug?: string | null | undefined;
  displayName?: string | null | undefined;
  brandingLogoUrl?: string | null | undefined;
}): TenantNavLogo | null {
  const bundled = bundledNavLogoForTenant(opts.slug, opts.displayName);
  if (bundled) return bundled;
  const branded = opts.brandingLogoUrl?.trim();
  if (branded) {
    return { src: branded, label: opts.displayName?.trim() || "Logo" };
  }
  return null;
}
