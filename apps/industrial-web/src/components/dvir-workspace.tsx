"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { DvirForm } from "@/components/dvir-form";
import { SignaturePad } from "@/components/signature-pad";
import { FilterPanel } from "@/components/filter-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { personNameDisplay } from "@/lib/person-name-display";
import {
  DOT_API,
  dotFileHref,
  dotStatusBadgeClass,
} from "@/lib/dot-compliance-module";
import {
  buildDvirSubmitPayload,
  buildDvirTitle,
  dvirDefectCountFromItems,
  dvirFollowUpBadgeClass,
  dvirFollowUpLabel,
  dvirFollowUpStatus,
  dvirDefectSummary,
  dvirDriverName,
  dvirInspectionDate,
  dvirNeedsDriverReview,
  dvirNeedsMechanic,
  emptyDvirForm,
  initialDvirStatus,
  isoFromLocalDateString,
  isDvirRecord,
  localDateFromIso,
  openPrintableHtmlPopup,
  resolveDvirReportItems,
  answerLabel,
  summarizeDvirList,
  todayIsoDate,
  tripTypeLabel,
  validateDvirDriverReview,
  validateDvirDriverSubmit,
  validateDvirMechanicCertify,
  type DvirFormState,
  type DvirTripType,
} from "@/lib/dvir";

type VehicleRow = {
  id: string;
  assetNumber?: string | null;
  licensePlate?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  hasDvirQr?: boolean;
  assignedDriverName?: string | null;
};

type Mode = "list" | "create" | "detail" | "qr";

function vehicleLabel(v: VehicleRow | null | undefined): string {
  if (!v) return "Vehicle";
  return (
    v.assetNumber ||
    [v.year, v.make, v.model].filter(Boolean).join(" ") ||
    v.licensePlate ||
    v.id ||
    "Vehicle"
  );
}

