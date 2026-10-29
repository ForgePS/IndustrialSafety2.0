"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { BluetoothPermissionGate } from "@/components/mobile-print/bluetooth-permission-gate";
import { ConnectedPrinterCard } from "@/components/mobile-print/connected-printer-card";
import { PrinterListItem } from "@/components/mobile-print/printer-list-item";
import {
  detectTabletBluetoothHint,
  getMobilePrintBridge,
  mobilePrintPermissionCodes,
  type MobileBluetoothState,
  type TabletBluetoothHint,
} from "@/lib/mobile-print";
import {
  getPrintManagerSummary,
  isDirectBluetoothPrinter,
  listPrintJobs,
  listPrinters,
  printerDisplayName,
  registerDirectBluetoothPrinter,
  type ForgePrinter,
  type PrintJob,
} from "@/lib/print-api";
import { FieldPrintButton } from "@/components/field-print-label";

type TabId = "home" | "printers" | "recent" | "settings";

function jobLabel(job: PrintJob): string {
  const parts = [job.module, job.recordType].map((v) => String(v ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Print job";
}

function jobWhen(job: PrintJob): string {
  const raw = job.completedAt || job.createdAt;
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}

export default function MobilePrintManagerPage() {
  const { hasAnyPermission, loading: authLoading } = useAuth();
  const canView = hasAnyPermission([...mobilePrintPermissionCodes("view")]);
  const canPair = hasAnyPermission([...mobilePrintPermissionCodes("managePrinters")]);
  const canPrint = hasAnyPermission([...mobilePrintPermissionCodes("submit")]);

  const [tab, setTab] = useState<TabId>("home");
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [recentJobs, setRecentJobs] = useState<PrintJob[]>([]);
  const [summary, setSummary] = useState<{
    queued?: number;
    completedToday?: number;
    failedToday?: number;
  } | null>(null);
  const [btState, setBtState] = useState<MobileBluetoothState>("unknown");
  const [btHint, setBtHint] = useState<TabletBluetoothHint | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const directPrinters = useMemo(
    () => printers.filter((p) => isDirectBluetoothPrinter(p)),
    [printers],
  );
  const preferredPrinter = useMemo(
    () =>
      directPrinters.find((p) => p.isDefault && p.ready) ??
      directPrinters.find((p) => p.ready) ??
      directPrinters.find((p) => p.isDefault) ??
      directPrinters[0] ??
      null,
    [directPrinters],
  );

  const refresh = useCallback(async () => {
    if (!canView) return;
    setError(null);
    try {
      const bridge = getMobilePrintBridge();
      const [bt, items, jobs, dash] = await Promise.all([
        bridge.getBluetoothState(),
        listPrinters({ enabled: "true" }),
        listPrintJobs({ history: "true", page: "1", pageSize: "12" }).catch(() => ({
          items: [] as PrintJob[],
        })),
        getPrintManagerSummary().catch(() => null),
      ]);
      setBtState(bt);
      setBtHint(detectTabletBluetoothHint());
      setPrinters(items);
      setRecentJobs(jobs.items ?? []);
      setSummary({
        ...(typeof dash?.jobs?.queued === "number" ? { queued: dash.jobs.queued } : {}),
        ...(typeof dash?.jobs?.completedToday === "number"
          ? { completedToday: dash.jobs.completedToday }
          : {}),
        ...(typeof dash?.jobs?.failedToday === "number"
          ? { failedToday: dash.jobs.failedToday }
          : {}),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Print Manager.");
    }
  }, [canView]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onFindPrinter() {
    if (!canPair) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const bridge = getMobilePrintBridge();
      const found = await bridge.scanPrinters({ supportedOnly: true });
      const device = found[0];
      if (!device) throw new Error("No printer selected.");
      const name = device.name || "Brady Direct Bluetooth";
      const registered = await registerDirectBluetoothPrinter({
        name,
        displayName: name,
        bluetoothSavedId: device.bluetoothSavedId || device.deviceId,
        bluetoothDeviceId: device.deviceId,
        ...(device.model ? { model: device.model } : {}),
      });
      setMessage(`Paired ${printerDisplayName(registered)}.`);
      setTab("printers");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find a printer.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return <p className="ff-page-body">Loading…</p>;
  }

  if (!canView && !canPair) {
    return (
      <>
        <h1 className="ff-page-title">Print Manager</h1>
        <p className="ff-page-body">You need printer permission to use mobile printing.</p>
      </>
    );
  }

  return (
    <>
      <p className="ff-brand-mark">Print Manager</p>
      <h1 className="ff-page-title">Nearby and cloud-connected printing</h1>
      <p className="ff-page-body">
        Print equipment, LOTO, and supply labels from this device. Bluetooth printers stay linked to
        the Forge Print Manager.
      </p>

      <div
        className="ff-tabs ff-tabs--secondary"
        role="tablist"
        aria-label="Print Manager sections"
      >
        {(
          [
            ["home", "Home"],
            ["printers", "My Printers"],
            ["recent", "Recent"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ff-tab${tab === id ? " ff-tab-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message ? <p className="ff-meta">{message}</p> : null}
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "home" ? (
        <BluetoothPermissionGate state={btState} hint={btHint}>
          <div className="ff-action-row" style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {canPrint ? (
              <Link className="ff-btn ff-btn-primary" href="/scan/">
                Quick Print — Scan QR
              </Link>
            ) : null}
            {canPair && btState === "ready" ? (
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                disabled={busy}
                onClick={() => void onFindPrinter()}
              >
                {busy ? "Scanning…" : "Find Printer"}
              </button>
            ) : null}
          </div>

          <section className="ff-section" aria-label="Connected printer">
            <h2 className="ff-section-title">Connected Printer</h2>
            <div className="ff-stack-list">
              <ConnectedPrinterCard
                printer={preferredPrinter}
                onDetails={() => setTab("printers")}
              />
            </div>
          </section>

          {canPrint ? (
            <section className="ff-section" aria-label="Print a label">
              <h2 className="ff-section-title">Print a label</h2>
              <p className="ff-page-body">
                Choose size, copies, and layout in the print popup — same options as the web Print
                Manager.
              </p>
              <FieldPrintButton
                module="EQUIPMENT"
                fieldValues={{ title: "Field label", name: "Field label" }}
                title="Field label"
                allowTitleEdit
                widthInches={4}
                heightInches={4}
              />
            </section>
          ) : null}

          <section className="ff-section" aria-label="Status">
            <h2 className="ff-section-title">Today</h2>
            <div className="ff-status-grid">
              <div className="ff-status-card">
                <div className="ff-status-card__count">{directPrinters.length}</div>
                <div className="ff-status-card__label">My printers</div>
              </div>
              <div className="ff-status-card">
                <div className="ff-status-card__count">{summary?.queued ?? 0}</div>
                <div className="ff-status-card__label">Queued</div>
              </div>
              <div className="ff-status-card">
                <div className="ff-status-card__count">{summary?.completedToday ?? 0}</div>
                <div className="ff-status-card__label">Completed</div>
              </div>
              <div
                className={`ff-status-card${(summary?.failedToday ?? 0) > 0 ? " ff-status-card--warn" : ""}`}
              >
                <div className="ff-status-card__count">{summary?.failedToday ?? 0}</div>
                <div className="ff-status-card__label">Failed</div>
              </div>
            </div>
          </section>

          <section className="ff-section" aria-label="Recent prints">
            <div className="ff-section-head">
              <h2 className="ff-section-title ff-section-title--inline">Recent Prints</h2>
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setTab("recent")}
              >
                View all
              </button>
            </div>
            <div className="ff-stack-list">
              {recentJobs.slice(0, 3).length === 0 ? (
                <p className="ff-page-body">No recent print jobs yet.</p>
              ) : (
                recentJobs.slice(0, 3).map((job) => (
                  <div key={job.id} className="ff-stack-item">
                    <strong>{jobLabel(job)}</strong>
                    <span className="ff-meta">
                      {job.status}
                      {jobWhen(job) ? ` · ${jobWhen(job)}` : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </BluetoothPermissionGate>
      ) : null}

      {tab === "printers" ? (
        <BluetoothPermissionGate state={btState} hint={btHint}>
          <section className="ff-section" aria-label="My printers">
            <div className="ff-section-head">
              <h2 className="ff-section-title ff-section-title--inline">My Printers</h2>
              {canPair && btState === "ready" ? (
                <button
                  type="button"
                  className="ff-btn ff-btn-primary"
                  disabled={busy}
                  onClick={() => void onFindPrinter()}
                >
                  {busy ? "Pairing…" : "Add printer"}
                </button>
              ) : null}
            </div>
            {directPrinters.length === 0 ? (
              <p className="ff-page-body">
                No Direct Bluetooth printers registered on this account yet.
              </p>
            ) : (
              <div className="ff-stack-list">
                {directPrinters.map((printer) => (
                  <PrinterListItem key={printer.id} printer={printer} />
                ))}
              </div>
            )}
          </section>
        </BluetoothPermissionGate>
      ) : null}

      {tab === "recent" ? (
        <section className="ff-section" aria-label="Recent print jobs">
          <h2 className="ff-section-title">Recent Prints</h2>
          {recentJobs.length === 0 ? (
            <p className="ff-page-body">No print history loaded.</p>
          ) : (
            <div className="ff-stack-list">
              {recentJobs.map((job) => (
                <div key={job.id} className="ff-stack-item">
                  <strong>{jobLabel(job)}</strong>
                  <span className="ff-meta">
                    {job.status} · {job.copies} cop{job.copies === 1 ? "y" : "ies"}
                    {jobWhen(job) ? ` · ${jobWhen(job)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className="ff-section" aria-label="Print settings">
          <h2 className="ff-section-title">Settings</h2>
          <div className="ff-stack-list">
            <div className="ff-stack-item">
              <strong>Bluetooth transport</strong>
              <span className="ff-meta">
                {btHint?.detail ??
                  (btState === "ready"
                    ? "Web Bluetooth ready (Brady)"
                    : btState === "unsupported"
                      ? "Not available in this browser"
                      : btState)}
              </span>
            </div>
            <div className="ff-stack-item">
              <strong>Forge Print Manager</strong>
              <span className="ff-meta">
                Templates, routing, and audit stay in the cloud Print Manager. This device only
                handles nearby Bluetooth delivery.
              </span>
            </div>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              onClick={() => void refresh()}
            >
              Refresh status
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
