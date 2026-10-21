"use client";

import { useMemo } from "react";
import { useAuth } from "@forge/web-kit";
import { useTenantBranding } from "@/hooks/use-tenant-branding";
import { navLogoForTenant } from "@/lib/tenant-nav-logo";

function absoluteAssetUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  if (typeof window === "undefined") return src;
  return new URL(src, window.location.origin).href;
}

export function FleetPrintHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { me } = useAuth();
  const { logoUrl, appShortName } = useTenantBranding();

  const activeTenant = useMemo(() => {
    if (!me) return null;
    const selectable = me.tenants?.filter((t) => t.selectable) ?? [];
    return (
      selectable.find((t) => t.tenantId === me.tenantId) ??
      me.tenants?.find((t) => t.tenantId === me.tenantId) ??
      null
    );
  }, [me]);

  const tenantLabel = activeTenant?.displayName?.trim() || appShortName;
  const navLogo = navLogoForTenant({
    slug: activeTenant?.slug,
    displayName: tenantLabel,
    brandingLogoUrl: logoUrl,
  });
  const logoSrc = navLogo?.src ? absoluteAssetUrl(navLogo.src) : "";
  const logoAlt = navLogo?.label || tenantLabel;

  return (
    <header className="fleet-print-header">
      <div className="fleet-print-header__brand">
        {logoSrc ? (
          <img src={logoSrc} alt={logoAlt} className="fleet-print-header__logo" />
        ) : (
          <span className="fleet-print-header__name">{tenantLabel}</span>
        )}
      </div>
      <div className="fleet-print-header__meta">
        <h2 className="fleet-print-header__title">{title}</h2>
        {subtitle ? <p className="fleet-print-header__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}
