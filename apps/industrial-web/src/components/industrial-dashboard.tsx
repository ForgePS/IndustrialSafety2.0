"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDUSTRIAL_PRODUCT_CODE, filterIndustrialDashboardAttentionItems } from "@forge/contracts";
import { ApiError, apiGet, apiGetResult, useAuth } from "@forge/web-kit";
import {
  IncidentTrendCard,
  InspectionsBySiteCard,
  SafetyIndexCard,
  TaskSchedulerCard,
  type DashboardTask,
} from "@/components/dashboard-insight-cards";
import { DashboardBlockFrame } from "@/components/dashboard-block-frame";
import { IncidentsBodyMapPanel } from "@/components/incidents-body-map-panel";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { aggregateInspectionsBySite } from "@/lib/dashboard-insights";
import {
  clearDashboardLayout,
  CUSTOMIZE_DASHBOARD_EVENT,
  CUSTOMIZE_DASHBOARD_FLAG,
  defaultDashboardLayout,
  getDashboardBlock,
  loadDashboardLayout,
  moveDashboardItem,
  reorderDashboardItems,
  updateDashboardItem,
  visibleDashboardItems,
  writeDashboardLayout,
  type DashboardBlockId,
  type DashboardLayoutState,
} from "@/lib/dashboard-layout";
import { toIncidentRecords, type IncidentRecord } from "@/lib/incidents-module";
import { buildIndustrialNavigation, moduleAvailabilityCaption } from "@/lib/navigation";
import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import { MyWorkspace } from "@/components/workspace/my-workspace";
import "@/components/workspace/workspace.css";
import { useOptionalWalkthroughController } from "@/features/executive-walkthrough/WalkthroughController";
import { WalkthroughDemoDashboard } from "@/features/executive-walkthrough/WalkthroughDemoDashboard";
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
};

