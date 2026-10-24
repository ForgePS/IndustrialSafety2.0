"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ForgePrintDialog } from "@/components/forge-print-dialog";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { FleetCustomReportBuilder } from "@/components/fleet-custom-report-builder";
import {
  fleetAssetHref,
  fleetAssetLabel,
  fleetAssetPrintFieldValues,
  ensureFleetDvirPrintQrPayload,
} from "@/lib/fleet";
import { formatApiErrorMessage } from "@/lib/api-error";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";
import { PERSONNEL_QUICK_LINKS } from "@/lib/personnel-quick-nav";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};

type TabId =
  | "dashboard"
  | "assets"
  | "drivers"
  | "renewals"
  | "compliance"
  | "maintenance"
  | "inspections"
  | "documents"
  | "removed"
  | "reports"
  | "settings";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "assets", label: "Assets" },
  { id: "drivers", label: "DRIVERS" },
  { id: "renewals", label: "Renewals" },
  { id: "compliance", label: "Compliance" },
  { id: "maintenance", label: "Maintenance" },
  { id: "inspections", label: "Inspections" },
  { id: "documents", label: "Documents" },
  { id: "removed", label: "Removed" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

const COMPANY_DRIVERS_HREF =
  PERSONNEL_QUICK_LINKS.find((link) => link.id === "company-drivers")?.href ??
  "/modules/personnel/?view=company-drivers";

function parseFleetTab(raw: string | null | undefined): TabId {
  if (raw && TABS.some((tab) => tab.id === raw)) return raw as TabId;
  return "dashboard";
}

const ASSET_TYPES = [
  "PASSENGER_VEHICLE",
  "FLEET_VEHICLE",
  "BOB_TRUCK",
  "TRASH_TRUCK",
  "TRACTOR_TRUCK",
  "DUMP_TRUCK",
  "CONSTRUCTION_EQUIPMENT",
  "OTHER",
] as const;

const ASSET_TYPE_LABELS: Record<string, string> = {
  PASSENGER_VEHICLE: "Passenger vehicle",
  FLEET_VEHICLE: "Fleet vehicle",
  BOB_TRUCK: "Bob truck",
  TRASH_TRUCK: "Trash truck",
  TRACTOR_TRUCK: "Tractor truck",
  DUMP_TRUCK: "Dump truck",
  CONSTRUCTION_EQUIPMENT: "Construction equipment",
  OTHER: "Other",
};

const FLEET_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  OUT_OF_SERVICE: "Out of service",
  INACTIVE: "Inactive",
  REMOVED: "Removed",
  DISPOSED: "Disposed",
  COMPLETED: "Completed",
  OPEN: "Open",
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
};

function fleetAssetTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  return (
    ASSET_TYPE_LABELS[type] ??
    type
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

function fleetStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return FLEET_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

function labelOf(item: Record<string, unknown>) {
  return fleetAssetLabel(item);
}

const FLEET_TAB_META: Record<TabId, { label: string; description: string; icon: string }> = {
  dashboard: {
    label: "Dashboard",
    description: "Fleet totals, asset mix, and quick links into each section.",
    icon: "bx-grid-alt",
  },
  assets: {
    label: "Assets",
    description:
      "Active vehicles and equipment — open any row for full edit, maintenance, insurance, and registration.",
    icon: "bx-car",
  },
  drivers: {
    label: "Drivers",
    description: "Company driver roster linked to Personnel records.",
    icon: "bx-user",
  },
  renewals: {
    label: "Renewals",
    description: "Registration renewal buckets and upcoming due dates.",
    icon: "bx-calendar",
  },
  compliance: {
    label: "Compliance",
    description: "Insurance, Form 2290, IRP, county, fringe, and commute tracking.",
    icon: "bx-shield-quarter",
  },
  maintenance: {
    label: "Maintenance",
    description: "Preventive maintenance and work orders across the fleet.",
    icon: "bx-wrench",
  },
  inspections: {
    label: "Inspections",
    description: "Vehicle inspections and defect / out-of-service workflow.",
    icon: "bx-check-shield",
  },
  documents: {
    label: "Documents",
    description: "Titles, registrations, insurance cards, and fleet attachments.",
    icon: "bx-file",
  },
  removed: {
    label: "Removed",
    description: "Disposed and archived assets kept for history and reporting.",
    icon: "bx-archive",
  },
  reports: {
    label: "Reports",
    description:
      "Build custom asset reports with your own columns and filters, or download standard CSV exports.",
    icon: "bx-export",
  },
  settings: {
    label: "Settings",
    description: "Insurer contacts and renewal notification recipients.",
    icon: "bx-cog",
  },
};

const RENEWAL_BUCKET_LABELS: Record<string, string> = {
  OVERDUE: "Overdue",
  DUE_30: "Due in 30 days",
  DUE_60: "Due in 60 days",
  DUE_90: "Due in 90 days",
  LATER: "Later",
  UNKNOWN: "Unknown",
};

function fleetStatusBadgeClass(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "COMPLETED") return "bg-label-success";
  if (normalized === "OUT_OF_SERVICE") return "bg-label-warning";
  if (normalized === "INACTIVE" || normalized === "REMOVED" || normalized === "DISPOSED") {
    return "bg-label-secondary";
  }
  if (normalized === "OPEN" || normalized === "PENDING" || normalized === "SCHEDULED") {
    return "bg-label-info";
  }
  return "bg-label-secondary";
}

