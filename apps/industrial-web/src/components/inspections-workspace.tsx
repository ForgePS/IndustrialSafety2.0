"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  canCompleteInspection,
  defaultInspectionTitle,
  FALLBACK_INSPECTION_TEMPLATE,
  itemsFromTemplate,
  noFindingItems,
  parseInspectionRun,
  statusBadgeClass,
  type InspectionAnswer,
  type InspectionPhoto,
  type InspectionRunItem,
  type InspectionTemplate,
} from "@/lib/inspections-module";

type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

type Department = {
  id: string;
  name: string;
  contactPersonnelId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

type PersonnelOption = { id: string; displayName: string };

type InspectionRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  status?: string;
};

const TABS = [
  { id: "list" as const, label: "Inspections" },
  { id: "start" as const, label: "Start" },
  { id: "run" as const, label: "Checklist" },
  { id: "report" as const, label: "Report" },
  { id: "open-items" as const, label: "Open items" },
  { id: "contacts" as const, label: "Dept contacts" },
];

function fileToDataUrl(file: File): Promise<InspectionPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read photo"));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve({
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name || "photo.jpg",
        contentType: file.type || "image/jpeg",
        dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file: File, maxDim = 1280, quality = 0.72): Promise<InspectionPhoto> {
  if (!file.type.startsWith("image/")) return fileToDataUrl(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fileToDataUrl(file);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name.replace(/\.\w+$/, "") + ".jpg",
    contentType: "image/jpeg",
    dataUrl,
  };
}

