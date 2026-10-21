"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { LotoProcedureForm } from "@/components/loto-procedure-form";
import { LotoProcedureDetailSections } from "@/components/loto-procedure-detail-sections";
import { LotoProcedureWorkflowActions } from "@/components/loto-procedure-workflow-actions";
import { ForgePrintButton } from "@/components/forge-print-button";
import {
  canIssueLockout,
  emptyLotoProcedureForm,
  extractLockoutItems,
  extractProcedureDisplay,
  isOpenLockoutStatus,
  lockoutAuthorizedEmployee,
  lotoListHref,
  lotoLockoutHref,
  lotoProcedureAreaName,
  lotoProcedureEquipmentName,
  lotoProcedureFormFromDetail,
  lotoProcedurePayloadFromForm,
  lotoStatusBadgeClass,
  lotoStatusLabel,
  type LotoProcedureFormState,
} from "@/lib/loto";
import {
  ensureLotoProcedurePrintQrPayload,
  lotoProcedurePrintFieldValues,
} from "@/lib/module-print-fields";
import { canGenerateQr, canViewQrLinks } from "@/lib/qr-links-module";
import { personNameDisplay } from "@/lib/person-name-display";
import { openPrintableHtmlPopup } from "@/lib/dvir";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function LotoProcedureInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
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
  const canQrView = canViewQrLinks(permissions);
  const canQrGenerate = canGenerateQr(permissions);

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "LOCKOUT_TAGOUT",
    canView,
  });
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [equipment, setEquipment] = useState<Array<Record<string, unknown>>>([]);
  const [sites, setSites] = useState<Array<Record<string, unknown>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, unknown>>>([]);
  const [personnel, setPersonnel] = useState<Array<Record<string, unknown>>>([]);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<LotoProcedureFormState>(emptyLotoProcedureForm);
  const [authorizedEmployee, setAuthorizedEmployee] = useState("");
  const [affectedEmployees, setAffectedEmployees] = useState("");
  const [lockTagId, setLockTagId] = useState("");
  const [tryStartRequired, setTryStartRequired] = useState(true);
  const [zeroEnergy, setZeroEnergy] = useState(false);
  const [tryStartDone, setTryStartDone] = useState(false);
  const [restorationDone, setRestorationDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("No procedure was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, equip, siteRows, deptRows, people] = await Promise.all([
        apiGet<Record<string, unknown>>(`/api/v1/industrial/loto/${encodeURIComponent(id)}`),
        apiGet<ListResponse>("/api/v1/industrial/equipment", {
          query: { page: "1", pageSize: "500" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 500 })),
        apiGet<ListResponse>("/api/v1/industrial/sites", {
          query: { page: "1", pageSize: "500" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 500 })),
        apiGet<Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> }>(
          "/api/v1/industrial/departments",
        ).catch(() => [] as Array<Record<string, unknown>>),
        apiGet<ListResponse>("/api/v1/industrial/personnel", {
          query: { page: "1", pageSize: "100" },
        }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 100 })),
      ]);
      setDetail(data);
      setEquipment(equip.items ?? []);
      setSites(siteRows.items ?? []);
      setDepartments(Array.isArray(deptRows) ? deptRows : (deptRows.items ?? []));
      setPersonnel(people.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load procedure");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void load();
  }, [awsReady, load]);

  const procedure = (detail?.procedure as Record<string, unknown> | undefined) ?? detail;
  const procedureDisplay = detail ? extractProcedureDisplay(detail) : null;
  const lockouts = (detail?.lockouts as Array<Record<string, unknown>>) ?? [];
  const openLockouts = lockouts.filter((row) => isOpenLockoutStatus(row.status));

  const personName = (row: Record<string, unknown>) =>
    personNameDisplay(
      [str(row.firstName), str(row.lastName)].filter(Boolean).join(" ") ||
        str(row.displayName) ||
        str(row.preferredName),
      "EMPLOYEE",
    );

  async function transition(path: string, body: Record<string, unknown> = {}) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${encodeURIComponent(id)}/${path}`, "POST", body);
      setNotice("Procedure updated.");
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  function onStartEdit() {
    if (!detail || !canEdit) return;
    setEditForm(lotoProcedureFormFromDetail(detail));
    setEditing(true);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!id || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/loto/${encodeURIComponent(id)}`,
        "PATCH",
        lotoProcedurePayloadFromForm(editForm),
      );
      setDetail(updated);
      setEditing(false);
      setNotice("Procedure saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function issueLockout(e: FormEvent) {
    e.preventDefault();
    if (!id || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/loto/${encodeURIComponent(id)}/issue`,
        "POST",
        {
          authorizedEmployee,
          affectedEmployees,
          lockTagId,
          tryStartRequired,
        },
      );
      setAuthorizedEmployee("");
      setAffectedEmployees("");
      setLockTagId("");
      setNotice("Lockout issued. Complete zero-energy verification before work begins.");
      const lockoutId = str(created.id);
      if (lockoutId) {
        window.location.href = lotoLockoutHref(lockoutId);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not issue lockout");
    } finally {
      setBusy(false);
    }
  }

  async function lockoutAction(lockoutId: string, action: "verify" | "close") {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto-records/${encodeURIComponent(lockoutId)}/${action}`, "POST", {
        zeroEnergyConfirmed: zeroEnergy,
        tryStartCompleted: tryStartDone,
        restorationComplete: restorationDone,
      });
      setNotice(action === "verify" ? "Lockout verified." : "Lockout closed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lockout action failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadPrint() {
    if (!id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<{ html: string }>(
        `/api/v1/industrial/loto/${encodeURIComponent(id)}/printable`,
      );
      const html = typeof data?.html === "string" ? data.html : "";
      if (!html.trim()) throw new Error("Printable HTML was empty for this procedure.");
      setPrintHtml(html);
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) {
        setError(blocked);
      } else {
        setNotice("Print dialog opened. Use Print / Save as PDF if it did not appear.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Printable failed");
    } finally {
      setBusy(false);
    }
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName="Lockout/Tagout"
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  const title =
    str(procedure?.procedureNumber) || str(procedure?.title) || str(detail?.title) || "Procedure";

  return (
    <section aria-labelledby="loto-procedure-title">
      <div className="mb-3">
        <Link className="btn btn-sm btn-outline-secondary" href={lotoListHref()}>
          <i className="bx bx-arrow-back me-1" aria-hidden="true" />
          Back to procedures
        </Link>
      </div>

      <ModuleWorkspaceHeader
        id="loto-procedure-title"
        eyebrow="Lockout/Tagout"
        title={loading ? "Loading procedure…" : title}
        description={
          loading
            ? "Opening energy-control procedure."
            : str(procedure?.title) && str(procedure?.procedureNumber)
              ? str(procedure?.title)
              : "Energy-control procedure detail, isolation steps, and lockout actions."
        }
        onRefresh={() => void load()}
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

      {loading ? (
        <p className="text-muted" role="status">
          Loading procedure…
        </p>
      ) : !procedure ? (
        <div className="card">
          <div className="card-body">
            <p className="text-muted mb-3">Procedure not found.</p>
            <Link className="btn btn-outline-primary" href={lotoListHref()}>
              Return to LOTO
            </Link>
          </div>
        </div>
      ) : (
        <>
          {editing ? (
            <LotoProcedureForm
              mode="edit"
              form={editForm}
              setForm={setEditForm}
              equipment={equipment}
              sites={sites}
              departments={departments}
              areaOptions={
                procedure
                  ? [lotoProcedureAreaName(procedure)].filter((name) => name && name !== "—")
                  : []
              }
              busy={busy}
              onSubmit={(e) => void onSaveEdit(e)}
              onCancel={() => setEditing(false)}
            />
          ) : (
          <article className="card mb-4">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <h6 className="card-title mb-1">
                  {str(procedure.procedureNumber || detail?.procedureNumber)} —{" "}
                  {str(procedure.title || detail?.title)}
                </h6>
                <span
                  className={`badge ${lotoStatusBadgeClass(str(procedure.status || detail?.status))}`}
                >
                  {lotoStatusLabel(str(procedure.status || detail?.status))}
                </span>
              </div>
              <LotoProcedureWorkflowActions
                status={str(procedure.status || detail?.status)}
                busy={busy}
                canEdit={canEdit}
                canApprove={canApprove}
                onEdit={() => onStartEdit()}
                onSubmitForReview={() => void transition("submit-review")}
                onActivate={() => void transition("activate")}
                onApprove={() => void transition("approve")}
                onRequestChanges={(notes) =>
                  void transition("request-changes", { reviewReturnNotes: notes })
                }
                extras={
                  <>
                    {canPrint ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void loadPrint()}
                      >
                        Print
                      </button>
                    ) : null}
                    {detail ? (
                      <ForgePrintButton
                        module="LOCKOUT_TAGOUT"
                        recordType="loto_procedure"
                        recordId={id}
                        className="btn btn-sm btn-outline-primary"
                        fieldValues={lotoProcedurePrintFieldValues(
                          detail,
                          lotoProcedureEquipmentName(procedure),
                        )}
                        onPrepare={async () =>
                          ensureLotoProcedurePrintQrPayload(detail, {
                            canView: canQrView,
                            canGenerate: canQrGenerate,
                          })
                        }
                      />
                    ) : null}
                  </>
                }
              />
            </div>
            <div className="card-body">
              {procedureDisplay ? <LotoProcedureDetailSections display={procedureDisplay} /> : null}

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
                <div className="mb-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <h6 className="mb-0">Printable preview</h6>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        const blocked = openPrintableHtmlPopup(printHtml, true);
                        if (blocked) setError(blocked);
                      }}
                    >
                      Print / Save as PDF
                    </button>
                  </div>
                  <iframe
                    title="LOTO printable"
                    srcDoc={printHtml}
                    className="w-100 border rounded"
                    style={{ minHeight: 980, background: "#d8dbe0" }}
                  />
                </div>
              ) : null}
            </div>
          </article>
          )}

          {lockouts.length > 0 ? (
            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Lockouts for this procedure</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Lockout</th>
                      <th>Authorized</th>
                      <th>Affected</th>
                      <th>Lock / tag</th>
                      <th>Status</th>
                      <th>Verify / close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openLockouts.length > 0 ? openLockouts : lockouts).map((row) => {
                      const lockoutId = str(row.id);
                      const href = lockoutId ? lotoLockoutHref(lockoutId) : undefined;
                      const itemCount = (() => {
                        const items = extractLockoutItems(row);
                        return (
                          items.energySources.length +
                          items.isolationPoints.length +
                          items.steps.length
                        );
                      })();
                      return (
                      <tr key={lockoutId}>
                        <td>
                          {href ? (
                            <Link href={href} className="fw-medium text-body">
                              {str(row.title) || str(row.procedureNumber) || "Lockout"}
                            </Link>
                          ) : (
                            <div className="fw-medium">{str(row.title) || str(row.procedureNumber)}</div>
                          )}
                          {itemCount > 0 ? (
                            <small className="text-muted d-block">{itemCount} control items</small>
                          ) : null}
                        </td>
                        <td>{personNameDisplay(lockoutAuthorizedEmployee(row), "—")}</td>
                        <td>{str(row.affectedEmployees) || "—"}</td>
                        <td>{str(row.lockTagId) || "—"}</td>
                        <td>
                          <span className={`badge ${lotoStatusBadgeClass(str(row.status))}`}>
                            {lotoStatusLabel(str(row.status))}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-2 align-items-center">
                            {href ? (
                              <Link href={href} className="btn btn-sm btn-outline-primary">
                                Open
                              </Link>
                            ) : null}
                            {str(row.status).toUpperCase() === "ISSUED" && canEdit ? (
                              <>
                                <div className="form-check mb-0">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`zero-${lockoutId}`}
                                    checked={zeroEnergy}
                                    onChange={(ev) => setZeroEnergy(ev.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`zero-${lockoutId}`}>
                                    Zero energy
                                  </label>
                                </div>
                                <div className="form-check mb-0">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`try-${lockoutId}`}
                                    checked={tryStartDone}
                                    onChange={(ev) => setTryStartDone(ev.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`try-${lockoutId}`}>
                                    Try-start
                                  </label>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-warning"
                                  disabled={busy || !zeroEnergy}
                                  onClick={() => void lockoutAction(lockoutId, "verify")}
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
                                    id={`rest-${lockoutId}`}
                                    checked={restorationDone}
                                    onChange={(ev) => setRestorationDone(ev.target.checked)}
                                  />
                                  <label className="form-check-label" htmlFor={`rest-${lockoutId}`}>
                                    Restored
                                  </label>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  disabled={busy || !restorationDone}
                                  onClick={() => void lockoutAction(lockoutId, "close")}
                                >
                                  Close out
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function LotoProcedureWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted mb-0">Loading procedure…</p>}>
      <LotoProcedureInner />
    </Suspense>
  );
}