type UpcomingPayload = {
  events: Array<{ id: string; title: string; startsAt: string | null; category?: { color: string } | null }>;
  tasks: Array<{ id: string; title: string; dueDate: string | null; href: string }>;
  reminders: Array<{ id: string; title: string | null; remindAt: string | null }>;
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
  workersCompWeeklyUpdates: { icon: "bx-calendar-check", tone: "warning" },
  tasks: { icon: "bx-task", tone: "secondary" },
  missingMvrConsent: { icon: "bx-file", tone: "warning" },
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
  if (c.includes("calendar")) return "bx-calendar";
  if (c.includes("remind")) return "bx-bell";
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
 * cards (trend / tasks / inspections by site), and the injury body map.
 */
export function IndustrialDashboard() {
  const { me, hasPermission } = useAuth();
  const walkthrough = useOptionalWalkthroughController();
  const { query: facilityQuery } = useIndustrialFacility();
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
  const availableCodes = useMemo(() => new Set(available.map((m) => m.code)), [available]);
  const canAccess = entitled && (hasPermission("industrial.access") || Boolean(me?.isPlatformAdmin));
  const canViewIncidents =
    entitled &&
    (Boolean(me?.isPlatformAdmin) ||
      hasPermission("industrial.admin") ||
      hasPermission("industrial.incidents.view"));
  const showIncidents = availableCodes.has("INCIDENTS") && canViewIncidents;
  const showTasks = availableCodes.has("TASKS");
  const showCalendar = availableCodes.has("CALENDAR");
  const showReminders = availableCodes.has("REMINDERS");
  const showInspections = availableCodes.has("INSPECTIONS");
  /** Incident trend is incidents/analytics work — not granted by industrial.access alone. */
  const showIncidentTrend =
    availableCodes.has("ANALYTICS") ||
    (availableCodes.has("INCIDENTS") && canViewIncidents);
  /** Safety Index lives under Analytics; do not show for every industrial user. */
  const showSafetyIndex = availableCodes.has("ANALYTICS") || availableCodes.has("REPORTING");
  const showDotScore = availableCodes.has("DOT_COMPLIANCE");

  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [injuries, setInjuries] = useState<IncidentRecord[]>([]);
  const [analytics, setAnalytics] = useState<SafetyIntelligenceReport | null>(null);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingPayload | null>(null);
  const [inspectionSites, setInspectionSites] = useState<
    ReturnType<typeof aggregateInspectionsBySite>
  >([]);

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<DashboardPayload>("/api/v1/industrial/dashboard", {
          query: facilityQuery,
        });
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
  }, [canAccess, facilityQuery]);

  useEffect(() => {
    if (!showIncidents) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await apiGetResult<ListResponse>("/api/v1/industrial/incidents", {
          query: { category: "injuries", page: "1", pageSize: "100", ...facilityQuery },
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
  }, [facilityQuery, showIncidents]);

  useEffect(() => {
    if (!showIncidentTrend && !showSafetyIndex) {
      setAnalytics(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await apiGet<unknown>("/api/v1/industrial/analytics/overview", {
          query: { preset: "6m", ...facilityQuery },
        });
        if (!cancelled) setAnalytics(toSafetyIntelligenceReport(raw));
      } catch {
        if (!cancelled) setAnalytics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facilityQuery, showIncidentTrend, showSafetyIndex]);

  useEffect(() => {
    if (!showTasks) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<ListResponse>("/api/v1/industrial/tasks", {
          query: facilityQuery,
        });
        if (!cancelled) setTasks(toDashboardTasks(Array.isArray(data.items) ? data.items : []));
      } catch {
        if (!cancelled) setTasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facilityQuery, showTasks]);

  useEffect(() => {
    if (!canAccess || (!showCalendar && !showReminders && !showTasks)) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<UpcomingPayload>("/api/v1/industrial/calendar/upcoming", {
          query: { days: "7" },
        });
        if (!cancelled) setUpcoming(data);
      } catch {
        if (!cancelled) setUpcoming(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess, showCalendar, showReminders, showTasks]);

  useEffect(() => {
    if (!showInspections) return;
    let cancelled = false;
    void (async () => {
      try {
        const [inspections, sites] = await Promise.all([
          apiGet<ListResponse>("/api/v1/industrial/inspections", {
            query: { page: "1", pageSize: "200", ...facilityQuery },
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
  }, [facilityQuery, showInspections]);

  const attention = useMemo(() => {
    const items = (dash?.attention ?? []).filter((a) => a.count > 0);
    return filterIndustrialDashboardAttentionItems(items, {
      permissions: me?.permissions ?? [],
      activeModules: me?.activeModules ?? [],
      isPlatformAdmin: Boolean(me?.isPlatformAdmin),
      availableModuleCodes: available.map((m) => m.code),
    });
  }, [available, dash?.attention, me?.activeModules, me?.isPlatformAdmin, me?.permissions]);
  const hasUpcomingEvents = Boolean(upcoming?.events.length) && showCalendar;
  const hasUpcomingTasks = Boolean(upcoming?.tasks.length) && showTasks;
  const hasUpcomingReminders = Boolean(upcoming?.reminders.length) && showReminders;

  const availableBlocks = useMemo(() => {
    const ids = new Set<DashboardBlockId>();
    if (attention.length > 0 || dash) ids.add("attention");
    if (hasUpcomingEvents) ids.add("upcoming-events");
    if (hasUpcomingTasks) ids.add("upcoming-tasks");
    if (hasUpcomingReminders) ids.add("upcoming-reminders");
    if (me?.tenantId && me?.userId && available.length > 0) ids.add("workspace");
    if (showIncidentTrend) ids.add("insight-trend");
    if (showSafetyIndex) ids.add("insight-safety");
    if (showTasks) ids.add("insight-tasks");
    if (showInspections) ids.add("insight-inspections");
    if (showIncidents) ids.add("body-map");
    return ids;
  }, [
    attention.length,
    available.length,
    dash,
    hasUpcomingEvents,
    hasUpcomingReminders,
    hasUpcomingTasks,
    me?.tenantId,
    me?.userId,
    showIncidentTrend,
    showIncidents,
    showInspections,
    showSafetyIndex,
    showTasks,
  ]);

  const [dashLayout, setDashLayout] = useState<DashboardLayoutState>(() =>
    defaultDashboardLayout(availableBlocks),
  );
  const [editingDash, setEditingDash] = useState(false);
  const [confirmDashReset, setConfirmDashReset] = useState(false);
  const dragBlockRef = useRef<DashboardBlockId | null>(null);
  const dragOverBlockRef = useRef<DashboardBlockId | null>(null);

  useEffect(() => {
    if (!me?.tenantId || !me?.userId) {
      setDashLayout(defaultDashboardLayout(availableBlocks));
      return;
    }
    setDashLayout(loadDashboardLayout(me.tenantId, me.userId, availableBlocks));
  }, [availableBlocks, me?.tenantId, me?.userId]);

  useEffect(() => {
    const enterEdit = () => {
      setEditingDash(true);
      setConfirmDashReset(false);
    };
    window.addEventListener(CUSTOMIZE_DASHBOARD_EVENT, enterEdit);
    try {
      if (sessionStorage.getItem(CUSTOMIZE_DASHBOARD_FLAG) === "1") {
        sessionStorage.removeItem(CUSTOMIZE_DASHBOARD_FLAG);
        enterEdit();
      }
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener(CUSTOMIZE_DASHBOARD_EVENT, enterEdit);
  }, []);

  const persistDash = useCallback(
    (next: DashboardLayoutState | ((prev: DashboardLayoutState) => DashboardLayoutState)) => {
      setDashLayout((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (me?.tenantId && me?.userId) {
          writeDashboardLayout(me.tenantId, me.userId, resolved);
        }
        return resolved;
      });
    },
    [me?.tenantId, me?.userId],
  );

  const visibleBlocks = useMemo(() => visibleDashboardItems(dashLayout), [dashLayout]);
  const hiddenBlocks = useMemo(
    () =>
      dashLayout.items
        .filter((item) => !item.isVisible && availableBlocks.has(item.id))
        .map((item) => getDashboardBlock(item.id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b)),
    [availableBlocks, dashLayout.items],
  );

  const dateStart = analytics?.dateRange.start ?? "";
  const dateEnd = analytics?.dateRange.end ?? "";
  const incidentTrend = useMemo(() => analytics?.incidentTrend ?? [], [analytics]);

  function renderBlockBody(id: DashboardBlockId) {
    switch (id) {
      case "attention":
        if (attention.length === 0) {
          return dash ? (
            <section aria-labelledby="dash-attention-title">
              <h5 className="mb-3" id="dash-attention-title">
                What Needs Your Attention
              </h5>
              <p className="text-muted mb-0">No open attention items right now.</p>
            </section>
          ) : null;
        }
        return (
          <section aria-labelledby="dash-attention-title">
            <h5 className="mb-3" id="dash-attention-title">
              What Needs Your Attention
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
        );
      case "upcoming-events":
        return (
          <div className="card h-100">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <h6 className="mb-0">Events</h6>
              {showCalendar ? (
                <Link className="small" href="/modules/calendar/">
                  Open
                </Link>
              ) : null}
            </div>
            <ul className="list-group list-group-flush">
              {(upcoming?.events ?? []).slice(0, 5).map((ev) => (
                <li key={ev.id} className="list-group-item small">
                  <div className="fw-semibold">{ev.title}</div>
                  <div className="text-muted">
                    {ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "—"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      case "upcoming-tasks":
        return (
          <div className="card h-100">
            <div className="card-header py-2">
              <h6 className="mb-0">Tasks due</h6>
            </div>
            <ul className="list-group list-group-flush">
              {(upcoming?.tasks ?? []).slice(0, 5).map((t) => (
                <li key={t.id} className="list-group-item small">
                  <Link href={t.href}>{t.title}</Link>
                  <div className="text-muted">Due {t.dueDate ?? "—"}</div>
                </li>
              ))}
            </ul>
          </div>
        );
      case "upcoming-reminders":
        return (
          <div className="card h-100">
            <div className="card-header py-2">
              <h6 className="mb-0">Reminders</h6>
            </div>
            <ul className="list-group list-group-flush">
              {(upcoming?.reminders ?? []).slice(0, 5).map((r) => (
                <li key={r.id} className="list-group-item small">
                  <Link href="/modules/reminders/">{r.title || "Reminder"}</Link>
                  <div className="text-muted">
                    {r.remindAt ? new Date(r.remindAt).toLocaleString() : "—"}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      case "workspace":
        return me?.tenantId && me?.userId ? (
          <MyWorkspace
            modules={available}
            tenantId={me.tenantId}
            userId={me.userId}
            iconForCode={moduleIcon}
            captionForModule={moduleAvailabilityCaption}
            permissions={me.permissions ?? []}
            isPlatformAdmin={Boolean(me.isPlatformAdmin)}
            editing={editingDash}
            embedded
          />
        ) : null;
      case "insight-trend":
        return (
          <IncidentTrendCard points={incidentTrend} dateStart={dateStart} dateEnd={dateEnd} />
        );
      case "insight-safety":
        return <SafetyIndexCard report={analytics} showDotScore={showDotScore} />;
      case "insight-tasks":
        return <TaskSchedulerCard tasks={tasks} />;
      case "insight-inspections":
        return (
          <InspectionsBySiteCard
            sites={inspectionSites}
            dateStart={dateStart}
            dateEnd={dateEnd}
          />
        );
      case "body-map":
        return (
          <IncidentsBodyMapPanel
            compact
            incidents={injuries}
            title="Injury body map"
            mapHref="/modules/incidents/?tab=body-map"
          />
        );
      default:
        return null;
    }
  }

  if (walkthrough?.session?.active) {
    return <WalkthroughDemoDashboard />;
  }

  return (
    <div className="ind-content ind-dashboard" data-walkthrough="executive-dashboard">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0 flex-grow-1">
          <h4 className="mb-1">Industrial Dashboard</h4>
          {editingDash ? (
            <p className="text-muted small mb-0 forge-ws-customize-hint">
              Drag any block by the ≡ handle to reorder. Resize or hide blocks, then tap Done.
            </p>
          ) : null}
        </div>
        <div className="ind-dashboard-actions d-flex flex-wrap gap-2">
          {editingDash ? (
            <>
              {hiddenBlocks.length > 0 ? (
                <select
                  className="form-select form-select-sm"
                  style={{ width: "auto", minWidth: "10rem" }}
                  aria-label="Add dashboard block"
                  defaultValue=""
                  onChange={(event) => {
                    const id = event.target.value as DashboardBlockId;
                    if (!id) return;
                    persistDash((prev) => updateDashboardItem(prev, id, { isVisible: true }));
                    event.target.value = "";
                  }}
                >
                  <option value="">Add block…</option>
                  {hiddenBlocks.map((block) => (
                    <option key={block.id} value={block.id}>
                      {block.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => setConfirmDashReset(true)}
              >
                Reset layout
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setEditingDash(false);
                  setConfirmDashReset(false);
                }}
              >
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>

      {dashError ? (
        <div className="alert alert-warning" role="status">
          {dashError}
        </div>
      ) : null}

      {confirmDashReset ? (
        <div
          className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"
          role="status"
        >
          <span className="small mb-0">
            Reset the dashboard layout to defaults? This clears your block order, sizes, and
            hidden blocks (My Workspace module layout is separate).
          </span>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setConfirmDashReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => {
                if (me?.tenantId && me?.userId) clearDashboardLayout(me.tenantId, me.userId);
                persistDash(defaultDashboardLayout(availableBlocks));
                setConfirmDashReset(false);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {visibleBlocks.length === 0 ? (
        <p className="text-muted">
          No dashboard blocks visible. Open <strong>Customize</strong> (desktop icon) and choose{" "}
          <strong>Customize dashboard</strong> to add some.
        </p>
      ) : (
        <div className="forge-ws-grid" aria-label="Dashboard">
          {visibleBlocks.map((item) => (
            <DashboardBlockFrame
              key={item.id}
              item={item}
              editing={editingDash}
              available={availableBlocks.has(item.id)}
              onSizeChange={(size: WorkspaceWidgetSize) =>
                persistDash((prev) => updateDashboardItem(prev, item.id, { size }))
              }
              onHide={() =>
                persistDash((prev) => updateDashboardItem(prev, item.id, { isVisible: false }))
              }
              onMove={(direction) =>
                persistDash((prev) => moveDashboardItem(prev, item.id, direction))
              }
              onDragStart={(id) => {
                dragBlockRef.current = id;
                dragOverBlockRef.current = null;
              }}
              onDragOver={(overId) => {
                const fromId = dragBlockRef.current;
                if (!fromId || fromId === overId || dragOverBlockRef.current === overId) return;
                dragOverBlockRef.current = overId;
                persistDash((prev) => {
                  const keys = visibleDashboardItems(prev).map((v) => v.id);
                  const fromIndex = keys.indexOf(fromId);
                  const toIndex = keys.indexOf(overId);
                  if (fromIndex < 0 || toIndex < 0) return prev;
                  const nextKeys = [...keys];
                  nextKeys.splice(fromIndex, 1);
                  nextKeys.splice(toIndex, 0, fromId);
                  const hidden = prev.items
                    .filter((row) => !row.isVisible)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((row) => row.id);
                  return reorderDashboardItems(prev, [...nextKeys, ...hidden]);
                });
              }}
              onDragEnd={() => {
                dragBlockRef.current = null;
                dragOverBlockRef.current = null;
              }}
            >
              {renderBlockBody(item.id)}
            </DashboardBlockFrame>
          ))}
        </div>
      )}
    </div>
  );
}
