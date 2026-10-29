"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { PrintHistoryWorkspace } from "@/components/print-history-workspace";
import { PrintQueueWorkspace } from "@/components/print-queue-workspace";
import {
  PrintManagerGroupsPanel,
  PrintManagerRoutingPanel,
} from "@/components/print-manager-routing-panels";
import { PrintManagerTemplatesPanel } from "@/components/print-manager-templates-panel";
import { PrintManagerBatchesPanel } from "@/components/print-manager-batches-panel";
import { PrintManagerAnalyticsPanel } from "@/components/print-manager-analytics-panel";
import { PrintManagerSuppliesPanel } from "@/components/print-manager-supplies-panel";
import {
  bridgeStatusLabel,
  connectionBadgeLabel,
  getPrintManagerSummary,
  listPrinterBridges,
  listPrinters,
  printerDisplayName,
  testPrinter,
  updatePrinter,
  type ForgePrinter,
  type PrintManagerSummary,
  type PrinterBridge,
} from "@/lib/print-api";
import { formatAdminDate } from "@/lib/platform-admin";

type TabId =
  | "dashboard"
  | "queue"
  | "printers"
  | "bridges"
  | "groups"
  | "routing"
  | "templates"
  | "batches"
  | "supplies"
  | "analytics"
  | "history";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "queue", label: "Print Queue" },
  { id: "printers", label: "Printers" },
  { id: "bridges", label: "Print Bridges" },
  { id: "groups", label: "Groups" },
  { id: "routing", label: "Routing" },
  { id: "templates", label: "Templates" },
  { id: "batches", label: "Batches" },
  { id: "supplies", label: "Supplies" },
  { id: "analytics", label: "Analytics" },
  { id: "history", label: "Print History" },
];

function statusBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === "ONLINE" || s === "COMPLETED" || s === "SENT_TO_PRINTER" || s === "PUBLISHED") {
    return "bg-label-success";
  }
  if (s === "WARNING" || s === "PAIRING" || s === "UNPUBLISHED") return "bg-label-warning";
  if (s === "ERROR" || s === "FAILED" || s === "OFFLINE" || s === "DISABLED")
    return "bg-label-danger";
  if (s === "PRINTING" || s === "SPOOLING" || s === "TRANSMITTING") return "bg-label-primary";
  return "bg-label-secondary";
}

function jobTitle(job: { module?: string | null; recordType?: string | null; id: string }): string {
  const parts = [job.module, job.recordType].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return `Job ${job.id.slice(0, 8)}`;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-success"
      : tone === "warning"
        ? "border-warning"
        : tone === "danger"
          ? "border-danger"
          : "";
  return (
    <div className="col-6 col-md-4 col-xl-2">
      <div className={`card border shadow-none h-100 ${toneClass}`}>
        <div className="card-body py-3">
          <div className="text-muted small text-uppercase mb-1">{label}</div>
          <div className="fs-4 fw-semibold mb-0">{value}</div>
        </div>
      </div>
    </div>
  );
}

