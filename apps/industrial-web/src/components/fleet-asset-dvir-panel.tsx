"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiSend } from "@forge/web-kit";
import { DvirDayCalendar } from "@/components/dvir-day-calendar";
import { DvirReportSummaryTable } from "@/components/dvir-report-summary-table";
import { formatApiErrorMessage } from "@/lib/api-error";
import { composeDvirQrStickerBlob, printDvirQrSticker } from "@/lib/dvir-qr-sticker";
import { DOT_API } from "@/lib/dot-compliance-module";
import { isDvirRecord } from "@/lib/dvir";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

export function FleetAssetDvirPanel({
  vehicleId,
  hasDvirQr,
  canManageQr,
  canManageDvir = false,
  dotRegulated = false,
}: {
  vehicleId: string;
  hasDvirQr?: boolean;
  canManageQr: boolean;
  canManageDvir?: boolean;
  /** When false, this asset is non-commercial and does not require DVIRs. */
  dotRegulated?: boolean;
}) {
  const [dvirs, setDvirs] = useState<Array<Record<string, unknown>>>([]);
  const [qrActive, setQrActive] = useState(Boolean(hasDvirQr));

  useEffect(() => {
    setQrActive(Boolean(hasDvirQr));
  }, [hasDvirQr]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrImageHref, setQrImageHref] = useState<string | null>(null);
  const [qrStickerBlob, setQrStickerBlob] = useState<Blob | null>(null);
  const [qrStickerTitle, setQrStickerTitle] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dotRegulated) {
      setDvirs([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiGet<ListResponse>(
        `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvirs`,
        { query: { page: "1", pageSize: "100" } },
      );
      setDvirs((res.items ?? []).filter(isDvirRecord));
    } catch (e) {
      setLoadError(formatApiErrorMessage(e, "Failed to load DVIR history"));
      setDvirs([]);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, dotRegulated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onIssueQr(e: FormEvent) {
    e.preventDefault();
    if (!canManageQr) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setQrImageHref(null);
    setQrStickerBlob(null);
    setQrStickerTitle(null);
    try {
      const appBaseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const issued = await apiSend<{ token: string; url: string }>(
        `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvir-qr`,
        "POST",
        { appBaseUrl },
      );
      if (!issued?.url || !issued?.token) {
        throw new Error("DVIR QR issue response was incomplete.");
      }
      setQrUrl(issued.url);
      setQrActive(true);
      try {
        const image = await apiSend<{
          dataBase64: string;
          qrPngBase64?: string;
          contentType?: string;
          vehicleLabel?: string;
          assetName?: string;
          vin?: string | null;
        }>(
          `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvir-qr/image`,
          "POST",
          { token: issued.token, appBaseUrl },
        );
        const qrBase64 = image?.qrPngBase64 ?? image?.dataBase64;
        if (qrBase64) {
          const stickerBlob = await composeDvirQrStickerBlob(
            qrBase64,
            image.assetName ?? image.vehicleLabel ?? "Vehicle",
            image.vin,
          );
          setQrStickerBlob(stickerBlob);
          setQrImageHref(URL.createObjectURL(stickerBlob));
          setQrStickerTitle(image.assetName ?? image.vehicleLabel ?? "Vehicle");
        }
      } catch (imageErr) {
        setError(
          formatApiErrorMessage(
            imageErr,
            "QR link was issued, but the printable image could not be generated.",
          ),
        );
      }
      setNotice("DVIR QR issued. Save or print the image for the vehicle sticker.");
      void load();
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to issue DVIR QR"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeQr() {
    if (!canManageQr) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend(
        `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvir-qr/revoke`,
        "POST",
        {},
      );
      setQrUrl(null);
      setQrImageHref(null);
      setQrStickerBlob(null);
      setQrStickerTitle(null);
      setQrActive(false);
      setNotice("DVIR QR revoked.");
      void load();
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to revoke DVIR QR"));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteDvir(row: Record<string, unknown>) {
    if (!canManageDvir) return;
    const recordId = String(row.id ?? "");
    if (!recordId) return;
    if (
      !window.confirm(
        "Delete this DVIR? It will be removed from DOT Compliance and this vehicle's inspection list.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiSend(`${DOT_API}/${encodeURIComponent(recordId)}/archive`, "POST", {});
      setNotice("DVIR deleted.");
      void load();
    } catch (err) {
      setError(formatApiErrorMessage(err, "Failed to delete DVIR"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h6 className="card-title mb-0">DVIR inspections</h6>
        {dotRegulated ? (
          <Link className="btn btn-sm btn-outline-primary" href="/modules/dot-compliance?tab=dvirs">
            Open DOT DVIRs
          </Link>
        ) : null}
      </div>
      <div className="card-body">
        {!dotRegulated ? (
          <div className="alert alert-info mb-0" role="status">
            This asset is not marked DOT regulated. Regular non-commercial assets do not require a
            DVIR to operate. Check <strong>DOT regulated</strong> under Insurance &amp; compliance
            if this unit must complete DVIRs.
          </div>
        ) : (
          <>
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
            {loadError ? (
              <div className="alert alert-warning" role="alert">
                {loadError}
              </div>
            ) : null}

            {canManageQr ? (
              <div className="border rounded p-3 mb-4">
                <p className="text-muted small mb-2">
                  Vehicle QR opens a menu: pre-trip, post-trip, or 91-day submission history. No
                  login required. Defect follow-up uses mechanic and DRIVER signatures in DOT
                  Compliance.
                </p>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span className="badge bg-label-secondary">
                    QR {qrActive ? "active" : "not issued"}
                  </span>
                  <form className="d-inline" onSubmit={(e) => void onIssueQr(e)}>
                    <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                      {qrActive ? "Re-issue QR" : "Issue QR"}
                    </button>
                  </form>
                  {qrActive ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      disabled={busy}
                      onClick={() => void onRevokeQr()}
                    >
                      Revoke QR
                    </button>
                  ) : null}
                </div>
                {qrUrl ? (
                  <div className="mt-3">
                    {qrImageHref ? (
                      <div className="text-center mb-3">
                        <img
                          src={qrImageHref}
                          alt="DVIR vehicle QR code"
                          className="border rounded bg-white p-2"
                          style={{ width: 320, height: "auto" }}
                        />
                        <div className="d-flex flex-wrap gap-2 justify-content-center mt-2">
                          <a
                            className="btn btn-sm btn-outline-primary"
                            href={qrImageHref}
                            download={`dvir-qr-${vehicleId}.png`}
                          >
                            Download sticker
                          </a>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              void printDvirQrSticker(
                                qrImageHref,
                                qrStickerTitle ?? `DVIR QR ${vehicleId}`,
                                qrStickerBlob,
                              ).then((blocked) => {
                                if (blocked) setError(blocked);
                              });
                            }}
                          >
                            <i className="bx bx-printer me-1" aria-hidden />
                            Print sticker
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => void navigator.clipboard.writeText(qrUrl)}
                          >
                            Copy link
                          </button>
                        </div>
                        <p className="text-muted small mt-2 mb-0">
                          Print this QR for the vehicle. Scan opens pre-trip, post-trip, or 91-day
                          history. Save the image now — the raw token is only returned once after
                          issue.
                        </p>
                      </div>
                    ) : null}
                    <label className="form-label small" htmlFor="fleet-dvir-qr-url">
                      QR link
                    </label>
                    <input
                      id="fleet-dvir-qr-url"
                      className="form-control form-control-sm"
                      readOnly
                      value={qrUrl}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {loading ? (
              <p className="text-muted mb-0">Loading DVIR history…</p>
            ) : (
              <>
                <DvirDayCalendar vehicleId={vehicleId} rows={dvirs} />
                {dvirs.length === 0 ? (
                  <p className="text-muted mb-0">No DVIRs for this unit in the last 91 days.</p>
                ) : (
                  <DvirReportSummaryTable
                    rows={dvirs}
                    showTrip
                    canDelete={canManageDvir}
                    busy={busy}
                    onDelete={(row) => void onDeleteDvir(row)}
                    compact
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