function renewalBucketLabel(bucket: string): string {
  return RENEWAL_BUCKET_LABELS[bucket] ?? bucket.replaceAll("_", " ");
}

function renewalBucketBadgeClass(bucket: string): string {
  if (bucket === "OVERDUE") return "bg-label-danger";
  if (bucket === "DUE_30") return "bg-label-warning";
  if (bucket === "DUE_60" || bucket === "DUE_90") return "bg-label-info";
  return "bg-label-secondary";
}

function FleetEmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-5">
      <div className="avatar avatar-lg mx-auto mb-3">
        <span className="avatar-initial rounded-circle bg-label-secondary">
          <i className={`bx ${icon}`} />
        </span>
      </div>
      <p className="text-muted mb-0">{message}</p>
    </div>
  );
}

export function FleetWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.fleet.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.fleet.manage") || permissions.has("industrial.admin");
  const canPrintLabel =
    permissions.has("industrial.printer.print") || permissions.has("industrial.admin");

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "FLEET",
    canView,
  });
  const [tab, setTab] = useState<TabId>(() => parseFleetTab(searchParams.get("tab")));
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "FLEET",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<Array<Record<string, unknown>>>([]);
  const [printTarget, setPrintTarget] = useState<Record<string, unknown> | null>(null);
  const [printQrPayload, setPrintQrPayload] = useState<string | null>(null);
  const [printQrBusyId, setPrintQrBusyId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [batchPrintItems, setBatchPrintItems] = useState<Array<{
    recordId: string;
    title?: string;
    fieldValues: Record<string, string>;
  }> | null>(null);
  const [batchPrintBusy, setBatchPrintBusy] = useState(false);
  const [drivers, setDrivers] = useState<Array<Record<string, unknown>>>([]);
  const [renewals, setRenewals] = useState<Record<string, unknown> | null>(null);
  const [maintenance, setMaintenance] = useState<Array<Record<string, unknown>>>([]);
  const [inspections, setInspections] = useState<Array<Record<string, unknown>>>([]);
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState("");
  const [assetType, setAssetType] = useState("");
  const [status, setStatus] = useState("");
  const [insuredFilter, setInsuredFilter] = useState("");
  const [renewalBucket, setRenewalBucket] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    year: "",
    make: "",
    model: "",
    color: "",
    vin: "",
    licensePlate: "",
    assetType: "FLEET_VEHICLE",
    locationName: "",
    renewalMonth: "",
    notes: "",
    dotRegulated: false,
  });
  const [settingsForm, setSettingsForm] = useState({
    insurerName: "",
    insurerEmail: "",
    lastSampleYear: "",
    notificationRecipients: "",
  });

  useEffect(() => {
    setTab(parseFleetTab(searchParams.get("tab")));
  }, [searchParams]);

  const clearListFilters = useCallback(() => {
    setQ("");
    setStatus("");
    setAssetType("");
    setInsuredFilter("");
    setRenewalBucket("");
  }, []);

  function navigateFleet(
    next: TabId,
    opts?: {
      status?: string;
      assetType?: string;
      insured?: string;
      renewalBucket?: string;
      clearFilters?: boolean;
    },
  ) {
    if (opts?.clearFilters) clearListFilters();
    if (opts?.status !== undefined) setStatus(opts.status);
    if (opts?.assetType !== undefined) setAssetType(opts.assetType);
    if (opts?.insured !== undefined) setInsuredFilter(opts.insured);
    if (opts?.renewalBucket !== undefined) setRenewalBucket(opts.renewalBucket);
    setTab(next);
  }

  useEffect(() => {
    const next = ensureActiveModuleTab(
      tab,
      visibleTabs.map((t) => t.id),
      "dashboard",
    );
    if (next !== tab) navigateFleet(next);
  }, [tab, visibleTabs]);

  const loadTab = useCallback(
    async (filterOverrides?: {
      q?: string;
      assetType?: string;
      status?: string;
      insuredFilter?: string;
      renewalBucket?: string;
    }) => {
      if (!awsReady) return;
      const filters = {
        q: filterOverrides?.q ?? q,
        assetType: filterOverrides?.assetType ?? assetType,
        status: filterOverrides?.status ?? status,
        insuredFilter: filterOverrides?.insuredFilter ?? insuredFilter,
        renewalBucket: filterOverrides?.renewalBucket ?? renewalBucket,
      };
      setLoading(true);
      setError(null);
      try {
        if (tab === "dashboard") {
          setDashboard(await apiGet<Record<string, unknown>>("/api/v1/industrial/fleet/dashboard"));
        } else if (tab === "assets" || tab === "compliance") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/vehicles", {
            query: {
              q: filters.q || undefined,
              assetType: filters.assetType || undefined,
              status: filters.status || undefined,
              insured: filters.insuredFilter || undefined,
              page: "1",
              pageSize: "100",
            },
          });
          setAssets(res.items ?? []);
        } else if (tab === "removed") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/vehicles", {
            query: { removed: "true", q: filters.q || undefined, page: "1", pageSize: "100" },
          });
          setAssets(res.items ?? []);
        } else if (tab === "drivers") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/drivers", {
            query: { q: filters.q || undefined, page: "1", pageSize: "100" },
          });
          setDrivers(res.items ?? []);
        } else if (tab === "renewals") {
          setRenewals(
            await apiGet<Record<string, unknown>>("/api/v1/industrial/fleet/renewals", {
              query: {
                bucket: filters.renewalBucket || undefined,
                page: "1",
                pageSize: "500",
              },
            }),
          );
        } else if (tab === "maintenance") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/maintenance", {
            query: { page: "1", pageSize: "100" },
          });
          setMaintenance(res.items ?? []);
        } else if (tab === "inspections") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/inspections", {
            query: { page: "1", pageSize: "100" },
          });
          setInspections(res.items ?? []);
        } else if (tab === "documents") {
          const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/documents", {
            query: { page: "1", pageSize: "100" },
          });
          setDocuments(res.items ?? []);
        } else if (tab === "settings") {
          const s = await apiGet<Record<string, unknown>>("/api/v1/industrial/fleet/settings");
          setSettings(s);
          setSettingsForm({
            insurerName: String(s.insurerName ?? ""),
            insurerEmail: String(s.insurerEmail ?? ""),
            lastSampleYear: s.lastSampleYear != null ? String(s.lastSampleYear) : "",
            notificationRecipients: Array.isArray(s.notificationRecipients)
              ? (s.notificationRecipients as string[]).join(", ")
              : "",
          });
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load fleet data");
      } finally {
        setLoading(false);
      }
    },
    [awsReady, tab, q, assetType, status, insuredFilter, renewalBucket],
  );

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadTab();
    // Only auto-reload when the tab (or AWS gate) changes. Typing in search must not
    // remount the filter panel — Apply / Clear / chip remove call loadTab explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [awsReady, tab]);

  function openAsset(id: string) {
    if (!id) return;
    router.push(fleetAssetHref(id));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiSend<Record<string, unknown>>(
        "/api/v1/industrial/fleet/vehicles",
        "POST",
        {
          year: form.year ? Number(form.year) : null,
          make: form.make || null,
          model: form.model || null,
          color: form.color || null,
          vin: form.vin || null,
          licensePlate: form.licensePlate || null,
          assetType: form.assetType,
          locationName: form.locationName || null,
          registrationRenewalMonth: form.renewalMonth || null,
          notes: form.notes || null,
          dotRegulated: form.dotRegulated,
        },
      );
      setForm({
        year: "",
        make: "",
        model: "",
        color: "",
        vin: "",
        licensePlate: "",
        assetType: "FLEET_VEHICLE",
        locationName: "",
        renewalMonth: "",
        notes: "",
        dotRegulated: false,
      });
      const createdId = String(created.id ?? "");
      if (createdId) {
        router.push(fleetAssetHref(createdId));
        return;
      }
      await loadTab();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function downloadReport(report: string) {
    try {
      const res = await apiGet<{ filename: string; csv: string }>(
        `/api/v1/industrial/fleet/reports/${report}`,
      );
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `fleet-${report}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    try {
      const recipients = settingsForm.notificationRecipients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const s = await apiSend<Record<string, unknown>>(
        "/api/v1/industrial/fleet/settings",
        "PATCH",
        {
          insurerName: settingsForm.insurerName || null,
          insurerEmail: settingsForm.insurerEmail || null,
          lastSampleYear: settingsForm.lastSampleYear ? Number(settingsForm.lastSampleYear) : null,
          notificationRecipients: recipients,
        },
      );
      setSettings(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Settings save failed");
    }
  }

  const renewalBuckets = useMemo(() => {
    const b = (renewals?.buckets as Record<string, number> | undefined) ?? {};
    return b;
  }, [renewals]);

  const byType = useMemo(() => {
    const raw = (dashboard?.byType as Record<string, number> | undefined) ?? {};
    return Object.entries(raw).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [dashboard]);

  const byStatus = useMemo(() => {
    const raw = (dashboard?.byStatus as Record<string, number> | undefined) ?? {};
    return Object.entries(raw).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [dashboard]);

  const dashboardTiles = useMemo(
    () => [
      {
        id: "active",
        label: "Active assets",
        value: String(dashboard?.totalActive ?? 0),
        icon: "bx-car",
        tone: "primary",
        onActivate: () => navigateFleet("assets", { clearFilters: true }),
      },
      {
        id: "oos",
        label: "Out of service",
        value: String(dashboard?.outOfService ?? 0),
        icon: "bx-error-circle",
        tone: "warning",
        onActivate: () => navigateFleet("assets", { clearFilters: true, status: "OUT_OF_SERVICE" }),
      },
      {
        id: "insured",
        label: "Insured",
        value: String(dashboard?.insured ?? 0),
        icon: "bx-shield-quarter",
        tone: "success",
        onActivate: () => navigateFleet("compliance", { clearFilters: true, insured: "true" }),
      },
      {
        id: "removed",
        label: "Removed",
        value: String(dashboard?.totalRemoved ?? 0),
        icon: "bx-archive",
        tone: "secondary",
        onActivate: () => navigateFleet("removed", { clearFilters: true }),
      },
      {
        id: "overdue",
        label: "Renewals overdue",
        value: String((dashboard?.renewals as Record<string, number> | undefined)?.OVERDUE ?? 0),
        icon: "bx-calendar-x",
        tone: "danger",
        onActivate: () =>
          navigateFleet("renewals", { clearFilters: true, renewalBucket: "OVERDUE" }),
      },
    ],
    // navigateFleet closes over latest setters; rebuild when dashboard counts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard],
  );

  const activeTabMeta = FLEET_TAB_META[tab];

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  return (
    <section
      aria-labelledby="fleet-title"
      className="fleet-workspace"
      data-walkthrough="fleet-overview"
    >
      <ModuleWorkspaceHeader
        id="fleet-title"
        eyebrow="Equipment & Operations"
        title={moduleName}
        description="Assets, DRIVERS, compliance renewals, maintenance, and disposition."
        onRefresh={() => void loadTab()}
        refreshing={loading}
      />

      {error ? (
        <div
          className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4"
          role="alert"
        >
          <span className="flex-grow-1">{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => void loadTab()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={(next) => navigateFleet(next)}
        ariaLabel="Fleet sections"
        tabPanelLabel={activeTabMeta.label}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
          <div className="min-w-0">
            <h5 className="mb-1">{activeTabMeta.label}</h5>
            <p className="text-muted small mb-0">{activeTabMeta.description}</p>
          </div>
          {tab === "drivers" ? (
            <Link className="btn btn-sm btn-outline-primary" href={COMPANY_DRIVERS_HREF}>
              <i className="bx bx-user me-1" />
              Company DRIVERS
            </Link>
          ) : null}
        </div>

        {loading ? (
          <p className="text-muted mb-0" role="status" aria-live="polite">
            Loading {activeTabMeta.label.toLowerCase()}…
          </p>
        ) : null}

        {!loading && tab === "dashboard" && dashboard ? (
          <>
            <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-5 g-3 mb-4">
              {dashboardTiles.map((tile) => (
                <div className="col" key={tile.id}>
                  <button
                    type="button"
                    className="card h-100 w-100 text-start border shadow-none"
                    onClick={tile.onActivate}
                  >
                    <div className="card-body p-3">
                      <div className="avatar avatar-sm mb-2">
                        <span className={`avatar-initial rounded bg-label-${tile.tone}`}>
                          <i className={`bx ${tile.icon}`} />
                        </span>
                      </div>
                      <span className="d-block text-muted small">{tile.label}</span>
                      <h5 className="mb-0">{tile.value}</h5>
                      <span className="small text-primary">View →</span>
                    </div>
                  </button>
                </div>
              ))}
            </div>

            <div className="row g-3 mb-4">
              <div className="col-lg-6">
                <div className="card border shadow-none h-100">
                  <div className="card-header">
                    <h6 className="card-title mb-0">By asset type</h6>
                  </div>
                  <div className="card-body">
                    {byType.length === 0 ? (
                      <p className="text-muted small mb-0">No active assets.</p>
                    ) : (
                      <ul className="list-group list-group-flush">
                        {byType.map(([type, count]) => (
                          <li key={type} className="list-group-item px-0">
                            <button
                              type="button"
                              className="btn btn-link p-0 text-decoration-none w-100 d-flex justify-content-between align-items-center"
                              onClick={() =>
                                navigateFleet("assets", {
                                  clearFilters: true,
                                  assetType: type,
                                })
                              }
                            >
                              <span>{type}</span>
                              <span className="badge bg-label-primary rounded-pill">{count}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="card border shadow-none h-100">
                  <div className="card-header">
                    <h6 className="card-title mb-0">By status</h6>
                  </div>
                  <div className="card-body">
                    {byStatus.length === 0 ? (
                      <p className="text-muted small mb-0">No active assets.</p>
                    ) : (
                      <ul className="list-group list-group-flush">
                        {byStatus.map(([statusKey, count]) => (
                          <li key={statusKey} className="list-group-item px-0">
                            <button
                              type="button"
                              className="btn btn-link p-0 text-decoration-none w-100 d-flex justify-content-between align-items-center"
                              onClick={() =>
                                navigateFleet("assets", {
                                  clearFilters: true,
                                  status: statusKey,
                                })
                              }
                            >
                              <span>{statusKey}</span>
                              <span className="badge bg-label-secondary rounded-pill">{count}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="card-title mb-0">Quick sections</h6>
              </div>
              <div className="card-body d-flex flex-wrap gap-2">
                {TABS.filter((entry) => entry.id !== "dashboard").map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={() => navigateFleet(entry.id, { clearFilters: true })}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === "assets" || tab === "removed" || tab === "compliance" ? (
          <>
            <FilterPanel
              searchId="fleet-asset-search"
              searchValue={q}
              onSearchChange={setQ}
              searchPlaceholder="VIN, plate, make…"
              chips={[
                ...(q
                  ? [
                      {
                        id: "q",
                        label: `Search: ${q}`,
                        onRemove: () => {
                          setQ("");
                          void loadTab({ q: "" });
                        },
                      },
                    ]
                  : []),
                ...(status && (tab === "assets" || tab === "compliance")
                  ? [
                      {
                        id: "status",
                        label: `Status: ${status}`,
                        onRemove: () => {
                          setStatus("");
                          void loadTab({ status: "" });
                        },
                      },
                    ]
                  : []),
                ...(assetType && (tab === "assets" || tab === "compliance")
                  ? [
                      {
                        id: "type",
                        label: `Type: ${assetType}`,
                        onRemove: () => {
                          setAssetType("");
                          void loadTab({ assetType: "" });
                        },
                      },
                    ]
                  : []),
                ...(insuredFilter
                  ? [
                      {
                        id: "insured",
                        label: `Insured: ${insuredFilter === "true" ? "Yes" : insuredFilter}`,
                        onRemove: () => {
                          setInsuredFilter("");
                          void loadTab({ insuredFilter: "" });
                        },
                      },
                    ]
                  : []),
              ]}
              onClearAll={() => {
                clearListFilters();
                void loadTab({
                  q: "",
                  status: "",
                  assetType: "",
                  insuredFilter: "",
                  renewalBucket: "",
                });
              }}
              onSubmit={() => void loadTab()}
              extraFields={
                tab === "assets" || tab === "compliance" ? (
                  <>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="fleet-asset-type">
                        Type
                      </label>
                      <select
                        id="fleet-asset-type"
                        className="form-select form-select-sm"
                        value={assetType}
                        onChange={(ev) => setAssetType(ev.target.value)}
                      >
                        <option value="">All</option>
                        {ASSET_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {fleetAssetTypeLabel(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="fleet-asset-status">
                        Status
                      </label>
                      <select
                        id="fleet-asset-status"
                        className="form-select form-select-sm"
                        value={status}
                        onChange={(ev) => setStatus(ev.target.value)}
                      >
                        <option value="">Active (default)</option>
                        <option value="ACTIVE">Active</option>
                        <option value="OUT_OF_SERVICE">Out of service</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </div>
                    {tab === "compliance" ? (
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-insured-filter">
                          Insured
                        </label>
                        <select
                          id="fleet-insured-filter"
                          className="form-select form-select-sm"
                          value={insuredFilter}
                          onChange={(ev) => setInsuredFilter(ev.target.value)}
                        >
                          <option value="">All</option>
                          <option value="true">Insured</option>
                          <option value="false">Not insured</option>
                        </select>
                      </div>
                    ) : null}
                  </>
                ) : undefined
              }
            />

            {canPrintLabel && selectedAssetIds.length > 0 ? (
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <span className="small text-muted">{selectedAssetIds.length} selected</span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={batchPrintBusy || selectedAssetIds.length < 1}
                  onClick={() => {
                    void (async () => {
                      setBatchPrintBusy(true);
                      setPrintError(null);
                      try {
                        const selected = assets.filter((a) =>
                          selectedAssetIds.includes(String(a.id)),
                        );
                        if (selected.length === 0) return;
                        if (selected.length === 1) {
                          const item = selected[0]!;
                          const qr = await ensureFleetDvirPrintQrPayload(item);
                          setPrintQrPayload(qr ?? null);
                          setBatchPrintItems(null);
                          setPrintTarget(item);
                          return;
                        }
                        const items: Array<{
                          recordId: string;
                          title?: string;
                          fieldValues: Record<string, string>;
                        }> = [];
                        for (const item of selected.slice(0, 200)) {
                          const qr = await ensureFleetDvirPrintQrPayload(item);
                          items.push({
                            recordId: String(item.id),
                            title: labelOf(item),
                            fieldValues: fleetAssetPrintFieldValues(item, {
                              ...(qr ? { qrPayload: qr } : {}),
                            }),
                          });
                        }
                        setPrintTarget(null);
                        setPrintQrPayload(null);
                        setBatchPrintItems(items);
                      } catch (e) {
                        setPrintError(
                          formatApiErrorMessage(e, "Could not prepare batch labels for print"),
                        );
                      } finally {
                        setBatchPrintBusy(false);
                      }
                    })();
                  }}
                >
                  {batchPrintBusy
                    ? "Preparing…"
                    : selectedAssetIds.length === 1
                      ? "Print Label"
                      : `Print ${selectedAssetIds.length} Labels`}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setSelectedAssetIds([])}
                >
                  Clear selection
                </button>
              </div>
            ) : null}

            {tab === "assets" && canManage ? (
              <div className="card border shadow-none mb-4">
                <div className="card-header">
                  <h6 className="card-title mb-0">Create asset</h6>
                </div>
                <div className="card-body">
                  <form onSubmit={(e) => void onCreate(e)}>
                    <div className="row g-3">
                      <div className="col-md-2">
                        <label className="form-label" htmlFor="fleet-year">
                          Year
                        </label>
                        <input
                          id="fleet-year"
                          className="form-control form-control-sm"
                          value={form.year}
                          onChange={(e) => setForm({ ...form, year: e.target.value })}
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label" htmlFor="fleet-make">
                          Make
                        </label>
                        <input
                          id="fleet-make"
                          className="form-control form-control-sm"
                          value={form.make}
                          onChange={(e) => setForm({ ...form, make: e.target.value })}
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label" htmlFor="fleet-model">
                          Model
                        </label>
                        <input
                          id="fleet-model"
                          className="form-control form-control-sm"
                          value={form.model}
                          onChange={(e) => setForm({ ...form, model: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-vin">
                          VIN
                        </label>
                        <input
                          id="fleet-vin"
                          className="form-control form-control-sm"
                          value={form.vin}
                          onChange={(e) => setForm({ ...form, vin: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-license">
                          License
                        </label>
                        <input
                          id="fleet-license"
                          className="form-control form-control-sm"
                          value={form.licensePlate}
                          onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-type">
                          Type
                        </label>
                        <select
                          id="fleet-type"
                          className="form-select form-select-sm"
                          value={form.assetType}
                          onChange={(e) => setForm({ ...form, assetType: e.target.value })}
                        >
                          {ASSET_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {fleetAssetTypeLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-location">
                          Location
                        </label>
                        <input
                          id="fleet-location"
                          className="form-control form-control-sm"
                          value={form.locationName}
                          onChange={(e) => setForm({ ...form, locationName: e.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="fleet-renewal">
                          Renewal month
                        </label>
                        <input
                          id="fleet-renewal"
                          className="form-control form-control-sm"
                          value={form.renewalMonth}
                          onChange={(e) => setForm({ ...form, renewalMonth: e.target.value })}
                          placeholder="December"
                        />
                      </div>
                      <div className="col-12">
                        <div className="form-check">
                          <input
                            id="fleet-dot-regulated"
                            className="form-check-input"
                            type="checkbox"
                            checked={form.dotRegulated}
                            onChange={(e) => setForm({ ...form, dotRegulated: e.target.checked })}
                          />
                          <label className="form-check-label" htmlFor="fleet-dot-regulated">
                            DOT regulated — requires DVIR to operate
                          </label>
                        </div>
                        <p className="form-text mb-0">
                          Leave unchecked for regular non-commercial assets that do not need a DVIR.
                        </p>
                      </div>
                      <div className="col-12">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={creating}
                        >
                          {creating ? "Creating…" : "Create asset"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="card border shadow-none">
              {assets.length === 0 ? (
                <div className="card-body">
                  <FleetEmptyState
                    icon={tab === "removed" ? "bx-archive" : "bx-car"}
                    message={
                      tab === "removed"
                        ? "No removed assets recorded."
                        : "No assets match these filters."
                    }
                  />
                </div>
              ) : (
                <div className="table-responsive text-nowrap">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        {canPrintLabel ? (
                          <th scope="col" style={{ width: 36 }}>
                            <span className="visually-hidden">Select</span>
                          </th>
                        ) : null}
                        <th scope="col">Asset</th>
                        <th scope="col">Type</th>
                        <th scope="col">VIN</th>
                        <th scope="col">Location</th>
                        <th scope="col">DRIVER</th>
                        <th scope="col">DOT</th>
                        <th scope="col">Status</th>
                        {tab === "compliance" ? <th scope="col">2290 / IRP / Ins</th> : null}
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="table-border-bottom-0">
                      {assets.map((item) => (
                        <tr
                          key={String(item.id)}
                          role="button"
                          tabIndex={0}
                          onClick={() => void openAsset(String(item.id))}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              void openAsset(String(item.id));
                            }
                          }}
                        >
                          {canPrintLabel ? (
                            <td onClick={(ev) => ev.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selectedAssetIds.includes(String(item.id))}
                                onChange={(ev) => {
                                  const id = String(item.id ?? "");
                                  setSelectedAssetIds((prev) =>
                                    ev.target.checked
                                      ? prev.includes(id)
                                        ? prev
                                        : [...prev, id]
                                      : prev.filter((x) => x !== id),
                                  );
                                }}
                                aria-label={`Select ${labelOf(item)}`}
                              />
                            </td>
                          ) : null}
                          <td>
                            <span className="fw-semibold text-primary">{labelOf(item)}</span>
                          </td>
                          <td>{fleetAssetTypeLabel(String(item.assetType ?? ""))}</td>
                          <td>{String(item.vin ?? "") || "—"}</td>
                          <td>{String(item.locationName ?? "") || "—"}</td>
                          <td>{String(item.assignedDriverName ?? "") || "—"}</td>
                          <td>{item.dotRegulated ? "Yes" : "No"}</td>
                          <td>
                            <span
                              className={`badge ${fleetStatusBadgeClass(String(item.status ?? ""))}`}
                            >
                              {fleetStatusLabel(String(item.status ?? ""))}
                            </span>
                          </td>
                          {tab === "compliance" ? (
                            <td>
                              {String(item.form2290Status ?? "—")} / {String(item.irpStatus ?? "—")}{" "}
                              / {item.insured === true ? "Y" : item.insured === false ? "N" : "—"}
                            </td>
                          ) : null}
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              {canPrintLabel ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  disabled={printQrBusyId === String(item.id)}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void (async () => {
                                      const id = String(item.id ?? "");
                                      setPrintQrBusyId(id);
                                      setPrintError(null);
                                      try {
                                        const qr = await ensureFleetDvirPrintQrPayload(item);
                                        setPrintQrPayload(qr ?? null);
                                        setPrintTarget(item);
                                      } catch (e) {
                                        setPrintError(
                                          formatApiErrorMessage(
                                            e,
                                            "Could not prepare label QR for print",
                                          ),
                                        );
                                      } finally {
                                        setPrintQrBusyId(null);
                                      }
                                    })();
                                  }}
                                >
                                  {printQrBusyId === String(item.id) ? "…" : "Print Label"}
                                </button>
                              ) : null}
                              <a
                                href={fleetAssetHref(String(item.id), { print: true })}
                                className="btn btn-sm btn-outline-primary"
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                <i className="bx bx-printer me-1" aria-hidden />
                                Report
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {!loading && tab === "drivers" ? (
          <div className="card border shadow-none">
            <div className="table-responsive text-nowrap">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">EMPLOYEE #</th>
                    <th scope="col">License</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody className="table-border-bottom-0">
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <FleetEmptyState icon="bx-user" message="No drivers on the fleet roster." />
                      </td>
                    </tr>
                  ) : (
                    drivers.map((d) => {
                      const personnelId =
                        typeof d.personnelId === "string" && d.personnelId ? d.personnelId : null;
                      return (
                        <tr key={String(d.id)}>
                          <td>
                            {personnelId ? (
                              <Link href={personFileHref(personnelId)} className="fw-semibold">
                                {personNameDisplay(String(d.personnelName ?? ""), "DRIVER")}
                              </Link>
                            ) : (
                              <Link href={COMPANY_DRIVERS_HREF} className="fw-semibold">
                                {personNameDisplay(String(d.personnelName ?? ""), "DRIVER")}
                              </Link>
                            )}
                          </td>
                          <td>{String(d.employeeNumber ?? "")}</td>
                          <td>
                            {String(d.licenseNumber ?? "")} {String(d.licenseState ?? "")}
                          </td>
                          <td>
                            <span
                              className={`badge ${fleetStatusBadgeClass(String(d.status ?? ""))}`}
                            >
                              {String(d.status ?? "—")}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === "renewals" && renewals ? (
          <div>
            <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-5 g-3 mb-4">
              {Object.entries(renewalBuckets).map(([k, v]) => (
                <div className="col" key={k}>
                  <button
                    type="button"
                    className={`card h-100 w-100 text-start border shadow-none${
                      renewalBucket === k ? " border-primary" : ""
                    }`}
                    onClick={() => setRenewalBucket((prev) => (prev === k ? "" : k))}
                    aria-pressed={renewalBucket === k}
                  >
                    <div className="card-body p-3">
                      <span className="d-block text-muted small">{renewalBucketLabel(k)}</span>
                      <h5 className="mb-0">{v}</h5>
                      <span className="small text-primary">
                        {renewalBucket === k ? "Clear filter" : "View →"}
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
            <p className="text-muted">
              {String(renewals.notificationHint ?? "")}
              {renewalBucket ? (
                <>
                  {" "}
                  Showing <span className="fw-semibold text-body">{renewalBucket}</span>.{" "}
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 align-baseline"
                    onClick={() => setRenewalBucket("")}
                  >
                    Show all
                  </button>
                </>
              ) : null}
            </p>
            <div className="card border shadow-none">
              <div className="table-responsive text-nowrap">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Asset</th>
                      <th scope="col">Location</th>
                      <th scope="col">Bucket</th>
                      <th scope="col">Month</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody className="table-border-bottom-0">
                    {((renewals.items as Array<Record<string, unknown>>) ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <FleetEmptyState
                            icon="bx-calendar"
                            message="No renewals in this bucket."
                          />
                        </td>
                      </tr>
                    ) : (
                      ((renewals.items as Array<Record<string, unknown>>) ?? []).map((item) => (
                        <tr
                          key={String(item.id)}
                          role="button"
                          tabIndex={0}
                          onClick={() => void openAsset(String(item.id))}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              void openAsset(String(item.id));
                            }
                          }}
                        >
                          <td>
                            <span className="fw-semibold text-primary">{labelOf(item)}</span>
                          </td>
                          <td>{String(item.locationName ?? "") || "—"}</td>
                          <td>
                            <span
                              className={`badge ${renewalBucketBadgeClass(String(item.renewalBucket ?? ""))}`}
                            >
                              {renewalBucketLabel(String(item.renewalBucket ?? ""))}
                            </span>
                          </td>
                          <td>{String(item.registrationRenewalMonth ?? "")}</td>
                          <td>{String(item.renewalDate ?? "")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && tab === "maintenance" ? (
          <div className="card border shadow-none">
            <div className="table-responsive text-nowrap">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody className="table-border-bottom-0">
                  {maintenance.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <FleetEmptyState icon="bx-wrench" message="No maintenance records yet." />
                      </td>
                    </tr>
                  ) : (
                    maintenance.map((m) => (
                      <tr key={String(m.id)}>
                        <td>
                          {m.vehicleId ? (
                            <button
                              type="button"
                              className="btn btn-link p-0 text-start fw-semibold"
                              onClick={() => void openAsset(String(m.vehicleId))}
                            >
                              {String(m.title ?? "")}
                            </button>
                          ) : (
                            String(m.title ?? "")
                          )}
                        </td>
                        <td>{String(m.maintenanceType ?? "")}</td>
                        <td>
                          <span
                            className={`badge ${fleetStatusBadgeClass(String(m.status ?? ""))}`}
                          >
                            {String(m.status ?? "—")}
                          </span>
                        </td>
                        <td>{String(m.dueDate ?? "")}</td>
                        <td>
                          {canManage && m.status !== "COMPLETED" ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() =>
                                void apiSend(
                                  `/api/v1/industrial/fleet/maintenance/${String(m.id)}/complete`,
                                  "POST",
                                  {},
                                ).then(() => loadTab())
                              }
                            >
                              Complete
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === "inspections" ? (
          <div className="card border shadow-none">
            <div className="table-responsive text-nowrap">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody className="table-border-bottom-0">
                  {inspections.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <FleetEmptyState
                          icon="bx-check-shield"
                          message="No inspections recorded."
                        />
                      </td>
                    </tr>
                  ) : (
                    inspections.map((i) => (
                      <tr
                        key={String(i.id)}
                        role={i.vehicleId ? "button" : undefined}
                        tabIndex={i.vehicleId ? 0 : undefined}
                        onClick={() => {
                          if (!i.vehicleId) return;
                          void openAsset(String(i.vehicleId));
                        }}
                        onKeyDown={(ev) => {
                          if (!i.vehicleId) return;
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            void openAsset(String(i.vehicleId));
                          }
                        }}
                      >
                        <td>
                          <span className={i.vehicleId ? "fw-semibold text-primary" : undefined}>
                            {String(i.title ?? "")}
                          </span>
                        </td>
                        <td>{String(i.vehicleId ?? "")}</td>
                        <td>
                          <span
                            className={`badge ${fleetStatusBadgeClass(String(i.status ?? ""))}`}
                          >
                            {String(i.status ?? "—")}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === "documents" ? (
          <div className="card border shadow-none">
            <div className="table-responsive text-nowrap">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Type</th>
                    <th scope="col">Vehicle</th>
                  </tr>
                </thead>
                <tbody className="table-border-bottom-0">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <FleetEmptyState icon="bx-file" message="No fleet documents uploaded." />
                      </td>
                    </tr>
                  ) : (
                    documents.map((d) => (
                      <tr
                        key={String(d.id)}
                        role={d.vehicleId ? "button" : undefined}
                        tabIndex={d.vehicleId ? 0 : undefined}
                        onClick={() => {
                          if (!d.vehicleId) return;
                          void openAsset(String(d.vehicleId));
                        }}
                        onKeyDown={(ev) => {
                          if (!d.vehicleId) return;
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            void openAsset(String(d.vehicleId));
                          }
                        }}
                      >
                        <td>
                          <span className={d.vehicleId ? "fw-semibold text-primary" : undefined}>
                            {String(d.title ?? "")}
                          </span>
                        </td>
                        <td>{String(d.documentType ?? "")}</td>
                        <td>{String(d.vehicleId ?? "")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === "reports" ? (
          <>
            <div className="alert alert-info" role="status">
              Prefer the shared <a href="/reporting/library/?q=fleet">Reporting Center</a> for
              catalog reports, scheduling, and CSV/XLSX/PDF exports. One-click fleet CSVs below
              remain for convenience; new custom reports should be saved under{" "}
              <a href="/reporting/builder/?source=fleet.assets">Reporting → Custom builder</a>.
            </div>
            <FleetCustomReportBuilder onError={(msg) => setError(msg)} />
            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="card-title mb-0">Standard CSV exports</h6>
              </div>
              <div className="card-body">
                <p className="text-muted small mb-3">
                  One-click downloads for common fleet lists. Use the Reporting Center for scheduled
                  delivery and multi-format exports.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {[
                    { id: "inventory", label: "Asset inventory" },
                    { id: "registration", label: "Registration" },
                    { id: "insurance", label: "Insurance" },
                    { id: "county", label: "County assessment" },
                    { id: "drivers", label: "DRIVERS" },
                    { id: "mileage", label: "Mileage" },
                    { id: "maintenance", label: "Maintenance" },
                    { id: "2290", label: "Form 2290" },
                    { id: "irp", label: "IRP" },
                    { id: "fringe", label: "Fringe" },
                    { id: "commute", label: "Commute" },
                    { id: "removed", label: "Removed assets" },
                    { id: "history", label: "History" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => void downloadReport(r.id)}
                    >
                      <i className="bx bx-download me-1" />
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {!loading && tab === "settings" ? (
          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">Fleet settings</h6>
            </div>
            <div className="card-body">
              <form onSubmit={(e) => void saveSettings(e)}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="fleet-insurer-name">
                      Insurer name
                    </label>
                    <input
                      id="fleet-insurer-name"
                      className="form-control form-control-sm"
                      value={settingsForm.insurerName}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, insurerName: e.target.value })
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="fleet-insurer-email">
                      Insurer email
                    </label>
                    <input
                      id="fleet-insurer-email"
                      className="form-control form-control-sm"
                      value={settingsForm.insurerEmail}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, insurerEmail: e.target.value })
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="fleet-sample-year">
                      Sample year
                    </label>
                    <input
                      id="fleet-sample-year"
                      className="form-control form-control-sm"
                      value={settingsForm.lastSampleYear}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, lastSampleYear: e.target.value })
                      }
                      disabled={!canManage}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="fleet-notify-recipients">
                      Notification recipients (comma-separated emails)
                    </label>
                    <input
                      id="fleet-notify-recipients"
                      className="form-control form-control-sm"
                      value={settingsForm.notificationRecipients}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, notificationRecipients: e.target.value })
                      }
                      disabled={!canManage}
                    />
                  </div>
                  {canManage ? (
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save settings
                      </button>
                    </div>
                  ) : null}
                </div>
                {settings ? (
                  <p className="text-muted small mt-3 mb-0">
                    Recipients drive renewal/insurance/2290/PM notification hooks.
                  </p>
                ) : null}
              </form>
            </div>
          </div>
        ) : null}
      </ModuleWorkspaceTabs>

      {printError ? (
        <div className="alert alert-danger mx-3" role="alert">
          {printError}
        </div>
      ) : null}

      <ForgePrintDialog
        open={printTarget != null || (batchPrintItems != null && batchPrintItems.length > 1)}
        onClose={() => {
          setPrintTarget(null);
          setPrintQrPayload(null);
          setBatchPrintItems(null);
          if (batchPrintItems && batchPrintItems.length > 1) {
            setSelectedAssetIds([]);
          }
        }}
        module="FLEET"
        recordType="fleet_vehicle"
        {...(printTarget?.id ? { recordId: String(printTarget.id) } : {})}
        defaultTitle={
          batchPrintItems && batchPrintItems.length > 1
            ? `PRINT ${batchPrintItems.length} LABELS`
            : "PRINT LABEL"
        }
        fieldValues={
          printTarget
            ? fleetAssetPrintFieldValues(printTarget, {
                ...(printQrPayload ? { qrPayload: printQrPayload } : {}),
              })
            : (batchPrintItems?.[0]?.fieldValues ?? {})
        }
        {...(batchPrintItems && batchPrintItems.length > 1 ? { items: batchPrintItems } : {})}
      />
    </section>
  );
}