import { composeDvirQrStickerBlob, printDvirQrSticker } from "@/lib/dvir-qr-sticker";
export function DvirWorkspace({
  records,
  canManage,
  loading,
  onRefresh,
}: {
  records: Array<Record<string, unknown>>;
  canManage: boolean;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
}) {
  const dvirRecords = useMemo(() => records.filter(isDvirRecord), [records]);
  const summary = useMemo(() => summarizeDvirList(dvirRecords), [dvirRecords]);

  const [mode, setMode] = useState<Mode>("list");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<DvirFormState>(() => emptyDvirForm());
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [qrVehicleId, setQrVehicleId] = useState("");
  const [qrResult, setQrResult] = useState<{
    token: string;
    url: string;
    svgHref?: string;
    stickerBlob?: Blob;
    label: string;
    vin?: string | null;
  } | null>(null);

  const [mechanicName, setMechanicName] = useState("");
  const [mechanicSig, setMechanicSig] = useState("");
  const [mechanicSigDate, setMechanicSigDate] = useState(() => todayIsoDate());
  const [defectDisposition, setDefectDisposition] = useState<"CORRECTED" | "NEED_NOT_CORRECT">(
    "CORRECTED",
  );
  const [driverReviewSig, setDriverReviewSig] = useState("");
  const [driverReviewSigDate, setDriverReviewSigDate] = useState(() => todayIsoDate());

  const loadVehicles = useCallback(async () => {
    try {
      const res = await apiGet<{ items: VehicleRow[] }>("/api/v1/industrial/fleet/vehicles", {
        query: { pageSize: "200" },
      });
      setVehicles(res.items ?? []);
    } catch {
      setVehicles([]);
    }
  }, []);

  useEffect(() => {
    if (mode === "qr" || mode === "create") void loadVehicles();
  }, [mode, loadVehicles]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return dvirRecords;
    return dvirRecords.filter((row) => {
      const hay = [
        row.title,
        row.workerName,
        row.driverName,
        row.truckNumber,
        row.trailerNumbers,
        row.tripType,
        row.status,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return hay.includes(needle);
    });
  }, [dvirRecords, q]);

  function startCreate(tripType: DvirTripType) {
    setError(null);
    setForm(emptyDvirForm({ tripType }));
    setMode("create");
  }

  function openDetail(row: Record<string, unknown>) {
    setSelected(row);
    setMechanicName(String(row.mechanicName ?? ""));
    setMechanicSig(String(row.mechanicSignatureDataUrl ?? ""));
    setMechanicSigDate(localDateFromIso(String(row.mechanicSignedAt ?? "")));
    setDriverReviewSig(String(row.driverReviewSignatureDataUrl ?? ""));
    setDriverReviewSigDate(localDateFromIso(String(row.driverReviewSignedAt ?? "")));
    setDefectDisposition(row.defectsNeedNotBeCorrected === true ? "NEED_NOT_CORRECT" : "CORRECTED");
    setError(null);
    setMode("detail");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const check = validateDvirDriverSubmit(form);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = buildDvirSubmitPayload(form, "office");
      await apiSend(DOT_API, "POST", {
        ...payload,
        title: buildDvirTitle(form),
        status: initialDvirStatus(dvirDefectCountFromItems(form.items) > 0),
        workerName: payload.workerName,
        locationText: form.truckNumber,
      });
      setMode("list");
      setForm(emptyDvirForm());
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit DVIR");
    } finally {
      setBusy(false);
    }
  }

  async function onCertifyMechanic(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    const check = validateDvirMechanicCertify({
      defectsCorrected: defectDisposition === "CORRECTED",
      defectsNeedNotBeCorrected: defectDisposition === "NEED_NOT_CORRECT",
      mechanicName,
      mechanicSignatureDataUrl: mechanicSig,
      mechanicSignatureDate: mechanicSigDate,
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `${DOT_API}/${encodeURIComponent(String(selected.id))}/dvir-certify`,
        "POST",
        {
          action: "mechanic",
          defectsCorrected: defectDisposition === "CORRECTED",
          defectsNeedNotBeCorrected: defectDisposition === "NEED_NOT_CORRECT",
          mechanicName,
          mechanicSignatureDataUrl: mechanicSig,
          mechanicSignedAt: isoFromLocalDateString(mechanicSigDate),
        },
      );
      setSelected(updated);
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save mechanic certification");
    } finally {
      setBusy(false);
    }
  }

  async function onDriverReview(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canManage) return;
    const check = validateDvirDriverReview({
      signatureDataUrl: driverReviewSig,
      signatureDate: driverReviewSigDate,
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<Record<string, unknown>>(
        `${DOT_API}/${encodeURIComponent(String(selected.id))}/dvir-certify`,
        "POST",
        {
          action: "driver-review",
          driverReviewSignatureDataUrl: driverReviewSig,
          driverReviewSignedAt: isoFromLocalDateString(driverReviewSigDate),
        },
      );
      setSelected(updated);
      await onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save DRIVER review");
    } finally {
      setBusy(false);
    }
  }

  async function onArchiveDvir(row: Record<string, unknown>) {
    if (!canManage) return;
    const recordId = String(row.id ?? "");
    if (!recordId) return;
    if (
      !window.confirm(
        "Delete this DVIR? It will be removed from DOT Compliance and vehicle inspection lists.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiSend(`${DOT_API}/${encodeURIComponent(recordId)}/archive`, "POST", {});
      if (selected?.id === row.id) {
        setSelected(null);
        setMode("list");
      }
      await onRefresh();
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to delete DVIR"));
    } finally {
      setBusy(false);
    }
  }

  async function onIssueQr(event: FormEvent) {
    event.preventDefault();
    if (!qrVehicleId || !canManage) return;
    setBusy(true);
    setError(null);
    setQrResult(null);
    const appBaseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
    try {
      const issued = await apiSend<{
        token: string;
        url: string;
        vehicle?: VehicleRow | null;
      }>(`/api/v1/industrial/fleet/vehicles/${encodeURIComponent(qrVehicleId)}/dvir-qr`, "POST", {
        appBaseUrl,
      });
      if (!issued?.url || !issued?.token) {
        throw new ApiError("DVIR QR issue response was incomplete.", 500);
      }
      const label = vehicleLabel(issued.vehicle);
      let svgHref: string | undefined;
      let stickerBlob: Blob | undefined;
      let issuedVin: string | null = issued.vehicle?.vin ?? null;
      try {
        const image = await apiSend<{
          dataBase64: string;
          qrPngBase64?: string;
          vehicleLabel?: string;
          assetName?: string;
          vin?: string | null;
        }>(
          `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(qrVehicleId)}/dvir-qr/image`,
          "POST",
          { token: issued.token, appBaseUrl },
        );
        const qrBase64 = image?.qrPngBase64 ?? image?.dataBase64;
        if (qrBase64) {
          stickerBlob = await composeDvirQrStickerBlob(
            qrBase64,
            image.assetName ?? image.vehicleLabel ?? label,
            image.vin,
          );
          svgHref = URL.createObjectURL(stickerBlob);
          issuedVin = image.vin ?? issuedVin;
        }
      } catch (imageErr) {
        setError(
          formatApiErrorMessage(
            imageErr,
            "QR link was issued, but the printable image could not be generated.",
          ),
        );
      }
      setQrResult({
        token: issued.token,
        url: issued.url,
        ...(svgHref ? { svgHref } : {}),
        ...(stickerBlob ? { stickerBlob } : {}),
        label,
        vin: issuedVin,
      });
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to issue DVIR QR"));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "create") {
    return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">New {tripTypeLabel(form.tripType)} DVIR</h5>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMode("list")}>
            Back to list
          </button>
        </div>
        {canManage ? (
          <div className="card border shadow-none">
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label" htmlFor="dvir-link-vehicle">
                  Link fleet vehicle (optional)
                </label>
                <select
                  id="dvir-link-vehicle"
                  className="form-select"
                  value={form.vehicleId ?? ""}
                  onChange={(ev) => {
                    const id = ev.target.value;
                    const v = vehicles.find((row) => row.id === id);
                    const next: DvirFormState = {
                      ...form,
                      truckNumber: v ? vehicleLabel(v) : form.truckNumber,
                      workerName: form.workerName || v?.assignedDriverName || "",
                    };
                    if (id) next.vehicleId = id;
                    else delete next.vehicleId;
                    setForm(next);
                  }}
                >
                  <option value="">— Manual unit number —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <DvirForm
                value={form}
                onChange={setForm}
                onSubmit={(e) => void onCreate(e)}
                submitting={busy}
                error={error}
                lockVehicleFields={Boolean(form.vehicleId)}
              />
            </div>
          </div>
        ) : (
          <div className="alert alert-warning">You do not have permission to create DVIRs.</div>
        )}
      </div>
    );
  }

  if (mode === "qr") {
    return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Vehicle DVIR QR</h5>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMode("list")}>
            Back to list
          </button>
        </div>
        <div className="card border shadow-none">
          <div className="card-body">
            <p className="text-muted">
              Issue a reusable QR sticker for a fleet unit. DRIVERS scan it to choose pre-trip, post-trip,
              or view the 91-day submission history — no login required.
            </p>
            {error ? (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            ) : null}
            <form onSubmit={(e) => void onIssueQr(e)} className="row g-3 align-items-end">
              <div className="col-md-8">
                <label className="form-label" htmlFor="dvir-qr-vehicle">
                  Fleet vehicle
                </label>
                <select
                  id="dvir-qr-vehicle"
                  className="form-select"
                  required
                  value={qrVehicleId}
                  onChange={(ev) => setQrVehicleId(ev.target.value)}
                >
                  <option value="">Select vehicle…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                      {v.hasDvirQr ? " (QR active)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <button type="submit" className="btn btn-primary w-100" disabled={busy || !canManage}>
                  {busy ? "Issuing…" : "Issue / rotate QR"}
                </button>
              </div>
            </form>
            {qrResult ? (
              <div className="mt-4 text-center">
                <p className="fw-semibold mb-1">{qrResult.label}</p>
                {qrResult.vin ? (
                  <p className="text-muted small mb-2">VIN: {qrResult.vin}</p>
                ) : null}
                {qrResult.svgHref ? (
                  <img
                    src={qrResult.svgHref}
                    alt={`DVIR QR for ${qrResult.label}`}
                    className="border rounded bg-white p-2"
                    style={{ width: 320, height: "auto" }}
                  />
                ) : null}
                <p className="small text-break mt-2 mb-2">{qrResult.url}</p>
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  {qrResult.svgHref ? (
                    <a
                      className="btn btn-sm btn-outline-primary"
                      href={qrResult.svgHref}
                      download={`dvir-qr-${qrVehicleId}.png`}
                    >
                      Download sticker
                    </a>
                  ) : null}
                  {qrResult.svgHref ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        void printDvirQrSticker(
                          qrResult.svgHref!,
                          `DVIR QR ${qrResult.label}`,
                          qrResult.stickerBlob,
                        ).then((blocked) => {
                          if (blocked) setError(blocked);
                        });
                      }}
                    >
                      <i className="bx bx-printer me-1" aria-hidden />
                      Print sticker
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => void navigator.clipboard.writeText(qrResult.url)}
                  >
                    Copy link
                  </button>
                </div>
                <p className="text-muted small mt-3 mb-0">
                  Save the image now — the raw token is only shown once after issue/rotate.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "detail" && selected) {
    const detail = selected;
    const reportItems = resolveDvirReportItems(detail);
    const noItems = reportItems.filter((item) => item.answer === "NO");
    const needsMechanic = dvirNeedsMechanic(detail);
    const needsReview = dvirNeedsDriverReview(detail);

    async function printSelected() {
      const recordId = String(detail.id ?? "");
      if (!recordId) return;
      try {
        const data = await apiGet<{ html: string }>(
          `/api/v1/industrial/dot/${encodeURIComponent(recordId)}/printable`,
        );
        const blocked = openPrintableHtmlPopup(data.html, true);
        if (blocked) setError(blocked);
      } catch (e) {
        setError(formatApiErrorMessage(e, "Could not print DVIR"));
      }
    }

    return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
          <h5 className="mb-0">{String(selected.title ?? "DVIR")}</h5>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => void printSelected()}
            >
              Print
            </button>
            <Link className="btn btn-sm btn-outline-primary" href={dotFileHref(String(selected.id))}>
              Open file
            </Link>
            {canManage ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={() => void onArchiveDvir(selected)}
              >
                Delete
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMode("list")}>
              Back to list
            </button>
          </div>
        </div>

        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}

        <p className="text-muted small mb-3">
          Submitted DVIRs cannot be edited. Mechanic certification and DRIVER review add follow-up
          signatures only.
        </p>

        <div className="card border shadow-none mb-3">
          <div className="card-body">
            <dl className="row mb-0">
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">Trip</dt>
                <dd className="mb-0">
                  {tripTypeLabel(
                    String(selected.tripType).toUpperCase() === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP",
                  )}
                </dd>
              </div>
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">Date</dt>
                <dd className="mb-0">{String(selected.inspectionDate ?? "—")}</dd>
              </div>
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">Status</dt>
                <dd className="mb-0">
                  <span className={`badge ${dotStatusBadgeClass(String(selected.status ?? ""))}`}>
                    {String(selected.status ?? "—")}
                  </span>
                </dd>
              </div>
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">Unit</dt>
                <dd className="mb-0">{String(selected.truckNumber ?? "—")}</dd>
              </div>
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">Trailer(s)</dt>
                <dd className="mb-0">{String(selected.trailerNumbers || "—")}</dd>
              </div>
              <div className="col-md-4 mb-2">
                <dt className="text-muted small">DRIVER</dt>
                <dd className="mb-0">
                  {personNameDisplay(
                    String(selected.workerName ?? selected.driverName ?? ""),
                    "—",
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <h6 className="mb-2">Inspection answers</h6>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Notes</th>
                      <th scope="col" className="text-end">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportItems.map((item) => (
                      <tr key={item.id} className={item.answer === "NO" ? "table-danger" : undefined}>
                        <td>{item.label}</td>
                        <td>{item.notes || "—"}</td>
                        <td className="text-end">{answerLabel(item.answer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {noItems.length > 0 ? (
              <div className="mt-3">
                <h6 className="mb-2">Defects (No)</h6>
                <ul className="mb-0">
                  {noItems.map((item) => (
                    <li key={item.id}>
                      {item.label}
                      {item.notes ? ` — ${item.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted mt-3 mb-0">No defects — all items Yes or N/A.</p>
            )}

            {selected.remarks ? (
              <div className="mt-3">
                <h6 className="mb-1">Additional remarks</h6>
                <p className="mb-0">{String(selected.remarks)}</p>
              </div>
            ) : null}
            {typeof selected.driverSignatureDataUrl === "string" &&
            selected.driverSignatureDataUrl.startsWith("data:image/") ? (
              <div className="mt-3">
                <h6 className="mb-1">
                  DRIVER signature
                  {selected.driverSignedAt
                    ? ` — ${localDateFromIso(String(selected.driverSignedAt))}`
                    : ""}
                </h6>
                <img
                  src={selected.driverSignatureDataUrl}
                  alt="DRIVER signature"
                  className="border rounded bg-white"
                  style={{ maxWidth: 320, height: "auto" }}
                />
              </div>
            ) : null}
            {typeof selected.mechanicSignatureDataUrl === "string" &&
            selected.mechanicSignatureDataUrl.startsWith("data:image/") ? (
              <div className="mt-3">
                <h6 className="mb-1">
                  Mechanic signature
                  {selected.mechanicSignedAt
                    ? ` — ${localDateFromIso(String(selected.mechanicSignedAt))}`
                    : ""}
                  {selected.mechanicName ? ` (${String(selected.mechanicName)})` : ""}
                </h6>
                <img
                  src={selected.mechanicSignatureDataUrl}
                  alt="Mechanic signature"
                  className="border rounded bg-white"
                  style={{ maxWidth: 320, height: "auto" }}
                />
              </div>
            ) : null}
            {typeof selected.driverReviewSignatureDataUrl === "string" &&
            selected.driverReviewSignatureDataUrl.startsWith("data:image/") ? (
              <div className="mt-3">
                <h6 className="mb-1">
                  DRIVER review signature
                  {selected.driverReviewSignedAt
                    ? ` — ${localDateFromIso(String(selected.driverReviewSignedAt))}`
                    : ""}
                </h6>
                <img
                  src={selected.driverReviewSignatureDataUrl}
                  alt="DRIVER review signature"
                  className="border rounded bg-white"
                  style={{ maxWidth: 320, height: "auto" }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {canManage && needsMechanic ? (
          <div className="card border shadow-none mb-3">
            <div className="card-header">
              <h6 className="card-title mb-0">Mechanic certification</h6>
            </div>
            <div className="card-body">
              <form onSubmit={(e) => void onCertifyMechanic(e)}>
                <div className="mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="defect-disposition"
                      id="defects-corrected"
                      checked={defectDisposition === "CORRECTED"}
                      onChange={() => setDefectDisposition("CORRECTED")}
                    />
                    <label className="form-check-label" htmlFor="defects-corrected">
                      Above defects corrected
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="defect-disposition"
                      id="defects-need-not"
                      checked={defectDisposition === "NEED_NOT_CORRECT"}
                      onChange={() => setDefectDisposition("NEED_NOT_CORRECT")}
                    />
                    <label className="form-check-label" htmlFor="defects-need-not">
                      Above defects need NOT be corrected for safe operation of vehicle
                    </label>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="mechanic-name">
                    Mechanic name *
                  </label>
                  <input
                    id="mechanic-name"
                    className="form-control"
                    value={mechanicName}
                    onChange={(ev) => setMechanicName(ev.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <SignaturePad
                    label="Mechanic signature *"
                    value={mechanicSig}
                    onChange={setMechanicSig}
                    signatureDate={mechanicSigDate}
                    onSignatureDateChange={setMechanicSigDate}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save mechanic certification"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {canManage && needsReview ? (
          <div className="card border shadow-none mb-3">
            <div className="card-header">
              <h6 className="card-title mb-0">DRIVER review</h6>
            </div>
            <div className="card-body">
              <p className="text-muted small">
                DRIVER acknowledges that reported defects were corrected or need not be corrected for
                safe operation.
              </p>
              <form onSubmit={(e) => void onDriverReview(e)}>
                <div className="mb-3">
                  <SignaturePad
                    label="DRIVER review signature *"
                    value={driverReviewSig}
                    onChange={setDriverReviewSig}
                    signatureDate={driverReviewSigDate}
                    onSignatureDateChange={setDriverReviewSigDate}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Complete DRIVER review"}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {!needsMechanic && !needsReview && noItems.length > 0 ? (
          <div className="alert alert-success" role="status">
            Defect follow-up is complete for this DVIR.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="row row-cols-2 row-cols-md-4 g-3 mb-4">
        <div className="col">
          <div className="card border shadow-none h-100">
            <div className="card-body p-3">
              <span className="text-muted small d-block">Open defect DVIRs</span>
              <h5 className="mb-0">{summary.openDefects}</h5>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border shadow-none h-100">
            <div className="card-body p-3">
              <span className="text-muted small d-block">Pre-trip today</span>
              <h5 className="mb-0">{summary.preToday}</h5>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border shadow-none h-100">
            <div className="card-body p-3">
              <span className="text-muted small d-block">Post-trip today</span>
              <h5 className="mb-0">{summary.postToday}</h5>
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card border shadow-none h-100">
            <div className="card-body p-3">
              <span className="text-muted small d-block">Total DVIRs</span>
              <h5 className="mb-0">{summary.total}</h5>
            </div>
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="d-flex flex-wrap gap-2 mb-4">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startCreate("PRE_TRIP")}>
            Start pre-trip
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startCreate("POST_TRIP")}>
            Start post-trip
          </button>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setMode("qr")}>
            <i className="bx bx-qr me-1" />
            Issue vehicle QR
          </button>
        </div>
      ) : null}

      <FilterPanel
        searchId="dvir-search"
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Unit, DRIVER, trip type…"
        chips={q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []}
        onClearAll={() => setQ("")}
        onSubmit={() => undefined}
      />

      {loading ? (
        <p className="text-muted" role="status">
          Loading DVIRs…
        </p>
      ) : null}

      <div className="card border shadow-none">
        {visible.length === 0 ? (
          <div className="card-body text-center py-5">
            <p className="text-muted mb-0">No DVIRs yet. Start a pre-trip or post-trip inspection.</p>
          </div>
        ) : (
          <div className="table-responsive text-nowrap">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Trip</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Defects</th>
                  <th scope="col">Defect summary</th>
                  <th scope="col">DRIVER</th>
                  <th scope="col">Follow-up</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col" className="text-end">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const defects = dvirDefectSummary(row);
                  const followUp = dvirFollowUpStatus(row);
                  return (
                    <tr key={String(row.id)} style={{ cursor: "pointer" }} onClick={() => openDetail(row)}>
                      <td className="text-muted">{dvirInspectionDate(row)}</td>
                      <td>
                        {tripTypeLabel(
                          String(row.tripType).toUpperCase() === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP",
                        )}
                      </td>
                      <td className="fw-semibold">{String(row.truckNumber ?? row.title ?? "—")}</td>
                      <td>{defects.yesNo}</td>
                      <td className={defects.hasDefects ? "text-danger" : "text-muted"}>
                        {defects.hasDefects ? defects.text : "—"}
                      </td>
                      <td>{dvirDriverName(row)}</td>
                      <td>
                        {followUp !== "none" ? (
                          <span className={`badge ${dvirFollowUpBadgeClass(followUp)}`}>
                            {dvirFollowUpLabel(followUp)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className={`badge ${dotStatusBadgeClass(String(row.status ?? ""))}`}>
                          {String(row.status ?? "—")}
                        </span>
                      </td>
                      {canManage ? (
                        <td className="text-end" onClick={(ev) => ev.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busy}
                            onClick={() => void onArchiveDvir(row)}
                          >
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
