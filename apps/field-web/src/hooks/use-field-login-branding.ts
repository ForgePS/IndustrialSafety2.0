"use client";

import { useEffect, useState } from "react";

export type FieldLoginBranding = {
  logoUrl: string;
  brandLabel: string;
  tenantDisplayName: string;
  employeeNumberPrefix: string;
  primaryColor: string;
  /**
   * Bundled host→tenant preference for post-auth switch.
   * Not sourced from the public login-branding API (FIS-L01).
   */
  hostTenantId: string | null;
};

const DEFAULT: FieldLoginBranding = {
  logoUrl: "/icons/icon.svg",
  brandLabel: "Forge Industrial Safety",
  tenantDisplayName: "",
  employeeNumberPrefix: "EMP-",
  primaryColor: "#e8b84a",
  hostTenantId: null,
};

/** Public API shape — no tenantId (FIS-L01). */
type PublicLoginBrandingResponse = {
  host: string;
  displayName?: string;
  brandLabel?: string;
  logoUrl?: string;
  primaryColor?: string;
  login?: {
    logoUrl?: string;
    brandLabel?: string;
  };
};

/** Client-bundled vanity host → tenant (mirrors industrial vanity map). */
const BUNDLED_HOST_TENANT: Readonly<Record<string, string>> = {
  "producersrice.forgepublicsafety.com": "019ff7d0-c20f-7659-81e4-c0cd68e23262",
  "producers-rice-mill.forgepublicsafety.com": "019ff7d0-c20f-7659-81e4-c0cd68e23262",
};

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

/**
 * Pre-auth host branding for Field. Reuses public login-branding API.
 * Employee-number prefix comes from tenant config later; defaults to EMP-.
 */
export function useFieldLoginBranding() {
  const [branding, setBranding] = useState<FieldLoginBranding>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const host = window.location.hostname.toLowerCase();
    const bundledTenantId = BUNDLED_HOST_TENANT[host] ?? null;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiBase()}/api/v1/public/login-branding?host=${encodeURIComponent(host)}`,
          { credentials: "omit" },
        );
        if (!res.ok) {
          if (!cancelled && bundledTenantId) {
            setBranding((prev) => ({ ...prev, hostTenantId: bundledTenantId }));
          }
          return;
        }
        const json = (await res.json()) as { data?: PublicLoginBrandingResponse };
        const data = json.data;
        if (!data || cancelled) return;
        setBranding({
          logoUrl: data.login?.logoUrl?.trim() || data.logoUrl?.trim() || DEFAULT.logoUrl,
          brandLabel:
            data.login?.brandLabel?.trim() ||
            data.brandLabel?.trim() ||
            data.displayName?.trim() ||
            DEFAULT.brandLabel,
          tenantDisplayName:
            data.displayName?.trim() ||
            data.login?.brandLabel?.trim() ||
            data.brandLabel?.trim() ||
            "",
          employeeNumberPrefix: "EMP-",
          primaryColor: data.primaryColor?.trim() || DEFAULT.primaryColor,
          hostTenantId: bundledTenantId,
        });
      } catch {
        if (!cancelled && bundledTenantId) {
          setBranding((prev) => ({ ...prev, hostTenantId: bundledTenantId }));
        }
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return { branding, loading };
}
