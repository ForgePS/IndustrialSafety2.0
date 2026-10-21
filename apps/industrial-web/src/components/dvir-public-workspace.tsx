"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { DvirDayCalendar } from "@/components/dvir-day-calendar";
import { DvirForm } from "@/components/dvir-form";
import { DvirReadonlyView } from "@/components/dvir-readonly-view";
import { SignaturePad } from "@/components/signature-pad";
import { TenantBrandHeader } from "@/components/tenant-brand-header";
import {
  buildDvirSubmitPayload,
  dvirDefectCountFromItems,
  emptyDvirForm,
  isoFromLocalDateString,
  isDvirRecord,
  localDateFromIso,
  resolveDvirPublicToken,
  todayIsoDate,
  tripTypeLabel,
  validateDvirDriverReview,
  validateDvirDriverSubmit,
  type DvirFormState,
  type DvirTripType,
} from "@/lib/dvir";

type PendingDriverReview = {
  id: string;
  title?: string;
  tripType?: string;
  inspectionDate?: string;
  mechanicName?: string;
  defectsCorrected?: boolean;
  defectsNeedNotBeCorrected?: boolean;
  mechanicSignedAt?: string;
};

type DvirContext = {
  vehicleId: string;
  truckNumber: string;
  assetNumber?: string | null;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  siteName?: string | null;
  assignedDriverName?: string | null;
  outOfService?: boolean;
  pendingMechanicCount?: number;
  pendingDriverReviews?: PendingDriverReview[];
  tenantKey?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
};

type PublicScreen = "hub" | "pre" | "post" | "history" | "view";

function parseTripQuery(raw: string | null): DvirTripType | null {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "POST_TRIP" || value === "POST") return "POST_TRIP";
  if (value === "PRE_TRIP" || value === "PRE") return "PRE_TRIP";
  return null;
}

