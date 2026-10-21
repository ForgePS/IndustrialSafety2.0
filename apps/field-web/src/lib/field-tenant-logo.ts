import { FIELD_PRODUCT_LOGO_SRC } from "@/lib/brand";

export type FieldTenantLogo = {
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
];

function tenantHaystack(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
): string {
  return [slug, displayName].filter(Boolean).join(" ");
}

export function bundledFieldTenantLogo(
  slug?: string | null | undefined,
  displayName?: string | null | undefined,
  theme: "light" | "dark" = "dark",
): FieldTenantLogo | null {
  const hay = tenantHaystack(slug, displayName);
  if (!hay.trim()) return null;
  for (const row of BUNDLED) {
    if (!row.test.test(hay)) continue;
    const src = theme === "dark" ? row.srcDark?.trim() || row.srcLight : row.srcLight;
    return { src, label: row.label };
  }
  return null;
}

export function isGenericTenantLogo(src: string | null | undefined): boolean {
  const value = src?.trim() ?? "";
  if (!value) return true;
  if (value === "/icons/icon.svg" || value === FIELD_PRODUCT_LOGO_SRC) return true;
  // Field uses the product mark for Forge tenants — avoid a second Forge logo.
  if (/forge-industrial-safety|forge-platform\.svg|\/branding\/forge/i.test(value)) return true;
  return false;
}

/**
 * Company logo for the active tenant.
 * Field chrome is dark — prefer Settings dark logo, then bundled dark marks,
 * then light/fallback URLs.
 */
export function fieldTenantLogoFor(opts: {
  slug?: string | null | undefined;
  displayName?: string | null | undefined;
  theme?: "light" | "dark";
  logoLightUrl?: string | null | undefined;
  logoDarkUrl?: string | null | undefined;
  brandingLogoUrl?: string | null | undefined;
}): FieldTenantLogo | null {
  const theme = opts.theme === "light" ? "light" : "dark";
  const label = opts.displayName?.trim() || "Company";

  const darkUploaded = opts.logoDarkUrl?.trim() || "";
  if (theme === "dark" && darkUploaded && !isGenericTenantLogo(darkUploaded)) {
    return { src: darkUploaded, label };
  }

  const bundled = bundledFieldTenantLogo(opts.slug, opts.displayName, theme);
  if (bundled) return bundled;

  const light =
    opts.logoLightUrl?.trim() ||
    opts.brandingLogoUrl?.trim() ||
    "";
  if (light && !isGenericTenantLogo(light)) {
    return { src: light, label };
  }

  return null;
}
