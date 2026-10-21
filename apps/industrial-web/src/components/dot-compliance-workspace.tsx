"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiGetResult, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { ForgePrintButton } from "@/components/forge-print-button";
import {
  DOT_API,
  DOT_RECORD_CATEGORIES,
  DOT_SORT_OPTIONS,
  DOT_TABS,
  DOT_TAB_META,
  dotDriverReferenceId,
  dotDriverSourceMeta,
  dotDueOverdueLabel,
  dotFileHref,
  dotLocationText,
  dotPersonnelId,
  dotRecordCategory,
  dotRecordTitle,
  dotStatusBadgeClass,
  dotStatusRowClass,
  dotWorkerName,
  filterDotRecords,
  parseDotSort,
  parseDotTab,
  resolveDotFileRecord,
  summarizeDotRecords,
  isDotCategoryTab,
  type DotCategory,
  type DotSort,
  type DotTabId,
} from "@/lib/dot-compliance-module";
import { dotVehiclePrintFieldValues } from "@/lib/module-print-fields";
import { deriveDotDqfTitle } from "@/lib/dot-dqf-fields";
import {
  attentionIssuesForFilter,
  attentionIssuesForRecord,
  buildCompanyDriverAttentionCards,
  buildDotAttentionCards,
  dotAttentionTotalCount,
  driverMatchesAttentionFilter,
  formatDriverListAttentionLine,
  summarizeCompanyDriverAttention,
  summarizeDotDqfAttention,
  type DotAttentionIssue,
  type DotAttentionKind,
} from "@/lib/dot-dqf-attention";
import {
  resolveDotAttentionHref,
  type DotAttentionHrefContext,
} from "@/lib/dot-attention-links";
import { buildDqfFormIdMap } from "@/lib/dot-dqf-form-links";
import { FORMS_API } from "@/lib/forms-module";
import {
  toCompanyVehicleDrivers,
  type CompanyVehicleDriver,
} from "@/lib/company-vehicle-drivers";
import { personNameDisplay } from "@/lib/person-name-display";
import { PERSONNEL_QUICK_LINKS } from "@/lib/personnel-quick-nav";
import { DvirWorkspace } from "@/components/dvir-workspace";
import { DotNewDriverForm } from "@/components/dot-new-driver-form";
import { DotDqfComplianceReportCard } from "@/components/dot-dqf-compliance-report-card";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
  summary?: unknown;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.dot.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.dot.manage") || permissions.has("industrial.admin");
  const canViewFleetDrivers =
    permissions.has("industrial.personnel.view") ||
    permissions.has("industrial.fleet.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "DOT_COMPLIANCE",
    canView,
  });
  const [tab, setTab] = useState<DotTabId>(() => parseDotTab(searchParams.get("tab")));
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: DOT_TABS,
        moduleCode: "DOT_COMPLIANCE",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [fleetDrivers, setFleetDrivers] = useState<CompanyVehicleDriver[]>([]);
  const [dqfFormIds, setDqfFormIds] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<DotSort>(() => parseDotSort(searchParams.get("sort")));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDriverOpen, setNewDriverOpen] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState<DotAttentionKind | null>(null);
  const [attentionSource, setAttentionSource] = useState<"dqf" | "fleet" | null>(null);
  const [attentionPanelOpen, setAttentionPanelOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "drivers" as DotCategory,
    workerName: "",
    locationText: "",
    status: "DRAFT",
  });

  const tenantSlug = useMemo(() => {
    const activeTenant =
      me?.tenants?.find((tenant) => tenant.tenantId === me.tenantId) ?? me?.tenants?.[0];
    return activeTenant?.slug ?? null;
  }, [me?.tenantId, me?.tenants]);

  useEffect(() => {
    setTab(parseDotTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "drivers") setNewDriverOpen(false);
  }, [tab]);

  const loadRecords = useCallback(async () => {
    if (!awsReady) return;
    setLoading(true);
    setError(null);
    try {
      const loadFleetAndForms = async () => {
        const secondary: Array<Promise<void>> = [];
        if (canViewFleetDrivers) {
          secondary.push(
            (async () => {
              try {
                const fleetItems: Array<Record<string, unknown>> = [];
                let fleetPage = 1;
                const fleetPageSize = 500;
                while (fleetPage <= 10) {
                  const fleet = await apiGetResult<ListResponse>("/api/v1/industrial/fleet/drivers", {
                    query: { page: String(fleetPage), pageSize: String(fleetPageSize) },
                  });
                  const batch = fleet.data?.items ?? [];
                  fleetItems.push(...batch);
                  setFleetDrivers(toCompanyVehicleDrivers(fleetItems));
                  if (batch.length < fleetPageSize) break;
                  fleetPage += 1;
                }
              } catch {
                setFleetDrivers([]);
              }
            })(),
          );
        } else {
          setFleetDrivers([]);
        }

        secondary.push(
          (async () => {
            try {
              const forms = await apiGet<{ items?: Array<Record<string, unknown>> }>(FORMS_API, {
                query: { page: "1", pageSize: "200" },
              });
              setDqfFormIds(buildDqfFormIdMap(forms.items ?? []));
            } catch {
              setDqfFormIds({});
            }
          })(),
        );

        await Promise.all(secondary);
      };

      const dotPageSize = 500;
      const first = await apiGet<ListResponse>(DOT_API, {
        query: { page: "1", pageSize: String(dotPageSize) },
      });
      const firstBatch = first.items ?? [];
      setRecords(firstBatch);
      // Unblock Drivers/attention UI as soon as the first page lands.
      setLoading(false);

      // Pull fleet/forms in parallel with remaining DOT pages (was sequential after the crawl).
      const secondaryPromise = loadFleetAndForms();

      const items = [...firstBatch];
      let page = 2;
      while (page <= 20 && firstBatch.length >= dotPageSize) {
        const res = await apiGet<ListResponse>(DOT_API, {
          query: { page: String(page), pageSize: String(dotPageSize) },
        });
        const batch = res.items ?? [];
        if (batch.length === 0) break;
        items.push(...batch);
        setRecords([...items]);
        if (batch.length < dotPageSize) break;
        page += 1;
      }

      await secondaryPromise;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load DOT records");
      setRecords([]);
      setFleetDrivers([]);
      setDqfFormIds({});
      setLoading(false);
    }
  }, [awsReady, canViewFleetDrivers]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadRecords();
  }, [awsReady, loadRecords]);

  const summary = useMemo(() => summarizeDotRecords(records), [records]);

  const dqfAttention = useMemo(
    () => summarizeDotDqfAttention(records, { tenantSlug }),
    [records, tenantSlug],
  );

  const companyDriverAttention = useMemo(
    () => summarizeCompanyDriverAttention(fleetDrivers),
    [fleetDrivers],
  );

  const dqfAttentionCards = useMemo(() => buildDotAttentionCards(dqfAttention), [dqfAttention]);
  const companyAttentionCards = useMemo(
    () => buildCompanyDriverAttentionCards(companyDriverAttention),
    [companyDriverAttention],
  );
  const attentionTotal =
    dotAttentionTotalCount(dqfAttention) + dotAttentionTotalCount(companyDriverAttention);

  const attentionHrefContext = useMemo<DotAttentionHrefContext>(
    () => ({
      dqfFormIds,
      companyDriversHref: COMPANY_DRIVERS_HREF,
    }),
    [dqfFormIds],
  );

  function attentionIssueHref(issue: DotAttentionIssue): string {
    const record = records.find((row) => String(row.id) === issue.recordId);
    return resolveDotAttentionHref(issue, {
      ...attentionHrefContext,
      personnelId: issue.personnelId ?? (record ? dotPersonnelId(record) : ""),
    });
  }

  const filteredAttentionIssues = useMemo(() => {
    const issues = [...dqfAttention.issues, ...companyDriverAttention.issues];
    return attentionIssuesForFilter(issues, attentionFilter, attentionSource ?? undefined);
  }, [
    dqfAttention.issues,
    companyDriverAttention.issues,
    attentionFilter,
    attentionSource,
  ]);

  const fileIdByRecordId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of records) {
      const recordId = String(row.id ?? "");
      if (!recordId || map.has(recordId)) continue;
      map.set(recordId, String(resolveDotFileRecord(row, records).id ?? recordId));
    }
    return map;
  }, [records]);

  const visibleRecords = useMemo(() => {
    const base = filterDotRecords(records, { tab, q, status, sort });
    if (!attentionFilter || tab === "dashboard") return base;
    if (attentionFilter === "openDvirDefects") {
      return base.filter((row) => {
        const id = String(row.id ?? "");
        return dqfAttention.issues.some(
          (issue) => issue.kind === "openDvirDefects" && issue.recordId === id,
        );
      });
    }
    if (tab === "drivers" && attentionSource !== "fleet") {
      return base.filter((row) =>
        driverMatchesAttentionFilter(row, attentionFilter, { tenantSlug }),
      );
    }
    return base;
  }, [records, tab, q, status, sort, attentionFilter, attentionSource, tenantSlug, dqfAttention.issues]);

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
        label: "DRIVERS (DQF)",
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

  useEffect(() => {
    const next = ensureActiveModuleTab(
      tab,
      visibleTabs.map((t) => t.id),
      "dashboard",
    );
    if (next !== tab) navigateTab(next);
  }, [tab, visibleTabs]);

  function activateAttentionFilter(kind: DotAttentionKind, source: "dqf" | "fleet") {
    setAttentionFilter(kind);
    setAttentionSource(source);
    setAttentionPanelOpen(true);
    if (kind === "openDvirDefects") {
      navigateTab("dvirs");
      return;
    }
    if (source === "fleet") {
      router.push(COMPANY_DRIVERS_HREF);
      return;
    }
    navigateTab("drivers");
  }

  function clearAttentionFilter() {
    setAttentionFilter(null);
    setAttentionSource(null);
    setAttentionPanelOpen(false);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      const workerName = form.workerName.trim();
      const locationText = form.locationText.trim();
      const title =
        form.title.trim() ||
        (form.category === "drivers"
          ? deriveDotDqfTitle({
              category: "drivers",
              dqf: true,
              workerName,
              locationText,
              locationDepartment: locationText,
            })
          : "");
      if (!title) {
        setError(
          form.category === "drivers"
            ? "Enter a DRIVER / worker name for this record."
            : "Enter a title or DRIVER/worker name for this record.",
        );
        return;
      }
      const created = await apiSend<Record<string, unknown>>(DOT_API, "POST", {
        title,
        category: form.category,
        workerName: workerName || undefined,
        locationText: locationText || undefined,
        status: form.status || "DRAFT",
        details: {},
        ...(form.category === "drivers" ? { dqf: true } : {}),
      });
      const createdId = String(created.id ?? "").trim();
      if (form.category === "drivers" && createdId) {
        router.push(dotFileHref(createdId));
        return;
      }
      setForm({
        title: "",
        category: isDotCategoryTab(tab) && tab !== "other" ? tab : "drivers",
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

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  return (
    <section aria-labelledby="dot-title" className="dot-compliance-workspace" data-walkthrough="dot-overview">
      <ModuleWorkspaceHeader
        id="dot-title"
        eyebrow="Compliance Programs"
        title={moduleName}
        description="DRIVER qualification, DVIRs, roadside inspections, accidents, and drug & alcohol records."
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

      {tab !== "reports" ? (
        !loading ? (
        <section className="mb-4" aria-labelledby="dot-attention-title">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h5 className="mb-0" id="dot-attention-title">What Needs Your Attention</h5>
            {attentionTotal > 0 ? (
              <span className="badge bg-label-warning">{attentionTotal} follow-ups</span>
            ) : null}
          </div>
          <div className="mb-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
              <h6 className="mb-0 text-muted text-uppercase small">DOT DQF</h6>
              {dotAttentionTotalCount(dqfAttention) > 0 ? (
                <span className="badge bg-label-primary">
                  {dotAttentionTotalCount(dqfAttention)} follow-ups
                </span>
              ) : null}
            </div>
            <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-xl-4 row-cols-xxl-8 g-2">
              <div className="col">
                <button
                  type="button"
                  className={`card h-100 w-100 text-start border shadow-none${
                    tab === "drivers" && !attentionFilter ? " border-primary" : ""
                  }`}
                  onClick={() => {
                    clearAttentionFilter();
                    navigateTab("drivers");
                  }}
                  aria-pressed={tab === "drivers" && !attentionFilter}
                >
                  <div className="card-body p-3">
                    <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                      <div className="avatar avatar-sm">
                        <span className="avatar-initial rounded bg-label-primary">
                          <i className="bx bx-user" aria-hidden="true" />
                        </span>
                      </div>
                      <h5 className="mb-0">{dqfAttention.driverProfiles}</h5>
                    </div>
                    <span className="d-block text-muted small text-truncate" title="Total DOT Drivers">
                      Total DOT Drivers
                    </span>
                  </div>
                </button>
              </div>
              {dqfAttentionCards.map((card) => (
                <div className="col" key={`dqf-${card.key}`}>
                  <button
                    type="button"
                    className={`card h-100 w-100 text-start border shadow-none${
                      attentionFilter === card.key && attentionSource === "dqf"
                        ? " border-primary"
                        : ""
                    }`}
                    onClick={() => activateAttentionFilter(card.key, "dqf")}
                    aria-pressed={attentionFilter === card.key && attentionSource === "dqf"}
                  >
                    <div className="card-body p-3">
                      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                        <div className="avatar avatar-sm">
                          <span className={`avatar-initial rounded bg-label-${card.tone}`}>
                            <i className={`bx ${card.icon}`} aria-hidden="true" />
                          </span>
                        </div>
                        <h5
                          className={`mb-0${
                            card.count > 0 && (card.tone === "danger" || card.tone === "warning")
                              ? " text-" + card.tone
                              : ""
                          }`}
                        >
                          {card.count}
                        </h5>
                      </div>
                      <span className="d-block text-muted small text-truncate" title={card.label}>
                        {card.label}
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {canViewFleetDrivers ? (
            <div className="mb-3">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h6 className="mb-0 text-muted text-uppercase small">Company drivers</h6>
                <Link className="btn btn-sm btn-outline-primary" href={COMPANY_DRIVERS_HREF}>
                  Open roster
                </Link>
              </div>
              <div className="row row-cols-2 row-cols-sm-2 row-cols-md-4 g-2">
                {companyAttentionCards.map((card) => (
                  <div className="col" key={`fleet-${card.key}`}>
                    <button
                      type="button"
                      className={`card h-100 w-100 text-start border shadow-none${
                        attentionFilter === card.key && attentionSource === "fleet"
                          ? " border-primary"
                          : ""
                      }`}
                      onClick={() => activateAttentionFilter(card.key, "fleet")}
                      aria-pressed={attentionFilter === card.key && attentionSource === "fleet"}
                    >
                      <div className="card-body p-3">
                        <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                          <div className="avatar avatar-sm">
                            <span className={`avatar-initial rounded bg-label-${card.tone}`}>
                              <i className={`bx ${card.icon}`} aria-hidden="true" />
                            </span>
                          </div>
                          <h5
                            className={`mb-0${
                              card.count > 0 && (card.tone === "danger" || card.tone === "warning")
                                ? " text-" + card.tone
                                : ""
                            }`}
                          >
                            {card.count}
                          </h5>
                        </div>
                        <span className="d-block text-muted small text-truncate" title={card.label}>
                          {card.label}
                        </span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {attentionTotal === 0 ? (
            <p className="text-muted small mb-2">No open attention items right now.</p>
          ) : null}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none"
            onClick={() => setAttentionPanelOpen((open) => !open)}
            aria-expanded={attentionPanelOpen}
          >
            {attentionPanelOpen ? "Hide follow-up list" : "Show follow-up list"}
          </button>
          {attentionPanelOpen ? (
            <div className="card border shadow-none mt-2">
              <div className="card-body py-3">
                {filteredAttentionIssues.length === 0 ? (
                  <p className="text-muted small mb-0">No follow-ups in this filter.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {filteredAttentionIssues.slice(0, 25).map((issue) => (
                      <li key={`${issue.source ?? "dqf"}-${issue.kind}-${issue.recordId}-${issue.fieldId ?? ""}`}>
                        <Link
                          href={attentionIssueHref(issue)}
                          className="list-group-item list-group-item-action px-0 border-0 text-decoration-none text-body"
                        >
                          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                            <div className="min-w-0">
                              <span className="fw-semibold d-block">
                                {personNameDisplay(issue.driverName)}
                              </span>
                              <span className="text-muted small d-block">{issue.reason}</span>
                            </div>
                            <div className="d-flex flex-wrap gap-1 align-self-start">
                              <span className="badge bg-label-secondary">
                                {(issue.source ?? "dqf") === "fleet" ? "Company" : "DQF"}
                              </span>
                              <span className="badge bg-label-secondary">Open</span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {filteredAttentionIssues.length > 25 ? (
                  <p className="text-muted small mt-2 mb-0">
                    Showing 25 of {filteredAttentionIssues.length}. Use a category card to filter the
                    list.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
        ) : (
        <p className="text-muted mb-4" role="status" aria-live="polite">Loading attention summary…</p>
        )
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
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
            <div className="d-flex flex-wrap gap-2 ms-auto">
              <Link className="btn btn-sm btn-outline-primary" href={COMPANY_DRIVERS_HREF}>
                <i className="bx bx-user me-1" />
                Company DRIVERS
              </Link>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary text-uppercase"
                  onClick={() => setNewDriverOpen(true)}
                  disabled={newDriverOpen}
                >
                  New driver
                </button>
              ) : null}
            </div>
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

        {!loading && tab === "dvirs" ? (
          <DvirWorkspace
            records={records}
            canManage={canManage}
            loading={loading}
            onRefresh={() => void loadRecords()}
          />
        ) : null}

        {!loading && tab === "reports" ? (
          <DotDqfComplianceReportCard records={records} tenantSlug={tenantSlug} />
        ) : null}

        {!loading && tab !== "dashboard" && tab !== "dvirs" && tab !== "reports" ? (
          <>
            <FilterPanel
              searchId="dot-record-search"
              searchValue={q}
              onSearchChange={setQ}
              searchPlaceholder={
                tab === "drivers" ? "DRIVER / worker, location…" : "Title, DRIVER, location…"
              }
              chips={[
                ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
                ...(status ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }] : []),
                ...(attentionFilter
                  ? [
                      {
                        id: "attention",
                        label: `Attention: ${
                          (attentionSource === "fleet"
                            ? companyAttentionCards
                            : dqfAttentionCards
                          ).find((card) => card.key === attentionFilter)?.label ?? attentionFilter
                        }`,
                        onRemove: clearAttentionFilter,
                      },
                    ]
                  : []),
              ]}
              onClearAll={() => {
                setQ("");
                setStatus("");
                clearAttentionFilter();
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

            {tab === "drivers" && canManage && newDriverOpen ? (
              <DotNewDriverForm
                tenantSlug={tenantSlug}
                onCancel={() => setNewDriverOpen(false)}
                onCreated={() => {
                  setNewDriverOpen(false);
                  void loadRecords();
                }}
              />
            ) : null}

            {canManage && tab !== "drivers" ? (
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
                          {DOT_RECORD_CATEGORIES.filter((category) => category !== "drivers").map(
                            (category) => (
                              <option key={category} value={category}>
                                {DOT_TAB_META[category].label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="dot-create-worker">
                          DRIVER / worker
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
              ) : tab === "drivers" ? (
                <ul className="list-group list-group-flush">
                  {visibleRecords.map((row) => {
                    const recordId = String(row.id);
                    const nameFileId = fileIdByRecordId.get(recordId) ?? recordId;
                    const workerName = personNameDisplay(dotWorkerName(row));
                    const driverLabel =
                      workerName || personNameDisplay(dotRecordTitle(row)) || "—";
                    const status = String(row.status ?? "");
                    const drvId = dotDriverReferenceId(row);
                    const location = dotLocationText(row);
                    const employee = String(row.employeeNumber ?? "").trim();
                    const locationLine = [employee, location].filter(Boolean).join(" · ");
                    const meta = dotDriverSourceMeta(row);
                    const overdue = dotDueOverdueLabel(row);
                    const attentionLine = formatDriverListAttentionLine(
                      attentionIssuesForRecord(dqfAttention.issues, recordId),
                    );
                    const rowTone = status ? dotStatusRowClass(status) : "";
                    return (
                      <li key={recordId} className={`list-group-item ${rowTone}`.trim()}>
                        <Link
                          href={dotFileHref(nameFileId)}
                          className="text-decoration-none text-body d-block"
                        >
                          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                            <div className="min-w-0 flex-grow-1">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <span className="fw-semibold">{driverLabel}</span>
                                {drvId ? (
                                  <span className="badge bg-label-secondary">{drvId}</span>
                                ) : null}
                              </div>
                              {attentionLine ? (
                                <div className="text-danger small mt-1">{attentionLine}</div>
                              ) : null}
                              {locationLine ? (
                                <div className="text-muted small mt-1 text-wrap text-break">
                                  {locationLine}
                                </div>
                              ) : null}
                              {meta ? <div className="text-muted small mt-1">{meta}</div> : null}
                              {typeof row.profileRecordCount === "number" &&
                              row.profileRecordCount > 1 ? (
                                <div className="text-muted small">
                                  {row.profileRecordCount} combined files
                                </div>
                              ) : null}
                            </div>
                            <div className="text-end flex-shrink-0">
                              {status ? (
                                <span className={`badge ${dotStatusBadgeClass(status)}`}>
                                  {status}
                                </span>
                              ) : (
                                <span className="badge bg-label-secondary">—</span>
                              )}
                              {overdue ? (
                                <div className="text-danger small mt-1">{overdue}</div>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="table-responsive text-nowrap">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Category</th>
                        <th scope="col">DRIVER / worker</th>
                        <th scope="col">Location</th>
                        <th scope="col">Status</th>
                        <th scope="col">Updated</th>
                        <th scope="col" className="text-end">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="table-border-bottom-0">
                      {visibleRecords.map((row) => {
                        const recordId = String(row.id);
                        const workerName = personNameDisplay(dotWorkerName(row));
                        const nameFileId = fileIdByRecordId.get(recordId) ?? recordId;
                        const category = dotRecordCategory(row);
                        const categoryLabel = DOT_TAB_META[category]?.label ?? category;
                        return (
                          <tr key={recordId} className={dotStatusRowClass(String(row.status ?? ""))}>
                            <td>
                              <Link href={dotFileHref(recordId)} className="fw-semibold">
                                {dotRecordTitle(row)}
                              </Link>
                              {typeof row.profileRecordCount === "number" &&
                              row.profileRecordCount > 1 ? (
                                <span className="text-muted small d-block">
                                  {row.profileRecordCount} combined files
                                </span>
                              ) : null}
                            </td>
                            <td>{categoryLabel}</td>
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
                            <td className="text-end">
                              <ForgePrintButton
                                module="DOT_COMPLIANCE"
                                recordType={
                                  category === "vehicles" ? "dot_vehicle" : "dot_record"
                                }
                                recordId={recordId}
                                fieldValues={dotVehiclePrintFieldValues({
                                  ...(row as Record<string, unknown>),
                                  name: dotRecordTitle(row),
                                  assetNumber: dotRecordTitle(row),
                                  driverName: workerName,
                                })}
                              />
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
