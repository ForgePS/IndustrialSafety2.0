"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INDUSTRIAL_PRODUCT_CODE, industrialAvailabilityLabel } from "@forge/contracts";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { buildIndustrialNavigation, moduleAvailabilityCaption } from "@/lib/navigation";

type AttentionItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

type DashboardPayload = {
  attention: AttentionItem[];
  quickActions: Array<{ label: string; href: string }>;
};

/**
 * Tenant-facing Industrial dashboard with Model A attention metrics.
 */
export function IndustrialDashboard() {
  const { me, hasPermission } = useAuth();
  const entitled =
    Boolean(me?.isPlatformAdmin) || Boolean(me?.activeProducts?.includes(INDUSTRIAL_PRODUCT_CODE));
  const nav = buildIndustrialNavigation({
    entitled,
    permissions: me?.isPlatformAdmin
      ? ["industrial.access", ...(me?.permissions ?? [])]
      : (me?.permissions ?? []),
    flags: {},
    enabledModules: me?.activeModules ?? [],
    strictEntitlements: true,
  });

  const available = nav.filter((n) => n.available && n.code !== "CORE");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  useEffect(() => {
    if (!entitled || !(hasPermission("industrial.access") || me?.isPlatformAdmin)) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<DashboardPayload>("/api/v1/industrial/dashboard");
        if (!cancelled) {
          setDash(data);
          setDashError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setDashError(e instanceof ApiError ? e.message : "Unable to load attention metrics");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entitled, hasPermission, me?.isPlatformAdmin]);

  const attention = (dash?.attention ?? []).filter((a) => a.count > 0);

  return (
    <div className="ind-content ind-dashboard">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0 flex-grow-1">
          <h1 className="mb-1">Industrial dashboard</h1>
          <p className="text-muted mb-0">What needs your attention — live Model A data.</p>
        </div>
        <div className="ind-dashboard-actions">
          {available.some((m) => m.code === "PERSONNEL") ? (
            <Link className="btn btn-outline-primary" href="/modules/personnel">
              Personnel
            </Link>
          ) : null}
          {available.some((m) => m.code === "INCIDENTS") ? (
            <Link className="btn btn-outline-primary" href="/modules/incidents">
              Incidents
            </Link>
          ) : null}
          <Link className="btn btn-outline-secondary" href="/settings">
            Settings
          </Link>
        </div>
      </div>

      {dashError ? (
        <div className="alert alert-warning" role="status">
          {dashError}
        </div>
      ) : null}

      {attention.length > 0 ? (
        <>
          <h2 className="h5 mb-3">Needs attention</h2>
          <div className="row g-3 mb-4">
            {attention.map((item) => (
              <div className="col-12 col-sm-6 col-md-4" key={item.key}>
                <Link href={item.href} className="card h-100 text-decoration-none">
                  <div className="card-body">
                    <div className="text-muted text-uppercase small">{item.label}</div>
                    <div className="fs-3 fw-semibold text-body">{item.count}</div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : dash ? (
        <p className="text-muted mb-4">No open attention items right now.</p>
      ) : null}

      {dash?.quickActions?.length ? (
        <div className="mb-4 d-flex flex-wrap gap-2">
          {dash.quickActions.map((a) => (
            <Link key={a.href} className="btn btn-sm btn-outline-primary" href={a.href}>
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}

      <h2 className="h5 mb-3">Module launcher</h2>
      {available.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <p className="mb-2">No modules are enabled for this customer yet.</p>
            <p className="text-muted small mb-0">
              A platform administrator can enable Ready modules in Creator Console under the
              customer&apos;s Products &amp; Modules screen.
            </p>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {available.slice(0, 24).map((mod) => (
            <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={mod.code}>
              <Link href={mod.route} className="card h-100 text-decoration-none">
                <div className="card-body">
                  <h3 className="h6 mb-1 text-body">{mod.name}</h3>
                  <p className="small text-muted mb-0">
                    {moduleAvailabilityCaption(mod)} ·{" "}
                    {industrialAvailabilityLabel(mod.implementationStatus)}
                  </p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
