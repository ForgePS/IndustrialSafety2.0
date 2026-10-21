"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLogo } from "@/components/field-logo";
import { useFieldThemeMode } from "@/components/field-theme-settings";
import { useFieldPathname } from "@/hooks/use-field-pathname";
import { resolvePageBack } from "@/lib/back-navigation";
import { fieldTenantLogoFor } from "@/lib/field-tenant-logo";

function BackChevron() {
  return (
    <svg className="ff-back-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.5 5.5 8 12l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One centered brand mark — company logo when available, otherwise Field product logo. */
function ShellBrand({
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  tenantLogoDarkUrl,
  tenantLogoLightUrl,
}: {
  tenantName: string;
  tenantSlug?: string | null;
  tenantLogoUrl?: string | null;
  tenantLogoDarkUrl?: string | null;
  tenantLogoLightUrl?: string | null;
}) {
  const { resolved } = useFieldThemeMode();
  const tenantLogo = fieldTenantLogoFor({
    slug: tenantSlug,
    displayName: tenantName,
    theme: resolved,
    logoLightUrl: tenantLogoLightUrl,
    logoDarkUrl: tenantLogoDarkUrl,
    brandingLogoUrl: tenantLogoUrl,
  });
  const [tenantFailed, setTenantFailed] = useState(false);
  const showTenant = Boolean(tenantLogo) && !tenantFailed;

  return (
    <div className="ff-shell-brand">
      {showTenant && tenantLogo ? (
        <img
          className="ff-tenant-logo ff-tenant-logo--shell"
          src={tenantLogo.src}
          alt={tenantLogo.label}
          onError={() => setTenantFailed(true)}
        />
      ) : (
        <FieldLogo size="inline" />
      )}
    </div>
  );
}

export function ShellHeader({
  tenantName,
  tenantSlug,
  tenantLogoUrl,
  tenantLogoDarkUrl,
  tenantLogoLightUrl,
}: {
  tenantName: string;
  tenantSlug?: string | null;
  tenantLogoUrl?: string | null;
  tenantLogoDarkUrl?: string | null;
  tenantLogoLightUrl?: string | null;
}) {
  const router = useRouter();
  const pathname = useFieldPathname();
  const back = resolvePageBack(pathname);
  const onHome = !back;

  return (
    <header className={`ff-shell-header${onHome ? " ff-shell-header--home" : ""}`}>
      <div className={onHome ? "ff-shell-homebar" : "ff-shell-topbar"}>
        <ShellBrand
          tenantName={tenantName}
          tenantSlug={tenantSlug ?? null}
          tenantLogoUrl={tenantLogoUrl ?? null}
          tenantLogoDarkUrl={tenantLogoDarkUrl ?? null}
          tenantLogoLightUrl={tenantLogoLightUrl ?? null}
        />
        {onHome ? null : (
          <div className="ff-back-bar">
            <button
              type="button"
              className="ff-back-btn ff-back-btn--prominent"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                  return;
                }
                router.push(back.href);
              }}
              aria-label={`Back to ${back.label}`}
            >
              <BackChevron />
              <span>Back to {back.label}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
