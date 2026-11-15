"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { AdminActionDropdown, AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  bridgeStatusLabel,
  connectionBadgeLabel,
  createPrinterBridgePairing,
  deletePrinterBridge,
  forgetBluetoothPrinter,
  getPrinterProfile,
  isBluetoothPrinter,
  listMediaProfiles,
  listPrinterBridges,
  listPrinters,
  printerDisplayName,
  reconnectPrinter,
  runPrinterDiagnostics,
  testPrinter,
  updatePrinter,
  updatePrinterBridge,
  upsertPrinterProfile,
  type BridgePairingResult,
  type ForgePrinter,
  type PrinterBridge,
  type PrinterMediaProfile,
  type PrinterProfile,
} from "@/lib/print-api";
import { formatApiErrorMessage } from "@/lib/api-error";
import { formatAdminDate } from "@/lib/platform-admin";
import { loadIndustrialSiteCatalog } from "@/lib/industrial-facility";

type LocationOption = { id: string; name: string };
type DivisionOption = { id: string; name: string; siteId?: string | null };

function statusBadgeClass(status: string, enabled: boolean): string {
  if (!enabled || status.toUpperCase() === "DISABLED") return "bg-label-secondary";
  const s = status.toUpperCase();
  if (s === "ONLINE") return "bg-label-success";
  if (s === "OFFLINE") return "bg-label-warning";
  if (s === "PAIRING") return "bg-label-info";
  return "bg-label-secondary";
}