export function InspectionsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.inspections.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.inspections.manage") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("list");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([FALLBACK_INSPECTION_TEMPLATE]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [openActions, setOpenActions] = useState<Array<Record<string, unknown>>>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [templateId, setTemplateId] = useState(FALLBACK_INSPECTION_TEMPLATE.id);
  const [responsiblePersonnelId, setResponsiblePersonnelId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [items, setItems] = useState<InspectionRunItem[]>([]);
  const [expandedNoId, setExpandedNoId] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);

  const modEntry = bootstrap?.modules.find((m) => m.code === "INSPECTIONS");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  const selectedDept = departments.find((d) => d.id === departmentId);
  const selectedTemplate =
    templates.find((t) => t.id === templateId) ?? FALLBACK_INSPECTION_TEMPLATE;

  const refreshList = useCallback(async () => {
    const data = await apiGet<{ items?: InspectionRow[] }>("/api/v1/industrial/inspections", {
      query: { page: "1", pageSize: "100" },
    });
    setRows((data.items ?? []).filter((row) => {
      const payload = (row.sourcePayload as Record<string, unknown> | undefined) ?? row;
      return payload.isTemplate !== true && row.inspectionType !== "TEMPLATE";
    }));
  }, []);

  const refreshLookups = useCallback(async () => {
    const [deptData, tplData, peopleData, caData] = await Promise.all([
      apiGet<Department[] | { items?: Department[] }>("/api/v1/industrial/departments"),
      apiGet<InspectionTemplate[]>("/api/v1/industrial/inspection-templates"),
      apiGet<{ items?: Array<Record<string, unknown>> }>("/api/v1/industrial/personnel", {
        query: { page: "1", pageSize: "100", sort: "lastName" },
      }),
      apiGet<{ items?: Array<Record<string, unknown>> }>("/api/v1/industrial/corrective-actions", {
        query: { page: "1", pageSize: "100" },
      }),
    ]);
    const depts = Array.isArray(deptData) ? deptData : (deptData.items ?? []);
    setDepartments(depts);
    setTemplates(Array.isArray(tplData) && tplData.length ? tplData : [FALLBACK_INSPECTION_TEMPLATE]);
    setPersonnel(
      (peopleData.items ?? [])
        .map((p) => ({
          id: String(p.id ?? ""),
          displayName: String(p.displayName ?? p.name ?? ""),
        }))
        .filter((p) => p.id && p.displayName),
    );
    setOpenActions(
      (caData.items ?? []).filter(
        (row) =>
          String(row.parentEntityType ?? "").toUpperCase() === "INSPECTION" &&
          String(row.status ?? "").toUpperCase() !== "COMPLETED",
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load bootstrap");
          setBootstrap({ industrialEnabled: false, modules: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!awsReady) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await Promise.all([refreshList(), refreshLookups()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load inspections");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, refreshList, refreshLookups]);

  useEffect(() => {
    if (titleTouched) return;
    setTitle(defaultInspectionTitle(selectedDept?.name || selectedTemplate.name));
  }, [selectedDept?.name, selectedTemplate.name, titleTouched]);

  useEffect(() => {
    if (!departmentId) return;
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return;
    if (dept.contactPersonnelId) setResponsiblePersonnelId(dept.contactPersonnelId);
    if (dept.contactName) setResponsibleName(dept.contactName);
    const preferred = templates.find(
      (t) =>
        t.departmentHint &&
        dept.name &&
        t.departmentHint.toLowerCase().includes(dept.name.toLowerCase()),
    );
    if (preferred) setTemplateId(preferred.id);
  }, [departmentId, departments, templates]);

  async function openInspection(id: string) {
    setBusy(true);
    setError(null);
    try {
      const row = await apiGet<InspectionRow>(`/api/v1/industrial/inspections/${encodeURIComponent(id)}`);
      const run = parseInspectionRun(row as Record<string, unknown>);
      setSelectedId(id);
      setTitle(String(row.title ?? run.templateName ?? ""));
      setDepartmentId(run.departmentId || "");
      setTemplateId(run.templateId || FALLBACK_INSPECTION_TEMPLATE.id);
      setResponsiblePersonnelId(run.responsiblePersonnelId || "");
      setResponsibleName(run.responsibleName || "");
      setItems(run.items.length ? run.items : itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE));
      setTitleTouched(true);
      setTab(String(row.status ?? "").toUpperCase() === "COMPLETED" ? "report" : "run");
      const firstNo = run.items.find((i) => i.answer === "NO" && !(i.notes ?? "").trim());
      setExpandedNoId(firstNo?.id ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to open inspection");
    } finally {
      setBusy(false);
    }
  }

  async function startInspection(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<InspectionRow>("/api/v1/industrial/inspections", "POST", {
        title: title.trim() || defaultInspectionTitle(selectedDept?.name || "Inspection"),
        departmentId: departmentId || null,
        departmentName: selectedDept?.name || "",
        templateId,
        responsiblePersonnelId: responsiblePersonnelId || null,
        responsibleName:
          responsibleName ||
          personnel.find((p) => p.id === responsiblePersonnelId)?.displayName ||
          "",
        appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      await refreshList();
      await openInspection(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start inspection");
    } finally {
      setBusy(false);
    }
  }

  async function persistItems(nextItems: InspectionRunItem[]) {
    if (!selectedId || !canManage) return;
    setItems(nextItems);
    try {
      await apiSend(`/api/v1/industrial/inspections/${encodeURIComponent(selectedId)}`, "PATCH", {
        title,
        departmentId: departmentId || null,
        departmentName: selectedDept?.name || "",
        templateId,
        responsiblePersonnelId: responsiblePersonnelId || null,
        responsibleName,
        items: nextItems,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save checklist");
    }
  }

  function setAnswer(itemId: string, answer: InspectionAnswer) {
    const next = items.map((item) => (item.id === itemId ? { ...item, answer } : item));
    if (answer === "NO") setExpandedNoId(itemId);
    void persistItems(next);
  }

  function setNotes(itemId: string, notes: string) {
    const next = items.map((item) => (item.id === itemId ? { ...item, notes } : item));
    void persistItems(next);
  }

  async function addPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    const photos: InspectionPhoto[] = [];
    for (const file of Array.from(files)) {
      photos.push(await compressImageFile(file));
    }
    const next = items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            answer: item.answer ?? "NO",
            photos: [...(item.photos ?? []), ...photos],
            notes: item.notes || `Photo evidence attached (${photos.map((p) => p.fileName).join(", ")})`,
          }
        : item,
    );
    setExpandedNoId(itemId);
    await persistItems(next);
  }

  async function completeInspection() {
    if (!selectedId || !canManage) return;
    const check = canCompleteInspection(items);
    if (!check.ok) {
      setError(check.reason ?? "Cannot complete");
      const missing = items.find((i) => i.answer === "NO" && !(i.notes ?? "").trim());
      if (missing) setExpandedNoId(missing.id);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const completed = await apiSend<InspectionRow>(
        `/api/v1/industrial/inspections/${encodeURIComponent(selectedId)}/complete`,
        "POST",
        {
          items,
          appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      );
      const run = parseInspectionRun(completed as Record<string, unknown>);
      setItems(run.items);
      await refreshList();
      await refreshLookups();
      setTab("report");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to complete inspection");
    } finally {
      setBusy(false);
    }
  }

  async function completeOpenItem(id: string) {
    if (!canManage) return;
    const notes = window.prompt("Close-out notes");
    if (notes == null) return;
    setBusy(true);
    try {
      await apiSend(`/api/v1/industrial/corrective-actions/${encodeURIComponent(id)}/complete`, "POST", {
        notes,
        completedByName: "Inspector",
      });
      await refreshLookups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to close item");
    } finally {
      setBusy(false);
    }
  }

  async function saveDeptContact(dept: Department, personnelId: string) {
    if (!canManage) return;
    setBusy(true);
    try {
      const person = personnel.find((p) => p.id === personnelId);
      await apiSend(`/api/v1/industrial/departments/${encodeURIComponent(dept.id)}/contact`, "PATCH", {
        contactPersonnelId: personnelId || null,
        contactName: person?.displayName || "",
      });
      await refreshLookups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save department contact");
    } finally {
      setBusy(false);
    }
  }

  const findings = useMemo(() => noFindingItems(items), [items]);

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view inspections.
      </div>
    );
  }

  if (bootstrap && !awsReady) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  return (
    <section aria-labelledby="inspections-title">
      <ModuleWorkspaceHeader
        id="inspections-title"
        title={moduleName}
        description="Run department checklists, capture No findings with notes and photos, and close out open items."
        onRefresh={() => void Promise.all([refreshList(), refreshLookups()])}
        refreshing={busy}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <ModuleWorkspaceTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Inspections sections">
        {tab === "list" ? (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Recent inspections</h5>
              {canManage ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setTab("start")}>
                  Start inspection
                </button>
              ) : null}
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Department</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No inspections yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const run = parseInspectionRun(row as Record<string, unknown>);
                      return (
                        <tr key={row.id}>
                          <td>{row.title || "—"}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                              {String(row.status ?? "—")}
                            </span>
                          </td>
                          <td>{run.departmentName || "—"}</td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => void openInspection(row.id)}
                            >
                              Open
                            </button>
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

        {tab === "start" ? (
          <form className="card" onSubmit={(ev) => void startInspection(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Start inspection</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-dept">
                    Department
                  </label>
                  <select
                    id="insp-dept"
                    className="form-select"
                    value={departmentId}
                    onChange={(ev) => {
                      setDepartmentId(ev.target.value);
                      setTitleTouched(false);
                    }}
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-template">
                    Template
                  </label>
                  <select
                    id="insp-template"
                    className="form-select"
                    value={templateId}
                    onChange={(ev) => setTemplateId(ev.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.source !== "builtin" ? ` (${t.source})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-title">
                    Inspection name
                  </label>
                  <input
                    id="insp-title"
                    className="form-control"
                    value={title}
                    onChange={(ev) => {
                      setTitleTouched(true);
                      setTitle(ev.target.value);
                    }}
                  />
                  <div className="form-text">Defaults to yy-mm-dd Department.</div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-resp">
                    Responsible party
                  </label>
                  <select
                    id="insp-resp"
                    className="form-select"
                    value={responsiblePersonnelId}
                    onChange={(ev) => {
                      setResponsiblePersonnelId(ev.target.value);
                      const person = personnel.find((p) => p.id === ev.target.value);
                      setResponsibleName(person?.displayName || "");
                    }}
                  >
                    <option value="">Select contact</option>
                    {personnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                  <div className="form-text">Defaults to the department contact when set.</div>
                </div>
              </div>
              <button type="submit" className="btn btn-primary mt-3" disabled={!canManage || busy}>
                Start checklist
              </button>
            </div>
          </form>
        ) : null}

        {tab === "run" ? (
          <div>
            {!selectedId ? (
              <p className="text-muted mb-0">Open or start an inspection to run the checklist.</p>
            ) : (
              <>
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                  <div>
                    <h5 className="mb-0">{title}</h5>
                    <small className="text-muted">
                      {selectedDept?.name || "No department"} · {selectedTemplate.name} ·{" "}
                      {responsibleName || "No responsible party"}
                    </small>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void completeInspection()}
                    >
                      Complete inspection
                    </button>
                  ) : null}
                </div>
                <div className="d-flex flex-column gap-3">
                  {items.map((item) => {
                    const showNotes = item.answer === "NO" || expandedNoId === item.id;
                    return (
                      <div className="card" key={item.id}>
                        <div className="card-body">
                          {item.section ? (
                            <small className="text-muted text-uppercase d-block mb-1">{item.section}</small>
                          ) : null}
                          <div className="fw-medium mb-2">{item.label}</div>
                          <div className="btn-group" role="group" aria-label={`Answer ${item.label}`}>
                            {(["YES", "NO", "NA"] as const).map((answer) => (
                              <button
                                key={answer}
                                type="button"
                                className={`btn btn-sm ${
                                  item.answer === answer
                                    ? answer === "NO"
                                      ? "btn-danger"
                                      : answer === "YES"
                                        ? "btn-success"
                                        : "btn-secondary"
                                    : "btn-outline-secondary"
                                }`}
                                disabled={!canManage}
                                onClick={() => setAnswer(item.id, answer)}
                              >
                                {answer === "YES" ? "Yes" : answer === "NO" ? "No" : "N/A"}
                              </button>
                            ))}
                          </div>
                          {showNotes ? (
                            <div className="mt-3 border rounded p-3 bg-label-danger bg-opacity-10">
                              <label className="form-label" htmlFor={`notes-${item.id}`}>
                                Notes (required for No)
                              </label>
                              <textarea
                                id={`notes-${item.id}`}
                                className="form-control mb-2"
                                rows={3}
                                value={item.notes ?? ""}
                                disabled={!canManage}
                                onChange={(ev) => setNotes(item.id, ev.target.value)}
                              />
                              <label className="form-label" htmlFor={`photo-${item.id}`}>
                                Photos
                              </label>
                              <input
                                id={`photo-${item.id}`}
                                type="file"
                                className="form-control"
                                accept="image/*"
                                capture="environment"
                                multiple
                                disabled={!canManage}
                                onChange={(ev) => void addPhotos(item.id, ev.target.files)}
                              />
                              {(item.photos ?? []).length > 0 ? (
                                <div className="d-flex flex-wrap gap-2 mt-2">
                                  {(item.photos ?? []).map((photo) => (
                                    <img
                                      key={photo.id}
                                      src={photo.dataUrl}
                                      alt={photo.fileName}
                                      className="rounded border"
                                      style={{ width: 96, height: 96, objectFit: "cover" }}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === "report" ? (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">No findings report</h5>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => window.print()}>
                Print
              </button>
            </div>
            <div className="card-body">
              {!selectedId ? (
                <p className="text-muted mb-0">Open a completed inspection to view the report.</p>
              ) : findings.length === 0 ? (
                <p className="text-muted mb-0">No “No” answers on this inspection.</p>
              ) : (
                <div className="d-flex flex-column gap-4">
                  {findings.map((item) => (
                    <div key={item.id} className="border-bottom pb-3">
                      <h6 className="mb-1">{item.label}</h6>
                      <p className="mb-2">{item.notes || "—"}</p>
                      {(item.photos ?? []).length > 0 ? (
                        <div className="d-flex flex-wrap gap-2 mb-2">
                          {(item.photos ?? []).map((photo) => (
                            <img
                              key={photo.id}
                              src={photo.dataUrl}
                              alt={photo.fileName}
                              className="rounded border"
                              style={{ maxWidth: 220 }}
                            />
                          ))}
                        </div>
                      ) : null}
                      {item.closeoutUrl ? (
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => void navigator.clipboard.writeText(item.closeoutUrl!)}
                          >
                            Copy close-out link
                          </button>
                          <Link className="btn btn-sm btn-outline-secondary" href={item.closeoutUrl}>
                            Open close-out
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "open-items" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Open corrective actions from inspections</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {openActions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No open inspection findings.
                      </td>
                    </tr>
                  ) : (
                    openActions.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.title ?? "—")}</td>
                        <td>{String(row.ownerName ?? "—")}</td>
                        <td>
                          <span className="badge bg-label-warning">{String(row.status ?? "OPEN")}</span>
                        </td>
                        <td className="text-end">
                          {canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => void completeOpenItem(String(row.id))}
                            >
                              Close out
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

        {tab === "contacts" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Department contacts</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Current contact</th>
                    <th>Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id}>
                      <td>{dept.name}</td>
                      <td>{dept.contactName || "—"}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          defaultValue={dept.contactPersonnelId || ""}
                          disabled={!canManage}
                          onChange={(ev) => void saveDeptContact(dept, ev.target.value)}
                        >
                          <option value="">Select personnel</option>
                          {personnel.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
