"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  DOT_API,
  DOT_RECORD_CATEGORIES,
  DOT_SORT_OPTIONS,
  DOT_TABS,
  DOT_TAB_META,
  dotFileHref,
  dotLocationText,
  dotRecordCategory,
  dotStatusBadgeClass,
  dotWorkerName,
  filterDotRecords,
  parseDotSort,
  parseDotTab,
  resolveDotFileRecord,
  summarizeDotRecords,
  type DotCategory,
  type DotSort,
  type DotTabId,
} from "@/lib/dot-compliance-module";
import { PERSONNEL_QUICK_LINKS } from "@/lib/personnel-quick-nav";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

const COMPANY_DRIVERS_HREF =
  PERSONNEL_QUICK_LINKS.find((link) => link.id === "company-drivers")?.href ??
  "/modules/personnel/?view=company-drivers";

const STATUS_OPTIONS = ["", "OPEN", "ACTIVE", "DRAFT", "PENDING", "CLOSED", "ARCHIVED"];

function DotEmptyState({ icon, message }: { icon: string; message: string }) {
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

export function DotComplianceWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.dot.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.dot.manage") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<DotTabId>(() => parseDotTab(searchParams.get("tab")));
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<DotSort>(() => parseDotSort(searchParams.get("sort")));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "drivers" as DotCategory,
    workerName: "",
    locationText: "",
    status: "DRAFT",
  });

  const modEntry = bootstrap?.modules.find((m) => m.code === "DOT_COMPLIANCE");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    void apiGet<Bootstrap>("/api/v1/industrial/bootstrap")
      .then(setBootstrap)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Bootstrap failed"));
  }, []);

  useEffect(() => {
    setTab(parseDotTab(searchParams.get("tab")));
  }, [searchParams]);

  const loadRecords = useCallback(async () => {
    if (!awsReady) return;
    setLoading(true);
    setError(null);
    try {
      const items: Array<Record<string, unknown>> = [];
      let page = 1;
      while (page <= 50) {
        const res = await apiGet<ListResponse>(DOT_API, {
          query: { page: String(page), pageSize: "100" },
        });
        const batch = res.items ?? [];
        items.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      setRecords(items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load DOT records");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [awsReady]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadRecords();
  }, [awsReady, loadRecords]);

  const summary = useMemo(() => summarizeDotRecords(records), [records]);

  const visibleRecords = useMemo(
    () => filterDotRecords(records, { tab, q, status, sort }),
    [records, tab, q, status, sort],
  );

  const dashboardTiles = useMemo(
    () => [
      {
        id: "score",
        label: "Compliance score",
        value: `${summary.complianceScore}%`,
        icon: "bx-check-shield",
        tone: summary.complianceScore >= 90 ? "success" : summary.complianceScore >= 70 ? "warning" : "danger",
        onActivate: () => setTab("dashboard"),
      },
      {
        id: "total",
        label: "Total records",
        value: String(summary.total),
        icon: "bx-file",
        tone: "primary",
        onActivate: () => setTab("other"),
      },
      {
        id: "open",
        label: "Open items",
        value: String(summary.open),
        icon: "bx-error-circle",
        tone: "warning",
        onActivate: () => {
          setStatus("OPEN");
          setTab("dashboard");
        },
      },
      {
        id: "drivers",
        label: "Drivers (DQF)",
        value: String(summary.byCategory.drivers),
        icon: "bx-user",
        tone: "info",
        onActivate: () => navigateTab("drivers"),
      },
      {
        id: "vehicles",
        label: "Vehicles",
        value: String(summary.byCategory.vehicles),
        icon: "bx-car",
        tone: "secondary",
        onActivate: () => navigateTab("vehicles"),
      },
      {
        id: "dvirs",
        label: "DVIRs",
        value: String(summary.byCategory.dvirs),
        icon: "bx-clipboard",
        tone: "primary",
        onActivate: () => navigateTab("dvirs"),
      },
      {
        id: "roadside",
        label: "Roadside",
        value: String(summary.byCategory.roadside),
        icon: "bx-map",
        tone: "warning",
        onActivate: () => navigateTab("roadside"),
      },
      {
        id: "accidents",
        label: "Accidents",
        value: String(summary.byCategory.accidents),
        icon: "bx-error-circle",
        tone: "danger",
        onActivate: () => navigateTab("accidents"),
      },
      {
        id: "drug-alcohol",
        label: "Drug & Alcohol",
        value: String(summary.byCategory["drug-alcohol"]),
        icon: "bx-plus-medical",
        tone: "info",
        onActivate: () => navigateTab("drug-alcohol"),
      },
    ],
    [summary],
  );

  function navigateTab(next: DotTabId) {
    setTab(next);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      await apiSend(DOT_API, "POST", {
        title: form.title.trim(),
        category: form.category,
        workerName: form.workerName.trim() || undefined,
        locationText: form.locationText.trim() || undefined,
        status: form.status || "DRAFT",
        details: {},
      });
      setForm({
        title: "",
        category: tab === "dashboard" || tab === "other" ? "drivers" : tab,
        workerName: "",
        locationText: "",
        status: "DRAFT",
      });
      await loadRecords();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const activeTabMeta = DOT_TAB_META[tab];

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view DOT compliance.</p>
      </div>
    );
  }

  if (!awsReady && bootstrap) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  return (
    <section aria-labelledby="dot-title" className="dot-compliance-workspace">
      <ModuleWorkspaceHeader
        id="dot-title"
        eyebrow="Compliance"
        title={moduleName}
        description="Driver qualification, DVIRs, roadside inspections, accidents, and drug & alcohol records."
        onRefresh={() => void loadRecords()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4" role="alert">
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void loadRecords()}>
            Retry
          </button>
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={DOT_TABS}
        active={tab}
        onChange={navigateTab}
        ariaLabel="DOT Compliance sections"
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

        {!loading && tab === "dashboard" ? (
          <>
            <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-4 g-3 mb-4">
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

            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="card-title mb-0">By category</h6>
              </div>
              <div className="card-body">
                <ul className="list-group list-group-flush">
                  {(Object.keys(summary.byCategory) as DotCategory[]).map((category) => (
                    <li key={category} className="list-group-item px-0">
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none w-100 d-flex justify-content-between align-items-center"
                        onClick={() => navigateTab(category)}
                      >
                        <span>{DOT_TAB_META[category].label}</span>
                        <span className="badge bg-label-primary rounded-pill">
                          {summary.byCategory[category]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}

        {!loading && tab !== "dashboard" ? (
          <>
            <FilterPanel
              searchId="dot-record-search"
              searchValue={q}
              onSearchChange={setQ}
              searchPlaceholder="Title, driver, location…"
              chips={[
                ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
                ...(status ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }] : []),
              ]}
              onClearAll={() => {
                setQ("");
                setStatus("");
              }}
              onSubmit={() => undefined}
              extraFields={
                <>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="dot-status-filter">
                      Status
                    </label>
                    <select
                      id="dot-status-filter"
                      className="form-select form-select-sm"
                      value={status}
                      onChange={(ev) => setStatus(ev.target.value)}
                    >
                      <option value="">All</option>
                      {STATUS_OPTIONS.filter(Boolean).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4 col-lg-3">
                    <label className="form-label" htmlFor="dot-record-sort">
                      Sort
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text">
                        <i className="bx bx-sort-a-z" aria-hidden="true" />
                      </span>
                      <select
                        id="dot-record-sort"
                        className="form-select"
                        value={sort}
                        onChange={(ev) => setSort(parseDotSort(ev.target.value))}
                        aria-label="Sort DOT records"
                      >
                        {DOT_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              }
            />

            {canManage ? (
              <div className="card border shadow-none mb-4">
                <div className="card-header">
                  <h6 className="card-title mb-0">New DOT record</h6>
                </div>
                <div className="card-body">
                  <form onSubmit={(e) => void onCreate(e)}>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="dot-create-title">
                          Title *
                        </label>
                        <input
                          id="dot-create-title"
                          className="form-control form-control-sm"
                          required
                          value={form.title}
                          onChange={(ev) => setForm({ ...form, title: ev.target.value })}
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label" htmlFor="dot-create-category">
                          Category
                        </label>
                        <select
                          id="dot-create-category"
                          className="form-select form-select-sm"
                          value={form.category}
                          onChange={(ev) =>
                            setForm({ ...form, category: ev.target.value as DotCategory })
                          }
                        >
                          {DOT_RECORD_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {DOT_TAB_META[category].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="dot-create-worker">
                          Driver / worker
                        </label>
                        <input
                          id="dot-create-worker"
                          className="form-control form-control-sm"
                          value={form.workerName}
                          onChange={(ev) => setForm({ ...form, workerName: ev.target.value })}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="dot-create-location">
                          Location
                        </label>
                        <input
                          id="dot-create-location"
                          className="form-control form-control-sm"
                          value={form.locationText}
                          onChange={(ev) => setForm({ ...form, locationText: ev.target.value })}
                        />
                      </div>
                      <div className="col-12">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                          {creating ? "Saving…" : "Create record"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="card border shadow-none">
              {visibleRecords.length === 0 ? (
                <div className="card-body">
                  <DotEmptyState
                    icon={activeTabMeta.icon}
                    message={`No ${activeTabMeta.label.toLowerCase()} records match these filters.`}
                  />
                </div>
              ) : (
                <div className="table-responsive text-nowrap">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Category</th>
                        <th scope="col">Driver / worker</th>
                        <th scope="col">Location</th>
                        <th scope="col">Status</th>
                        <th scope="col">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="table-border-bottom-0">
                      {visibleRecords.map((row) => {
                        const recordId = String(row.id);
                        const workerName = dotWorkerName(row);
                        const nameFileId = String(resolveDotFileRecord(row, records).id ?? recordId);
                        return (
                          <tr key={recordId}>
                            <td>
                              <Link href={dotFileHref(recordId)} className="fw-semibold">
                                {String(row.title ?? "Untitled")}
                              </Link>
                              {typeof row.profileRecordCount === "number" &&
                              row.profileRecordCount > 1 ? (
                                <span className="text-muted small d-block">
                                  {row.profileRecordCount} combined files
                                </span>
                              ) : null}
                            </td>
                            <td>{DOT_TAB_META[dotRecordCategory(row)].label}</td>
                            <td>
                              {workerName ? (
                                <Link href={dotFileHref(nameFileId)}>{workerName}</Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{dotLocationText(row) || "—"}</td>
                            <td>
                              <span className={`badge ${dotStatusBadgeClass(String(row.status ?? ""))}`}>
                                {String(row.status ?? "—")}
                              </span>
                            </td>
                            <td className="text-muted">
                              {row.updatedAt
                                ? new Date(String(row.updatedAt)).toLocaleDateString()
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
