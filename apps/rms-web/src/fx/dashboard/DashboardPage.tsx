"use client";

import { useEffect, useMemo, useState } from "react";
import { FxButton } from "@forge/fx-ui";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import {
  loadDashboardPreferences,
  mergePreferences,
  saveDashboardPreferences,
} from "./DashboardPreferences";
import { listDashboardWidgets } from "./DashboardRegistry";
import { DashboardGrid, DashboardWidget } from "./DashboardWidget";
import { DashboardEmptyState } from "./DashboardStates";
import { resolveVisibleWidgets } from "./WidgetVisibility";
import { ensureDashboardWidgetsRegistered } from "./widgets/register-all";
import "./dashboard.css";

const FOOTER_LINKS: Record<string, { href: string; label: string }> = {
  "quick-actions": { href: "/incidents/", label: "Browse" },
  "recent-incidents": { href: "/incidents/", label: "All incidents" },
  "review-queue": { href: "/review/", label: "Open queue" },
  "cad-status": { href: "/cad/operations/", label: "CAD operations" },
  "cad-conflicts": { href: "/cad/conflicts/", label: "Conflicts" },
  "my-work": { href: "/review/", label: "Queues" },
  notifications: { href: "/", label: "Home" },
  "system-status": { href: "/health/", label: "Health" },
};

export function DashboardPage() {
  ensureDashboardWidgetsRegistered();
  const { me, loading: authLoading } = useAuth();
  const { flags, loading: flagsLoading } = useFeatureFlags(Object.values(RMS_FEATURE_FLAGS));
  const widgets = useMemo(() => listDashboardWidgets(), []);
  const [preferences, setPreferences] = useState(() => loadDashboardPreferences(widgets));
  const [timestamps, setTimestamps] = useState<Record<string, string>>({});

  useEffect(() => {
    setPreferences(loadDashboardPreferences(widgets));
  }, [widgets]);

  const visible = useMemo(() => {
    const merged = mergePreferences(widgets, preferences);
    return resolveVisibleWidgets(widgets, merged, {
      authenticated: Boolean(me),
      flags,
    });
  }, [widgets, preferences, me, flags]);

  const markRefreshed = (id: string) => {
    setTimestamps((prev) => ({ ...prev, [id]: new Date().toLocaleTimeString() }));
  };

  const hideWidget = (id: string) => {
    setPreferences((prev) => {
      const next = {
        ...prev,
        widgets: prev.widgets.map((item) => (item.id === id ? { ...item, visible: false } : item)),
      };
      saveDashboardPreferences(next);
      return next;
    });
  };

  const resetPreferences = () => {
    try {
      window.localStorage.removeItem("fx.rms.dashboard.preferences.v1");
    } catch {
      /* ignore */
    }
    const defaults = loadDashboardPreferences(widgets);
    setPreferences(defaults);
    saveDashboardPreferences(defaults);
  };

  if (authLoading || flagsLoading) {
    return (
      <section className="rms-fx-dashboard" data-testid="rms-fx-dashboard-loading">
        <p>Loading dashboard…</p>
      </section>
    );
  }

  if (!me) {
    return (
      <section className="rms-fx-dashboard" data-testid="rms-fx-dashboard">
        <header className="rms-fx-dashboard__header">
          <div>
            <h1 className="rms-fx-dashboard__title">Operations dashboard</h1>
            <p className="rms-fx-dashboard__lead">
              Sign in and select a tenant to load operational widgets.
            </p>
          </div>
        </header>
        <DashboardEmptyState title="Authentication required" description="Sign in to continue." />
      </section>
    );
  }

  return (
    <section className="rms-fx-dashboard" data-testid="rms-fx-dashboard">
      <header className="rms-fx-dashboard__header">
        <div>
          <h1 className="rms-fx-dashboard__title">Operations dashboard</h1>
          <p className="rms-fx-dashboard__lead">
            Presentation of existing RMS operational data. Metrics come from current APIs only —
            nothing is fabricated.
          </p>
        </div>
        <FxButton tone="secondary" onClick={resetPreferences}>
          Reset layout
        </FxButton>
      </header>

      {visible.length === 0 ? (
        <DashboardEmptyState
          title="No widgets available"
          description="No authorized widgets are enabled for this tenant, or all widgets were hidden in local preferences."
        />
      ) : (
        <DashboardGrid>
          {visible.map((widget) => {
            const Component = widget.component;
            const footer = FOOTER_LINKS[widget.id];
            return (
              <DashboardWidget
                key={widget.id}
                title={widget.title}
                size={widget.size}
                refreshable={widget.refreshable}
                onRefresh={() => markRefreshed(widget.id)}
                timestamp={timestamps[widget.id] ?? null}
                {...(footer?.href ? { href: footer.href } : {})}
                {...(footer?.label ? { linkLabel: footer.label } : {})}
              >
                <div style={{ display: "grid", gap: "var(--fx-space-8)" }}>
                  <Component onRefreshRequest={() => markRefreshed(widget.id)} />
                  <button
                    type="button"
                    className="fx-btn fx-btn--ghost"
                    style={{ justifySelf: "start", minHeight: 44 }}
                    onClick={() => hideWidget(widget.id)}
                  >
                    Hide widget
                  </button>
                </div>
              </DashboardWidget>
            );
          })}
        </DashboardGrid>
      )}
    </section>
  );
}
