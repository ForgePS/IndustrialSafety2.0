"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiGetResult, apiSend, useAuth } from "@forge/web-kit";
import { IncidentBodyMap } from "@/components/incident-body-map";
import { IncidentsBodyMapPanel } from "@/components/incidents-body-map-panel";
import { IncidentsEvaluationPanel } from "@/components/incidents-evaluation-panel";
import { IncidentsRcaPanel } from "@/components/incidents-rca-panel";
import { IncidentsWorkflowPanel } from "@/components/incidents-workflow-panel";
import {
  bodyLocationSummaryLabel,
  toggleBodyLocation,
} from "@/lib/incident-body-map";
import {
  buildIncidentCreatePayload,
  EMPTY_INCIDENT_SUMMARY,
  INCIDENT_WORKSPACE_TABS,
  incidentSummaryTiles,
  incidentTabDescription,
  incidentTabLabel,
  isIncidentCategoryTab,
  isIncidentProcessTab,
  parseIncidentWorkspaceTab,
  statusBadgeClass,
  toIncidentRecords,
  toIncidentSummary,
  type EvaluationChecklist,
  type IncidentCategory,
  type IncidentLifecycleData,
  type IncidentRecord,
  type IncidentSummary,
  type IncidentWorkspaceTab,
  type RootCauseAnalysis,
} from "@/lib/incidents-module";

type ListResponse = { items?: unknown[] };

const FETCH_SIZE = 100;
const MAX_PAGES = 20;

/**
 * Incidents module — Sneat-themed summary tiles, record-type tabs, and process
 * tabs (workflow / evaluation checklist / root cause analysis).
 */
