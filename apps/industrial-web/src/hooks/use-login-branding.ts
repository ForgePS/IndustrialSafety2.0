"use client";

import { useEffect, useState } from "react";
import { pickThemeLogoUrl } from "@forge/contracts";
import { useAuth } from "@forge/web-kit";
import { useIndustrialThemeMode } from "@/components/theme-mode-toggle";
import { vanityLoginBrandingForHost } from "@/lib/vanity-login-branding";
import { useTenantBranding, type TenantBranding } from "./use-tenant-branding";

export type ResolvedLoginBranding = {
  logoUrl: string;
  brandLabel: string;
  headline: string;
  body: string;
  statusText: string;
  buttonLabel: string;
};

const DEFAULT_LOGIN: ResolvedLoginBranding = {
  brandLabel: "Forge Industrial Safety",
  headline: "Welcome to Forge Industrial Safety",
  body: "Sign in is required to continue.",
  statusText: "Unauthenticated",
  buttonLabel: "Sign in",
  logoUrl: "/branding/forge-industrial-safety.png",
};

function resolveLoginBranding(
  branding: TenantBranding | null | undefined,
  theme: "light" | "dark",
): ResolvedLoginBranding {
  const login = branding?.login;
  const product = branding?.productDisplayName?.trim();
  const legacyHeadline = product ? `Welcome to ${product}` : DEFAULT_LOGIN.headline;
  const logoUrl = pickThemeLogoUrl({
    theme,
    ...(login?.logoUrl || branding?.logoUrl
      ? { logoLightUrl: login?.logoUrl || branding?.logoUrl || null }
      : {}),
    ...(login?.logoDarkUrl || branding?.logoDarkUrl
      ? { logoDarkUrl: login?.logoDarkUrl || branding?.logoDarkUrl || null }
      : {}),
    fallbackUrl: DEFAULT_LOGIN.logoUrl,
  });
  return {
    logoUrl,
    brandLabel:
      login?.brandLabel?.trim() || branding?.loginShortName?.trim() || DEFAULT_LOGIN.brandLabel,
    headline: login?.headline?.trim() || legacyHeadline,
    body: login?.body?.trim() || DEFAULT_LOGIN.body,
    statusText: login?.statusText?.trim() || DEFAULT_LOGIN.statusText,
    buttonLabel: login?.buttonLabel?.trim() || DEFAULT_LOGIN.buttonLabel,
  };
}

/** Public API shape — no tenantId (FIS-L01). */
type PublicLoginBrandingResponse = {
  host: string;
  displayName?: string;
  brandLabel?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  primaryColor?: string;
  login: ResolvedLoginBranding & { logoDarkUrl?: string };
};

type ApiEnvelope<T> = { data: T };

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

/**
 * Sign-in / gate branding: host lookup pre-auth, authenticated tenant branding post-auth.
 * hostTenantId comes from bundled vanity maps only (not the public API) so vanity hosts
 * can prefer that tenant after Cognito sign-in without disclosing UUIDs pre-auth.
 */
export function useLoginBranding() {
  const { me } = useAuth();
  const themeMode = useIndustrialThemeMode();
  const tenant = useTenantBranding();
  const [hostLogin, setHostLogin] = useState<
    (ResolvedLoginBranding & { logoDarkUrl?: string }) | null
  >(null);
  const [hostPrimaryColor, setHostPrimaryColor] = useState("");
  const [hostTenantId, setHostTenantId] = useState<string | null>(null);
  const [loadingHost, setLoadingHost] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const host = window.location.hostname;
    const bundled = vanityLoginBrandingForHost(host);
    // Prefer bundled tenant id for post-auth switch; never read tenantId from public API.
    if (bundled?.tenantId) {
      setHostTenantId(bundled.tenantId);
    }
    void (async () => {
      setLoadingHost(true);
      try {
        const res = await fetch(
          `${apiBase()}/api/v1/public/login-branding?host=${encodeURIComponent(host)}`,
          { credentials: "omit" },
        );
        if (!res.ok) {
          if (!cancelled) {
            if (bundled) {
              setHostLogin(bundled.login);
              setHostPrimaryColor("");
            } else {
              setHostLogin(null);
              setHostTenantId(null);
              setHostPrimaryColor("");
            }
          }
          return;
        }
        const json = (await res.json()) as ApiEnvelope<PublicLoginBrandingResponse>;
        if (cancelled) return;
        setHostLogin({
          ...json.data.login,
          ...(json.data.logoDarkUrl ? { logoDarkUrl: json.data.logoDarkUrl } : {}),
        });
        setHostPrimaryColor(json.data.primaryColor?.trim() || "");
        if (!bundled?.tenantId) {
          setHostTenantId(null);
        }
      } catch {
        if (!cancelled) {
          if (bundled) {
            setHostLogin(bundled.login);
            setHostPrimaryColor("");
          } else {
            setHostLogin(null);
            setHostTenantId(null);
          }
        }
      } finally {
        if (!cancelled) setLoadingHost(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hostMismatch =
    Boolean(me?.tenantId) && Boolean(hostTenantId) && me?.tenantId !== hostTenantId;

  const login: ResolvedLoginBranding =
    me?.tenantId && !hostMismatch
      ? {
          ...resolveLoginBranding(tenant.branding, themeMode),
          logoUrl:
            tenant.logoUrl || resolveLoginBranding(tenant.branding, themeMode).logoUrl,
        }
      : hostLogin
        ? {
            ...hostLogin,
            logoUrl: pickThemeLogoUrl({
              theme: themeMode,
              logoLightUrl: hostLogin.logoUrl,
              logoDarkUrl: hostLogin.logoDarkUrl,
              fallbackUrl: hostLogin.logoUrl,
            }),
          }
        : resolveLoginBranding(undefined, themeMode);

  const primaryColor =
    me?.tenantId && !hostMismatch
      ? tenant.primaryColor
      : hostPrimaryColor || tenant.primaryColor;

  return {
    loading: me?.tenantId ? tenant.loading : loadingHost,
    loadingHost,
    hostTenantId,
    login,
    primaryColor,
    productDisplayName: tenant.productDisplayName,
    appShortName: tenant.appShortName,
    logoUrl: tenant.logoUrl,
    secondaryColor: tenant.secondaryColor,
    accentColor: tenant.accentColor,
  };
}
