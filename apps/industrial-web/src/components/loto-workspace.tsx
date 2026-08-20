"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  LOTO_ENERGY_TYPES,
  LOTO_PROCEDURE_STATUSES,
  canIssueLockout,
  lotoPhaseBadgeClass,
  lotoStats,
  lotoStatusBadgeClass,
  lotoStatusLabel,
  type LotoTab,
} from "@/lib/loto";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

type StepForm = {
  energySourceName: string;
  energyMagnitude: string;
  isolationLocationText: string;
  lockoutDeviceName: string;
  isolationAction: string;
  verificationMethodName: string;
};

const emptyStep = (): StepForm => ({
  energySourceName: "",
  energyMagnitude: "",
  isolationLocationText: "",
  lockoutDeviceName: "",
  isolationAction: "",
  verificationMethodName: "",
});

const TABS: Array<{ id: LotoTab; label: string }> = [
  { id: "procedures", label: "Procedures" },
  { id: "lockouts", label: "Active lockouts" },
];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function LotoWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has("industrial.loto.view") || permissions.has("industrial.admin");
  const canEdit =
    permissions.has("industrial.loto.edit") ||
    permissions.has("industrial.loto.manage") ||
    permissions.has("industrial.loto.create") ||
    permissions.has("industrial.admin");
  const canApprove =
    permissions.has("industrial.loto.approve") ||
    permissions.has("industrial.loto.manage") ||
    permissions.has("industrial.admin");
  const canPrint =
    permissions.has("industrial.loto.print") ||
    permissions.has("industrial.loto.view") ||
    permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<LotoTab>("procedures");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [lockouts, setLockouts] = useState<Array<Record<string, unknown>>>([]);
  const [equipment, setEquipment] = useState<Array<Record<string, unknown>>>([]);
  const [personnel, setPersonnel] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [scope, setScope] = useState("");
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState<StepForm[]>([emptyStep()]);
  const [restorationLabel, setRestorationLabel] = useState("Guards replaced / personnel clear");
  const [authorizedEmployee, setAuthorizedEmployee] = useState("");
  const [affectedEmployees, setAffectedEmployees] = useState("");
  const [lockTagId, setLockTagId] = useState("");
  const [tryStartRequired, setTryStartRequired] = useState(true);
  const [zeroEnergy, setZeroEnergy] = useState(false);
  const [tryStartDone, setTryStartDone] = useState(false);
  const [restorationDone, setRestorationDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const modEntry = bootstrap?.modules.find((m) => m.code === "LOCKOUT_TAGOUT");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    void apiGet<Bootstrap>("/api/v1/industrial/bootstrap")
      .then(setBootstrap)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Bootstrap failed"));
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loto, equip, people, records] = await Promise.all([
        apiGet<ListResponse>("/api/v1/industrial/loto", {
          query: {
            q: q || undefined,
            status: statusFilter || undefined,
            page: "1",
            pageSize: "50",
          },
        }),
        apiGet<ListResponse>("/api/v1/industrial/equipment", {
          query: { page: "1", pageSize: "100" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 100 })),
        apiGet<ListResponse>("/api/v1/industrial/personnel", {
          query: { page: "1", pageSize: "100" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 100 })),
        apiGet<ListResponse>("/api/v1/industrial/loto-records", {
          query: { page: "1", pageSize: "50" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 50 })),
      ]);
      setItems(loto.items ?? []);
      setEquipment(equip.items ?? []);
      setPersonnel(people.items ?? []);
      setLockouts(records.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load LOTO");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadList();
  }, [awsReady, loadList]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setPrintHtml(null);
    setZeroEnergy(false);
    setTryStartDone(false);
    setRestorationDone(false);
    try {
      const data = await apiGet<Record<string, unknown>>(`/api/v1/industrial/loto/${id}`);
      setDetail(data);
      const nested = Array.isArray(data.lockouts) ? (data.lockouts as Array<Record<string, unknown>>) : [];
      if (nested.length > 0) {
        setLockouts((current) => {
          const others = current.filter((row) => str(row.procedureId) !== id);
          return [...nested, ...others];
        });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load procedure");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setBusy(true);
    try {
      const payload = {
        title: title || `${equipmentName} LOTO`,
        equipmentName,
        equipmentId: equipmentId || null,
        scope,
        status: "DRAFT",
        steps: steps.map((s, i) => ({
          sortOrder: i,
          stepNumber: i + 1,
          ...s,
        })),
        restorationChecks: restorationLabel
          ? [{ sortOrder: 0, checkKey: "clearance", label: restorationLabel, completed: false }]
          : [],
      };
      const created = await apiSend<Record<string, unknown>>("/api/v1/industrial/loto", "POST", payload);
      const procedure = (created.procedure as Record<string, unknown> | undefined) ?? created;
      setTitle("");
      setEquipmentName("");
      setEquipmentId("");
      setScope("");
      setSteps([emptyStep()]);
      setShowCreate(false);
      setNotice("Draft procedure created.");
      await loadList();
      if (str(procedure.id)) await openDetail(str(procedure.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(path: string, body: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${selectedId}/${path}`, "POST", body);
      await openDetail(selectedId);
      await loadList();
      setNotice("Procedure updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function issueLockout(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${selectedId}/issue`, "POST", {
        authorizedEmployee,
        affectedEmployees,
        lockTagId,
        tryStartRequired,
      });
      setAuthorizedEmployee("");
      setAffectedEmployees("");
      setLockTagId("");
      setNotice("Lockout issued. Complete zero-energy verification before work begins.");
      await openDetail(selectedId);
      await loadList();
      setTab("lockouts");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not issue lockout");
    } finally {
      setBusy(false);
    }
  }

  async function lockoutAction(id: string, action: "verify" | "close") {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto-records/${id}/${action}`, "POST", {
        zeroEnergyConfirmed: action === "verify" ? zeroEnergy : undefined,
        tryStartCompleted: action === "verify" ? tryStartDone : undefined,
        restorationComplete: action === "close" ? restorationDone : undefined,
      });
      setNotice(action === "verify" ? "Zero-energy verification recorded." : "Lockout closed out.");
      await loadList();
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lockout update failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadPrint() {
    if (!selectedId || !canPrint) return;
    try {
      const data = await apiGet<{ html: string }>(`/api/v1/industrial/loto/${selectedId}/printable`);
      setPrintHtml(data.html);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Printable failed");
    }
  }

  const stats = useMemo(() => lotoStats(items, lockouts), [items, lockouts]);
  const procedure = (detail?.procedure as Record<string, unknown> | undefined) ?? detail;
  const detailSteps = (detail?.steps as Array<Record<string, unknown>>) ?? [];
  const energySources = (detail?.energySources as Array<Record<string, unknown>>) ?? [];
  const isolationPoints = (detail?.isolationPoints as Array<Record<string, unknown>>) ?? [];
  const openLockouts = lockouts.filter((row) => {
    const status = str(row.status).toUpperCase();
    return status === "ISSUED" || status === "VERIFIED" || status === "OPEN";
  });
  const personName = (row: Record<string, unknown>) =>
    [str(row.firstName), str(row.lastName)].filter(Boolean).join(" ") ||
    str(row.displayName) ||
    str(row.preferredName) ||
    "Employee";

  if (!awsReady && bootstrap) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  return (
    <section aria-labelledby="loto-title">
      <ModuleWorkspaceHeader
        id="loto-title"
        eyebrow="High-risk work"
        title={moduleName}
        description="Write energy-control procedures, isolate and verify zero energy, then issue and close lockouts."
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        {[
          { label: "Procedures", value: stats.procedures, icon: "bx-file", tone: "primary" },
          { label: "Drafts", value: stats.drafts, icon: "bx-edit", tone: "secondary" },
          { label: "In review", value: stats.reviews, icon: "bx-time-five", tone: "warning" },
          { label: "Active procedures", value: stats.active, icon: "bx-check-shield", tone: "success" },
          { label: "Open lockouts", value: stats.openLockouts, icon: "bx-lock-alt", tone: "danger" },
        ].map((card) => (
          <div className="col-6 col-md" key={card.label}>
            <div className="card h-100">
              <div className="card-body">
                <div className="d-flex align-items-center gap-3">
                  <div className="avatar">
                    <span className={`avatar-initial rounded bg-label-${card.tone}`}>
                      <i className={`bx ${card.icon}`} />
                    </span>
                  </div>
                  <div>
                    <small className="text-muted">{card.label}</small>
                    <h4 className="mb-0">{card.value}</h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ModuleWorkspaceTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="LOTO sections"
      />

      {tab === "procedures" ? (
        <>
          <div className="d-flex flex-wrap justify-content-end gap-2 mb-3">
            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreate((open) => !open)}
              >
                <i className="bx bx-plus me-1" />
                {showCreate ? "Close builder" : "New procedure"}
              </button>
            ) : null}
          </div>

          {canEdit && showCreate ? (
            <form className="card mb-4" onSubmit={(e) => void onCreate(e)}>
              <div className="card-header">
                <h6 className="card-title mb-0">Create energy-control procedure</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="loto-title-field">
                      Title
                    </label>
                    <input
                      id="loto-title-field"
                      className="form-control"
                      value={title}
                      onChange={(ev) => setTitle(ev.target.value)}
                      placeholder="Mill #3 conveyor LOTO"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="loto-equipment-name">
                      Equipment name
                    </label>
                    <input
                      id="loto-equipment-name"
                      className="form-control"
                      required
                      value={equipmentName}
                      onChange={(ev) => setEquipmentName(ev.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="loto-equipment-link">
                      Link equipment
                    </label>
                    <select
                      id="loto-equipment-link"
                      className="form-select"
                      value={equipmentId}
                      onChange={(ev) => {
                        const id = ev.target.value;
                        setEquipmentId(id);
                        const match = equipment.find((x) => str(x.id) === id);
                        if (match) setEquipmentName(str(match.equipmentName || match.name || match.title));
                      }}
                    >
                      <option value="">Optional catalog asset</option>
                      {equipment.map((eq) => (
                        <option key={str(eq.id)} value={str(eq.id)}>
                          {str(eq.equipmentName || eq.name || eq.title) || str(eq.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label" htmlFor="loto-scope">
                      Scope of work
                    </label>
                    <textarea
                      id="loto-scope"
                      className="form-control"
                      value={scope}
                      onChange={(ev) => setScope(ev.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <h6 className="mt-4 mb-3">Isolation points</h6>
                {steps.map((step, idx) => (
                  <div className="card shadow-none bg-lighter mb-3" key={idx}>
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <span className="fw-medium">Point {idx + 1}</span>
                        {steps.length > 1 ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setSteps((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-energy-${idx}`}>
                            Energy source
                          </label>
                          <input
                            id={`loto-energy-${idx}`}
                            className="form-control"
                            list="loto-energy-types"
                            required
                            value={step.energySourceName}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, energySourceName: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-magnitude-${idx}`}>
                            Magnitude
                          </label>
                          <input
                            id={`loto-magnitude-${idx}`}
                            className="form-control"
                            placeholder="480V / 120 psi"
                            value={step.energyMagnitude}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, energyMagnitude: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-isolation-${idx}`}>
                            Isolation location
                          </label>
                          <input
                            id={`loto-isolation-${idx}`}
                            className="form-control"
                            value={step.isolationLocationText}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, isolationLocationText: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-device-${idx}`}>
                            Lockout device / tag
                          </label>
                          <input
                            id={`loto-device-${idx}`}
                            className="form-control"
                            value={step.lockoutDeviceName}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, lockoutDeviceName: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-method-${idx}`}>
                            Isolation method
                          </label>
                          <input
                            id={`loto-method-${idx}`}
                            className="form-control"
                            placeholder="Open disconnect, close valve"
                            value={step.isolationAction}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, isolationAction: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor={`loto-verify-${idx}`}>
                            Zero-energy verification
                          </label>
                          <input
                            id={`loto-verify-${idx}`}
                            className="form-control"
                            placeholder="Try-start, meter, gauge"
                            value={step.verificationMethodName}
                            onChange={(ev) =>
                              setSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx ? { ...s, verificationMethodName: ev.target.value } : s,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <datalist id="loto-energy-types">
                  {LOTO_ENERGY_TYPES.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm mb-3"
                  onClick={() => setSteps((prev) => [...prev, emptyStep()])}
                >
                  Add isolation point
                </button>
                <div className="mb-3">
                  <label className="form-label" htmlFor="loto-restoration">
                    Restoration / close-out check
                  </label>
                  <input
                    id="loto-restoration"
                    className="form-control"
                    value={restorationLabel}
                    onChange={(ev) => setRestorationLabel(ev.target.value)}
                  />
                </div>
              </div>
              <div className="card-footer d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Create draft
                </button>
              </div>
            </form>
          ) : null}

          <FilterPanel
            searchId="loto-search"
            searchValue={q}
            onSearchChange={setQ}
            searchPlaceholder="Procedure # or title"
            statusId="loto-status"
            statusValue={statusFilter}
            onStatusChange={setStatusFilter}
            statusOptions={[
              { value: "", label: "All statuses" },
              ...LOTO_PROCEDURE_STATUSES.map((status) => ({
                value: status,
                label: lotoStatusLabel(status),
              })),
            ]}
            chips={[
              ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
              ...(statusFilter
                ? [
                    {
                      id: "status",
                      label: lotoStatusLabel(statusFilter),
                      onRemove: () => setStatusFilter(""),
                    },
                  ]
                : []),
            ]}
            onClearAll={() => {
              setQ("");
              setStatusFilter("");
            }}
            onSubmit={() => void loadList()}
          />

          <div className="card mb-4">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Procedure</th>
                    <th>Equipment</th>
                    <th>Status</th>
                    <th>Rev</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="text-muted">
                        Loading procedures…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted">
                        No LOTO procedures yet.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={str(item.id)}
                        className={selectedId === str(item.id) ? "table-active" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => void openDetail(str(item.id))}
                      >
                        <td>
                          <div className="fw-medium">
                            {str(item.procedureNumber) || str(item.title) || "Procedure"}
                          </div>
                          <small className="text-muted">{str(item.title)}</small>
                        </td>
                        <td>{str(item.equipmentName) || "—"}</td>
                        <td>
                          <span className={`badge ${lotoStatusBadgeClass(str(item.status))}`}>
                            {lotoStatusLabel(str(item.status))}
                          </span>
                        </td>
                        <td>{str(item.revision) || "1"}</td>
                        <td className="text-nowrap">
                          {item.updatedAt ? new Date(String(item.updatedAt)).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {procedure && selectedId ? (
            <article className="card mb-4">
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <h6 className="card-title mb-1">
                    {str(procedure.procedureNumber || detail?.procedureNumber)} — {str(procedure.title || detail?.title)}
                  </h6>
                  <span className={`badge ${lotoStatusBadgeClass(str(procedure.status || detail?.status))}`}>
                    {lotoStatusLabel(str(procedure.status || detail?.status))}
                  </span>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busy}
                        onClick={() => void transition("submit-review")}
                      >
                        Submit review
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={busy}
                        onClick={() => void transition("submit-approval")}
                      >
                        Submit approval
                      </button>
                    </>
                  ) : null}
                  {canApprove ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => void transition("approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        disabled={busy}
                        onClick={() => void transition("activate")}
                      >
                        Activate
                      </button>
                    </>
                  ) : null}
                  {canPrint ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void loadPrint()}>
                      Printable
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="card-body">
                <p className="text-muted">
                  Equipment {str(procedure.equipmentName || detail?.equipmentName) || "—"} · Rev{" "}
                  {str(procedure.revision || detail?.revision) || "1"}
                </p>
                {str(detail?.scope || procedure.scope) ? (
                  <p>{str(detail?.scope || procedure.scope)}</p>
                ) : null}

                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <h6>Energy sources</h6>
                    {energySources.length === 0 ? (
                      <p className="text-muted small mb-0">None stored on this procedure yet.</p>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {energySources.map((row) => (
                          <li key={str(row.id)} className="mb-1">
                            <span className="badge bg-label-danger me-2">{str(row.energyType)}</span>
                            {str(row.magnitude)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="col-md-6">
                    <h6>Isolation points</h6>
                    {isolationPoints.length === 0 ? (
                      <p className="text-muted small mb-0">None stored on this procedure yet.</p>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {isolationPoints.map((row) => (
                          <li key={str(row.id)} className="mb-1">
                            <strong>{str(row.label)}</strong>
                            {str(row.locationDescription) ? ` · ${str(row.locationDescription)}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <h6>Control steps</h6>
                <div className="timeline mb-4">
                  {detailSteps.length === 0 ? (
                    <p className="text-muted small">No isolation or verification steps saved.</p>
                  ) : (
                    detailSteps.map((step) => (
                      <div className="d-flex gap-3 mb-3" key={str(step.id)}>
                        <span className={`badge ${lotoPhaseBadgeClass(str(step.stepPhase))} align-self-start`}>
                          {str(step.stepPhase) || "STEP"}
                        </span>
                        <div>
                          <div className="fw-medium">
                            {str(step.stepNumber)}. {str(step.instruction)}
                          </div>
                          {step.isVerification ? (
                            <small className="text-warning">Zero-energy verification required</small>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {canEdit && canIssueLockout(str(procedure.status || detail?.status)) ? (
                  <form className="border rounded p-3 mb-3" onSubmit={(e) => void issueLockout(e)}>
                    <h6 className="mb-3">Issue lockout</h6>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-authorized">
                          Authorized employee
                        </label>
                        <input
                          id="loto-authorized"
                          className="form-control"
                          list="loto-personnel"
                          required
                          value={authorizedEmployee}
                          onChange={(ev) => setAuthorizedEmployee(ev.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-affected">
                          Affected employees
                        </label>
                        <input
                          id="loto-affected"
                          className="form-control"
                          value={affectedEmployees}
                          onChange={(ev) => setAffectedEmployees(ev.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-lock-tag">
                          Lock / tag ID
                        </label>
                        <input
                          id="loto-lock-tag"
                          className="form-control"
                          value={lockTagId}
                          onChange={(ev) => setLockTagId(ev.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <div className="form-check">
                          <input
                            id="loto-try-start"
                            className="form-check-input"
                            type="checkbox"
                            checked={tryStartRequired}
                            onChange={(ev) => setTryStartRequired(ev.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="loto-try-start">
                            Try-start / zero-energy test required before work
                          </label>
                        </div>
                      </div>
                    </div>
                    <datalist id="loto-personnel">
                      {personnel.map((person) => (
                        <option key={str(person.id)} value={personName(person)} />
                      ))}
                    </datalist>
                    <button type="submit" className="btn btn-danger mt-3" disabled={busy}>
                      Issue lockout
                    </button>
                  </form>
                ) : null}

                {printHtml ? (
                  <iframe title="LOTO printable" srcDoc={printHtml} className="w-100 border rounded" style={{ minHeight: 360 }} />
                ) : null}
              </div>
            </article>
          ) : null}
        </>
      ) : (
        <div className="card">
          <div className="card-header">
            <h6 className="card-title mb-0">Issued lockouts</h6>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Lockout</th>
                  <th>Authorized</th>
                  <th>Lock / tag</th>
                  <th>Status</th>
                  <th>Verify / close</th>
                </tr>
              </thead>
              <tbody>
                {openLockouts.length === 0 && lockouts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      No lockouts issued yet. Activate a procedure, then issue a lockout.
                    </td>
                  </tr>
                ) : (
                  (openLockouts.length > 0 ? openLockouts : lockouts).map((row) => (
                    <tr key={str(row.id)}>
                      <td>
                        <div className="fw-medium">{str(row.title) || str(row.procedureNumber)}</div>
                        <small className="text-muted">{str(row.equipmentName)}</small>
                      </td>
                      <td>{str(row.authorizedEmployee) || "—"}</td>
                      <td>{str(row.lockTagId) || "—"}</td>
                      <td>
                        <span className={`badge ${lotoStatusBadgeClass(str(row.status))}`}>
                          {lotoStatusLabel(str(row.status))}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-2 align-items-center">
                          {str(row.status).toUpperCase() === "ISSUED" && canEdit ? (
                            <>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`zero-${str(row.id)}`}
                                  checked={zeroEnergy}
                                  onChange={(ev) => setZeroEnergy(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`zero-${str(row.id)}`}>
                                  Zero energy
                                </label>
                              </div>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`try-${str(row.id)}`}
                                  checked={tryStartDone}
                                  onChange={(ev) => setTryStartDone(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`try-${str(row.id)}`}>
                                  Try-start
                                </label>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-warning"
                                disabled={busy || !zeroEnergy}
                                onClick={() => void lockoutAction(str(row.id), "verify")}
                              >
                                Verify
                              </button>
                            </>
                          ) : null}
                          {(str(row.status).toUpperCase() === "ISSUED" ||
                            str(row.status).toUpperCase() === "VERIFIED") &&
                          canEdit ? (
                            <>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`rest-${str(row.id)}`}
                                  checked={restorationDone}
                                  onChange={(ev) => setRestorationDone(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`rest-${str(row.id)}`}>
                                  Restored
                                </label>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={busy || !restorationDone}
                                onClick={() => void lockoutAction(str(row.id), "close")}
                              >
                                Close out
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
