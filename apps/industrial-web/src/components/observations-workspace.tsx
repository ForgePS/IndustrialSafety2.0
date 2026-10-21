"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ObservationFollowUpFields } from "@/components/observation-followup-fields";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { PersonnelSearchField } from "@/components/personnel-search-field";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { useOrgLocationLookups, type OrgLocationLookups } from "@/hooks/use-org-location-lookups";
import { compressImageToDataUrl, imageCompressErrorMessage } from "@/lib/compress-image";
import {
  DEFAULT_OBSERVATION_CATEGORIES,
  OBSERVATIONS_API,
  OBSERVATION_RISK_OPTIONS,
  OBSERVATION_STATUS_OPTIONS,
  OBSERVATION_TYPE_OPTIONS,
  emptyObservationForm,
  formatObservedAt,
  mapObservationRecord,
  observationCategoryOptions,
  observationFormFromRecord,
  observationPayloadFromForm,
  observationRiskOption,
  observationStatusOption,
  observationTypeOption,
  departmentSupervisor,
  emptyObservationFollowUp,
  followUpMissing,
  followUpPayload,
  isPositiveObservationType,
  observedPersonAtFault,
  sameAssignee,
  splitEmailList,
  validateObservationForm,
  type ObservationAssignee,
  type ObservationFollowUp,
  type ObservationFormState,
  type ObservationPhoto,
  type ObservationRecord,
} from "@/lib/observations-module";

const VIEW_PERM = "industrial.observations.view";
const MANAGE_PERM = "industrial.observations.manage";
const MAX_PHOTOS = 10;
/** Per-photo data-URL budget; 10 photos must fit the API's 20 MB body limit. */
const PHOTO_MAX_LENGTH = 1_000_000;

type Tab = "list" | "categories";
type StatusFilter = "" | "ACTIVE" | "OPEN" | "IN_PROGRESS" | "CLOSED" | "ARCHIVED";

