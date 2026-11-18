"use client";

import { navLogoForTenant } from "@/lib/tenant-nav-logo";

function absoluteAssetUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  if (typeof window === "undefined") return src;
  return new URL(src, window.location.origin).href;
}

export function TenantBrandHeader({
  tenantKey,
  companyName,
  logoUrl,
  title,
  subtitle,
}: {
  tenantKey?: string | null | undefined;
  companyName?: string | null | undefined;
  logoUrl?: string | null | undefined;
  title: string;
  subtitle?: string;
}) {
  const navLogo = navLogoForTenant({
    slug: tenantKey,
    displayName: companyName,
    brandingLogoUrl: logoUrl,
  });
  const logoSrc = navLogo?.src ? absoluteAssetUrl(navLogo.src) : "";
  const logoAlt = navLogo?.label || companyName?.trim() || "Company";

  return (
    <header className="fleet-print-header">
      <div className="fleet-print-header__brand">
        {logoSrc ? (
          <img src={logoSrc} alt={logoAlt} className="fleet-print-header__logo" />
        ) : companyName?.trim() ? (
          <span className="fleet-print-header__name">{companyName.trim()}</span>
        ) : null}
      </div>
      <div className="fleet-print-header__meta">
        <h1 className="fleet-print-header__title">{title}</h1>
        {subtitle ? <p className="fleet-print-header__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}