function remainingMs(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PRINTER_BRIDGE_PROTOCOL = "forge-printer-bridge://register";

/** Opens the local tray via custom protocol (install registers HKCU Classes). */
function openPrinterBridgeOnThisPc(): void {
  window.location.href = PRINTER_BRIDGE_PROTOCOL;
}

export function PrinterBridgesWorkspace() {
  const { me, hasAnyPermission, loading: authLoading } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canManage = hasAnyPermission(["industrial.printer.manage_bridge", "industrial.admin"]);
  const canManagePrinters = hasAnyPermission([
    "industrial.printer.manage",
    "industrial.printer.manage_bridge",
    "industrial.admin",
  ]);
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canPairBluetooth = hasAnyPermission([
    "industrial.printer.pair_bluetooth",
    "industrial.printer.manage",
    "industrial.admin",
  ]);
  const canRunDiagnostics = hasAnyPermission([
    "industrial.printer.run_diagnostics",
    "industrial.admin",
  ]);
  const canManageDefaults = hasAnyPermission([
    "industrial.printer.manage_defaults",
    "industrial.printer.manage",
    "industrial.admin",
  ]);

  const [bridges, setBridges] = useState<PrinterBridge[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [mediaProfiles, setMediaProfiles] = useState<PrinterMediaProfile[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [profileByPrinter, setProfileByPrinter] = useState<Record<string, PrinterProfile>>({});
  const [fallbackDraft, setFallbackDraft] = useState<Record<string, string>>({});
  const [diagMessage, setDiagMessage] = useState<string | null>(null);

  const [pairOpen, setPairOpen] = useState(false);
  const [pairName, setPairName] = useState("Printer Bridge");
  const [pairLocationId, setPairLocationId] = useState("");
  const [pairDivisionId, setPairDivisionId] = useState("");
  const [pairing, setPairing] = useState<BridgePairingResult | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);

  const [openBridgeId, setOpenBridgeId] = useState<string | null>(null);
  const [manageBridgeId, setManageBridgeId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const locationName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      return locations.find((l) => l.id === id)?.name ?? "—";
    },
    [locations],
  );

  const divisionName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      return divisions.find((d) => d.id === id)?.name ?? "—";
    },
    [divisions],
  );

  const printerCountByBridge = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of printers) {
      if (!p.bridgeId) continue;
      map.set(p.bridgeId, (map.get(p.bridgeId) ?? 0) + 1);
    }
    return map;
  }, [printers]);

  const filteredDivisions = useMemo(() => {
    if (!pairLocationId) return divisions;
    return divisions.filter((d) => !d.siteId || d.siteId === pairLocationId);
  }, [divisions, pairLocationId]);

  const openBridge = useMemo(
    () => bridges.find((b) => b.id === openBridgeId) ?? null,
    [bridges, openBridgeId],
  );

  const managePrinters = useMemo(
    () => printers.filter((p) => p.bridgeId === manageBridgeId),
    [printers, manageBridgeId],
  );

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const tenantId = me?.tenantId;
      const [bridgeResult, printerResult, siteRows, mediaRows] = await Promise.all([
        listPrinterBridges().then(
          (rows) => ({ ok: true as const, rows }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        listPrinters().then(
          (rows) => ({ ok: true as const, rows }),
          (err: unknown) => ({ ok: false as const, err }),
        ),
        loadIndustrialSiteCatalog(tenantId).catch(() => [] as LocationOption[]),
        listMediaProfiles().catch(() => [] as PrinterMediaProfile[]),
      ]);
      if (bridgeResult.ok) {
        setBridges(Array.isArray(bridgeResult.rows) ? bridgeResult.rows : []);
      } else {
        setBridges([]);
        setError(formatApiErrorMessage(bridgeResult.err, "Could not load printer bridges."));
      }
      if (printerResult.ok) {
        setPrinters(Array.isArray(printerResult.rows) ? printerResult.rows : []);
      } else {
        setPrinters([]);
        const printerMsg = formatApiErrorMessage(printerResult.err, "Could not load printers.");
        setError((prev) => (prev ? `${prev} ${printerMsg}` : printerMsg));
      }
      setMediaProfiles(Array.isArray(mediaRows) ? mediaRows : []);
      setLocations(
        Array.isArray(siteRows)
          ? siteRows
              .filter((s) => s && typeof s.id === "string")
              .map((s) => ({ id: s.id, name: s.name || s.id }))
          : [],
      );

      if (tenantId) {
        try {
          const deptPayload = await apiGet<unknown>(
            `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial/departments`,
          );
          const rows = Array.isArray(deptPayload)
            ? deptPayload
            : Array.isArray((deptPayload as { items?: unknown[] })?.items)
              ? ((deptPayload as { items: unknown[] }).items as unknown[])
              : [];
          const opts: DivisionOption[] = [];
          for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            const r = row as Record<string, unknown>;
            if (typeof r.id !== "string" || !r.id) continue;
            if (r.archivedAt) continue;
            const name =
              typeof r.name === "string" && r.name.trim()
                ? r.name.trim()
                : typeof r.displayName === "string"
                  ? r.displayName
                  : r.id;
            opts.push({
              id: r.id,
              name: String(name),
              siteId: typeof r.siteId === "string" ? r.siteId : null,
            });
          }
          setDivisions(opts.sort((a, b) => a.name.localeCompare(b.name)));
        } catch {
          setDivisions([]);
        }
      }
    } catch (err) {
      setError(formatApiErrorMessage(err, "Could not load printer bridges."));
    } finally {
      setLoading(false);
    }
  }, [canView, me?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!manageBridgeId) return;
    for (const p of printers.filter((row) => row.bridgeId === manageBridgeId)) {
      void ensurePrinterProfile(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageBridgeId, printers]);

  useEffect(() => {
    if (!pairing?.expiresAt) {
      setCountdownMs(0);
      return;
    }
    const tick = () => setCountdownMs(remainingMs(pairing.expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairing?.expiresAt]);

  async function startPairing() {
    if (!canManage) return;
    setPairBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createPrinterBridgePairing({
        name: pairName.trim() || "Printer Bridge",
        ...(pairLocationId ? { locationId: pairLocationId } : {}),
        ...(pairDivisionId ? { divisionId: pairDivisionId } : {}),
      });
      setPairing(result);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create pairing code.");
    } finally {
      setPairBusy(false);
    }
  }

  async function renameBridge(id: string) {
    if (!canManage || !renameValue.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      await updatePrinterBridge(id, { name: renameValue.trim() });
      setRenameId(null);
      setMessage("Bridge renamed.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not rename bridge.");
    } finally {
      setBusyId(null);
    }
  }

  async function disableBridge(bridge: PrinterBridge) {
    if (!canManage) return;
    setBusyId(bridge.id);
    setError(null);
    try {
      await updatePrinterBridge(bridge.id, {
        enabled: false,
        status: "DISABLED",
      });
      setMessage(`${bridge.name} disabled.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not disable bridge.");
    } finally {
      setBusyId(null);
    }
  }

  async function enableBridge(bridge: PrinterBridge) {
    if (!canManage) return;
    setBusyId(bridge.id);
    setError(null);
    try {
      await updatePrinterBridge(bridge.id, {
        enabled: true,
        status: "OFFLINE",
      });
      setMessage(
        `${bridge.name} enabled. It will show Online after the Windows bridge heartbeats — create a new pairing code if registration never completed.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enable bridge.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeBridge(bridge: PrinterBridge) {
    if (!canManage) return;
    if (!window.confirm(`Remove printer bridge “${bridge.name}”? This cannot be undone.`)) return;
    setBusyId(bridge.id);
    setError(null);
    try {
      await deletePrinterBridge(bridge.id);
      setMessage(`${bridge.name} removed.`);
      if (openBridgeId === bridge.id) setOpenBridgeId(null);
      if (manageBridgeId === bridge.id) setManageBridgeId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove bridge.");
    } finally {
      setBusyId(null);
    }
  }

  async function testBridge(bridge: PrinterBridge) {
    if (!canPrint) return;
    const candidates = printers.filter((p) => p.bridgeId === bridge.id && p.enabled);
    const target = candidates.find((p) => p.isDefault) ?? candidates[0];
    if (!target) {
      setError("No enabled printers on this bridge to test.");
      return;
    }
    setBusyId(bridge.id);
    setError(null);
    setMessage(null);
    try {
      const job = await testPrinter(target.id);
      setMessage(
        `Test print queued for ${printerDisplayName(target)} (job ${job.id.slice(0, 8)}…, ${job.status}).`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test print failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onTestPrinter(printer: ForgePrinter) {
    if (!canPrint) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      const job = await testPrinter(printer.id);
      setMessage(
        `Test print queued for ${printerDisplayName(printer)} (job ${job.id.slice(0, 8)}…, ${job.status}).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test print failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onPublishPrinter(printer: ForgePrinter, enabled: boolean) {
    if (!canManagePrinters) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      await updatePrinter(printer.id, { enabled });
      setMessage(
        enabled
          ? `${printerDisplayName(printer)} published for Forge printing.`
          : `${printerDisplayName(printer)} unpublished.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update printer.");
    } finally {
      setBusyId(null);
    }
  }

  async function onReconnectBluetooth(printer: ForgePrinter) {
    if (!canPairBluetooth) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      const result = await reconnectPrinter(printer.id);
      setMessage(
        result.message ??
          `Reconnect requested for ${printerDisplayName(printer)}. Keep the Bluetooth Companion open near the printer.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not request reconnect.");
    } finally {
      setBusyId(null);
    }
  }

  async function onForgetBluetooth(printer: ForgePrinter) {
    if (!canPairBluetooth) return;
    if (
      !window.confirm(
        `Forget ${printerDisplayName(printer)}?\n\nThis removes the saved Bluetooth association from this Forge Printer Bridge. The printer must be paired again before Bluetooth printing can resume.`,
      )
    ) {
      return;
    }
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      await forgetBluetoothPrinter(printer.id);
      setMessage(`${printerDisplayName(printer)} Bluetooth association forgotten.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not forget Bluetooth printer.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRunDiagnostics(printer: ForgePrinter) {
    if (!canRunDiagnostics) return;
    setBusyId(printer.id);
    setDiagMessage(null);
    setError(null);
    try {
      const result = await runPrinterDiagnostics(printer.id);
      const diag = result?.diagnostics;
      const bits = [
        diag?.printerReady ? "Ready" : "Not ready",
        diag?.supplyOk ? "Supply OK" : "Supply issue",
        result.ribbonOk == null ? null : result.ribbonOk ? "Ribbon OK" : "Ribbon issue",
        result.mediaOk == null ? null : result.mediaOk ? "Media OK" : "Media issue",
        result.batteryPercent != null ? `Battery ${result.batteryPercent}%` : null,
        diag?.bridgeReachable == null
          ? null
          : diag.bridgeReachable
            ? "Bridge online"
            : "Bridge offline",
      ].filter(Boolean);
      setDiagMessage(`${printerDisplayName(printer)}: ${bits.join(" · ")}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Diagnostics failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function ensurePrinterProfile(printerId: string) {
    if (profileByPrinter[printerId]) return profileByPrinter[printerId];
    try {
      const profile = await getPrinterProfile(printerId);
      setProfileByPrinter((prev) => ({ ...prev, [printerId]: profile }));
      setFallbackDraft((prev) => ({
        ...prev,
        [printerId]: profile.fallbackPrinterId ?? "",
      }));
      return profile;
    } catch {
      return null;
    }
  }

  async function onSaveFallback(printer: ForgePrinter) {
    if (!canManageDefaults) return;
    setBusyId(printer.id);
    setError(null);
    setMessage(null);
    try {
      const fallbackPrinterId = (fallbackDraft[printer.id] ?? "").trim() || null;
      const profile = await upsertPrinterProfile(printer.id, { fallbackPrinterId });
      setProfileByPrinter((prev) => ({ ...prev, [printer.id]: profile }));
      setMessage(`Fallback saved for ${printerDisplayName(printer)}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save printer profile.");
    } finally {
      setBusyId(null);
    }
  }

  function healthBadges(p: ForgePrinter) {
    const ble = isBluetoothPrinter(p);
    const attentionHint = `${p.lastErrorCode ?? ""} ${p.lastErrorMessage ?? ""}`;
    const bleHealth = ble
      ? p.ready
        ? { label: "Ready", className: "bg-label-success" }
        : /USER_ACTION|PERMISSION|gesture/i.test(attentionHint)
          ? { label: "Needs attention", className: "bg-label-warning" }
          : p.connected
            ? { label: "Connecting", className: "bg-label-info" }
            : p.bluetoothSavedId
              ? { label: "Connecting", className: "bg-label-info" }
              : { label: "Not paired", className: "bg-label-secondary" }
      : null;

    return (
      <div className="d-flex flex-wrap gap-1">
        {bleHealth ? (
          <span className={`badge ${bleHealth.className}`}>{bleHealth.label}</span>
        ) : null}
        {p.ribbonOk != null ? (
          <span className={`badge ${p.ribbonOk ? "bg-label-success" : "bg-label-danger"}`}>
            Ribbon
          </span>
        ) : null}
        {p.mediaOk != null ? (
          <span className={`badge ${p.mediaOk ? "bg-label-success" : "bg-label-danger"}`}>
            Media
          </span>
        ) : null}
        {p.batteryPercent != null ? (
          <span className="badge bg-label-info">{p.batteryPercent}%</span>
        ) : null}
        {p.supplyName ? <span className="badge bg-label-secondary">{p.supplyName}</span> : null}
      </div>
    );
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading printer bridges…</p>;
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You need printer view permission to manage Printer Bridges.
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Integrations</p>
          <h1 className="h4 mb-1">Printer Bridges</h1>
          <p className="text-muted mb-0">
            Pair Windows bridge agents so shop-floor printers can receive Forge labels.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn btn-outline-secondary"
            title="Opens the Forge Printer Bridge tray on this PC (requires install)"
            onClick={() => openPrinterBridgeOnThisPc()}
          >
            Open Printer Bridge on this PC
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setMediaOpen((v) => !v)}
          >
            {mediaOpen ? "Hide media profiles" : "Media profiles"}
          </button>
          <button type="button" className="btn btn-outline-primary" onClick={() => void load()}>
            <i className="bx bx-refresh me-1" />
            Refresh
          </button>
          {canManage ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPairOpen(true);
                setPairing(null);
                setPairName("Printer Bridge");
                setPairLocationId("");
                setPairDivisionId("");
              }}
            >
              <i className="bx bx-plus me-1" />
              Add Printer Bridge
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {diagMessage ? (
        <div className="alert alert-info" role="status">
          {diagMessage}
        </div>
      ) : null}

      {mediaOpen ? (
        <div className="card border shadow-none mb-3">
          <div className="card-header bg-transparent">
            <h2 className="h6 mb-0">Media profiles (Brady defaults)</h2>
          </div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Model</th>
                  <th>Size</th>
                  <th>Part</th>
                </tr>
              </thead>
              <tbody>
                {mediaProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted">
                      No media profiles yet.
                    </td>
                  </tr>
                ) : (
                  mediaProfiles.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>
                        {m.manufacturer} {m.printerModel}
                      </td>
                      <td>
                        {m.widthInches}×{m.heightInches} in
                      </td>
                      <td>{m.partNumber || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card border shadow-none">
        <div className="card-header bg-transparent d-flex justify-content-between align-items-center">
          <h2 className="h6 mb-0">Registered bridges</h2>
          <span className="text-muted small">{bridges.length} total</span>
        </div>
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Bridge</th>
                <th>Status</th>
                <th>Computer</th>
                <th>Location</th>
                <th>Division</th>
                <th>Version</th>
                <th>Last seen</th>
                <th>Printers</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : bridges.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <AdminEmptyState
                      title="No printer bridges yet"
                      description="Add a bridge and enter the pairing code on the Windows agent."
                    />
                  </td>
                </tr>
              ) : (
                bridges.map((bridge) => (
                  <tr key={bridge.id || bridge.name}>
                    <td>
                      <div className="fw-semibold">{bridge.name || "Bridge"}</div>
                      <div className="text-muted small">
                        {bridge.id ? `${bridge.id.slice(0, 8)}…` : "—"}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(bridge.status, bridge.enabled)}`}>
                        {bridgeStatusLabel(bridge.status, bridge.enabled)}
                      </span>
                    </td>
                    <td>{bridge.computerName || "—"}</td>
                    <td>{locationName(bridge.locationId)}</td>
                    <td>{divisionName(bridge.divisionId)}</td>
                    <td>{bridge.bridgeVersion || "—"}</td>
                    <td>{formatAdminDate(bridge.lastSeenAt)}</td>
                    <td>{printerCountByBridge.get(bridge.id) ?? 0}</td>
                    <td className="text-end">
                      <AdminActionDropdown
                        busy={busyId === bridge.id}
                        items={[
                          {
                            id: "open",
                            label: "Open",
                            icon: "bx-show",
                            onClick: () => setOpenBridgeId(bridge.id),
                          },
                          {
                            id: "printers",
                            label: "Manage Printers",
                            icon: "bx-printer",
                            onClick: () => setManageBridgeId(bridge.id),
                          },
                          {
                            id: "test",
                            label: "Test",
                            icon: "bx-test-tube",
                            hidden: !canPrint,
                            onClick: () => void testBridge(bridge),
                          },
                          {
                            id: "rename",
                            label: "Rename",
                            icon: "bx-edit",
                            hidden: !canManage,
                            onClick: () => {
                              setRenameId(bridge.id);
                              setRenameValue(bridge.name);
                            },
                          },
                          {
                            id: "enable",
                            label: "Enable",
                            icon: "bx-check-circle",
                            hidden: !canManage || bridge.enabled,
                            onClick: () => void enableBridge(bridge),
                          },
                          {
                            id: "disable",
                            label: "Disable",
                            icon: "bx-block",
                            tone: "warning",
                            hidden: !canManage || !bridge.enabled,
                            onClick: () => void disableBridge(bridge),
                          },
                          {
                            id: "remove",
                            label: "Remove",
                            icon: "bx-trash",
                            tone: "danger",
                            hidden: !canManage,
                            onClick: () => void removeBridge(bridge),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {manageBridgeId ? (
        <div className="card border shadow-none mt-3">
          <div className="card-header bg-transparent d-flex justify-content-between align-items-center">
            <h2 className="h6 mb-0">
              Printers — {bridges.find((b) => b.id === manageBridgeId)?.name ?? "Bridge"}
            </h2>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setManageBridgeId(null)}
            >
              Close
            </button>
          </div>
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Connection</th>
                  <th>Transport</th>
                  <th>Status</th>
                  <th>Health</th>
                  <th>Default</th>
                  <th>Fallback</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managePrinters.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-muted">
                      No printers reported yet. After the bridge connects, Windows printers appear
                      automatically. For Brady Bluetooth on this PC: click the{" "}
                      <strong>Forge Printer Bridge</strong> tray icon (system tray / hidden icons),
                      choose <strong>Connect Bluetooth Printer…</strong>, then scan and save in the
                      Forge Bluetooth Printer Companion. That menu ships in Phase 2 tray builds
                      (About → Version 1.1.0). You can also pair Direct Bluetooth from a Print Label
                      dialog in Chrome/Edge on this machine.
                    </td>
                  </tr>
                ) : (
                  managePrinters.map((p) => {
                    const ble = isBluetoothPrinter(p);
                    return (
                      <tr key={p.id}>
                        <td>
                          {printerDisplayName(p)}
                          {ble && p.bluetoothSavedId ? (
                            <div className="small text-muted">Pairing saved</div>
                          ) : null}
                        </td>
                        <td>{connectionBadgeLabel(p.connectionType)}</td>
                        <td>
                          {ble
                            ? "Brady Web Bluetooth"
                            : p.transportType === "WINDOWS_SPOOLER"
                              ? "Windows Driver"
                              : p.transportType?.replace(/_/g, " ") || "—"}
                        </td>
                        <td>
                          {!p.enabled
                            ? "Unpublished"
                            : p.ready
                              ? "Ready"
                              : ble && !p.connected
                                ? "Bluetooth Disconnected"
                                : p.online
                                  ? "Online"
                                  : "Offline"}
                        </td>
                        <td>{healthBadges(p)}</td>
                        <td>{p.isDefault ? "Yes" : "—"}</td>
                        <td style={{ minWidth: 160 }}>
                          {canManageDefaults ? (
                            <div className="d-flex flex-column gap-1">
                              <select
                                className="form-select form-select-sm"
                                value={fallbackDraft[p.id] ?? ""}
                                onChange={(e) =>
                                  setFallbackDraft((prev) => ({
                                    ...prev,
                                    [p.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">None</option>
                                {printers
                                  .filter((other) => other.id !== p.id && other.enabled)
                                  .map((other) => (
                                    <option key={other.id} value={other.id}>
                                      {printerDisplayName(other)}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={busyId === p.id}
                                onClick={() => void onSaveFallback(p)}
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <span className="text-muted small">
                              {profileByPrinter[p.id]?.fallbackPrinterId
                                ? printerDisplayName(
                                    printers.find(
                                      (x) => x.id === profileByPrinter[p.id]?.fallbackPrinterId,
                                    ) ?? {
                                      name: profileByPrinter[p.id]!.fallbackPrinterId!,
                                      displayName: null,
                                    },
                                  )
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="text-end">
                          <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                            {canManagePrinters ? (
                              <button
                                type="button"
                                className={`btn btn-sm ${p.enabled ? "btn-outline-secondary" : "btn-outline-success"}`}
                                disabled={busyId === p.id}
                                onClick={() => void onPublishPrinter(p, !p.enabled)}
                              >
                                {p.enabled ? "Unpublish" : "Publish"}
                              </button>
                            ) : null}
                            {canPrint ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={busyId === p.id || !p.enabled}
                                onClick={() => void onTestPrinter(p)}
                              >
                                Test
                              </button>
                            ) : null}
                            {canRunDiagnostics ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-info"
                                disabled={busyId === p.id}
                                onClick={() => void onRunDiagnostics(p)}
                              >
                                Run diagnostics
                              </button>
                            ) : null}
                            {ble && canPairBluetooth ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-warning"
                                  disabled={busyId === p.id}
                                  onClick={() => void onReconnectBluetooth(p)}
                                >
                                  Reconnect
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={busyId === p.id}
                                  onClick={() => void onForgetBluetooth(p)}
                                >
                                  Forget
                                </button>
                              </>
                            ) : null}
                          </div>
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

      {pairOpen ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-close, same as the other Forge modals; Escape is handled by onKeyDown
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pair-bridge-title"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => {
            if (!pairBusy) setPairOpen(false);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" && !pairBusy) setPairOpen(false);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="pair-bridge-title">
                  Add Printer Bridge
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={pairBusy}
                  onClick={() => setPairOpen(false)}
                />
              </div>
              <div className="modal-body">
                {!pairing ? (
                  <div className="d-flex flex-column gap-3">
                    <div>
                      <label className="form-label" htmlFor="pair-bridge-name">
                        Bridge name
                      </label>
                      <input
                        id="pair-bridge-name"
                        className="form-control"
                        value={pairName}
                        onChange={(e) => setPairName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="pair-bridge-location">
                        Location
                      </label>
                      <select
                        id="pair-bridge-location"
                        className="form-select"
                        value={pairLocationId}
                        onChange={(e) => {
                          setPairLocationId(e.target.value);
                          setPairDivisionId("");
                        }}
                      >
                        <option value="">Optional</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="pair-bridge-division">
                        Division
                      </label>
                      <select
                        id="pair-bridge-division"
                        className="form-select"
                        value={pairDivisionId}
                        onChange={(e) => setPairDivisionId(e.target.value)}
                      >
                        <option value="">Optional</option>
                        {filteredDivisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-muted small mb-2">Enter this code in Forge Printer Bridge</p>
                    <p
                      className="display-6 fw-bold font-monospace mb-2"
                      style={{ letterSpacing: "0.08em" }}
                    >
                      {pairing.pairingCode}
                    </p>
                    <p className="mb-3">
                      Expires in{" "}
                      <span className={countdownMs < 60_000 ? "text-danger fw-semibold" : ""}>
                        {formatCountdown(countdownMs)}
                      </span>
                    </p>
                    <ol className="text-start small text-muted mb-3 ps-3">
                      <li>
                        On this PC, run <strong>ForgePrinterBridgeSetup.exe</strong> once (IT can
                        provide it). Approve the Windows security prompt.
                      </li>
                      <li>
                        Click <strong>Open Printer Bridge on this PC</strong>, then enter this code.
                      </li>
                      <li>Finish before the code expires (10 minutes).</li>
                      <li>
                        For Brady Bluetooth: tray icon → <strong>Connect Bluetooth Printer…</strong>{" "}
                        (pair once; later reconnects are automatic when the companion is running).
                      </li>
                    </ol>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => openPrinterBridgeOnThisPc()}
                    >
                      Open Printer Bridge on this PC
                    </button>
                    <p className="small text-muted mt-2 mb-0">
                      If nothing opens, install the bridge under Program Files\Forge Public
                      Safety\Printer Bridge, then look for the tray icon (Windows may hide it under
                      the overflow <strong>^</strong>).
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={pairBusy}
                  onClick={() => setPairOpen(false)}
                >
                  {pairing ? "Done" : "Cancel"}
                </button>
                {!pairing ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pairBusy || !canManage}
                    onClick={() => void startPairing()}
                  >
                    {pairBusy ? "Creating…" : "Create pairing code"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => openPrinterBridgeOnThisPc()}
                  >
                    Open Printer Bridge on this PC
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {openBridge ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-close, same as the other Forge modals; Escape is handled by onKeyDown
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setOpenBridgeId(null)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setOpenBridgeId(null);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{openBridge.name}</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setOpenBridgeId(null)}
                />
              </div>
              <div className="modal-body">
                <dl className="row mb-0 small">
                  <dt className="col-4">Status</dt>
                  <dd className="col-8">
                    {bridgeStatusLabel(openBridge.status, openBridge.enabled)}
                  </dd>
                  <dt className="col-4">Computer</dt>
                  <dd className="col-8">{openBridge.computerName || "—"}</dd>
                  <dt className="col-4">Location</dt>
                  <dd className="col-8">{locationName(openBridge.locationId)}</dd>
                  <dt className="col-4">Division</dt>
                  <dd className="col-8">{divisionName(openBridge.divisionId)}</dd>
                  <dt className="col-4">Version</dt>
                  <dd className="col-8">{openBridge.bridgeVersion || "—"}</dd>
                  <dt className="col-4">OS</dt>
                  <dd className="col-8">{openBridge.osVersion || "—"}</dd>
                  <dt className="col-4">Last seen</dt>
                  <dd className="col-8">{formatAdminDate(openBridge.lastSeenAt)}</dd>
                  <dt className="col-4">Printers</dt>
                  <dd className="col-8">{printerCountByBridge.get(openBridge.id) ?? 0}</dd>
                </dl>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => {
                    setManageBridgeId(openBridge.id);
                    setOpenBridgeId(null);
                  }}
                >
                  Manage Printers
                </button>
                <Link className="btn btn-outline-secondary" href="/modules/print-queue/">
                  Open Print Queue
                </Link>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setOpenBridgeId(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {renameId ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-close, same as the other Forge modals; Escape is handled by onKeyDown
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setRenameId(null)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") setRenameId(null);
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Rename bridge</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setRenameId(null)}
                />
              </div>
              <div className="modal-body">
                <label className="form-label" htmlFor="rename-bridge-input">
                  Name
                </label>
                <input
                  id="rename-bridge-input"
                  className="form-control"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setRenameId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!renameValue.trim() || busyId === renameId}
                  onClick={() => void renameBridge(renameId)}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
