"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@forge/web-kit";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { FIELD_DASHBOARD_CATALOG } from "@/lib/dashboard-cards";
import { canUseDashboardCard } from "@/lib/dashboard-layout";
import { writeForceTenantPick } from "@/lib/field-tenant";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { FieldThemeSettings } from "@/components/field-theme-settings";
import { FIELD_PRODUCT_NAME } from "@/lib/brand";
import { fieldSignOut } from "@/lib/field-sign-out";

export default function MePage() {
  const router = useRouter();
  const { logout, me } = useAuth();
  const { profile } = useFieldProfile();
  const { permissions, opts, activeModules, featureEnabled } = useFieldPermissions();
  const layoutOpts = { ...opts, activeModules };
  const { ready, isPinned, pin, unpin } = useDashboardLayout(permissions, layoutOpts);
  const selectableCount = (me?.tenants ?? []).filter((t) => t.selectable).length;
  const activeTenant = me?.tenants?.find((t) => t.tenantId === me.tenantId);

  const moreCards = FIELD_DASHBOARD_CATALOG.filter(
    (card) =>
      card.source === "more" &&
      canUseDashboardCard(card, permissions, layoutOpts) &&
      featureEnabled(card.id),
  );

  return (
    <>
      <h1 className="ff-page-title">Me</h1>
      <p className="ff-page-body">
        {profile?.displayName || "Signed in"}
        {activeTenant?.displayName ? ` · ${activeTenant.displayName}` : ""}
      </p>
      <p className="ff-hint ff-hint--left">{FIELD_PRODUCT_NAME}</p>

      <FieldThemeSettings />

      <section className="ff-section" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="ff-section-title">
          Tools
        </h2>
        <p className="ff-hint ff-hint--left">
          Pin shortcuts to your home dashboard, then reorder them from Home → Customize.
        </p>
        <div className="ff-action-grid">
          {moreCards.map((card) => {
            const pinned = ready && isPinned(card.id);
            return (
              <div key={card.id} className="ff-dashboard-card">
                {ready ? (
                  <button
                    type="button"
                    className={`ff-pin-btn${pinned ? " ff-pin-btn--active" : ""}`}
                    aria-label={
                      pinned ? `Remove ${card.label} from home` : `Add ${card.label} to home`
                    }
                    aria-pressed={pinned}
                    onClick={() => {
                      if (pinned) unpin(card.id);
                      else pin(card.id);
                    }}
                  >
                    {pinned ? "On home" : "Add to home"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ff-action-tile"
                  onClick={() => router.push(card.href)}
                >
                  {card.label}
                </button>
              </div>
            );
          })}
          <button type="button" className="ff-action-tile" onClick={() => router.push("/report/")}>
            Report
          </button>
          {selectableCount > 1 ? (
            <button
              type="button"
              className="ff-btn ff-btn-secondary ff-action-grid-span"
              onClick={() => {
                writeForceTenantPick(true);
                router.push("/");
                router.refresh();
                window.location.assign("/");
              }}
            >
              Switch company
            </button>
          ) : null}
          <button
            type="button"
            className="ff-btn ff-btn-secondary ff-action-grid-span"
            onClick={() => void fieldSignOut(logout)}
          >
            Sign out
          </button>
        </div>
      </section>
    </>
  );
}
