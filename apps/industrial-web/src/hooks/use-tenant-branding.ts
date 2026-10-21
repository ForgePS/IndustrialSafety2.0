"use client";

import { useEffect, useState } from "react";
import { apiGet, useAuth } from "@forge/web-kit";
import { pickThemeLogoUrl } from "@forge/contracts";
import {
  useIndustrialThemeMode,
  type IndustrialThemeMode,
} from "@/components/theme-mode-toggle";
import { sameOriginBrandingLogoUrl } from "@/lib/branding-logo-url";

export type TenantBranding = {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  productDisplayName?: string;
  appShortName?: string;
  loginShortName?: string;
  login?: {
    logoUrl?: string;
    logoDarkUrl?: string;
    brandLabel?: string;
    headline?: string;
    body?: string;
    statusText?: string;
    buttonLabel?: string;
  };
  emailFromName?: string;
  emailFromAddress?: string;
  customCss?: string;
};

type EffectiveResponse = {
  payload: TenantBranding | null;
  source?: string;
};

type TenantBrandingAssetsRow = {
  logoDocumentId?: string | null;
  logoDarkDocumentId?: string | null;
  iconDocumentId?: string | null;
};

type BrandingAssetDownload = {
  downloadUrl: string;
};

export const DEFAULT_INDUSTRIAL_BRANDING: Required<
  Pick<TenantBranding, "productDisplayName" | "appShortName" | "loginShortName">
> = {
  productDisplayName: "Forge Industrial Safety",
  appShortName: "Forge Industrial",
  loginShortName: "Forge Industrial",
};

async function fetchAssetUrl(
  tenantId: string,
  documentId: string | null | undefined,
): Promise<string> {
  const id = documentId?.trim();
  if (!id) return "";
  try {
    const row = await apiGet<BrandingAssetDownload>(
      `/api/v1/tenants/${tenantId}/branding/assets/${encodeURIComponent(id)}/download-url`,
    );
    return row.downloadUrl?.trim() || "";
  } catch {
    return "";
  }
}

type BrandingLoadResult = {
  payload: TenantBranding;
  logoLightUrl: string;
  logoDarkUrl: string;
  iconUrl: string;
};

const brandingLoadCache = new Map<string, Promise<BrandingLoadResult>>();

async function loadTenantBrandingOnce(tenantId: string): Promise<BrandingLoadResult> {
  const existing = brandingLoadCache.get(tenantId);
  if (existing) return existing;

  const pending = (async (): Promise<BrandingLoadResult> => {
    const [configResult, assetsRow] = await Promise.all([
      apiGet<EffectiveResponse>(
        `/api/v1/tenants/${tenantId}/config/branding/default/effective`,
      ).catch(() => ({ payload: null }) as EffectiveResponse),
      apiGet<TenantBrandingAssetsRow | null>(`/api/v1/tenants/${tenantId}/branding`).catch(
        () => null,
      ),
    ]);

    const payload = configResult.payload ?? {};
    const [light, dark, icon] = await Promise.all([
      fetchAssetUrl(tenantId, assetsRow?.logoDocumentId),
      fetchAssetUrl(tenantId, assetsRow?.logoDarkDocumentId),
      fetchAssetUrl(tenantId, assetsRow?.iconDocumentId),
    ]);

    const configLight =
      sameOriginBrandingLogoUrl(payload.logoUrl?.trim() || payload.login?.logoUrl?.trim()) || "";
    const configDark =
      sameOriginBrandingLogoUrl(
        payload.logoDarkUrl?.trim() || payload.login?.logoDarkUrl?.trim(),
      ) || "";

    // Settings uploads (presigned S3) win when present; config /branding/ is fallback.
    return {
      payload,
      logoLightUrl: light || configLight,
      logoDarkUrl: dark || configDark,
      iconUrl: icon,
    };
  })();

  brandingLoadCache.set(tenantId, pending);
  try {
    return await pending;
  } catch (err) {
    brandingLoadCache.delete(tenantId);
    throw err;
  }
}

/**
 * Loads published Configuration Studio branding plus Settings branding assets
 * (light/dark logos and icon) for the active tenant.
 */
export function useTenantBranding() {
  const { me } = useAuth();
  const themeMode = useIndustrialThemeMode();
  const [branding, setBranding] = useState<TenantBranding>({});
  const [logoLightUrl, setLogoLightUrl] = useState("");
  const [logoDarkUrl, setLogoDarkUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(me?.tenantId));

  useEffect(() => {
    const tenantId = me?.tenantId;
    if (!tenantId) {
      setBranding({});
      setLogoLightUrl("");
      setLogoDarkUrl("");
      setIconUrl("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const loaded = await loadTenantBrandingOnce(tenantId);
        if (cancelled) return;
        setBranding(loaded.payload);
        setLogoLightUrl(loaded.logoLightUrl);
        setLogoDarkUrl(loaded.logoDarkUrl);
        setIconUrl(loaded.iconUrl);
      } catch {
        if (!cancelled) {
          setBranding({});
          setLogoLightUrl("");
          setLogoDarkUrl("");
          setIconUrl("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId]);

  const productDisplayName =
    branding.productDisplayName?.trim() || DEFAULT_INDUSTRIAL_BRANDING.productDisplayName;
  const appShortName = branding.appShortName?.trim() || DEFAULT_INDUSTRIAL_BRANDING.appShortName;
  const loginShortName =
    branding.loginShortName?.trim() || DEFAULT_INDUSTRIAL_BRANDING.loginShortName;

  const logoUrl = pickThemeLogoUrl({
    theme: themeMode,
    ...(logoLightUrl ? { logoLightUrl } : {}),
    ...(logoDarkUrl ? { logoDarkUrl } : {}),
  });

  return {
    loading,
    branding,
    productDisplayName,
    appShortName,
    loginShortName,
    themeMode: themeMode as IndustrialThemeMode,
    logoLightUrl,
    logoDarkUrl,
    iconUrl,
    /** Theme-resolved logo for the current light/dark mode. */
    logoUrl,
    primaryColor: branding.primaryColor?.trim() || "",
    secondaryColor: branding.secondaryColor?.trim() || "",
    accentColor: branding.accentColor?.trim() || "",
  };
}