function DvirPublicForm({ token, initialTrip }: { token: string; initialTrip: DvirTripType | null }) {
  const [context, setContext] = useState<DvirContext | null>(null);
  // Open the inspection form immediately — drivers should not land on a menu after scanning.
  const [screen, setScreen] = useState<PublicScreen>(() =>
    initialTrip === "POST_TRIP" ? "post" : "pre",
  );
  const [historyRows, setHistoryRows] = useState<Array<Record<string, unknown>>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<DvirFormState>(() => emptyDvirForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [resultTitle, setResultTitle] = useState<string | null>(null);
  const [hadDefects, setHadDefects] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewSig, setReviewSig] = useState("");
  const [reviewSigDate, setReviewSigDate] = useState(() => todayIsoDate());

  const loadContext = useCallback(async () => {
    const data = await apiGet<DvirContext>(`/api/v1/public/dvir/${encodeURIComponent(token)}`);
    setContext(data);
    setForm(
      emptyDvirForm({
        tripType: initialTrip === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP",
        truckNumber: data.truckNumber,
        vehicleId: data.vehicleId,
        workerName: data.assignedDriverName ?? "",
      }),
    );
    const pending = data.pendingDriverReviews ?? [];
    if (pending.length > 0) {
      setActiveReviewId(pending[0]?.id ?? null);
    }
  }, [token, initialTrip]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await apiGet<{ items?: Array<Record<string, unknown>> }>(
        `/api/v1/public/dvir/${encodeURIComponent(token)}/dvirs`,
      );
      setHistoryRows((data.items ?? []).filter(isDvirRecord));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load DVIR history");
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await loadContext();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "DVIR link is invalid or revoked");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadContext, initialTrip]);

  useEffect(() => {
    if (screen !== "history") return;
    void loadHistory();
  }, [screen, loadHistory]);

  function openTripForm(tripType: DvirTripType) {
    setError(null);
    setDone(false);
    setForm(
      emptyDvirForm({
        tripType,
        truckNumber: context?.truckNumber ?? "",
        vehicleId: context?.vehicleId,
        workerName: context?.assignedDriverName ?? "",
      }),
    );
    setScreen(tripType === "POST_TRIP" ? "post" : "pre");
  }

  function backToHub() {
    setError(null);
    setDone(false);
    setViewRow(null);
    setScreen("hub");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const check = validateDvirDriverSubmit(form);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const defects = dvirDefectCountFromItems(form.items);
      const payload = buildDvirSubmitPayload(form, "public-qr");
      const created = await apiSend<{ title?: string }>(
        `/api/v1/public/dvir/${encodeURIComponent(token)}`,
        "POST",
        payload,
      );
      setResultTitle(created.title ?? "DVIR");
      setHadDefects(defects > 0);
      setDone(true);
      await loadContext();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to submit DVIR");
    } finally {
      setBusy(false);
    }
  }

  async function onDriverReview(event: FormEvent) {
    event.preventDefault();
    if (!activeReviewId) return;
    const check = validateDvirDriverReview({
      signatureDataUrl: reviewSig,
      signatureDate: reviewSigDate,
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiSend(
        `/api/v1/public/dvir/${encodeURIComponent(token)}/driver-review`,
        "POST",
        {
          dvirId: activeReviewId,
          driverReviewSignatureDataUrl: reviewSig,
          driverReviewSignedAt: isoFromLocalDateString(reviewSigDate),
        },
      );
      setReviewDone(true);
      setReviewSig("");
      await loadContext();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save DRIVER review");
    } finally {
      setBusy(false);
    }
  }

  const pendingReviews = context?.pendingDriverReviews ?? [];
  const activeReview = pendingReviews.find((row) => row.id === activeReviewId) ?? pendingReviews[0];

  const hubTitle =
    screen === "pre"
      ? "Pre-trip inspection"
      : screen === "post"
        ? "Post-trip inspection"
        : screen === "history"
          ? "91-day submission history"
          : screen === "view"
            ? "DVIR report"
            : "DRIVER Vehicle Inspection Report";

  return (
    <div className="container-xxl">
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner" style={{ maxWidth: 720 }}>
          <div className="card">
            <div className="card-body">
              <TenantBrandHeader
                tenantKey={context?.tenantKey}
                companyName={context?.companyName}
                logoUrl={context?.logoUrl}
                title={hubTitle}
                subtitle={
                  screen === "hub"
                    ? "Choose an option below. No login required."
                    : screen === "history" || screen === "view"
                      ? "Review prior submissions for this unit."
                      : "Complete the pre-trip or post-trip inspection. No login required."
                }
              />

              {context ? (
                <div className="alert alert-primary" role="status">
                  <div className="fw-semibold">{context.truckNumber}</div>
                  {context.siteName ? <div className="small">{context.siteName}</div> : null}
                  {context.outOfService ? (
                    <div className="small text-danger mt-1">This unit is marked out of service.</div>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              ) : null}

              {busy && !context ? <p className="text-muted">Loading vehicle…</p> : null}

              {screen !== "hub" && screen !== "view" && screen !== "pre" && screen !== "post" ? (
                <div className="mb-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={backToHub}
                  >
                    Back to menu
                  </button>
                </div>
              ) : null}

              {(screen === "pre" || screen === "post") && !done ? (
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={!context}
                    onClick={() => {
                      setViewRow(null);
                      setScreen("history");
                    }}
                  >
                    91-day history
                  </button>
                </div>
              ) : null}

              {screen === "hub" ? (
                <div className="d-grid gap-2 mb-4">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    disabled={!context || context.outOfService}
                    onClick={() => openTripForm("PRE_TRIP")}
                  >
                    Pre-trip inspection
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    disabled={!context || context.outOfService}
                    onClick={() => openTripForm("POST_TRIP")}
                  >
                    Post-trip inspection
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-lg"
                    disabled={!context}
                    onClick={() => {
                      setViewRow(null);
                      setScreen("history");
                    }}
                  >
                    Asset DVIR — 91-day submission history
                  </button>
                </div>
              ) : null}

              {done && (screen === "pre" || screen === "post") ? (
                <div className="alert alert-success mb-4" role="status">
                  <div className="fw-semibold">{resultTitle ?? "DVIR"} submitted. Thank you.</div>
                  {hadDefects ? (
                    <p className="small mb-0 mt-2">
                      Defects were reported. A mechanic must certify repairs in DOT Compliance. After
                      that, return to this QR link to sign DRIVER review below.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary mt-3"
                    onClick={() => openTripForm(form.tripType)}
                  >
                    Start another inspection
                  </button>
                </div>
              ) : null}

              {reviewDone ? (
                <div className="alert alert-success mb-4" role="status">
                  DRIVER review signature saved. This DVIR is complete.
                </div>
              ) : null}

              {(screen === "hub" || screen === "pre" || screen === "post") &&
              context &&
              pendingReviews.length > 0 ? (
                <div className="card border shadow-none mb-4">
                  <div className="card-header">
                    <h6 className="card-title mb-0">DRIVER review signature</h6>
                  </div>
                  <div className="card-body">
                    <p className="text-muted small mb-3">
                      Mechanic certification is complete. Sign below to acknowledge defect disposition
                      before operating this vehicle.
                    </p>
                    {pendingReviews.length > 1 ? (
                      <div className="mb-3">
                        <label className="form-label" htmlFor="dvir-review-pick">
                          Inspection
                        </label>
                        <select
                          id="dvir-review-pick"
                          className="form-select form-select-sm"
                          value={activeReviewId ?? ""}
                          onChange={(ev) => setActiveReviewId(ev.target.value)}
                        >
                          {pendingReviews.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.title ??
                                `${tripTypeLabel(
                                  String(row.tripType).toUpperCase() === "POST_TRIP"
                                    ? "POST_TRIP"
                                    : "PRE_TRIP",
                                )} ${String(row.inspectionDate ?? "").slice(0, 10)}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {activeReview ? (
                      <div className="small mb-3">
                        {activeReview.defectsCorrected ? (
                          <span className="badge bg-label-success me-1">Defects corrected</span>
                        ) : null}
                        {activeReview.defectsNeedNotBeCorrected ? (
                          <span className="badge bg-label-warning me-1">
                            Need not be corrected for safe operation
                          </span>
                        ) : null}
                        {activeReview.mechanicName ? (
                          <span className="text-muted">
                            Mechanic: {activeReview.mechanicName}
                            {activeReview.mechanicSignedAt
                              ? ` (${localDateFromIso(activeReview.mechanicSignedAt)})`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <form onSubmit={(e) => void onDriverReview(e)}>
                      <SignaturePad
                        label="DRIVER review signature *"
                        value={reviewSig}
                        onChange={setReviewSig}
                        signatureDate={reviewSigDate}
                        onSignatureDateChange={setReviewSigDate}
                      />
                      <button type="submit" className="btn btn-primary w-100 mt-3" disabled={busy}>
                        {busy ? "Saving…" : "Complete DRIVER review"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}

              {context && (context.pendingMechanicCount ?? 0) > 0 && screen === "hub" ? (
                <div className="alert alert-warning mb-4" role="status">
                  {context.pendingMechanicCount} open DVIR(s) on this unit are waiting for mechanic
                  certification in DOT Compliance before DRIVER review can be signed here.
                </div>
              ) : null}

              {screen === "pre" || screen === "post" ? (
                !done && context ? (
                  <DvirForm
                    value={form}
                    onChange={(next) => {
                      setForm(next);
                      setScreen(next.tripType === "POST_TRIP" ? "post" : "pre");
                    }}
                    onSubmit={(e) => void onSubmit(e)}
                    submitting={busy}
                    lockVehicleFields
                    error={null}
                  />
                ) : null
              ) : null}

              {screen === "history" ? (
                <div className="mb-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => openTripForm(form.tripType)}
                  >
                    Back to inspection form
                  </button>
                </div>
              ) : null}

              {screen === "history" ? (
                historyLoading ? (
                  <p className="text-muted mb-0">Loading submission history…</p>
                ) : (
                  <DvirDayCalendar
                    publicToken={token}
                    rows={historyRows}
                    onViewReport={(row) => {
                      setViewRow(row);
                      setScreen("view");
                    }}
                  />
                )
              ) : null}

              {screen === "view" && viewRow ? (
                <DvirReadonlyView
                  row={viewRow}
                  publicToken={token}
                  onBack={() => {
                    setViewRow(null);
                    setScreen("history");
                  }}
                />
              ) : null}

              <div className="mt-4">
                <Link href="/" className="text-muted small">
                  Back to Forge Industrial
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DvirTokenResolver() {
  const search = useSearchParams();
  const pathname = usePathname();
  const params = useParams<{ token?: string }>();
  const token = resolveDvirPublicToken({
    pathname,
    queryToken: search.get("token"),
    routeToken: params.token,
  });
  const initialTrip = parseTripQuery(search.get("trip") ?? search.get("tripType"));

  if (!token) {
    return (
      <div className="container-xxl py-5">
        <div className="alert alert-warning" role="alert">
          Missing DVIR token. Scan the QR code on the vehicle or open the link from DOT Compliance.
        </div>
      </div>
    );
  }

  return <DvirPublicForm token={token} initialTrip={initialTrip} />;
}

export function DvirPublicWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted p-4 mb-0">Loading DVIR…</p>}>
      <DvirTokenResolver />
    </Suspense>
  );
}