export function IncidentsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.incidents.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.incidents.manage") || permissions.has("industrial.admin");

  const [tab, setTab] = useState<IncidentWorkspaceTab>(() =>
    parseIncidentWorkspaceTab(searchParams.get("tab")),
  );
  const [summary, setSummary] = useState<IncidentSummary>(EMPTY_INCIDENT_SUMMARY);
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    title: "",
    severity: "moderate",
    location: "",
    description: "",
    reportedBy: "",
    dateOccurred: "",
    status: "open",
  });
  const [bodyLocations, setBodyLocations] = useState<string[]>([]);
  const [selectedBodyMapId, setSelectedBodyMapId] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseIncidentWorkspaceTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const incidentId = searchParams.get("incident");
    if (!incidentId) return;
    setSelectedBodyMapId(incidentId);
  }, [searchParams]);

  useEffect(() => {
    const incidentId = searchParams.get("incident");
    if (!incidentId || loading) return;
    const row = document.getElementById(`incident-row-${incidentId}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchParams, loading, records]);

  const isCategoryTab = isIncidentCategoryTab(tab);
  const isProcessTab = isIncidentProcessTab(tab);

  const recordsCategory = useMemo((): IncidentCategory | undefined => {
    if (isIncidentCategoryTab(tab)) return tab;
    if (tab === "body-map") return "injuries";
    return undefined;
  }, [tab]);

  const loadSummary = useCallback(async () => {
    const data = await apiGet<unknown>("/api/v1/industrial/incidents/summary");
    setSummary(toIncidentSummary(data));
  }, []);

  const loadRecords = useCallback(async (category?: IncidentCategory) => {
    const all: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await apiGetResult<ListResponse>("/api/v1/industrial/incidents", {
        query: {
          ...(category ? { category } : {}),
          page: String(page),
          pageSize: String(FETCH_SIZE),
        },
      });
      const items = Array.isArray(result.data.items) ? result.data.items : [];
      all.push(...items);
      if (items.length < FETCH_SIZE) break;
    }
    setRecords(toIncidentRecords(all));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadRecords(recordsCategory)]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load incidents");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadSummary, recordsCategory]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void reload();
  }, [canView, reload]);

  useEffect(() => {
    setSelectedBodyMapId(null);
  }, [tab]);

  const tiles = useMemo(() => incidentSummaryTiles(summary), [summary]);

  function switchTab(next: IncidentWorkspaceTab) {
    setTab(next);
    setShowForm(false);
    setFormError(null);
    setBodyLocations([]);
    setSelectedBodyMapId(null);
  }

  function onTileClick(tileTab: IncidentWorkspaceTab | undefined) {
    if (tileTab) switchTab(tileTab);
  }

  async function patchIncident(
    incidentId: string,
    body: {
      lifecycle?: IncidentLifecycleData;
      evaluationChecklist?: EvaluationChecklist;
      rootCauseAnalysis?: RootCauseAnalysis;
      bodyLocations?: string[];
    },
  ) {
    await apiSend(`/api/v1/industrial/incidents/${incidentId}`, "PATCH", body);
    await Promise.all([loadSummary(), loadRecords(recordsCategory)]);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !isCategoryTab) return;
    const payload = buildIncidentCreatePayload(form, tab, bodyLocations);
    if (!payload.title) {
      setFormError("Title is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiSend("/api/v1/industrial/incidents", "POST", payload);
      setForm({
        title: "",
        severity: "moderate",
        location: "",
        description: "",
        reportedBy: "",
        dateOccurred: "",
        status: "open",
      });
      setBodyLocations([]);
      setShowForm(false);
      await reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to create incident");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view incidents.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="incidents-title">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-uppercase text-primary fw-semibold small mb-1">Safety</p>
          <h4 className="mb-1" id="incidents-title">
            {moduleName}
          </h4>
          <p className="text-muted mb-0">
            Injury, near miss, medical refusal, property damage, and automotive reporting — plus
            workflow, evaluation, and root cause analysis.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={() => void reload()}
          disabled={loading}
        >
          <i className="bx bx-refresh me-1" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-5 row-cols-xl-9 g-3 mb-4">
        {tiles.map((tile) => (
          <div className="col" key={tile.id}>
            <button
              type="button"
              className={`card h-100 w-100 text-start${tile.tab === tab ? " border border-primary" : ""}`}
              onClick={() => onTileClick(tile.tab)}
              disabled={!tile.tab}
              aria-pressed={tile.tab === tab}
            >
              <div className="card-body p-3">
                <div className="avatar avatar-sm mb-2">
                  <span className={`avatar-initial rounded bg-label-${tile.tone}`}>
                    <i className={`bx ${tile.icon}`} />
                  </span>
                </div>
                <span className="d-block text-muted small">{tile.label}</span>
                <h5 className="mb-0">{tile.value}</h5>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="nav-align-top">
        <ul className="nav nav-tabs flex-wrap" role="tablist">
          {INCIDENT_WORKSPACE_TABS.map((item) => (
            <li className="nav-item" key={item.id}>
              <button
                type="button"
                role="tab"
                className={`nav-link${tab === item.id ? " active" : ""}`}
                aria-selected={tab === item.id}
                onClick={() => switchTab(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="tab-content">
          <div className="tab-pane fade show active" role="tabpanel" aria-label={incidentTabLabel(tab)}>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
              <div className="min-w-0">
                <h5 className="mb-1">{incidentTabLabel(tab)}</h5>
                <p className="text-muted small mb-0">{incidentTabDescription(tab)}</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {isProcessTab ? (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => window.print()}
                  >
                    <i className="bx bx-printer me-1" />
                    Print
                  </button>
                ) : null}
                {isCategoryTab && canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowForm((open) => !open)}
                  >
                    <i className="bx bx-plus me-1" />
                    New Report
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
                <span className="flex-grow-1">{error}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => void reload()}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {isCategoryTab ? (
              <div className="card border shadow-none mb-4">
                <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div className="min-w-0">
                    <h6 className="mb-1">Incident forms</h6>
                    <p className="text-muted small mb-0">
                      Fill PDF forms linked to this module. No PDF forms linked yet — upload a form
                      in Forms → PDF Forms and assign this module.
                    </p>
                  </div>
                  <Link className="btn btn-outline-secondary" href="/modules/forms/">
                    <i className="bx bx-file me-1" />
                    Manage PDF forms
                  </Link>
                </div>
              </div>
            ) : null}

            {showForm && canManage && isCategoryTab ? (
              <div className="card border shadow-none mb-4">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="card-title mb-0">New {incidentTabLabel(tab)} report</h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                </div>
                <div className="card-body">
                  {formError ? (
                    <div className="alert alert-danger" role="alert">
                      {formError}
                    </div>
                  ) : null}
                  <form className="row g-3" onSubmit={(ev) => void onCreate(ev)}>
                    <div className="col-md-8">
                      <label className="form-label" htmlFor="incident-title">
                        Title <span className="text-danger">*</span>
                      </label>
                      <input
                        id="incident-title"
                        className="form-control"
                        required
                        value={form.title}
                        onChange={(ev) => setForm((prev) => ({ ...prev, title: ev.target.value }))}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="incident-date">
                        Date occurred
                      </label>
                      <input
                        id="incident-date"
                        type="date"
                        className="form-control"
                        value={form.dateOccurred}
                        onChange={(ev) =>
                          setForm((prev) => ({ ...prev, dateOccurred: ev.target.value }))
                        }
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="incident-severity">
                        Severity
                      </label>
                      <select
                        id="incident-severity"
                        className="form-select"
                        value={form.severity}
                        onChange={(ev) =>
                          setForm((prev) => ({ ...prev, severity: ev.target.value }))
                        }
                      >
                        <option value="minor">Minor</option>
                        <option value="moderate">Moderate</option>
                        <option value="serious">Serious</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="incident-location">
                        Location
                      </label>
                      <input
                        id="incident-location"
                        className="form-control"
                        value={form.location}
                        onChange={(ev) =>
                          setForm((prev) => ({ ...prev, location: ev.target.value }))
                        }
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="incident-reported-by">
                        Reported by
                      </label>
                      <input
                        id="incident-reported-by"
                        className="form-control"
                        value={form.reportedBy}
                        onChange={(ev) =>
                          setForm((prev) => ({ ...prev, reportedBy: ev.target.value }))
                        }
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="incident-description">
                        Description
                      </label>
                      <textarea
                        id="incident-description"
                        className="form-control"
                        rows={4}
                        value={form.description}
                        onChange={(ev) =>
                          setForm((prev) => ({ ...prev, description: ev.target.value }))
                        }
                      />
                    </div>
                    {tab === "injuries" ? (
                      <div className="col-12">
                        <span className="form-label d-block">Injury location</span>
                        <p className="text-muted small mb-3">
                          Click the body to mark where the injury occurred (front and back).
                        </p>
                        <IncidentBodyMap
                          mode="select"
                          selected={bodyLocations}
                          onToggle={(id) =>
                            setBodyLocations((prev) => toggleBodyLocation(prev, id))
                          }
                        />
                        <p className="text-muted small mt-3 mb-0">
                          {bodyLocations.length > 0 ? (
                            <>
                              <span className="fw-semibold text-body">Selected:</span>{" "}
                              {bodyLocationSummaryLabel(bodyLocations)}
                            </>
                          ) : (
                            "No body location selected."
                          )}
                        </p>
                      </div>
                    ) : null}
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? "Saving…" : "Save report"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {loading ? (
              <p className="text-muted mb-0" role="status">
                Loading {incidentTabLabel(tab).toLowerCase()}…
              </p>
            ) : isProcessTab ? (
              tab === "incident-workflow" ? (
                <IncidentsWorkflowPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, lifecycle) => patchIncident(incidentId, { lifecycle })}
                />
              ) : tab === "evaluation-checklist" ? (
                <IncidentsEvaluationPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, checklist) =>
                    patchIncident(incidentId, { evaluationChecklist: checklist })
                  }
                />
              ) : tab === "body-map" ? (
                <IncidentsBodyMapPanel
                  incidents={records}
                  initialRegionId={searchParams.get("region")}
                  selectedId={selectedBodyMapId}
                  onSelectedIdChange={setSelectedBodyMapId}
                  canManage={canManage}
                  onSaveLocations={(incidentId, locations) =>
                    patchIncident(incidentId, { bodyLocations: locations })
                  }
                />
              ) : (
                <IncidentsRcaPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, rca) => patchIncident(incidentId, { rootCauseAnalysis: rca })}
                />
              )
            ) : tab === "injuries" ? (
              <>
                {records.length === 0 ? (
                  <div className="text-center py-5 card border shadow-none mb-4">
                    <div className="card-body">
                      <div className="avatar avatar-lg mx-auto mb-3">
                        <span className="avatar-initial rounded-circle bg-label-secondary">
                          <i className="bx bx-clipboard" />
                        </span>
                      </div>
                      <p className="text-muted mb-0">No injuries recorded yet.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-muted small mb-2">
                      {records.length} record{records.length === 1 ? "" : "s"}
                    </p>
                    <div className="table-responsive text-nowrap card border shadow-none mb-4">
                      <table className="table table-hover mb-0">
                        <thead>
                          <tr>
                            <th scope="col">Title</th>
                            <th scope="col">Status</th>
                            <th scope="col">Severity</th>
                            <th scope="col">Body</th>
                            <th scope="col">Location</th>
                          </tr>
                        </thead>
                        <tbody className="table-border-bottom-0">
                          {records.map((record) => (
                            <tr
                              key={record.id}
                              id={`incident-row-${record.id}`}
                              className={selectedBodyMapId === record.id ? "table-active" : undefined}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setSelectedBodyMapId((prev) =>
                                  prev === record.id ? null : record.id,
                                )
                              }
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  setSelectedBodyMapId((prev) =>
                                    prev === record.id ? null : record.id,
                                  );
                                }
                              }}
                              aria-pressed={selectedBodyMapId === record.id}
                              title="Select to mark body locations on Tim"
                            >
                              <td>
                                <span className="fw-semibold d-block">{record.title}</span>
                                {record.description ? (
                                  <span className="text-muted small">{record.description}</span>
                                ) : null}
                              </td>
                              <td>
                                <span className={`badge ${statusBadgeClass(record.status)}`}>
                                  {record.status}
                                </span>
                              </td>
                              <td className="text-muted">{record.severity || "—"}</td>
                              <td className="text-muted small">
                                {bodyLocationSummaryLabel(record.bodyLocations) || "—"}
                              </td>
                              <td className="text-muted">{record.location || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <IncidentsBodyMapPanel
                  compact
                  incidents={records}
                  title="Injury body map"
                  mapHref="/modules/incidents/?tab=body-map"
                  selectedId={selectedBodyMapId}
                  onSelectedIdChange={setSelectedBodyMapId}
                  canManage={canManage}
                  onSaveLocations={(incidentId, locations) =>
                    patchIncident(incidentId, { bodyLocations: locations })
                  }
                />
              </>
            ) : records.length === 0 ? (
              <div className="text-center py-5">
                <div className="avatar avatar-lg mx-auto mb-3">
                  <span className="avatar-initial rounded-circle bg-label-secondary">
                    <i className="bx bx-clipboard" />
                  </span>
                </div>
                <p className="text-muted mb-0">
                  No {incidentTabLabel(tab).toLowerCase()} recorded yet.
                </p>
              </div>
            ) : (
              <>
                <p className="text-muted small mb-2">
                  {records.length} record{records.length === 1 ? "" : "s"}
                </p>
                <div className="table-responsive text-nowrap">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Status</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Location</th>
                      </tr>
                    </thead>
                    <tbody className="table-border-bottom-0">
                      {records.map((record) => (
                        <tr
                          key={record.id}
                          id={`incident-row-${record.id}`}
                          className={selectedBodyMapId === record.id ? "table-active" : undefined}
                        >
                          <td>
                            <span className="fw-semibold d-block">{record.title}</span>
                            {record.description ? (
                              <span className="text-muted small">{record.description}</span>
                            ) : null}
                          </td>
                          <td>
                            <span className={`badge ${statusBadgeClass(record.status)}`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="text-muted">{record.severity || "—"}</td>
                          <td className="text-muted">{record.location || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
