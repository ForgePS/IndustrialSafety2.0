"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { personFileHref } from "@/lib/personnel-directory";
import { PERSONNEL_QUICK_LINKS } from "@/lib/personnel-quick-nav";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number; total?: number };
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
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
  { id: "drivers", label: "Drivers" },
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
];

function labelOf(item: Record<string, unknown>) {
  const year = item.year ? String(item.year) : "";
  const make = String(item.make ?? "");
  const model = String(item.model ?? "");
  const plate = String(item.licensePlate ?? "");
  return [year, make, model].filter(Boolean).join(" ") || plate || String(item.id ?? "Asset");
}

const FLEET_TAB_META: Record<TabId, { label: string; description: string; icon: string }> = {
  dashboard: {
    label: "Dashboard",
    description: "Fleet totals, asset mix, and quick links into each section.",
    icon: "bx-grid-alt",
  },
  assets: {
    label: "Assets",
    description: "Active vehicles and equipment — search, filter, create, and open detail.",
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
    description: "CSV exports for inventory, compliance, mileage, and history.",
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
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.fleet.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.fleet.manage") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<TabId>(() => parseFleetTab(searchParams.get("tab")));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [assets, setAssets] = useState<Array<Record<string, unknown>>>([]);
  const [drivers, setDrivers] = useState<Array<Record<string, unknown>>>([]);
  const [renewals, setRenewals] = useState<Record<string, unknown> | null>(null);
  const [maintenance, setMaintenance] = useState<Array<Record<string, unknown>>>([]);
  const [inspections, setInspections] = useState<Array<Record<string, unknown>>>([]);
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Record<string, unknown> | null>(null);
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
  });
  const [assignName, setAssignName] = useState("");
  const [mileage, setMileage] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [maintTitle, setMaintTitle] = useState("");
  const [inspTitle, setInspTitle] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    insurerName: "",
    insurerEmail: "",
    lastSampleYear: "",
    notificationRecipients: "",
  });

  const modEntry = bootstrap?.modules.find((m) => m.code === "FLEET");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    void apiGet<Bootstrap>("/api/v1/industrial/bootstrap")
      .then(setBootstrap)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Bootstrap failed"));
  }, []);

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
    setSelected(null);
    if (opts?.clearFilters) clearListFilters();
    if (opts?.status !== undefined) setStatus(opts.status);
    if (opts?.assetType !== undefined) setAssetType(opts.assetType);
    if (opts?.insured !== undefined) setInsuredFilter(opts.insured);
    if (opts?.renewalBucket !== undefined) setRenewalBucket(opts.renewalBucket);
    setTab(next);
  }

  const loadTab = useCallback(async () => {
    if (!awsReady) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "dashboard") {
        setDashboard(await apiGet<Record<string, unknown>>("/api/v1/industrial/fleet/dashboard"));
      } else if (tab === "assets" || tab === "compliance") {
        const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/vehicles", {
          query: {
            q: q || undefined,
            assetType: assetType || undefined,
            status: status || undefined,
            insured: insuredFilter || undefined,
            page: "1",
            pageSize: "100",
          },
        });
        setAssets(res.items ?? []);
      } else if (tab === "removed") {
        const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/vehicles", {
          query: { removed: "true", q: q || undefined, page: "1", pageSize: "100" },
        });
        setAssets(res.items ?? []);
      } else if (tab === "drivers") {
        const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/drivers", {
          query: { q: q || undefined, page: "1", pageSize: "100" },
        });
        setDrivers(res.items ?? []);
      } else if (tab === "renewals") {
        setRenewals(
          await apiGet<Record<string, unknown>>("/api/v1/industrial/fleet/renewals", {
            query: {
              bucket: renewalBucket || undefined,
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
  }, [awsReady, tab, q, assetType, status, insuredFilter, renewalBucket]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadTab();
  }, [awsReady, loadTab]);

  async function openAsset(id: string) {
    try {
      const [asset, hist] = await Promise.all([
        apiGet<Record<string, unknown>>(`/api/v1/industrial/fleet/vehicles/${id}`),
        apiGet<Record<string, unknown>>(`/api/v1/industrial/fleet/vehicles/${id}/history`),
      ]);
      setSelected(asset);
      setHistory(hist);
      setAssignName(String(asset.assignedDriverName ?? ""));
      setMileage(asset.mileage != null ? String(asset.mileage) : "");
      setEngineHours(asset.engineHours != null ? String(asset.engineHours) : "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load asset");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/fleet/vehicles", "POST", {
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
      });
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
      });
      await loadTab();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function saveSelected() {
    if (!canManage || !selected?.id) return;
    try {
      await apiSend(`/api/v1/industrial/fleet/vehicles/${String(selected.id)}`, "PATCH", {
        year: selected.year,
        make: selected.make,
        model: selected.model,
        color: selected.color,
        vin: selected.vin,
        licensePlate: selected.licensePlate,
        assetType: selected.assetType,
        locationName: selected.locationName,
        countyAssessed: selected.countyAssessed,
        insured: selected.insured,
        insuranceStatus: selected.insuranceStatus,
        form2290Status: selected.form2290Status,
        irpStatus: selected.irpStatus,
        notOnVehicleFringeSs: selected.notOnVehicleFringeSs,
        commuteUseStatus: selected.commuteUseStatus,
        registrationRenewalMonth: selected.registrationRenewalMonth,
        renewalDate: selected.renewalDate,
        notes: selected.notes,
        status: selected.status,
      });
      await loadTab();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function assignDriver() {
    if (!canManage || !selected?.id) return;
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${String(selected.id)}/assign`,
        "POST",
        { driverName: assignName || null },
      );
      setSelected(updated);
      const hist = await apiGet<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${String(selected.id)}/history`,
      );
      setHistory(hist);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assign failed");
    }
  }

  async function saveMileage() {
    if (!canManage || !selected?.id) return;
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${String(selected.id)}/mileage`,
        "POST",
        { mileage: Number(mileage) },
      );
      setSelected(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mileage update failed");
    }
  }

  async function saveEngineHours() {
    if (!canManage || !selected?.id) return;
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/fleet/vehicles/${String(selected.id)}/engine-hours`,
        "POST",
        { engineHours: Number(engineHours) },
      );
      setSelected(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Engine hours update failed");
    }
  }

  async function disposeSelected() {
    if (!canManage || !selected?.id) return;
    try {
      await apiSend(`/api/v1/industrial/fleet/vehicles/${String(selected.id)}/dispose`, "POST", {
        status: "REMOVED",
        dispositionNotes: "Removed from Fleet UI",
      });
      setSelected(null);
      await loadTab();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dispose failed");
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
          lastSampleYear: settingsForm.lastSampleYear
            ? Number(settingsForm.lastSampleYear)
            : null,
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
        onActivate: () =>
          navigateFleet("assets", { clearFilters: true, status: "OUT_OF_SERVICE" }),
      },
      {
        id: "insured",
        label: "Insured",
        value: String(dashboard?.insured ?? 0),
        icon: "bx-shield-quarter",
        tone: "success",
        onActivate: () =>
          navigateFleet("compliance", { clearFilters: true, insured: "true" }),
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
        value: String(
          (dashboard?.renewals as Record<string, number> | undefined)?.OVERDUE ?? 0,
        ),
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

  if (!awsReady && bootstrap) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  return (
    <section aria-labelledby="fleet-title" className="fleet-workspace">
      <ModuleWorkspaceHeader
        id="fleet-title"
        eyebrow="Operations"
        title={moduleName}
        description="Assets, drivers, compliance renewals, maintenance, and disposition."
        onRefresh={() => void loadTab()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4" role="alert">
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void loadTab()}>
            Retry
          </button>
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={TABS}
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
              Company Drivers
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

        {!loading && (tab === "assets" || tab === "removed" || tab === "compliance") ? (
        <>
          <FilterPanel
            searchId="fleet-asset-search"
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder="VIN, plate, make…"
            chips={[
              ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
              ...(status && (tab === "assets" || tab === "compliance")
                ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }]
                : []),
              ...(assetType && (tab === "assets" || tab === "compliance")
                ? [{ id: "type", label: `Type: ${assetType}`, onRemove: () => setAssetType("") }]
                : []),
              ...(insuredFilter
                ? [
                    {
                      id: "insured",
                      label: `Insured: ${insuredFilter === "true" ? "Yes" : insuredFilter}`,
                      onRemove: () => setInsuredFilter(""),
                    },
                  ]
                : []),
            ]}
            onClearAll={() => {
              clearListFilters();
              void loadTab();
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
                          {t}
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
                      <option value="">Active-ish</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                      <option value="INACTIVE">INACTIVE</option>
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
                            {t}
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
                      <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
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
                  <th scope="col">Asset</th>
                  <th scope="col">Type</th>
                  <th scope="col">VIN</th>
                  <th scope="col">Location</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Status</th>
                  {tab === "compliance" ? <th scope="col">2290 / IRP / Ins</th> : null}
                </tr>
              </thead>
              <tbody className="table-border-bottom-0">
                {assets.map((item) => (
                  <tr
                    key={String(item.id)}
                    role="button"
                    tabIndex={0}
                    className={selected?.id === item.id ? "table-active" : undefined}
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
                    <td>{String(item.assetType ?? "")}</td>
                    <td>{String(item.vin ?? "")}</td>
                    <td>{String(item.locationName ?? "")}</td>
                    <td>{String(item.assignedDriverName ?? "")}</td>
                    <td>
                      <span className={`badge ${fleetStatusBadgeClass(String(item.status ?? ""))}`}>
                        {String(item.status ?? "—")}
                      </span>
                    </td>
                    {tab === "compliance" ? (
                      <td>
                        {String(item.form2290Status ?? "—")} / {String(item.irpStatus ?? "—")} /{" "}
                        {item.insured === true ? "Y" : item.insured === false ? "N" : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            )}
          </div>
        </>
        ) : null}

        {!loading &&
        selected &&
        !["dashboard", "drivers", "reports", "settings"].includes(tab) ? (
        <div className="card border shadow-none mt-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <div className="min-w-0">
              <h6 className="card-title mb-0">{labelOf(selected)}</h6>
              <p className="text-muted small mb-0 mt-1">
                {String(selected.vin ?? "—")} · {String(selected.licensePlate ?? "—")}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="card-body">
          <div className="row g-3">
            {(
              [
                ["make", "Make"],
                ["model", "Model"],
                ["color", "Color"],
                ["vin", "VIN"],
                ["licensePlate", "License"],
                ["locationName", "Location"],
                ["countyAssessed", "County"],
                ["insuranceStatus", "Insurance status"],
                ["form2290Status", "Form 2290"],
                ["irpStatus", "IRP"],
                ["commuteUseStatus", "Commute"],
                ["notes", "Notes"],
              ] as const
            ).map(([key, label]) => (
              <div className="col-md-4" key={key}>
                <label className="form-label" htmlFor={`fleet-detail-${key}`}>
                  {label}
                </label>
                <input
                  id={`fleet-detail-${key}`}
                  className="form-control form-control-sm"
                  value={String(selected[key] ?? "")}
                  disabled={!canManage}
                  onChange={(e) => setSelected({ ...selected, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="col-md-4">
              <label className="form-label" htmlFor="fleet-detail-insured">
                Insured
              </label>
              <select
                id="fleet-detail-insured"
                className="form-select form-select-sm"
                value={selected.insured === true ? "true" : selected.insured === false ? "false" : ""}
                disabled={!canManage}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    insured: e.target.value === "" ? null : e.target.value === "true",
                  })
                }
              >
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="fleet-detail-fringe">
                Fringe SS excluded
              </label>
              <select
                id="fleet-detail-fringe"
                className="form-select form-select-sm"
                value={
                  selected.notOnVehicleFringeSs === true
                    ? "true"
                    : selected.notOnVehicleFringeSs === false
                      ? "false"
                      : ""
                }
                disabled={!canManage}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    notOnVehicleFringeSs:
                      e.target.value === "" ? null : e.target.value === "true",
                  })
                }
              >
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
          {canManage ? (
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveSelected()}>
                Save
              </button>
              <button type="button" className="btn btn-outline-warning btn-sm" onClick={() => void disposeSelected()}>
                Mark removed
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() =>
                  void apiSend(
                    `/api/v1/industrial/fleet/vehicles/${String(selected.id)}/out-of-service`,
                    "POST",
                    { outOfService: true, reason: "Marked OOS from Fleet UI" },
                  ).then((u) => setSelected(u as Record<string, unknown>))
                }
              >
                Out of service
              </button>
            </div>
          ) : null}

          <div className="card border shadow-none mt-4">
            <div className="card-header">
              <h6 className="card-title mb-0">Assignment</h6>
            </div>
            <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-6">
              <label className="form-label" htmlFor="fleet-assign-driver">
                Driver name
              </label>
              <input
                id="fleet-assign-driver"
                className="form-control form-control-sm"
                value={assignName}
                onChange={(e) => setAssignName(e.target.value)}
                disabled={!canManage}
              />
            </div>
            {canManage ? (
              <div className="col-md-auto">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void assignDriver()}>
                  Assign
                </button>
              </div>
            ) : null}
          </div>
            </div>
          </div>

          <div className="card border shadow-none mt-4">
            <div className="card-header">
              <h6 className="card-title mb-0">Mileage / engine hours</h6>
            </div>
            <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label" htmlFor="fleet-mileage">
                Mileage
              </label>
              <input
                id="fleet-mileage"
                className="form-control form-control-sm"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                disabled={!canManage}
              />
            </div>
            {canManage ? (
              <div className="col-md-auto">
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void saveMileage()}>
                  Update mileage
                </button>
              </div>
            ) : null}
            <div className="col-md-3">
              <label className="form-label" htmlFor="fleet-engine-hours">
                Engine hours
              </label>
              <input
                id="fleet-engine-hours"
                className="form-control form-control-sm"
                value={engineHours}
                onChange={(e) => setEngineHours(e.target.value)}
                disabled={!canManage}
              />
            </div>
            {canManage ? (
              <div className="col-md-auto">
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void saveEngineHours()}>
                  Update hours
                </button>
              </div>
            ) : null}
          </div>
            </div>
          </div>

          {canManage ? (
            <div className="card border shadow-none mt-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Quick add</h6>
              </div>
              <div className="card-body">
              <div className="row g-2 align-items-end">
                <div className="col-md-3">
                  <label className="form-label" htmlFor="fleet-maint-title">
                    Maintenance
                  </label>
                  <input
                    id="fleet-maint-title"
                    className="form-control form-control-sm"
                    value={maintTitle}
                    onChange={(e) => setMaintTitle(e.target.value)}
                  />
                </div>
                <div className="col-md-auto">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      void apiSend("/api/v1/industrial/fleet/maintenance", "POST", {
                        vehicleId: selected.id,
                        title: maintTitle || "PM / repair",
                        maintenanceType: "PM",
                      }).then(() => setMaintTitle(""))
                    }
                  >
                    Add
                  </button>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="fleet-insp-title">
                    Inspection
                  </label>
                  <input
                    id="fleet-insp-title"
                    className="form-control form-control-sm"
                    value={inspTitle}
                    onChange={(e) => setInspTitle(e.target.value)}
                  />
                </div>
                <div className="col-md-auto">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      void apiSend("/api/v1/industrial/fleet/inspections", "POST", {
                        vehicleId: selected.id,
                        title: inspTitle || "Fleet inspection",
                      }).then(() => setInspTitle(""))
                    }
                  >
                    Add
                  </button>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="fleet-doc-title">
                    Document
                  </label>
                  <input
                    id="fleet-doc-title"
                    className="form-control form-control-sm"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                </div>
                <div className="col-md-auto">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      void apiSend("/api/v1/industrial/fleet/documents", "POST", {
                        vehicleId: selected.id,
                        title: docTitle || "Fleet document",
                        documentType: "OTHER",
                      }).then(() => setDocTitle(""))
                    }
                  >
                    Add
                  </button>
                </div>
              </div>
              </div>
            </div>
          ) : null}

          {history ? (
            <div className="card border shadow-none mt-4">
              <div className="card-header">
                <h6 className="card-title mb-0">History</h6>
              </div>
              <div className="card-body">
              <p className="small text-muted mb-0">
                Assignments: {Array.isArray(history.assignments) ? history.assignments.length : 0} ·
                Mileage: {Array.isArray(history.mileage) ? history.mileage.length : 0} · Engine hours:{" "}
                {Array.isArray(history.engineHours) ? history.engineHours.length : 0}
              </p>
              </div>
            </div>
          ) : null}
          </div>
        </div>
        ) : null}

        {!loading && tab === "drivers" ? (
        <div className="card border shadow-none">
          <div className="table-responsive text-nowrap">
            <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Employee #</th>
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
                            {String(d.personnelName ?? "Driver")}
                          </Link>
                        ) : (
                          <Link href={COMPANY_DRIVERS_HREF} className="fw-semibold">
                            {String(d.personnelName ?? "Driver")}
                          </Link>
                        )}
                      </td>
                      <td>{String(d.employeeNumber ?? "")}</td>
                      <td>
                        {String(d.licenseNumber ?? "")} {String(d.licenseState ?? "")}
                      </td>
                      <td>
                        <span className={`badge ${fleetStatusBadgeClass(String(d.status ?? ""))}`}>
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
                  <th scope="col">Bucket</th>
                  <th scope="col">Month</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody className="table-border-bottom-0">
                {((renewals.items as Array<Record<string, unknown>>) ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <FleetEmptyState icon="bx-calendar" message="No renewals in this bucket." />
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
                    <td>
                      <span className={`badge ${renewalBucketBadgeClass(String(item.renewalBucket ?? ""))}`}>
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
                    <span className={`badge ${fleetStatusBadgeClass(String(m.status ?? ""))}`}>
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
                    <FleetEmptyState icon="bx-check-shield" message="No inspections recorded." />
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
                    <span className={`badge ${fleetStatusBadgeClass(String(i.status ?? ""))}`}>
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
        <div className="card border shadow-none">
          <div className="card-header">
            <h6 className="card-title mb-0">CSV exports</h6>
          </div>
          <div className="card-body d-flex flex-wrap gap-2">
          {[
            "inventory",
            "registration",
            "insurance",
            "county",
            "drivers",
            "mileage",
            "maintenance",
            "2290",
            "irp",
            "fringe",
            "commute",
            "removed",
            "history",
          ].map((r) => (
            <button key={r} type="button" className="btn btn-outline-primary btn-sm" onClick={() => void downloadReport(r)}>
              <i className="bx bx-download me-1" />
              Export {r}
            </button>
          ))}
          </div>
        </div>
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
                onChange={(e) => setSettingsForm({ ...settingsForm, insurerName: e.target.value })}
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
                onChange={(e) => setSettingsForm({ ...settingsForm, insurerEmail: e.target.value })}
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
                onChange={(e) => setSettingsForm({ ...settingsForm, lastSampleYear: e.target.value })}
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
    </section>
  );
}
