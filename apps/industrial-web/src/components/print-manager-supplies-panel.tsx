"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  createPrintSupply,
  deletePrintSupply,
  listPrinters,
  listPrintSupplies,
  replacePrintSupply,
  type ForgePrinter,
  type PrintSupply,
} from "@/lib/print-api";
import { formatAdminDate } from "@/lib/platform-admin";

const SUPPLY_TYPES = [
  "LABELS",
  "RIBBON",
  "PAPER",
  "TONER",
  "INK",
  "CARDS",
  "SPECIALTY_MEDIA",
  "OTHER",
] as const;

function alertBadge(level: string): string {
  const s = level.toUpperCase();
  if (s === "EMPTY" || s === "CRITICAL") return "bg-label-danger";
  if (s === "LOW") return "bg-label-warning";
  return "bg-label-success";
}

export function PrintManagerSuppliesPanel() {
  const { hasAnyPermission } = useAuth();
  const canView = hasAnyPermission([
    "industrial.printer.view",
    "industrial.printer.print",
    "industrial.admin",
  ]);
  const canManage = hasAnyPermission(["industrial.printer.manage_media", "industrial.admin"]);

  const [items, setItems] = useState<PrintSupply[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [supplyType, setSupplyType] = useState<string>("LABELS");
  const [printerId, setPrinterId] = useState("");
  const [startingQuantity, setStartingQuantity] = useState(1000);
  const [warningThreshold, setWarningThreshold] = useState(50);
  const [criticalThreshold, setCriticalThreshold] = useState(15);
  const [unit, setUnit] = useState("labels");

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [supplies, printerList] = await Promise.all([listPrintSupplies(), listPrinters()]);
      setItems(supplies);
      setPrinters(printerList);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load supplies.");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return <p className="text-muted mb-0">You do not have permission to view print supplies.</p>;
  }

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <p className="text-muted small mb-3">
        Remaining quantities are <strong>estimates</strong> based on successful print jobs (copies),
        not live printer telemetry. Configure alert recipients on each supply via API if needed.
      </p>

      {canManage ? (
        <div className="card border shadow-none mb-4">
          <div className="card-header">
            <h6 className="mb-0">Add supply</h6>
          </div>
          <div className="card-body">
            <div className="row g-2 align-items-end">
              <div className="col-md-3">
                <label className="form-label small">Name</label>
                <input
                  className="form-control form-control-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Brady 2x4 labels"
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small">Type</label>
                <select
                  className="form-select form-select-sm"
                  value={supplyType}
                  onChange={(e) => setSupplyType(e.target.value)}
                >
                  {SUPPLY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label small">Printer</label>
                <select
                  className="form-select form-select-sm"
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                >
                  <option value="">Tenant-wide</option>
                  {printers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName || p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-1">
                <label className="form-label small">Start qty</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={0}
                  value={startingQuantity}
                  onChange={(e) => setStartingQuantity(Number(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-1">
                <label className="form-label small">Warn</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={0}
                  value={warningThreshold}
                  onChange={(e) => setWarningThreshold(Number(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-1">
                <label className="form-label small">Critical</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  min={0}
                  value={criticalThreshold}
                  onChange={(e) => setCriticalThreshold(Number(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-1">
                <label className="form-label small">Unit</label>
                <input
                  className="form-control form-control-sm"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
              <div className="col-md-1">
                <button
                  type="button"
                  className="btn btn-sm btn-primary w-100"
                  disabled={!name.trim() || busyId === "create"}
                  onClick={() => {
                    void (async () => {
                      setBusyId("create");
                      try {
                        await createPrintSupply({
                          name: name.trim(),
                          supplyType,
                          ...(printerId ? { printerId } : { printerId: null }),
                          startingQuantity,
                          warningThreshold,
                          criticalThreshold,
                          unit,
                        });
                        setName("");
                        await load();
                      } catch (err) {
                        setError(
                          err instanceof ApiError ? err.message : "Could not create supply.",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    })();
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card border shadow-none">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Supply inventory</h6>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Printer</th>
                <th>Estimated remaining</th>
                <th>Consumed</th>
                <th>Alert</th>
                <th>Replaced</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="text-muted">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="text-muted">
                    No print supplies tracked yet.
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="fw-semibold">{s.name}</div>
                      {s.sku ? <div className="small text-muted">{s.sku}</div> : null}
                    </td>
                    <td>
                      <span className="badge bg-label-secondary">{s.supplyType}</span>
                    </td>
                    <td>{s.printerName || "Tenant-wide"}</td>
                    <td>
                      <div>
                        {s.estimatedRemaining} {s.unit}{" "}
                        <span className="text-muted small">(est.)</span>
                      </div>
                      {s.percentRemaining != null ? (
                        <div className="small text-muted">{s.percentRemaining}% of starting</div>
                      ) : null}
                    </td>
                    <td>
                      {s.unitsConsumed} {s.unit}
                    </td>
                    <td>
                      <span className={`badge ${alertBadge(s.alertLevel)}`}>{s.alertLevel}</span>
                    </td>
                    <td className="small text-muted">{formatAdminDate(s.lastReplacedAt)}</td>
                    {canManage ? (
                      <td>
                        <div className="d-flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            disabled={busyId === s.id}
                            onClick={() => {
                              const qty = window.prompt(
                                "Replacement quantity (resets estimated remaining):",
                                String(s.startingQuantity),
                              );
                              if (!qty) return;
                              const quantity = Number(qty);
                              if (!Number.isFinite(quantity) || quantity < 1) return;
                              void (async () => {
                                setBusyId(s.id);
                                try {
                                  await replacePrintSupply(s.id, { quantity });
                                  await load();
                                } catch (err) {
                                  setError(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Could not replace supply.",
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              })();
                            }}
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busyId === s.id}
                            onClick={() => {
                              if (!window.confirm(`Delete supply “${s.name}”?`)) return;
                              void (async () => {
                                setBusyId(s.id);
                                try {
                                  await deletePrintSupply(s.id);
                                  await load();
                                } catch (err) {
                                  setError(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Could not delete supply.",
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              })();
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
