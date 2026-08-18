"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";
import { ApiError, apiGet, apiGetResult, useAuth } from "@forge/web-kit";
import {
  IncidentTrendCard,
  InspectionsBySiteCard,
  TaskSchedulerCard,
  type DashboardTask,
} from "@/components/dashboard-insight-cards";
import { IncidentsBodyMapPanel } from "@/components/incidents-body-map-panel";
import { aggregateInspectionsBySite } from "@/lib/dashboard-insights";
import { toIncidentRecords, type IncidentRecord } from "@/lib/incidents-module";
import { buildIndustrialNavigation, moduleAvailabilityCaption } from "@/lib/navigation";
import {
  toSafetyIntelligenceReport,
  type SafetyIntelligenceReport,
} from "@/lib/safety-intelligence";

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

function toDashboardTasks(items: unknown[]): DashboardTask[] {
  return items
    .filter((raw): raw is Record<string, unknown> => Boolean(raw) && typeof raw === "object")
    .map((row) => ({
      id: String(row.id ?? ""),
      title: String(row.title ?? row.name ?? "Task"),
      status: String(row.status ?? "assigned"),
      deadlineDate: typeof row.deadlineDate === "string" ? row.deadlineDate : null,
      assigneeName: typeof row.assigneeName === "string" ? row.assigneeName : null,
      overdue: Boolean(row.overdue),
    }))
    .filter((t) => t.id);
}

/**
 * Tenant-facing Industrial dashboard with Model A attention metrics, insight
 * cards (trend / tasks / inspections by site), and the Safety Tim body map.
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
  const canAccess = entitled && (hasPermission("industrial.access") || Boolean(me?.isPlatformAdmin));
  const canViewIncidents =
    entitled &&
    (canAccess ||
      hasPermission("industrial.incidents.view") ||
      hasPermission("industrial.admin"));
  const showIncidents = available.some((m) => m.code === "INCIDENTS") && canViewIncidents;
  const showTasks = available.some((m) => m.code === "TASKS");
  const showInspections = available.some((m) => m.code === "INSPECTIONS");
  const showAnalytics =
    available.some((m) => m.code === "ANALYTICS" || m.code === "REPORTING") || canAccess;

  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<IncidentRecord[]>([]);
  const [analytics, setAnalytics] = useState<SafetyIntelligenceReport | null>(null);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [inspectionSites, setInspectionSites] = useState<
    ReturnType<typeof aggregateInspectionsBySite>
  >([]);

  useEffect(() => {
    if (!canAccess) return;
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
  }, [canAccess]);

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

  useEffect(() => {
    if (!showAnalytics) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await apiGet<unknown>("/api/v1/industrial/analytics/overview", {
          query: { preset: "6m" },
        });
        if (!cancelled) setAnalytics(toSafetyIntelligenceReport(raw));
      } catch {
        if (!cancelled) setAnalytics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAnalytics]);

  useEffect(() => {
    if (!showTasks) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<ListResponse>("/api/v1/industrial/tasks");
        if (!cancelled) setTasks(toDashboardTasks(Array.isArray(data.items) ? data.items : []));
      } catch {
        if (!cancelled) setTasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTasks]);

  useEffect(() => {
    if (!showInspections) return;
    let cancelled = false;
    void (async () => {
      try {
        const [inspections, sites] = await Promise.all([
          apiGet<ListResponse>("/api/v1/industrial/inspections", {
            query: { page: "1", pageSize: "200" },
          }),
          apiGet<ListResponse>("/api/v1/industrial/sites", {
            query: { page: "1", pageSize: "200" },
          }).catch(() => ({ items: [] as unknown[] })),
        ]);
        if (cancelled) return;
        const siteNames = new Map<string, string>();
        for (const raw of sites.items ?? []) {
          if (!raw || typeof raw !== "object") continue;
          const row = raw as Record<string, unknown>;
          const id = typeof row.id === "string" ? row.id : "";
          const name = String(row.name ?? row.title ?? row.displayName ?? "").trim();
          if (id && name) siteNames.set(id, name);
        }
        setInspectionSites(
          aggregateInspectionsBySite(
            Array.isArray(inspections.items) ? inspections.items : [],
            siteNames,
          ),
        );
      } catch {
        if (!cancelled) setInspectionSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showInspections]);

  const attention = (dash?.attention ?? []).filter((a) => a.count > 0);
  const showInsightCards = showAnalytics || showTasks || showInspections;
  const dateStart = analytics?.dateRange.start ?? "";
  const dateEnd = analytics?.dateRange.end ?? "";
  const incidentTrend = useMemo(() => analytics?.incidentTrend ?? [], [analytics]);

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

      <section className="mb-3" aria-labelledby="dash-modules-title">
        <h5 className="mb-2 visually-hidden" id="dash-modules-title">
          Module launcher
        </h5>
        {available.length === 0 ? (
          <div className="card border shadow-none">
            <div className="card-body p-2">
              <p className="mb-1 small">No modules are enabled for this customer yet.</p>
              <p className="text-muted small mb-0">
                A platform administrator can enable Ready modules in Creator Console under the
                customer&apos;s Products &amp; Modules screen.
              </p>
            </div>
          </div>
        ) : (
          <div className="ind-module-launcher" role="navigation" aria-label="Module launcher">
            {available.map((mod) => (
              <Link
                key={mod.code}
                href={mod.route}
                className="ind-module-launcher__item"
                title={`${mod.name} — ${moduleAvailabilityCaption(mod)}`}
              >
                <span className="ind-module-launcher__icon" aria-hidden="true">
                  <i className={`bx ${moduleIcon(mod.code)}`} />
                </span>
                <span className="ind-module-launcher__label">{mod.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {dash?.quickActions?.length ? (
        <div className="mb-4 d-flex flex-wrap gap-2">
          {dash.quickActions.map((a) => (
            <Link key={a.href} className="btn btn-sm btn-outline-primary" href={a.href}>
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}

      {showInsightCards ? (
        <section className="mb-4" aria-labelledby="dash-insights-title">
          <h5 className="mb-3" id="dash-insights-title">
            Operations snapshot
          </h5>
          <div className="d-flex flex-column gap-3">
            {showAnalytics ? (
              <div className="row g-3">
                <div className="col-12 col-lg-6">
                  <IncidentTrendCard
                    points={incidentTrend}
                    dateStart={dateStart}
                    dateEnd={dateEnd}
                  />
                </div>
              </div>
            ) : null}
            {showTasks ? <TaskSchedulerCard tasks={tasks} /> : null}
            {showInspections ? (
              <InspectionsBySiteCard
                sites={inspectionSites}
                dateStart={dateStart}
                dateEnd={dateEnd}
              />
            ) : null}
          </div>
        </section>
      ) : null}

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
