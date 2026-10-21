"use client";

import { useEffect, useState } from "react";
import { apiGet, useAuth } from "@forge/web-kit";

export type FieldTenantBranding = {
  primaryColor?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  login?: {
    logoUrl?: string;
    logoDarkUrl?: string;
    brandLabel?: string;
  };
};

type EffectiveResponse = {
  payload: FieldTenantBranding | null;
};

type TenantBrandingAssetsRow = {
  logoDocumentId?: string | null;
  logoDarkDocumentId?: string | null;
};

type BrandingAssetDownload = {
  downloadUrl: string;
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

/**
 * Published Configuration Studio + Settings branding assets for the signed-in tenant.
 * Logo selection follows the active Field theme (light vs dark mark when available).
 */
export function useFieldTenantBranding() {
  const { me } = useAuth();
  const [branding, setBranding] = useState<FieldTenantBranding>({});
  const [logoLightUrl, setLogoLightUrl] = useState("");
  const [logoDarkUrl, setLogoDarkUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(me?.tenantId));

  useEffect(() => {
    const tenantId = me?.tenantId;
    if (!tenantId) {
      setBranding({});
      setLogoLightUrl("");
      setLogoDarkUrl("");
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [configResult, assetsRow] = await Promise.all([
          apiGet<EffectiveResponse>(
            `/api/v1/tenants/${tenantId}/config/branding/default/effective`,
          ).catch(() => ({ payload: null }) as EffectiveResponse),
          apiGet<TenantBrandingAssetsRow | null>(`/api/v1/tenants/${tenantId}/branding`).catch(
            () => null,
          ),
        ]);
        if (cancelled) return;

        const payload = configResult.payload ?? {};
        setBranding(payload);

        const [light, dark] = await Promise.all([
          fetchAssetUrl(tenantId, assetsRow?.logoDocumentId),
          fetchAssetUrl(tenantId, assetsRow?.logoDarkDocumentId),
        ]);
        if (cancelled) return;

        const configLight = payload.logoUrl?.trim() || payload.login?.logoUrl?.trim() || "";
        const configDark =
          payload.logoDarkUrl?.trim() || payload.login?.logoDarkUrl?.trim() || "";

        setLogoLightUrl(light || configLight);
        setLogoDarkUrl(dark || configDark);
      } catch {
        if (!cancelled) {
          setBranding({});
          setLogoLightUrl("");
          setLogoDarkUrl("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId]);

  // Field chrome is dark — prefer dark logo, then light, then config fallback.
  const logoUrl = logoDarkUrl || logoLightUrl || branding.login?.logoUrl?.trim() || branding.logoUrl?.trim() || "";

  return { branding, loading, logoUrl, logoLightUrl, logoDarkUrl };
}
