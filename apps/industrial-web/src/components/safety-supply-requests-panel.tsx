"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";

type SupplyRequest = {
  id: string;
  requestNumber: string;
  status: string;
  priority?: string | null;
  source?: string | null;
  requestorType?: string | null;
  contractorName?: string | null;
  locationId?: string | null;
  siteId?: string | null;
  reason?: string | null;
  notes?: string | null;
  employeeMessage?: string | null;
  internalNotes?: string | null;
  neededBy?: string | null;
  createdAt?: string;
  assignedUserId?: string | null;
};

type RequestLine = {
  id: string;
  itemId?: string | null;
  itemName?: string | null;
  quantityRequested: string | number;
  quantityApproved?: string | number | null;
  quantityIssued?: string | number | null;
  quantityBackordered?: string | number | null;
  status?: string | null;
  customItem?: boolean;
  customItemName?: string | null;
  denialReason?: string | null;
};

type RequestEvent = {
  id: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  createdAt?: string;
};

type RequestDetail = SupplyRequest & {
  items: RequestLine[];
  events: RequestEvent[];
  inventoryWarnings?: Array<{ itemName: string; available: number; requested: number }>;
};

type InventoryRow = {
  itemId: string;
  locationId: string;
  quantityAvailable: string | number;
  reorderPoint?: string | number | null;
  itemName?: string;
};

type Props = {
  requests: SupplyRequest[];
  locations: Array<{ id: string; code: string; name: string }>;
  inventory: InventoryRow[];
  approveLocationId: string;
  onApproveLocationChange: (id: string) => void;
  locationOptions: ReactNode;
  orgCascadeFields: () => ReactNode;
  requestForm: {
    itemId: string;
    quantity: string;
    locationId: string;
    reason: string;
    departmentId: string;
  };
  setRequestForm: (next: Props["requestForm"]) => void;
  itemOptions: () => ReactNode;
  onCreateRequest: (e: FormEvent) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  saving: boolean;
  initialRequestId?: string | null;
};

function qty(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "0";
  return String(value);
}