export function PrintManagerWorkspace({ moduleName }: { moduleName: string }) {
  const { me, hasAnyPermission, loading: authLoading } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canManageBridge = hasAnyPermission([
    "industrial.printer.manage_bridge",
    "industrial.admin",
  ]);
  const canManagePrinters = hasAnyPermission([
    "industrial.printer.manage",
    "industrial.printer.manage_bridge",
    "industrial.admin",
  ]);
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);

  const searchParams = useSearchParams();
  const initialTab = useMemo(() => {
    const raw = String(searchParams.get("tab") ?? "").toLowerCase();
    const match = TABS.find((t) => t.id === raw);
    return match?.id ?? "dashboard";
  }, [searchParams]);
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "PRINT_MANAGER",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "dashboard",
      ),
    );
  }, [tab, visibleTabs]);
  const [summary, setSummary] = useState<PrintManagerSummary | null>(null);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [bridges, setBridges] = useState<PrinterBridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [nextSummary, printerRows, bridgeRows] = await Promise.all([
        getPrintManagerSummary(),
        listPrinters().catch(() => [] as ForgePrinter[]),
        listPrinterBridges().catch(() => [] as PrinterBridge[]),
      ]);
      setSummary(nextSummary);
      setPrinters(printerRows);
      setBridges(bridgeRows);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Print Manager.");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (authLoading || !canView) return;
    if (tab === "dashboard" || tab === "printers" || tab === "bridges") {
      void loadDashboard();
    }
  }, [authLoading, canView, tab, loadDashboard]);

  const bridgeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bridges) map.set(b.id, b.name);
    for (const b of summary?.bridgeHealth ?? []) map.set(b.id, b.name);
    return map;
  }, [bridges, summary]);

  const bridgeRows = useMemo(() => {
    if (summary?.bridgeHealth.length) return summary.bridgeHealth;
    return bridges.map((b) => ({
      id: b.id,
      name: b.name,
      computerName: b.computerName,
      version: b.bridgeVersion,
      status: b.status,
      enabled: b.enabled,
      lastSeenAt: b.lastSeenAt,
      printerCount: printers.filter((p) => p.bridgeId === b.id).length,
      pendingJobs: 0,
      locationId: b.locationId,
    }));
  }, [summary, bridges, printers]);

  async function onPublishPrinter(printer: ForgePrinter, enabled: boolean) {
    if (!canManagePrinters) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      await updatePrinter(printer.id, { enabled });
      setMessage(
        enabled
          ? `${printerDisplayName(printer)} published.`
          : `${printerDisplayName(printer)} unpublished.`,
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update printer.");
    } finally {
      setBusyId(null);
    }
  }

  async function onTestPrinter(printer: ForgePrinter) {
    if (!canPrint) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      const job = await testPrinter(printer.id);
      setMessage(
        `Test print queued for ${printerDisplayName(printer)} (job ${job.id.slice(0, 8)}…).`,
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test print failed.");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading Print Manager…</p>;
  }

  if (!canView) {
    return (
      <AdminEmptyState
        title="Print Manager"
        description="You do not have permission to view printers or print jobs."
      />
    );
  }

  return (
    <section aria-labelledby="print-manager-title">
      <ModuleWorkspaceHeader
        id="print-manager-title"
        eyebrow="System Tools"
        title={moduleName}
        description="Centralized Forge printing — queue, printers, bridges, routing, and job history."
        {...(tab === "dashboard" || tab === "printers" || tab === "bridges"
          ? { onRefresh: () => void loadDashboard(), refreshing: loading }
          : {})}
      />

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Print Manager sections"
      >
        {tab === "dashboard" ? (
          <div>
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}
            {loading && !summary ? (
              <p className="text-muted">Loading dashboard…</p>
            ) : summary ? (
              <>
                <div className="row g-3 mb-4">
                  <StatCard
                    label="Printers online"
                    value={summary.printers.online}
                    tone="success"
                  />
                  <StatCard label="Printers offline" value={summary.printers.offline} />
                  <StatCard
                    label="Printers warning"
                    value={summary.printers.warning}
                    tone="warning"
                  />
                  <StatCard label="Printers error" value={summary.printers.error} tone="danger" />
                  <StatCard label="Bridges online" value={summary.bridges.online} tone="success" />
                  <StatCard label="Bridges offline" value={summary.bridges.offline} tone="danger" />
                  <StatCard label="Jobs queued" value={summary.jobs.queued} />
                  <StatCard label="Jobs printing" value={summary.jobs.printing} tone="warning" />
                  <StatCard
                    label="Completed today"
                    value={summary.jobs.completedToday}
                    tone="success"
                  />
                  <StatCard label="Failed today" value={summary.jobs.failedToday} tone="danger" />
                  <StatCard label="Labels today" value={summary.jobs.labelsPrintedToday} />
                  <StatCard label="Pages today" value={summary.jobs.pagesPrintedToday} />
                  {summary.batches ? (
                    <>
                      <StatCard label="Batches active" value={summary.batches.active} />
                      <StatCard
                        label="Batch jobs pending"
                        value={summary.batches.jobsPending}
                        tone="warning"
                      />
                      <StatCard
                        label="Batch jobs failed"
                        value={summary.batches.jobsFailed}
                        tone="danger"
                      />
                    </>
                  ) : null}
                  {summary.supplies ? (
                    <>
                      <StatCard
                        label="Supplies low"
                        value={summary.supplies.warning}
                        tone="warning"
                      />
                      <StatCard
                        label="Supplies critical"
                        value={summary.supplies.critical + summary.supplies.empty}
                        tone="danger"
                      />
                    </>
                  ) : null}
                </div>

                <div className="row g-3">
                  <div className="col-lg-7">
                    <div className="card border shadow-none h-100">
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <h6 className="mb-0">Live queue</h6>
                        <button
                          type="button"
                          className="btn btn-sm btn-link"
                          onClick={() => setTab("queue")}
                        >
                          Open queue
                        </button>
                      </div>
                      <div className="table-responsive">
                        <table className="table mb-0">
                          <thead>
                            <tr>
                              <th>Job</th>
                              <th>Module</th>
                              <th>Printer</th>
                              <th>Status</th>
                              <th>Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.liveQueue.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-muted">
                                  No active jobs.
                                </td>
                              </tr>
                            ) : (
                              summary.liveQueue.map((job) => (
                                <tr key={job.id}>
                                  <td className="font-monospace small">{job.id.slice(0, 8)}</td>
                                  <td>{jobTitle(job)}</td>
                                  <td>{job.printerName || "—"}</td>
                                  <td>
                                    <span className={`badge ${statusBadge(job.status)}`}>
                                      {job.status}
                                    </span>
                                  </td>
                                  <td className="small text-muted">
                                    {formatAdminDate(job.createdAt)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-5">
                    <div className="card border shadow-none mb-3">
                      <div className="card-header">
                        <h6 className="mb-0">Printer health</h6>
                      </div>
                      <div className="table-responsive">
                        <table className="table mb-0">
                          <thead>
                            <tr>
                              <th>Printer</th>
                              <th>Status</th>
                              <th>Last seen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.printerHealth.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="text-muted">
                                  No printers published yet.
                                </td>
                              </tr>
                            ) : (
                              summary.printerHealth.slice(0, 8).map((p) => (
                                <tr key={p.id}>
                                  <td>
                                    <div>{p.name}</div>
                                    <div className="small text-muted">
                                      {connectionBadgeLabel(p.connectionType)}
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`badge ${statusBadge(p.status)}`}>
                                      {p.status}
                                    </span>
                                  </td>
                                  <td className="small text-muted">
                                    {formatAdminDate(p.lastSeenAt)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="card border shadow-none">
                      <div className="card-header">
                        <h6 className="mb-0">Recent errors</h6>
                      </div>
                      <div className="table-responsive">
                        <table className="table mb-0">
                          <thead>
                            <tr>
                              <th>When</th>
                              <th>Printer</th>
                              <th>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.recentErrors.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="text-muted">
                                  No failures today.
                                </td>
                              </tr>
                            ) : (
                              summary.recentErrors.slice(0, 8).map((e) => (
                                <tr key={e.id}>
                                  <td className="small text-muted">
                                    {formatAdminDate(e.createdAt)}
                                  </td>
                                  <td>{e.printerName || "—"}</td>
                                  <td className="small">
                                    {e.errorCode || e.errorMessage || e.status}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === "queue" ? <PrintQueueWorkspace moduleName="Print Queue" embedded /> : null}

        {tab === "history" ? <PrintHistoryWorkspace moduleName="Print History" embedded /> : null}

        {tab === "printers" ? (
          <div>
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="alert alert-success" role="alert">
                {message}
              </div>
            ) : null}
            <div className="card border shadow-none">
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>Printer</th>
                      <th>Connection</th>
                      <th>Bridge</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted">
                          No printers found. Register a Print Bridge or pair Direct Bluetooth.
                        </td>
                      </tr>
                    ) : (
                      printers.map((p) => {
                        const health = !p.enabled
                          ? "UNPUBLISHED"
                          : (summary?.printerHealth.find((h) => h.id === p.id)?.status ??
                            (p.online ? (p.ready ? "ONLINE" : "WARNING") : "OFFLINE"));
                        return (
                          <tr key={p.id}>
                            <td>
                              <div>{printerDisplayName(p)}</div>
                              <div className="small text-muted">
                                {[p.manufacturer, p.model].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </td>
                            <td>{connectionBadgeLabel(p.connectionType)}</td>
                            <td>
                              {p.bridgeId
                                ? bridgeNameById.get(p.bridgeId) || p.bridgeId.slice(0, 8)
                                : "Direct"}
                            </td>
                            <td>
                              <span className={`badge ${statusBadge(health)}`}>{health}</span>
                            </td>
                            <td className="small text-muted">{formatAdminDate(p.lastSeenAt)}</td>
                            <td className="text-end">
                              <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                                {canManagePrinters ? (
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${p.enabled ? "btn-outline-secondary" : "btn-outline-success"}`}
                                    disabled={busyId === p.id}
                                    onClick={() => void onPublishPrinter(p, !p.enabled)}
                                  >
                                    {p.enabled ? "Unpublish" : "Publish"}
                                  </button>
                                ) : null}
                                {canPrint ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={busyId === p.id || !p.enabled}
                                    onClick={() => void onTestPrinter(p)}
                                  >
                                    Test
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "bridges" ? (
          <div>
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}
            <div className="d-flex flex-wrap gap-2 mb-3">
              {canManageBridge ? (
                <Link
                  className="btn btn-primary btn-sm"
                  href="/settings/integrations/printer-bridges/"
                >
                  Manage bridges
                </Link>
              ) : null}
            </div>
            <div className="card border shadow-none">
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>Bridge</th>
                      <th>Computer</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Printers</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bridgeRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted">
                          No Print Bridges registered. Install Forge Print Bridge and pair from
                          Settings.
                        </td>
                      </tr>
                    ) : (
                      bridgeRows.map((b) => (
                        <tr key={b.id}>
                          <td>{b.name}</td>
                          <td>{b.computerName || "—"}</td>
                          <td className="font-monospace small">{b.version || "—"}</td>
                          <td>
                            <span className={`badge ${statusBadge(b.status)}`}>
                              {bridgeStatusLabel(b.status, b.enabled)}
                            </span>
                          </td>
                          <td>{b.printerCount}</td>
                          <td className="small text-muted">{formatAdminDate(b.lastSeenAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "groups" ? <PrintManagerGroupsPanel /> : null}

        {tab === "routing" ? <PrintManagerRoutingPanel /> : null}

        {tab === "templates" ? <PrintManagerTemplatesPanel /> : null}

        {tab === "batches" ? <PrintManagerBatchesPanel /> : null}

        {tab === "supplies" ? <PrintManagerSuppliesPanel /> : null}

        {tab === "analytics" ? <PrintManagerAnalyticsPanel /> : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
