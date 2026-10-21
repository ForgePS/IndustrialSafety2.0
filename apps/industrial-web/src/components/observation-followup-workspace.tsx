"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ObservationFollowUpFields } from "@/components/observation-followup-fields";
import {
  emptyObservationFollowUp,
  followUpMissing,
  followUpPayload,
  formatObservedAt,
  mapObservationFollowUp,
  observationRiskOption,
  observationTypeOption,
  todayDateInput,
  type ObservationFollowUp,
} from "@/lib/observations-module";

type FollowUpView = {
  id: string;
  tenantName: string;
  title: string;
  status: string;
  observationType: string;
  category: string;
  description: string;
  riskLevel: string;
  observedAt: string;
  siteName: string;
  departmentName: string;
  area: string;
  peopleObserved: Array<{ key: string; name: string; atFault: boolean }>;
  canMarkFault?: boolean;
  immediateActions: string;
  reportedBy: string;
  assignedToName: string;
  photos: Array<{ id?: string; fileName?: string; dataUrl?: string }>;
  followUp: unknown;
  closedAt: string;
};

function apiPath(token: string) {
  return `/api/v1/public/observations/follow-up/${encodeURIComponent(token)}`;
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="col-sm-6">
      <div className="small text-muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function FollowUpForm({ token }: { token: string }) {
  const [view, setView] = useState<FollowUpView | null>(null);
  const [followUp, setFollowUp] = useState<ObservationFollowUp>(() => emptyObservationFollowUp());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "complete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fault, setFault] = useState<Record<string, boolean>>({});

  function applyView(data: FollowUpView) {
    setView(data);
    setFault(Object.fromEntries((data.peopleObserved ?? []).map((p) => [p.key, p.atFault])));
    const mapped = mapObservationFollowUp(data.followUp);
    setFollowUp({
      ...mapped,
      completedByName: mapped.completedByName || data.assignedToName || "",
      completedDate: mapped.completedDate || todayDateInput(),
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<FollowUpView>(apiPath(token));
        if (!cancelled) applyView(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "This follow-up link is invalid or has expired.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(action: "save" | "complete") {
    if (action === "complete") {
      const missing = followUpMissing(followUp);
      if (missing) {
        setError(missing);
        return;
      }
    }
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const data = await apiSend<FollowUpView>(apiPath(token), "POST", {
        action,
        followUp: followUpPayload(followUp),
        ...(view?.canMarkFault
          ? { peopleFault: Object.entries(fault).map(([key, atFault]) => ({ key, atFault })) }
          : {}),
      });
      applyView(data);
      if (action === "save") setNotice("Progress saved. You can come back to this link to finish.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit the follow-up");
    } finally {
      setBusy(null);
    }
  }

  const closed = view ? view.status === "CLOSED" || view.status === "ARCHIVED" : false;
  const savedFollowUp = view ? mapObservationFollowUp(view.followUp) : null;
  const where = view ? [view.siteName, view.departmentName, view.area].filter(Boolean).join(" · ") : "";
  const people = view ? view.peopleObserved.map((p) => p.name).filter(Boolean).join(", ") : "";
  const showFault = Boolean(view?.canMarkFault) && (view?.peopleObserved.length ?? 0) > 0;

  return (
    <div className="container-xxl">
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner" style={{ maxWidth: 760 }}>
          <div className="card">
            <div className="card-body">
              <h1 className="h4 mb-1">Observation follow-up</h1>
              <p className="text-muted mb-4">
                {view?.tenantName ? `${view.tenantName} · ` : ""}
                Record what was done about this observation, sign, and close it out.
              </p>

              {loading ? (
                <p className="text-muted" role="status">
                  Loading…
                </p>
              ) : null}

              {view ? (
                <div className="border rounded p-3 mb-4 bg-lighter">
                  <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
                    <span className="fw-medium">{view.title}</span>
                    {observationTypeOption(view.observationType) ? (
                      <span className={`badge bg-label-${observationTypeOption(view.observationType)!.tone}`}>
                        {observationTypeOption(view.observationType)!.label}
                      </span>
                    ) : null}
                    {observationRiskOption(view.riskLevel) ? (
                      <span className={`badge bg-label-${observationRiskOption(view.riskLevel)!.tone}`}>
                        {observationRiskOption(view.riskLevel)!.label} risk
                      </span>
                    ) : null}
                  </div>
                  {view.description ? <p className="mb-3" style={{ whiteSpace: "pre-wrap" }}>{view.description}</p> : null}
                  <div className="row g-2 small">
                    <Detail label="Category" value={view.category} />
                    <Detail label="Observed" value={view.observedAt ? formatObservedAt(view.observedAt) : ""} />
                    <Detail label="Location" value={where} />
                    <Detail label="People observed" value={people} />
                    <Detail label="Immediate action taken" value={view.immediateActions} />
                    <Detail label="Reported by" value={view.reportedBy} />
                  </div>
                  {view.photos.some((p) => p.dataUrl) ? (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {view.photos.map((p, i) =>
                        p.dataUrl ? (
                          <a key={p.id || i} href={p.dataUrl} target="_blank" rel="noreferrer">
                            <img
                              src={p.dataUrl}
                              alt={p.fileName || "Observation photo"}
                              className="rounded border"
                              style={{ width: 96, height: 96, objectFit: "cover" }}
                            />
                          </a>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

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

              {view && closed ? (
                <div className="alert alert-success mb-0" role="status">
                  This observation is closed
                  {savedFollowUp?.completedByName ? ` by ${savedFollowUp.completedByName}` : ""}
                  {savedFollowUp?.completedAt ? ` on ${formatObservedAt(savedFollowUp.completedAt)}` : ""}. Thank you.
                  {savedFollowUp?.correctiveAction ? (
                    <div className="mt-2 small">
                      <strong>Corrective action:</strong> {savedFollowUp.correctiveAction}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {view && !closed ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit("complete");
                  }}
                  noValidate
                >
                  {showFault ? (
                    <div className="mb-4">
                      <span className="form-label d-block">Who was at fault?</span>
                      <p className="text-muted small mb-2">
                        Mark a person only when their own actions caused this. It lowers their safety score.
                      </p>
                      {view!.peopleObserved.map((p, idx) => (
                        <div key={p.key} className="form-check form-switch">
                          <input
                            id={`public-fault-${idx}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={Boolean(fault[p.key])}
                            disabled={busy !== null}
                            onChange={(e) => setFault((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                          />
                          <label className="form-check-label" htmlFor={`public-fault-${idx}`}>
                            {p.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <ObservationFollowUpFields
                    idPrefix="public-fu"
                    value={followUp}
                    onChange={setFollowUp}
                    disabled={busy !== null}
                    onError={setError}
                  />
                  <div className="d-flex flex-wrap gap-2 mt-4">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      disabled={busy !== null}
                      onClick={() => void submit("save")}
                    >
                      {busy === "save" ? "Saving…" : "Save progress"}
                    </button>
                    <button type="submit" className="btn btn-success" disabled={busy !== null}>
                      {busy === "complete" ? "Closing…" : "Complete & close out"}
                    </button>
                  </div>
                  {savedFollowUp?.savedAt ? (
                    <p className="text-muted small mt-2 mb-0">
                      Last saved {formatObservedAt(savedFollowUp.savedAt)}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowUpTokenResolver() {
  const token = useSearchParams().get("token")?.trim() || "";
  if (!token) {
    return (
      <div className="container-xxl py-5">
        <div className="alert alert-warning" role="alert">
          Missing follow-up link. Open the link from the observation email.
        </div>
      </div>
    );
  }
  return <FollowUpForm token={token} />;
}

export function ObservationFollowUpWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted p-4 mb-0">Loading follow-up…</p>}>
      <FollowUpTokenResolver />
    </Suspense>
  );
}