/** Filter values that span several stored values. */
const POSITIVE_TYPES = "POSITIVE";
const HIGH_OR_CRITICAL = "HIGH_PLUS";
const POSITIVE_TYPE_VALUES = new Set(["SAFE_BEHAVIOR", "GOOD_CATCH"]);
const UNASSIGNED = "__unassigned__";
/** Same permissions the API requires to change a department's contact. */
const DEPARTMENT_CONTACT_PERMS = [
  "industrial.personnel.manage",
  "industrial.inspections.manage",
  "industrial.admin",
];

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge bg-label-${tone}`}>{children}</span>;
}

type EmailResult = { sentTo: string[]; record?: Record<string, unknown> };

function sendObservationEmail(
  id: string,
  options: { to?: string[]; message?: string },
): Promise<EmailResult> {
  return apiSend<EmailResult>(`${OBSERVATIONS_API}/${encodeURIComponent(id)}/email`, "POST", {
    ...(options.to ? { to: options.to } : {}),
    ...(options.message ? { message: options.message } : {}),
    appBaseUrl: window.location.origin,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function newPhotoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ObservationsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const { query: facilityQuery } = useIndustrialFacility();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has(VIEW_PERM) || permissions.has(MANAGE_PERM) || permissions.has("industrial.admin");
  const canManage = permissions.has(MANAGE_PERM) || permissions.has("industrial.admin");
  const canSetDepartmentSupervisor = DEPARTMENT_CONTACT_PERMS.some((p) => permissions.has(p));
  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "OBSERVATIONS",
    canView,
  });
  const lookups = useOrgLocationLookups(me?.tenantId);

  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<ObservationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([...DEFAULT_OBSERVATION_CATEGORIES]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [typeFilter, setTypeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; id: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ items?: Array<Record<string, unknown>> }>(OBSERVATIONS_API, {
        query: { page: "1", pageSize: "500", ...facilityQuery },
      });
      setItems((data.items ?? []).map(mapObservationRecord));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load observations");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [facilityQuery]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiGet<{ categories?: string[] }>(`${OBSERVATIONS_API}/settings`);
      if (Array.isArray(data.categories)) setCategories(data.categories);
    } catch {
      // Keep the standard list if settings can't be read.
    }
  }, []);

  useEffect(() => {
    if (!awsReady || !canView) {
      setLoading(false);
      return;
    }
    void loadList();
    void loadSettings();
  }, [awsReady, canView, loadList, loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const linkedId = new URLSearchParams(window.location.search).get("id");
    if (linkedId) {
      setEditor({ mode: "edit", id: linkedId });
    } else if (canManage && window.location.hash === "#ops-create") {
      setEditor({ mode: "create" });
    }
  }, [canManage]);

  const assigneeChoices = useMemo(
    () =>
      [...new Set(items.map((row) => row.assignedToName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [items],
  );

  const siteLabelById = useMemo(
    () => new Map(lookups.sites.map((s) => [s.id, s.label])),
    [lookups.sites],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((row) => {
      if (statusFilter === "ACTIVE") {
        if (row.status !== "OPEN" && row.status !== "IN_PROGRESS") return false;
      } else if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      if (typeFilter === POSITIVE_TYPES) {
        if (!POSITIVE_TYPE_VALUES.has(row.observationType)) return false;
      } else if (typeFilter && row.observationType !== typeFilter) {
        return false;
      }
      if (riskFilter === HIGH_OR_CRITICAL) {
        if (row.riskLevel !== "high" && row.riskLevel !== "critical") return false;
      } else if (riskFilter && row.riskLevel !== riskFilter) {
        return false;
      }
      if (categoryFilter && row.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (assigneeFilter === UNASSIGNED) {
        if (row.assignedToName) return false;
      } else if (assigneeFilter && row.assignedToName !== assigneeFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        row.title,
        row.description,
        row.category,
        row.siteName,
        row.area,
        row.reportedBy,
        row.assignedToName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, q, statusFilter, typeFilter, riskFilter, categoryFilter, assigneeFilter]);

  const summary = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let highRisk = 0;
    let positive = 0;
    for (const row of items) {
      const active = row.status === "OPEN" || row.status === "IN_PROGRESS";
      if (row.status === "OPEN") open += 1;
      if (row.status === "IN_PROGRESS") inProgress += 1;
      if (active && (row.riskLevel === "high" || row.riskLevel === "critical")) highRisk += 1;
      if (POSITIVE_TYPE_VALUES.has(row.observationType)) positive += 1;
    }
    return { open, inProgress, highRisk, positive };
  }, [items]);

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view observations.</p>
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

  const filtersActive = Boolean(
    q || statusFilter !== "ACTIVE" || typeFilter || riskFilter || categoryFilter || assigneeFilter,
  );
  const categoryChoices = observationCategoryOptions(categories, categoryFilter);

  return (
    <section aria-labelledby="observations-title" data-walkthrough="safety-observations">
      <ModuleWorkspaceHeader
        id="observations-title"
        eyebrow="Safety"
        title={moduleName}
        description="Record safe and unsafe behaviors, conditions, hazards, near misses, and good catches."
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      <ModuleWorkspaceTabs<Tab>
        tabs={[
          { id: "list", label: "Observations" },
          { id: "categories", label: "Categories" },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Observations sections"
      />

      {notice ? (
        <div className={`alert alert-${notice.tone} d-flex align-items-center gap-3`} role="status">
          <span className="flex-grow-1">{notice.text}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setNotice(null)} />
        </div>
      ) : null}

      {tab === "categories" ? (
        <CategoriesPanel
          categories={categories}
          canManage={canManage}
          onSaved={(next) => setCategories(next)}
        />
      ) : (
        <>
          <div className="row g-3 mb-4">
            {[
              { label: "Open", value: summary.open, icon: "bx-error-circle", tone: "warning", status: "OPEN" as StatusFilter },
              { label: "In progress", value: summary.inProgress, icon: "bx-loader-circle", tone: "info", status: "IN_PROGRESS" as StatusFilter },
              {
                label: "High / critical risk (open)",
                value: summary.highRisk,
                icon: "bx-shield-x",
                tone: "danger",
                status: "ACTIVE" as StatusFilter,
                risk: HIGH_OR_CRITICAL,
              },
              {
                label: "Positive observations",
                value: summary.positive,
                icon: "bx-like",
                tone: "success",
                status: "" as StatusFilter,
                type: POSITIVE_TYPES,
              },
            ].map((tile) => (
              <div className="col-6 col-lg-3" key={tile.label}>
                <button
                  type="button"
                  className="card border shadow-none w-100 text-start h-100"
                  onClick={() => {
                    setStatusFilter(tile.status);
                    setRiskFilter(tile.risk ?? "");
                    setTypeFilter(tile.type ?? "");
                    setCategoryFilter("");
                  }}
                >
                  <div className="card-body d-flex align-items-center gap-3">
                    <span className={`avatar-initial rounded bg-label-${tile.tone} p-2`}>
                      <i className={`bx ${tile.icon} fs-4`} />
                    </span>
                    <div>
                      <div className="fs-4 fw-semibold">{tile.value}</div>
                      <div className="text-muted small">{tile.label}</div>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>

          <div className="card border shadow-none mb-4">
            <div className="card-body">
              <div className="row g-2 align-items-end">
                <div className="col-md-3">
                  <label className="form-label small" htmlFor="obs-filter-q">
                    Search
                  </label>
                  <input
                    id="obs-filter-q"
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Description, location, reporter…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label small" htmlFor="obs-filter-status">
                    Status
                  </label>
                  <select
                    id="obs-filter-status"
                    className="form-select form-select-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  >
                    <option value="ACTIVE">Open &amp; in progress</option>
                    <option value="">All</option>
                    {OBSERVATION_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label small" htmlFor="obs-filter-type">
                    Type
                  </label>
                  <select
                    id="obs-filter-type"
                    className="form-select form-select-sm"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="">All types</option>
                    <option value={POSITIVE_TYPES}>Positive (safe behavior or good catch)</option>
                    {OBSERVATION_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label small" htmlFor="obs-filter-category">
                    Category
                  </label>
                  <select
                    id="obs-filter-category"
                    className="form-select form-select-sm"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categoryChoices.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-md-1">
                  <label className="form-label small" htmlFor="obs-filter-risk">
                    Risk
                  </label>
                  <select
                    id="obs-filter-risk"
                    className="form-select form-select-sm"
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value={HIGH_OR_CRITICAL}>High or critical</option>
                    {OBSERVATION_RISK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label small" htmlFor="obs-filter-assignee">
                    Assigned to
                  </label>
                  <select
                    id="obs-filter-assignee"
                    className="form-select form-select-sm"
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                  >
                    <option value="">Anyone</option>
                    <option value={UNASSIGNED}>Unassigned</option>
                    {assigneeChoices.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 d-flex gap-2 justify-content-end">
                  {filtersActive ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        setQ("");
                        setStatusFilter("ACTIVE");
                        setTypeFilter("");
                        setRiskFilter("");
                        setCategoryFilter("");
                        setAssigneeFilter("");
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => setEditor({ mode: "create" })}
                    >
                      <i className="bx bx-plus me-1" />
                      New observation
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
              <span className="flex-grow-1">{error}</span>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void loadList()}>
                Retry
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="text-muted" role="status" aria-live="polite">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <div className="card border shadow-none">
              <div className="card-body">
                <p className="text-muted mb-0">
                  {items.length === 0 ? "No observations recorded yet." : "No observations match these filters."}
                </p>
              </div>
            </div>
          ) : (
            <div className="card border shadow-none" role="region" aria-label="Observations list">
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th scope="col">Observed</th>
                      <th scope="col">Type</th>
                      <th scope="col">Category</th>
                      <th scope="col">Description</th>
                      <th scope="col">Location</th>
                      <th scope="col">Risk</th>
                      <th scope="col">Assigned to</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const type = observationTypeOption(row.observationType);
                      const risk = observationRiskOption(row.riskLevel);
                      const status = observationStatusOption(row.status);
                      const site = row.siteName || siteLabelById.get(row.siteId) || "";
                      const where = [site, row.departmentName, row.area].filter(Boolean).join(" · ");
                      return (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setEditor({ mode: "edit", id: row.id })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setEditor({ mode: "edit", id: row.id });
                            }
                          }}
                        >
                          <td className="text-nowrap small">{formatObservedAt(row.observedAt || row.createdAt)}</td>
                          <td>{type ? <Badge tone={type.tone}>{type.label}</Badge> : <span className="text-muted">-</span>}</td>
                          <td>{row.category || <span className="text-muted">-</span>}</td>
                          <td style={{ maxWidth: 360 }}>
                            <div className="text-truncate">{row.description || row.title}</div>
                            <div className="text-muted small d-flex gap-3">
                              {row.peopleObserved.length > 0 ? (
                                <span>
                                  <i className="bx bx-user me-1" />
                                  {row.peopleObserved.length}
                                </span>
                              ) : null}
                              {row.peopleObserved.some((p) => observedPersonAtFault(p, row.observationType)) ? (
                                <span className="text-danger">
                                  {row.peopleObserved.filter((p) => observedPersonAtFault(p, row.observationType)).length} at
                                  fault
                                </span>
                              ) : null}
                              {row.photoCount > 0 ? (
                                <span>
                                  <i className="bx bx-camera me-1" />
                                  {row.photoCount}
                                </span>
                              ) : null}
                              {row.reportedBy ? <span>By {row.reportedBy}</span> : null}
                            </div>
                          </td>
                          <td className="small">{where || <span className="text-muted">-</span>}</td>
                          <td>{risk ? <Badge tone={risk.tone}>{risk.label}</Badge> : <span className="text-muted">-</span>}</td>
                          <td className="small">
                            {row.assignedToName || <span className="text-muted">Unassigned</span>}
                            {row.lastEmailedAt ? (
                              <div className="text-muted" title={`Emailed ${formatObservedAt(row.lastEmailedAt)}`}>
                                <i className="bx bx-envelope me-1" />
                                Emailed
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                            {row.followUpCompletedAt ? (
                              <div className="small text-success mt-1">
                                <i className="bx bx-check-circle me-1" />
                                Follow-up done
                              </div>
                            ) : row.followUpSavedAt ? (
                              <div className="small text-info mt-1">
                                <i className="bx bx-edit me-1" />
                                Follow-up started
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {editor ? (
        <ObservationEditor
          key={editor.mode === "edit" ? editor.id : "create"}
          id={editor.mode === "edit" ? editor.id : null}
          categories={categories}
          lookups={lookups}
          canManage={canManage}
          canSetDepartmentSupervisor={canSetDepartmentSupervisor}
          onClose={() => {
            setEditor(null);
            if (window.location.search.includes("id=")) {
              window.history.replaceState(null, "", window.location.pathname);
            }
          }}
          onSaved={(message) => {
            setEditor(null);
            if (message) setNotice(message);
            void loadList();
          }}
        />
      ) : null}
    </section>
  );
}

function ObservationEditor({
  id,
  categories,
  lookups,
  canManage,
  canSetDepartmentSupervisor,
  onClose,
  onSaved,
}: {
  id: string | null;
  categories: string[];
  lookups: OrgLocationLookups;
  canManage: boolean;
  canSetDepartmentSupervisor: boolean;
  onClose: () => void;
  onSaved: (notice?: { tone: "success" | "warning"; text: string }) => void;
}) {
  const isCreate = id === null;
  const [form, setForm] = useState<ObservationFormState>(() => emptyObservationForm());
  const [record, setRecord] = useState<ObservationRecord | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [zoomPhoto, setZoomPhoto] = useState<ObservationPhoto | null>(null);
  /** null = follow the default (on for new observations / a changed assignee). */
  const [emailOnSave, setEmailOnSave] = useState<boolean | null>(null);
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [deptBusy, setDeptBusy] = useState(false);
  const [followUp, setFollowUp] = useState<ObservationFollowUp>(() => emptyObservationFollowUp());
  const [followUpDirty, setFollowUpDirty] = useState(false);
  const readOnly = !canManage;
  const followUpOpen = !isCreate && record !== null && record.status !== "CLOSED" && record.status !== "ARCHIVED";

  const departmentById = useMemo(
    () => new Map(lookups.departments.map((d) => [d.id, d])),
    [lookups.departments],
  );
  const department = departmentById.get(form.departmentId);
  const supervisor = departmentSupervisor(department);
  const hasAssignee = Boolean(form.assignedToPersonnelId || form.assignedToName.trim());
  const assigneeChanged = record
    ? !sameAssignee(form, {
        personnelId: record.assignedToPersonnelId,
        name: record.assignedToName,
        email: record.assignedToEmail,
      })
    : hasAssignee;
  const emailOnSaveChecked = hasAssignee && (emailOnSave ?? (isCreate || assigneeChanged));

  function assign(who: ObservationAssignee | null) {
    setForm((prev) => ({
      ...prev,
      assignedToPersonnelId: who?.personnelId ?? "",
      assignedToName: who?.name ?? "",
      assignedToEmail: who?.email ?? "",
    }));
  }

  async function makeDepartmentSupervisor() {
    if (!department || !hasAssignee) return;
    setDeptBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/departments/${encodeURIComponent(department.id)}/contact`, "PATCH", {
        contactPersonnelId: form.assignedToPersonnelId || null,
        contactName: form.assignedToName.trim(),
        contactEmail: form.assignedToEmail.trim(),
      });
      await lookups.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the department supervisor");
    } finally {
      setDeptBusy(false);
    }
  }

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<Record<string, unknown>>(`${OBSERVATIONS_API}/${id}`);
        if (cancelled) return;
        const mapped = mapObservationRecord(data ?? {});
        setRecord(mapped);
        setForm(observationFormFromRecord(mapped));
        setFollowUp({
          ...mapped.followUp,
          completedByName: mapped.followUp.completedByName || mapped.assignedToName,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load observation");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isCreate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomPhoto) setZoomPhoto(null);
      else if (!saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, zoomPhoto]);

  const set = <K extends keyof ObservationFormState>(key: K, value: ObservationFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function addPerson(personnelId: string | null, name: string) {
    const trimmed = name.trim();
    if (!trimmed && !personnelId) return;
    setForm((prev) => {
      const dup = prev.peopleObserved.some((p) =>
        personnelId ? p.personnelId === personnelId : !p.personnelId && p.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (dup) return prev;
      return { ...prev, peopleObserved: [...prev.peopleObserved, { personnelId, name: trimmed || "Unnamed" }] };
    });
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - form.photos.length;
    if (room <= 0) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setPhotoBusy(true);
    setError(null);
    try {
      const added: ObservationPhoto[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const dataUrl = await compressImageToDataUrl(file, PHOTO_MAX_LENGTH);
        if (!dataUrl.startsWith("data:image/")) throw new Error("Only image files can be attached.");
        added.push({
          id: newPhotoId(),
          fileName: file.name || "photo.jpg",
          contentType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
          dataUrl,
        });
      }
      setForm((prev) => ({ ...prev, photos: [...prev.photos, ...added] }));
      if (files.length > room) setError(`Only the first ${room} photo(s) were added (limit ${MAX_PHOTOS}).`);
    } catch (e) {
      setError(imageCompressErrorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  function changeFollowUp(next: ObservationFollowUp) {
    setFollowUp(next);
    setFollowUpDirty(true);
  }

  async function completeFollowUp() {
    if (readOnly || !id) return;
    const problem = validateObservationForm(form) ?? followUpMissing(followUp);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiSend(`${OBSERVATIONS_API}/${id}`, "PATCH", {
        ...observationPayloadFromForm(form),
        followUp: followUpPayload(followUp),
        completeFollowUp: true,
      });
      onSaved({ tone: "success", text: "Follow-up completed and observation closed." });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close the observation");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const problem = validateObservationForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    let savedId = id;
    try {
      const payload = observationPayloadFromForm(form);
      if (followUpDirty && followUpOpen) payload.followUp = followUpPayload(followUp);
      if (isCreate) {
        const created = await apiSend<{ id?: string }>(OBSERVATIONS_API, "POST", payload);
        savedId = created?.id ?? null;
      } else {
        await apiSend(`${OBSERVATIONS_API}/${id}`, "PATCH", payload);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
      setSaving(false);
      return;
    }
    if (!emailOnSaveChecked || !savedId) {
      setSaving(false);
      onSaved();
      return;
    }
    try {
      const result = await sendObservationEmail(savedId, {});
      onSaved({
        tone: "success",
        text: `Observation saved and emailed to ${result.sentTo.join(", ")}.`,
      });
    } catch (err) {
      onSaved({
        tone: "warning",
        text: `Observation saved, but the email was not sent: ${
          err instanceof ApiError ? err.message : "unknown error"
        }`,
      });
    } finally {
      setSaving(false);
    }
  }

  const typeHelp = observationTypeOption(form.observationType)?.help;
  const riskHelp = observationRiskOption(form.riskLevel)?.help;
  const canMarkFault = Boolean(form.observationType) && !isPositiveObservationType(form.observationType);
  const categoryChoices = observationCategoryOptions(categories, form.category);
  const title = isCreate ? "New observation" : readOnly ? "Observation" : "Edit observation";

  return (
    <>
      <div
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="obs-editor-title"
      >
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <form className="modal-content" onSubmit={(e) => void onSubmit(e)} noValidate>
            <div className="modal-header">
              <div>
                <h5 className="modal-title" id="obs-editor-title">
                  {title}
                </h5>
                {record ? (
                  <p className="text-muted small mb-0">
                    Created {formatObservedAt(record.createdAt)}
                    {record.fieldSource ? " from Field" : ""}
                    {record.reportedBy ? ` · Reported by ${record.reportedBy}` : ""}
                  </p>
                ) : null}
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={saving} />
            </div>
            <div className="modal-body">
              {loading ? (
                <p className="text-muted mb-0" role="status">
                  Loading…
                </p>
              ) : (
                <fieldset disabled={readOnly || saving}>
                  <div className="mb-4">
                    <span className="form-label d-block">
                      Observation type <span className="text-danger">*</span>
                    </span>
                    <div className="d-flex flex-wrap gap-2" role="radiogroup" aria-label="Observation type">
                      {OBSERVATION_TYPE_OPTIONS.map((o) => {
                        const selected = form.observationType === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`btn btn-sm ${selected ? `btn-${o.tone}` : `btn-outline-${o.tone}`}`}
                            onClick={() => set("observationType", o.value)}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    {typeHelp ? <div className="form-text">{typeHelp}</div> : null}
                  </div>

                  <div className="row g-3 mb-4">
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="obs-category">
                        Category <span className="text-danger">*</span>
                      </label>
                      <select
                        id="obs-category"
                        className="form-select"
                        value={form.category}
                        onChange={(e) => set("category", e.target.value)}
                      >
                        <option value="">Select category</option>
                        {categoryChoices.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="obs-observed-at">
                        Date and time observed
                      </label>
                      <input
                        id="obs-observed-at"
                        type="datetime-local"
                        className="form-control"
                        value={form.observedAt}
                        onChange={(e) => set("observedAt", e.target.value)}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="obs-status">
                        Status
                      </label>
                      <select
                        id="obs-status"
                        className="form-select"
                        value={form.status}
                        onChange={(e) => set("status", e.target.value)}
                      >
                        {OBSERVATION_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="obs-description">
                        What was observed? <span className="text-danger">*</span>
                      </label>
                      <textarea
                        id="obs-description"
                        className="form-control"
                        rows={4}
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        placeholder="Describe the behavior or condition, what could have happened, and why it matters."
                      />
                    </div>
                  </div>

                  <h6 className="text-muted text-uppercase small mb-2">Where</h6>
                  <div className="row g-3 mb-4">
                    <OrgLocationCascade
                      idPrefix="obs"
                      value={{
                        siteId: form.siteId,
                        siteName: form.siteName,
                        divisionName: form.divisionName,
                        departmentId: form.departmentId,
                        departmentName: form.departmentName,
                      }}
                      onChange={(next) =>
                        setForm((prev) => {
                          const merged = { ...prev, ...next };
                          if (next.departmentId === prev.departmentId) return merged;
                          // Follow the department's supervisor unless someone else was picked by hand.
                          const prevSupervisor = departmentSupervisor(departmentById.get(prev.departmentId));
                          if (!sameAssignee(prev, prevSupervisor)) return merged;
                          const nextSupervisor = departmentSupervisor(departmentById.get(next.departmentId));
                          return {
                            ...merged,
                            assignedToPersonnelId: nextSupervisor?.personnelId ?? "",
                            assignedToName: nextSupervisor?.name ?? "",
                            assignedToEmail: nextSupervisor?.email ?? "",
                          };
                        })
                      }
                      sites={lookups.sites}
                      departments={lookups.departments}
                      divisionEntries={lookups.divisionEntries}
                      loading={lookups.loading}
                      disabled={readOnly || saving}
                    />
                    <div className="col-md-8">
                      <label className="form-label" htmlFor="obs-area">
                        Area / specific spot
                      </label>
                      <input
                        id="obs-area"
                        className="form-control"
                        value={form.area}
                        onChange={(e) => set("area", e.target.value)}
                        placeholder="e.g. Line 3 packaging, north dock door"
                      />
                    </div>
                  </div>

                  <h6 className="text-muted text-uppercase small mb-2">Assigned supervisor</h6>
                  {supervisor && !sameAssignee(form, supervisor) && !readOnly ? (
                    <div className="alert alert-info py-2 small d-flex flex-wrap align-items-center gap-2">
                      <span className="flex-grow-1">
                        {department?.label} supervisor: <strong>{supervisor.name}</strong>
                        {supervisor.email ? ` (${supervisor.email})` : ""}
                      </span>
                      <button type="button" className="btn btn-sm btn-info" onClick={() => assign(supervisor)}>
                        Assign to {supervisor.name}
                      </button>
                    </div>
                  ) : null}
                  {department && !supervisor && !readOnly ? (
                    <div className="alert alert-secondary py-2 small d-flex flex-wrap align-items-center gap-2">
                      <span className="flex-grow-1">
                        {department.label} has no supervisor set, so pick one below.
                      </span>
                      {canSetDepartmentSupervisor && hasAssignee ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={deptBusy}
                          onClick={() => void makeDepartmentSupervisor()}
                        >
                          {deptBusy ? "Saving…" : `Make ${form.assignedToName || "them"} the ${department.label} supervisor`}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="row g-3 mb-2">
                    <div className="col-md-6">
                      <PersonnelSearchField
                        id="obs-assignee"
                        label="Supervisor"
                        personnelId={form.assignedToPersonnelId}
                        displayName={form.assignedToName}
                        disabled={readOnly || saving}
                        allowUnlinkedText
                        placeholder="Search employees, or type a name"
                        onUnlinkedTextChange={(value) =>
                          setForm((prev) => ({ ...prev, assignedToPersonnelId: "", assignedToName: value }))
                        }
                        onLinkedChange={(sel) =>
                          assign(sel ? { personnelId: sel.personnelId, name: sel.displayName, email: "" } : null)
                        }
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="obs-assignee-email">
                        Supervisor email
                      </label>
                      <input
                        id="obs-assignee-email"
                        type="email"
                        className="form-control"
                        value={form.assignedToEmail}
                        onChange={(e) => set("assignedToEmail", e.target.value)}
                        placeholder={
                          form.assignedToPersonnelId
                            ? "Uses the email on their employee profile"
                            : "supervisor@company.com"
                        }
                      />
                    </div>
                  </div>
                  {!readOnly && hasAssignee ? (
                    <div className="form-check mb-2">
                      <input
                        id="obs-email-on-save"
                        className="form-check-input"
                        type="checkbox"
                        checked={emailOnSaveChecked}
                        onChange={(e) => setEmailOnSave(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="obs-email-on-save">
                        Email this observation to {form.assignedToName || "the supervisor"} when I save
                      </label>
                    </div>
                  ) : null}
                  {record?.lastEmailedAt ? (
                    <p className="text-muted small mb-2">
                      <i className="bx bx-envelope me-1" />
                      Last emailed to {record.lastEmailedTo.join(", ") || "the supervisor"} on{" "}
                      {formatObservedAt(record.lastEmailedAt)}
                    </p>
                  ) : null}
                  {!readOnly && record ? (
                    emailPanelOpen ? (
                      <EmailPanel
                        recordId={record.id}
                        defaultTo={record.assignedToEmail}
                        unsaved={assigneeChanged}
                        onCancel={() => setEmailPanelOpen(false)}
                        onSent={(sent) => {
                          setEmailPanelOpen(false);
                          if (sent.record) setRecord(mapObservationRecord(sent.record));
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary mb-2"
                        onClick={() => setEmailPanelOpen(true)}
                      >
                        <i className="bx bx-envelope me-1" />
                        Email now…
                      </button>
                    )
                  ) : null}
                  <div className="mb-4" />

                  <div className="mb-4">
                    <span className="form-label d-block">
                      Risk level <span className="text-danger">*</span>
                    </span>
                    <div className="btn-group flex-wrap" role="radiogroup" aria-label="Risk level">
                      {OBSERVATION_RISK_OPTIONS.map((o) => {
                        const selected = form.riskLevel === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={`btn btn-sm ${selected ? `btn-${o.tone}` : `btn-outline-${o.tone}`}`}
                            onClick={() => set("riskLevel", o.value)}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    {riskHelp ? <div className="form-text">{riskHelp}</div> : null}
                  </div>

                  <h6 className="text-muted text-uppercase small mb-2">People observed</h6>
                  <p className="text-muted small mb-2">
                    Optional. Add employees from the directory or type a contractor / visitor name.
                    {canMarkFault
                      ? " Mark At fault only when the person's own actions caused it; it lowers their safety score."
                      : ""}
                  </p>
                  {form.peopleObserved.length > 0 ? (
                    <ul className="list-unstyled mb-3">
                      {form.peopleObserved.map((p, idx) => {
                        const atFault = observedPersonAtFault(p, form.observationType);
                        return (
                          <li
                            key={`${p.personnelId ?? "name"}-${p.name}-${idx}`}
                            className="d-flex align-items-center gap-2 border rounded px-2 py-1 mb-2"
                          >
                            <i className={`bx ${p.personnelId ? "bx-id-card" : "bx-user"} text-muted`} />
                            <span className="me-auto">{p.name}</span>
                            {canMarkFault ? (
                              <div className="form-check form-switch mb-0">
                                <input
                                  id={`obs-fault-${idx}`}
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={atFault}
                                  onChange={(e) =>
                                    set(
                                      "peopleObserved",
                                      form.peopleObserved.map((x, i) =>
                                        i === idx ? { ...x, atFault: e.target.checked } : x,
                                      ),
                                    )
                                  }
                                />
                                <label
                                  className={`form-check-label small ${atFault ? "text-danger fw-medium" : "text-muted"}`}
                                  htmlFor={`obs-fault-${idx}`}
                                >
                                  At fault
                                </label>
                              </div>
                            ) : null}
                            {!readOnly ? (
                              <button
                                type="button"
                                className="btn-close btn-close-sm ms-1"
                                style={{ fontSize: "0.55rem" }}
                                aria-label={`Remove ${p.name}`}
                                onClick={() =>
                                  set(
                                    "peopleObserved",
                                    form.peopleObserved.filter((_, i) => i !== idx),
                                  )
                                }
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {!readOnly ? (
                    <div className="row g-3 mb-4">
                      <div className="col-md-6">
                        <PersonnelSearchField
                          id="obs-person-search"
                          label="Add employee"
                          personnelId=""
                          displayName=""
                          disabled={saving}
                          onLinkedChange={(sel) => {
                            if (sel) addPerson(sel.personnelId, sel.displayName);
                          }}
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="obs-person-name">
                          Or add a name
                        </label>
                        <div className="input-group">
                          <input
                            id="obs-person-name"
                            className="form-control"
                            value={extraName}
                            onChange={(e) => setExtraName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addPerson(null, extraName);
                                setExtraName("");
                              }
                            }}
                            placeholder="Contractor or visitor"
                          />
                          <button
                            type="button"
                            className="btn btn-outline-primary"
                            disabled={!extraName.trim()}
                            onClick={() => {
                              addPerson(null, extraName);
                              setExtraName("");
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : form.peopleObserved.length === 0 ? (
                    <p className="text-muted small mb-4">None recorded.</p>
                  ) : null}

                  <div className="row g-3 mb-4">
                    <div className="col-md-8">
                      <label className="form-label" htmlFor="obs-actions">
                        Immediate action taken
                      </label>
                      <textarea
                        id="obs-actions"
                        className="form-control"
                        rows={3}
                        value={form.immediateActions}
                        onChange={(e) => set("immediateActions", e.target.value)}
                        placeholder="e.g. Coached employee, barricaded area, cleaned spill"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="obs-reported-by">
                        Reported by
                      </label>
                      <input
                        id="obs-reported-by"
                        className="form-control"
                        value={form.reportedBy}
                        onChange={(e) => set("reportedBy", e.target.value)}
                        placeholder={isCreate ? "Defaults to you" : ""}
                      />
                    </div>
                  </div>

                  <h6 className="text-muted text-uppercase small mb-2">
                    Photos ({form.photos.length}/{MAX_PHOTOS})
                  </h6>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {form.photos.map((photo) => (
                      <div key={photo.id} className="position-relative border rounded overflow-hidden" style={{ width: 112, height: 112 }}>
                        <button
                          type="button"
                          className="p-0 border-0 bg-transparent w-100 h-100"
                          onClick={() => setZoomPhoto(photo)}
                          aria-label={`View ${photo.fileName}`}
                        >
                          <img
                            src={photo.dataUrl}
                            alt={photo.fileName}
                            className="w-100 h-100"
                            style={{ objectFit: "cover" }}
                          />
                        </button>
                        {!readOnly ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 px-1 py-0"
                            aria-label={`Remove ${photo.fileName}`}
                            onClick={() =>
                              set(
                                "photos",
                                form.photos.filter((p) => p.id !== photo.id),
                              )
                            }
                          >
                            <i className="bx bx-x" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {!readOnly && form.photos.length < MAX_PHOTOS ? (
                      <label
                        className="border rounded d-flex flex-column align-items-center justify-content-center text-muted"
                        style={{ width: 112, height: 112, cursor: "pointer", borderStyle: "dashed" }}
                      >
                        <i className="bx bx-camera fs-3" />
                        <span className="small">{photoBusy ? "Adding…" : "Add photos"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="d-none"
                          disabled={photoBusy || saving}
                          onChange={(e) => {
                            void addPhotos(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  {readOnly && form.photos.length === 0 ? (
                    <p className="text-muted small mb-0">No photos.</p>
                  ) : null}
                </fieldset>
              )}
              {!loading && record ? (
                <section className="border-top pt-4 mt-4" aria-labelledby="obs-followup-title">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <h6 className="text-muted text-uppercase small mb-0" id="obs-followup-title">
                      Supervisor follow-up
                    </h6>
                    {record.followUp.completedAt ? (
                      <Badge tone="success">
                        Completed {formatObservedAt(record.followUp.completedAt)}
                        {record.followUp.completedVia === "supervisor-link" ? " via email link" : ""}
                      </Badge>
                    ) : record.followUp.savedAt ? (
                      <Badge tone="info">In progress · saved {formatObservedAt(record.followUp.savedAt)}</Badge>
                    ) : (
                      <Badge tone="secondary">Not started</Badge>
                    )}
                  </div>
                  {followUpOpen ? (
                    <p className="text-muted small">
                      The assigned supervisor can fill this in from the emailed link (no login), or you can
                      complete it here.
                    </p>
                  ) : null}
                  {followUpOpen || record.followUp.completedAt || record.followUp.savedAt ? (
                    <ObservationFollowUpFields
                      idPrefix="obs-fu"
                      value={followUp}
                      onChange={changeFollowUp}
                      disabled={readOnly || saving || !followUpOpen}
                      onError={setError}
                    />
                  ) : (
                    <p className="text-muted small mb-0">No follow-up was recorded before this observation was closed.</p>
                  )}
                </section>
              ) : null}
            </div>
            <div className="modal-footer">
              {error ? (
                <div className="text-danger small me-auto" role="alert">
                  {error}
                </div>
              ) : null}
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
                {readOnly ? "Close" : "Cancel"}
              </button>
              {!readOnly && followUpOpen ? (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={saving || loading || photoBusy}
                  onClick={() => void completeFollowUp()}
                >
                  Complete follow-up &amp; close
                </button>
              ) : null}
              {!readOnly ? (
                <button type="submit" className="btn btn-primary" disabled={saving || loading || photoBusy}>
                  {saving ? "Saving…" : isCreate ? "Save observation" : "Save changes"}
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" />

      {zoomPhoto ? (
        <button
          type="button"
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center border-0 p-0"
          style={{ background: "rgba(0,0,0,0.85)", zIndex: 2000 }}
          aria-label={`Close ${zoomPhoto.fileName}`}
          onClick={() => setZoomPhoto(null)}
        >
          <img
            src={zoomPhoto.dataUrl}
            alt={zoomPhoto.fileName}
            style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain" }}
          />
        </button>
      ) : null}
    </>
  );
}

function EmailPanel({
  recordId,
  defaultTo,
  unsaved,
  onCancel,
  onSent,
}: {
  recordId: string;
  defaultTo: string;
  unsaved: boolean;
  onCancel: () => void;
  onSent: (result: EmailResult) => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function send() {
    const recipients = splitEmailList(to);
    if (recipients.length === 0) {
      setStatus({ tone: "danger", text: "Enter at least one email address." });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const result = await sendObservationEmail(recordId, { to: recipients, message: message.trim() });
      setStatus({ tone: "success", text: `Sent to ${result.sentTo.join(", ")}.` });
      onSent(result);
    } catch (e) {
      setStatus({ tone: "danger", text: e instanceof ApiError ? e.message : "Email failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border rounded p-3 mb-2 bg-lighter">
      <div className="row g-2">
        <div className="col-md-6">
          <label className="form-label small" htmlFor="obs-email-to">
            Send to
          </label>
          <input
            id="obs-email-to"
            className="form-control form-control-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@company.com, another@company.com"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label small" htmlFor="obs-email-message">
            Message (optional)
          </label>
          <textarea
            id="obs-email-message"
            className="form-control form-control-sm"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Please follow up with the crew by Friday."
          />
        </div>
      </div>
      {unsaved ? (
        <p className="text-warning small mt-2 mb-0">
          This sends the last saved version. Save first to include your changes.
        </p>
      ) : null}
      <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={sending} onClick={() => void send()}>
          {sending ? "Sending…" : "Send email"}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={sending} onClick={onCancel}>
          Cancel
        </button>
        {status ? (
          <span className={`small text-${status.tone}`} role="status">
            {status.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CategoriesPanel({
  categories,
  canManage,
  onSaved,
}: {
  categories: string[];
  canManage: boolean;
  onSaved: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(categories);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => setDraft(categories), [categories]);

  const dirty = draft.join("\n") !== categories.join("\n");

  function add() {
    const name = newName.trim();
    if (!name) return;
    if (draft.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setMessage({ tone: "danger", text: `"${name}" is already in the list.` });
      return;
    }
    setDraft((prev) => [...prev, name]);
    setNewName("");
    setMessage(null);
  }

  function move(idx: number, delta: number) {
    setDraft((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const data = await apiSend<{ categories: string[] }>(`${OBSERVATIONS_API}/settings`, "PATCH", {
        categories: draft,
      });
      const saved = Array.isArray(data?.categories) ? data.categories : draft;
      onSaved(saved);
      setMessage({ tone: "success", text: "Categories saved." });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof ApiError ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card border shadow-none">
      <div className="card-header">
        <h6 className="card-title mb-1">Observation categories</h6>
        <p className="text-muted small mb-0">
          These are the choices in the Category dropdown. Removing a category does not change observations
          that already use it.
        </p>
      </div>
      <div className="card-body">
        {draft.length === 0 ? <p className="text-muted">No categories yet.</p> : null}
        <ul className="list-group mb-3">
          {draft.map((c, idx) => (
            <li key={c} className="list-group-item d-flex align-items-center gap-2 py-2">
              <span className="flex-grow-1">{c}</span>
              {canManage ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon btn-outline-secondary"
                    aria-label={`Move ${c} up`}
                    disabled={idx === 0 || saving}
                    onClick={() => move(idx, -1)}
                  >
                    <i className="bx bx-chevron-up" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon btn-outline-secondary"
                    aria-label={`Move ${c} down`}
                    disabled={idx === draft.length - 1 || saving}
                    onClick={() => move(idx, 1)}
                  >
                    <i className="bx bx-chevron-down" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon btn-outline-danger"
                    aria-label={`Remove ${c}`}
                    disabled={saving}
                    onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <i className="bx bx-trash" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>

        {canManage ? (
          <>
            <div className="input-group mb-3" style={{ maxWidth: 480 }}>
              <input
                className="form-control"
                aria-label="New category name"
                placeholder="New category"
                maxLength={80}
                value={newName}
                disabled={saving}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <button type="button" className="btn btn-outline-primary" disabled={!newName.trim() || saving} onClick={add}>
                Add
              </button>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save categories"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft(categories);
                  setMessage(null);
                }}
              >
                Discard changes
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={saving}
                onClick={() => {
                  setDraft([...DEFAULT_OBSERVATION_CATEGORIES]);
                  setMessage(null);
                }}
              >
                Reset to standard list
              </button>
              {message ? (
                <span className={`small text-${message.tone}`} role="status">
                  {message.text}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-muted small mb-0">Editing categories requires {MANAGE_PERM}.</p>
        )}
      </div>
    </div>
  );
}
