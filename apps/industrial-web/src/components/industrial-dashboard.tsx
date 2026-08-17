"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { ApiError, apiGet, apiGetResult, useAuth } from "@forge/web-kit";
import { IncidentsBodyMapPanel } from "@/components/incidents-body-map-panel";
import { toIncidentRecords, type IncidentRecord } from "@/lib/incidents-module";
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

type ListResponse = { items?: unknown[] };

type SneatTone = "primary" | "info" | "success" | "warning" | "danger" | "secondary";

const ATTENTION_META: Record<string, { icon: string; tone: SneatTone }> = {
  openIncidents: { icon: "bx-error", tone: "danger" },
  openCorrectiveActions: { icon: "bx-wrench", tone: "warning" },
  inspectionsDue: { icon: "bx-check-shield", tone: "info" },
  trainingExpiring: { icon: "bx-book", tone: "warning" },
  observations: { icon: "bx-show", tone: "primary" },
  lotoReviews: { icon: "bx-lock-alt", tone: "danger" },
  workersComp: { icon: "bx-plus-medical", tone: "danger" },
  tasks: { icon: "bx-task", tone: "secondary" },
};

function attentionMeta(key: string): { icon: string; tone: SneatTone } {
  return ATTENTION_META[key] ?? { icon: "bx-bell", tone: "secondary" };
}

function moduleIcon(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("loto") || c.includes("lockout")) return "bx-lock-alt";
  if (c.includes("equipment")) return "bx-cog";
  if (c.includes("personnel") || c.includes("people")) return "bx-group";
  if (c.includes("training")) return "bx-book";
  if (c.includes("inspection")) return "bx-check-shield";
  if (c.includes("incident")) return "bx-error";
  if (c.includes("document")) return "bx-file";
  if (c.includes("report") || c.includes("analytics")) return "bx-bar-chart-alt-2";
  if (c.includes("qr")) return "bx-qr";
  if (c.includes("message")) return "bx-message";
  if (c.includes("task")) return "bx-task";
  if (c.includes("form")) return "bx-edit";
  if (c.includes("jsa")) return "bx-list-check";
  if (c.includes("observ")) return "bx-show";
  if (c.includes("fleet") || c.includes("vehicle")) return "bx-car";
  if (c.includes("import")) return "bx-import";
  if (c.includes("emergency")) return "bx-first-aid";
  return "bx-cube";
}

/**
 * Tenant-facing Industrial dashboard with Model A attention metrics and the
 * Safety Tim injury body map.
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
  const canViewIncidents =
    entitled &&
    (me?.isPlatformAdmin ||
      hasPermission("industrial.access") ||
      hasPermission("industrial.incidents.view") ||
      hasPermission("industrial.admin"));
  const showIncidents = available.some((m) => m.code === "INCIDENTS") && canViewIncidents;

  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<IncidentRecord[]>([]);

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

  useEffect(() => {
    if (!showIncidents) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiGetResult<ListResponse>("/api/v1/industrial/incidents", {
          query: { category: "injuries", page: "1", pageSize: "100" },
        });
        if (!cancelled) {
          setInjuries(toIncidentRecords(Array.isArray(result.data.items) ? result.data.items : []));
        }
      } catch {
        if (!cancelled) setInjuries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showIncidents]);

  const attention = (dash?.attention ?? []).filter((a) => a.count > 0);

  return (
    <div className="ind-content ind-dashboard">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0 flex-grow-1">
          <h4 className="mb-1">Industrial dashboard</h4>
          <p className="text-muted mb-0">What needs your attention — live Model A data.</p>
        </div>
        <div className="ind-dashboard-actions d-flex flex-wrap gap-2">
          {available.some((m) => m.code === "PERSONNEL") ? (
            <Link className="btn btn-sm btn-outline-primary" href="/modules/personnel">
              Personnel
            </Link>
          ) : null}
          {available.some((m) => m.code === "INCIDENTS") ? (
            <Link className="btn btn-sm btn-outline-primary" href="/modules/incidents">
              Incidents
            </Link>
          ) : null}
          <Link className="btn btn-sm btn-outline-secondary" href="/settings">
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
        <section className="mb-4" aria-labelledby="dash-attention-title">
          <h5 className="mb-3" id="dash-attention-title">
            Needs attention
          </h5>
          <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-xl-6 g-2">
            {attention.map((item) => {
              const meta = attentionMeta(item.key);
              return (
                <div className="col" key={item.key}>
                  <Link href={item.href} className="card h-100 text-decoration-none">
                    <div className="card-body p-3">
                      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                        <div className="avatar avatar-sm">
                          <span className={`avatar-initial rounded bg-label-${meta.tone}`}>
                            <i className={`bx ${meta.icon}`} aria-hidden="true" />
                          </span>
                        </div>
                        <h5 className="mb-0">{item.count}</h5>
                      </div>
                      <span className="d-block text-muted small text-truncate" title={item.label}>
                        {item.label}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
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

      <section className="mb-4" aria-labelledby="dash-modules-title">
        <h5 className="mb-3" id="dash-modules-title">
          Module launcher
        </h5>
        {available.length === 0 ? (
          <div className="card border shadow-none">
            <div className="card-body p-3">
              <p className="mb-2">No modules are enabled for this customer yet.</p>
              <p className="text-muted small mb-0">
                A platform administrator can enable Ready modules in Creator Console under the
                customer&apos;s Products &amp; Modules screen.
              </p>
            </div>
          </div>
        ) : (
          <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-xl-6 g-2">
            {available.slice(0, 24).map((mod) => (
              <div className="col" key={mod.code}>
                <Link href={mod.route} className="card h-100 text-decoration-none">
                  <div className="card-body p-3">
                    <div className="avatar avatar-sm mb-2">
                      <span className="avatar-initial rounded bg-label-primary">
                        <i className={`bx ${moduleIcon(mod.code)}`} aria-hidden="true" />
                      </span>
                    </div>
                    <h6 className="mb-1 text-body text-truncate" title={mod.name}>
                      {mod.name}
                    </h6>
                    <p className="small text-muted mb-0 text-truncate">
                      {moduleAvailabilityCaption(mod)}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {showIncidents ? (
        <IncidentsBodyMapPanel
          compact
          incidents={injuries}
          title="Injury body map"
          mapHref="/modules/incidents/?tab=body-map"
        />
      ) : null}
    </div>
  );
}