export function SafetySupplyRequestsPanel({
  requests,
  locations,
  inventory,
  approveLocationId,
  onApproveLocationChange,
  locationOptions,
  orgCascadeFields,
  requestForm,
  setRequestForm,
  itemOptions,
  onCreateRequest,
  onRefresh,
  saving,
  initialRequestId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [employeeMessage, setEmployeeMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [partial, setPartial] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const data = await apiGet<RequestDetail>(
        `/api/v1/industrial/supplies/requests/${encodeURIComponent(id)}`,
      );
      setDetail(data);
      setEmployeeMessage(data.employeeMessage ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load request");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialRequestId) {
      setSelectedId(initialRequestId);
    }
  }, [initialRequestId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    return requests.filter((req) => {
      if (statusFilter && req.status !== statusFilter) return false;
      if (priorityFilter && (req.priority || "ROUTINE") !== priorityFilter) return false;
      return true;
    });
  }, [requests, statusFilter, priorityFilter]);

  const fulfillLocationId = approveLocationId || detail?.locationId || "";

  const inventoryWarnings = useMemo(() => {
    if (!detail?.items?.length || !fulfillLocationId) return [];
    const warnings: Array<{ label: string; available: number; needed: number; low: boolean }> = [];
    for (const line of detail.items) {
      if (!line.itemId) continue;
      const needed = Number(line.quantityApproved || line.quantityRequested || 0);
      if (!(needed > 0)) continue;
      const row = inventory.find(
        (inv) => inv.itemId === line.itemId && inv.locationId === fulfillLocationId,
      );
      const available = Number(row?.quantityAvailable ?? 0);
      const reorder = Number(row?.reorderPoint ?? 0);
      const name = line.itemName || line.customItemName || "Item";
      if (available < needed) {
        warnings.push({ label: name, available, needed, low: true });
      } else if (reorder > 0 && available - needed <= reorder) {
        warnings.push({ label: name, available, needed, low: false });
      }
    }
    return warnings;
  }, [detail, fulfillLocationId, inventory]);

  async function run(action: string, body: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setError("");
    try {
      await apiSend(
        `/api/v1/industrial/supplies/requests/${encodeURIComponent(selectedId)}/${action}`,
        "POST",
        body,
      );
      await onRefresh();
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  return (
    <div className="row g-3">
      <div className="col-lg-7">
        <div className="card">
          <div className="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <h5 className="mb-0">Supply requests</h5>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <select
                className="form-select form-select-sm"
                style={{ minWidth: 140 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {[
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "APPROVED",
                  "PARTIALLY_APPROVED",
                  "READY_FOR_PICKUP",
                  "PARTIALLY_FULFILLED",
                  "BACKORDERED",
                  "FULFILLED",
                  "DENIED",
                  "CANCELLED",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <select
                className="form-select form-select-sm"
                style={{ minWidth: 120 }}
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                aria-label="Filter by priority"
              >
                <option value="">All priorities</option>
                <option value="ROUTINE">Routine</option>
                <option value="NEEDED_SOON">Needed soon</option>
                <option value="URGENT">Urgent</option>
              </select>
              <label className="form-label mb-0 small" htmlFor="req-approve-loc">
                Fulfill-from
              </label>
              <select
                id="req-approve-loc"
                className="form-select form-select-sm"
                style={{ minWidth: 160 }}
                value={approveLocationId}
                onChange={(e) => onApproveLocationChange(e.target.value)}
              >
                <option value="">Use request location</option>
                {locationOptions}
              </select>
            </div>
          </div>
          {error ? <div className="alert alert-danger m-3 mb-0">{error}</div> : null}
          <div className="table-responsive">
            <table className="table mb-0 table-hover">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Needed by</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr
                    key={req.id}
                    className={selectedId === req.id ? "table-active" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedId(req.id)}
                  >
                    <td>
                      <code>{req.requestNumber}</code>
                      {req.contractorName ? (
                        <div className="small text-muted">{req.contractorName}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          req.priority === "URGENT"
                            ? "bg-danger"
                            : req.priority === "NEEDED_SOON"
                              ? "bg-warning text-dark"
                              : "bg-label-secondary"
                        }`}
                      >
                        {req.priority || "ROUTINE"}
                      </span>
                    </td>
                    <td>
                      <span className="badge bg-label-secondary">{req.status}</span>
                    </td>
                    <td className="small">{req.source || "—"}</td>
                    <td>{req.neededBy ?? "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted">
                      No requests yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId ? (
          <div className="card mt-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Request detail</h5>
              {detailLoading ? <span className="small text-muted">Loading…</span> : null}
            </div>
            <div className="card-body">
              {detail ? (
                <>
                  <div className="row g-2 mb-3">
                    <div className="col-md-4">
                      <div className="small text-muted">Number</div>
                      <code>{detail.requestNumber}</code>
                    </div>
                    <div className="col-md-4">
                      <div className="small text-muted">Status</div>
                      <strong>{detail.status}</strong>
                    </div>
                    <div className="col-md-4">
                      <div className="small text-muted">Requestor</div>
                      {detail.requestorType || "EMPLOYEE"}
                      {detail.contractorName ? ` — ${detail.contractorName}` : ""}
                    </div>
                    <div className="col-12">
                      <div className="small text-muted">Notes</div>
                      {detail.notes || detail.reason || "—"}
                    </div>
                  </div>

                  {inventoryWarnings.length > 0 ? (
                    <div className="alert alert-warning">
                      <strong>Inventory notice</strong>
                      <ul className="mb-0 mt-1">
                        {inventoryWarnings.map((w) => (
                          <li key={w.label}>
                            {w.label}: available {w.available}, needed {w.needed}
                            {w.low ? " (insufficient)" : " (near reorder)"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="table-responsive mb-3">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Requested</th>
                          <th>Approved</th>
                          <th>Issued</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((line) => (
                          <tr key={line.id}>
                            <td>
                              {line.itemName || line.customItemName || line.itemId || "Custom"}
                            </td>
                            <td>{qty(line.quantityRequested)}</td>
                            <td>{qty(line.quantityApproved)}</td>
                            <td>{qty(line.quantityIssued)}</td>
                            <td>{line.status || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="form-check mb-2">
                    <input
                      id="req-partial"
                      className="form-check-input"
                      type="checkbox"
                      checked={partial}
                      onChange={(e) => setPartial(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="req-partial">
                      Partial approve / fulfill
                    </label>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Employee message</label>
                    <input
                      className="form-control"
                      value={employeeMessage}
                      onChange={(e) => setEmployeeMessage(e.target.value)}
                      placeholder="Shown on public status page"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Deny reason</label>
                    <input
                      className="form-control"
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                    />
                  </div>

                  <div className="d-flex flex-wrap gap-2">
                    {["SUBMITTED", "PENDING"].includes(detail.status) ? (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        disabled={saving}
                        onClick={() => void run("review")}
                      >
                        Begin review
                      </button>
                    ) : null}
                    {["SUBMITTED", "PENDING", "UNDER_REVIEW"].includes(detail.status) ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          disabled={saving}
                          onClick={() =>
                            void run("approve", {
                              locationId: approveLocationId || undefined,
                              partial,
                              employeeMessage: employeeMessage || undefined,
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          disabled={saving || !denyReason.trim()}
                          onClick={() =>
                            void run("deny", {
                              reason: denyReason,
                              employeeMessage: employeeMessage || undefined,
                            })
                          }
                        >
                          Deny
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-warning btn-sm"
                          disabled={saving}
                          onClick={() =>
                            void run("backorder", {
                              reason: denyReason || "Backordered",
                              employeeMessage: employeeMessage || undefined,
                            })
                          }
                        >
                          Backorder
                        </button>
                      </>
                    ) : null}
                    {["APPROVED", "PARTIALLY_APPROVED"].includes(detail.status) ? (
                      <button
                        type="button"
                        className="btn btn-outline-info btn-sm"
                        disabled={saving}
                        onClick={() =>
                          void run("ready", {
                            employeeMessage: employeeMessage || "Ready for pickup",
                          })
                        }
                      >
                        Ready for pickup
                      </button>
                    ) : null}
                    {["APPROVED", "PARTIALLY_APPROVED", "READY_FOR_PICKUP"].includes(
                      detail.status,
                    ) ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={saving}
                        onClick={() =>
                          void run("fulfill", {
                            locationId: approveLocationId || undefined,
                            partial,
                            employeeMessage: employeeMessage || undefined,
                          })
                        }
                      >
                        Fulfill
                      </button>
                    ) : null}
                    {!["FULFILLED", "DENIED", "CANCELLED"].includes(detail.status) ? (
                      <button
                        type="button"
                        className="btn btn-outline-dark btn-sm"
                        disabled={saving}
                        onClick={() => void run("cancel", { reason: denyReason || undefined })}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>

                  {detail.events?.length ? (
                    <div className="mt-4">
                      <h6>Activity</h6>
                      <ul className="list-group list-group-flush">
                        {detail.events.map((ev) => (
                          <li key={ev.id} className="list-group-item px-0">
                            <div className="fw-semibold">{ev.eventType.replace(/_/g, " ")}</div>
                            <div className="small text-muted">
                              {ev.previousStatus || "—"} → {ev.newStatus || "—"}
                              {ev.createdAt ? ` · ${new Date(ev.createdAt).toLocaleString()}` : ""}
                            </div>
                            {ev.notes ? <div className="small">{ev.notes}</div> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-muted mb-0">Select a request to review.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="col-lg-5">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">Create request</h5>
            <form onSubmit={(e) => void onCreateRequest(e)}>
              {orgCascadeFields()}
              <div className="mb-3">
                <label className="form-label" htmlFor="req-item">
                  Item
                </label>
                <select
                  id="req-item"
                  className="form-select"
                  value={requestForm.itemId}
                  onChange={(e) => setRequestForm({ ...requestForm, itemId: e.target.value })}
                  required
                >
                  <option value="">Select item</option>
                  {itemOptions()}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="req-qty">
                  Quantity
                </label>
                <input
                  id="req-qty"
                  type="number"
                  min={0.0001}
                  step="any"
                  className="form-control"
                  value={requestForm.quantity}
                  onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="req-loc">
                  Location (optional)
                </label>
                <select
                  id="req-loc"
                  className="form-select"
                  value={requestForm.locationId}
                  onChange={(e) => setRequestForm({ ...requestForm, locationId: e.target.value })}
                >
                  <option value="">None</option>
                  {locationOptions}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="req-reason">
                  Reason (optional)
                </label>
                <input
                  id="req-reason"
                  className="form-control"
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Submitting…" : "Submit request"}
              </button>
            </form>
            {locations.length === 0 ? (
              <p className="small text-muted mt-3 mb-0">Add locations to enable fulfillment.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
