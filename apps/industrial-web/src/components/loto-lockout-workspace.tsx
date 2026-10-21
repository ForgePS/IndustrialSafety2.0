"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  extractLockoutItems,
  lockoutAuthorizedEmployee,
  lockoutEquipmentName,
  lotoEnergyLetterStyle,
  lotoListHref,
  lotoPhaseBadgeClass,
  lotoProcedureHref,
  lotoStatusBadgeClass,
  lotoStatusLabel,
} from "@/lib/loto";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function LotoLockoutInner() {
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

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "LOCKOUT_TAGOUT",
    canView,
  });
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zeroEnergy, setZeroEnergy] = useState(false);
  const [tryStartDone, setTryStartDone] = useState(false);
  const [restorationDone, setRestorationDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setError("No lockout was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Record<string, unknown>>(
        `/api/v1/industrial/loto-records/${encodeURIComponent(id)}`,
      ).catch(async () => {
        // Fallback if detail route is not yet deployed: scan the list page.
        const list = await apiGet<ListResponse>("/api/v1/industrial/loto-records", {
          query: { page: "1", pageSize: "500" },
        });
        const match = (list.items ?? []).find((row) => str(row.id) === id);
        if (!match) throw new ApiError("Lockout record not found", 404, "NOT_FOUND");
        return match;
      });
      setDetail(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load lockout");
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

  async function lockoutAction(action: "verify" | "close") {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto-records/${id}/${action}`, "POST", {
        zeroEnergyConfirmed: action === "verify" ? zeroEnergy : undefined,
        tryStartCompleted: action === "verify" ? tryStartDone : undefined,
        restorationComplete: action === "close" ? restorationDone : undefined,
      });
      setNotice(action === "verify" ? "Zero-energy verification recorded." : "Lockout closed out.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lockout update failed");
    } finally {
      setBusy(false);
    }
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName="Lockout / Tagout"
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  const items = extractLockoutItems(detail);
  const details = (detail?.details as Record<string, unknown> | undefined) ?? {};
  const procedureId = str(detail?.procedureId);
  const status = str(detail?.status);

  return (
    <section aria-labelledby="loto-lockout-title">
      <ModuleWorkspaceHeader
        id="loto-lockout-title"
        eyebrow="Active lockout"
        title={str(detail?.title) || "Lockout"}
        description="Energy sources, isolation points, and control steps for this lockout."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="mb-3">
        <Link href={lotoListHref()} className="btn btn-sm btn-outline-secondary">
          Back to LOTO list
        </Link>
      </div>

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

      {loading && !detail ? (
        <p className="text-muted">Loading lockout…</p>
      ) : detail ? (
        <article className="card mb-4">
          <div className="card-header d-flex flex-wrap justify-content-between gap-2 align-items-center">
            <div>
              <h5 className="mb-1">{str(detail.title)}</h5>
              <span className={`badge ${lotoStatusBadgeClass(status)}`}>{lotoStatusLabel(status)}</span>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {procedureId ? (
                <Link href={lotoProcedureHref(procedureId)} className="btn btn-sm btn-outline-primary">
                  Open procedure
                </Link>
              ) : null}
              {status.toUpperCase() === "ISSUED" && canEdit ? (
                <>
                  <div className="form-check mb-0 align-self-center">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="lockout-zero"
                      checked={zeroEnergy}
                      onChange={(ev) => setZeroEnergy(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="lockout-zero">
                      Zero energy
                    </label>
                  </div>
                  <div className="form-check mb-0 align-self-center">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="lockout-try"
                      checked={tryStartDone}
                      onChange={(ev) => setTryStartDone(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="lockout-try">
                      Try-start
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-warning"
                    disabled={busy || !zeroEnergy}
                    onClick={() => void lockoutAction("verify")}
                  >
                    Verify
                  </button>
                </>
              ) : null}
              {(status.toUpperCase() === "ISSUED" || status.toUpperCase() === "VERIFIED") &&
              canEdit ? (
                <>
                  <div className="form-check mb-0 align-self-center">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="lockout-rest"
                      checked={restorationDone}
                      onChange={(ev) => setRestorationDone(ev.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="lockout-rest">
                      Restored
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy || !restorationDone}
                    onClick={() => void lockoutAction("close")}
                  >
                    Close out
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="card-body">
            <p className="text-muted mb-3">
              Equipment {lockoutEquipmentName(detail) || "—"} · Authorized{" "}
              {lockoutAuthorizedEmployee(detail) || "—"} · Lock / tag {str(detail.lockTagId) || "—"}
              {str(detail.affectedEmployees) ? ` · Affected ${str(detail.affectedEmployees)}` : ""}
              {str(detail.dueDate)
                ? ` · Due ${(() => {
                    const parsed = new Date(str(detail.dueDate));
                    return Number.isNaN(parsed.getTime())
                      ? str(detail.dueDate)
                      : parsed.toLocaleDateString();
                  })()}`
                : ""}
            </p>
            {str(details.primaryHazards) ? (
              <p>
                <strong>Hazards:</strong> {str(details.primaryHazards)}
              </p>
            ) : null}
            {str(details.requiredPpe) ? (
              <p>
                <strong>PPE:</strong> {str(details.requiredPpe)}
              </p>
            ) : null}

            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <h6>Energy sources</h6>
                {items.energySources.length === 0 ? (
                  <p className="text-muted small mb-0">None stored on this lockout yet.</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {items.energySources.map((row) => {
                      const energy = lotoEnergyLetterStyle(
                        row.magnitude || row.description,
                        row.energyType,
                      );
                      return (
                      <li key={row.id} className="mb-2">
                        <span
                          className={`badge me-2 ${energy ? "" : "bg-label-danger"}`.trim()}
                          style={
                            energy
                              ? { backgroundColor: energy.bg, color: energy.fg }
                              : undefined
                          }
                        >
                          {energy ? `🔒${energy.letter} ` : null}
                          {row.energyType}
                        </span>
                        {row.magnitude}
                        {row.description ? (
                          <div className="small text-muted mt-1">{row.description}</div>
                        ) : null}
                      </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="col-md-6">
                <h6>Isolation points</h6>
                {items.isolationPoints.length === 0 ? (
                  <p className="text-muted small mb-0">None stored on this lockout yet.</p>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {items.isolationPoints.map((row) => (
                      <li key={row.id} className="mb-2">
                        <strong>{row.label}</strong>
                        {row.locationDescription ? ` · ${row.locationDescription}` : ""}
                        {row.isolationMethod ? (
                          <div className="small text-muted">Method: {row.isolationMethod}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <h6>Control steps</h6>
            <div className="timeline mb-2">
              {items.steps.length === 0 ? (
                <p className="text-muted small">No isolation or verification steps saved.</p>
              ) : (
                items.steps.map((step) => {
                  const energy = lotoEnergyLetterStyle(
                    step.descriptionCode,
                    step.energySourceName,
                  );
                  return (
                  <div className="d-flex gap-3 mb-3" key={step.id}>
                    <span
                      className={`badge align-self-start rounded-1 px-2 py-2 text-start ${energy ? "" : lotoPhaseBadgeClass(step.stepPhase)}`.trim()}
                      style={
                        energy
                          ? { backgroundColor: energy.bg, color: energy.fg, minWidth: "3.25rem" }
                          : { minWidth: "3.25rem" }
                      }
                      title={energy ? `🔒${energy.letter} — ${energy.label}` : undefined}
                    >
                      {energy ? (
                        <>
                          <span className="d-block fw-bold">#{step.stepNumber}</span>
                          <span className="d-block small">🔒{energy.letter}</span>
                        </>
                      ) : (
                        step.stepPhase || "STEP"
                      )}
                    </span>
                    <div>
                      <div className="fw-medium">
                        {step.stepNumber}. {step.instruction}
                      </div>
                      {step.isVerification ? (
                        <small className="text-warning">Zero-energy verification required</small>
                      ) : null}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}

export function LotoLockoutWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted p-3">Loading lockout…</p>}>
      <LotoLockoutInner />
    </Suspense>
  );
}
