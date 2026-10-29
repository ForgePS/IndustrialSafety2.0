"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import {
  createPrinterGroup,
  createPrintRoutingRule,
  deletePrinterGroup,
  deletePrintRoutingRule,
  listPrinterGroups,
  listPrintRoutingRules,
  listPrinters,
  patchPrinterGroup,
  patchPrintRoutingRule,
  printerDisplayName,
  resolvePrintRoute,
  type ForgePrinter,
  type PrinterGroup,
  type PrintRoutingRule,
  type ResolvePrintRouteResult,
} from "@/lib/print-api";

function emptyOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function PrintManagerGroupsPanel() {
  const { hasAnyPermission } = useAuth();
  const canManage = hasAnyPermission([
    "industrial.printer.manage_defaults",
    "industrial.printer.manage",
    "industrial.admin",
  ]);

  const [groups, setGroups] = useState<PrinterGroup[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextGroups, nextPrinters] = await Promise.all([
        listPrinterGroups(),
        listPrinters().catch(() => [] as ForgePrinter[]),
      ]);
      setGroups(nextGroups);
      setPrinters(nextPrinters.filter((p) => p.enabled));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load printer groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const printerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of printers) map.set(p.id, printerDisplayName(p));
    return map;
  }, [printers]);

  function toggleMember(printerId: string) {
    setMemberIds((prev) => {
      if (prev.includes(printerId)) {
        const next = prev.filter((id) => id !== printerId);
        if (primaryId === printerId) setPrimaryId(next[0] ?? "");
        return next;
      }
      const next = [...prev, printerId];
      if (!primaryId) setPrimaryId(printerId);
      return next;
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !name.trim() || memberIds.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createPrinterGroup({
        name: name.trim(),
        strategy: "PRIMARY_FAILOVER",
        members: memberIds.map((printerId, index) => ({
          printerId,
          sortOrder: index,
          isPrimary: printerId === (primaryId || memberIds[0]),
        })),
      });
      setName("");
      setMemberIds([]);
      setPrimaryId("");
      setMessage("Printer group created.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create group.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleEnabled(group: PrinterGroup) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      await patchPrinterGroup(group.id, { enabled: !group.enabled });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update group.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(group: PrinterGroup) {
    if (!canManage) return;
    if (!window.confirm(`Delete printer group “${group.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deletePrinterGroup(group.id);
      setMessage(`Deleted group ${group.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="alert">
          {message}
        </div>
      ) : null}

      <p className="text-muted small mb-3">
        Groups pick a printer for failover. Phase 3 uses PRIMARY_FAILOVER (primary member first,
        then sort order).
      </p>

      {canManage ? (
        <form className="card border shadow-none mb-4" onSubmit={(e) => void onCreate(e)}>
          <div className="card-header">
            <h6 className="mb-0">New printer group</h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label" htmlFor="group-name">
                  Name
                </label>
                <input
                  id="group-name"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="col-md-8">
                <div className="form-label">Members</div>
                <div className="border rounded p-2" style={{ maxHeight: 180, overflow: "auto" }}>
                  {printers.length === 0 ? (
                    <div className="text-muted small">No published printers available.</div>
                  ) : (
                    printers.map((p) => (
                      <label key={p.id} className="d-flex align-items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={memberIds.includes(p.id)}
                          onChange={() => toggleMember(p.id)}
                        />
                        <span>{printerDisplayName(p)}</span>
                        {memberIds.includes(p.id) ? (
                          <button
                            type="button"
                            className={`btn btn-sm ${primaryId === p.id ? "btn-primary" : "btn-outline-secondary"}`}
                            onClick={() => setPrimaryId(p.id)}
                          >
                            {primaryId === p.id ? "Primary" : "Make primary"}
                          </button>
                        ) : null}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !name.trim() || memberIds.length === 0}
              >
                Create group
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Group</th>
                <th>Strategy</th>
                <th>Members</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Loading groups…
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted">
                    No printer groups yet.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="font-monospace small">{g.strategy}</td>
                    <td className="small">
                      {g.members.length === 0
                        ? "—"
                        : g.members
                            .map((m) => {
                              const label =
                                printerNameById.get(m.printerId) ?? m.printerId.slice(0, 8);
                              return m.isPrimary ? `${label} (primary)` : label;
                            })
                            .join(", ")}
                    </td>
                    <td>
                      <span
                        className={`badge ${g.enabled ? "bg-label-success" : "bg-label-secondary"}`}
                      >
                        {g.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="text-end">
                      {canManage ? (
                        <div className="d-inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busy}
                            onClick={() => void onToggleEnabled(g)}
                          >
                            {g.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busy}
                            onClick={() => void onDelete(g)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </td>
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

export function PrintManagerRoutingPanel() {
  const { hasAnyPermission } = useAuth();
  const canManage = hasAnyPermission([
    "industrial.printer.manage_defaults",
    "industrial.printer.manage",
    "industrial.admin",
  ]);

  const [rules, setRules] = useState<PrintRoutingRule[]>([]);
  const [groups, setGroups] = useState<PrinterGroup[]>([]);
  const [printers, setPrinters] = useState<ForgePrinter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [moduleCond, setModuleCond] = useState("");
  const [recordTypeCond, setRecordTypeCond] = useState("");
  const [actionTarget, setActionTarget] = useState<"printer" | "group">("printer");
  const [actionPrinterId, setActionPrinterId] = useState("");
  const [actionGroupId, setActionGroupId] = useState("");

  const [previewModule, setPreviewModule] = useState("");
  const [previewRecordType, setPreviewRecordType] = useState("");
  const [preview, setPreview] = useState<ResolvePrintRouteResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextRules, nextGroups, nextPrinters] = await Promise.all([
        listPrintRoutingRules(),
        listPrinterGroups().catch(() => [] as PrinterGroup[]),
        listPrinters().catch(() => [] as ForgePrinter[]),
      ]);
      setRules(nextRules);
      setGroups(nextGroups);
      setPrinters(nextPrinters.filter((p) => p.enabled));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load routing rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const printerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of printers) map.set(p.id, printerDisplayName(p));
    return map;
  }, [printers]);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }, [groups]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !name.trim()) return;
    const action =
      actionTarget === "group"
        ? { printerGroupId: actionGroupId || null }
        : { printerId: actionPrinterId || null };
    if (!action.printerId && !action.printerGroupId) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await createPrintRoutingRule({
        name: name.trim(),
        priority,
        conditions: {
          module: emptyOrNull(moduleCond),
          recordType: emptyOrNull(recordTypeCond),
        },
        action,
      });
      setName("");
      setPriority(100);
      setModuleCond("");
      setRecordTypeCond("");
      setActionPrinterId("");
      setActionGroupId("");
      setMessage("Routing rule created.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create rule.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleEnabled(rule: PrintRoutingRule) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      await patchPrintRoutingRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update rule.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(rule: PrintRoutingRule) {
    if (!canManage) return;
    if (!window.confirm(`Delete routing rule “${rule.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deletePrintRoutingRule(rule.id);
      setMessage(`Deleted rule ${rule.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete rule.");
    } finally {
      setBusy(false);
    }
  }

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await resolvePrintRoute({
        ...(previewModule.trim() ? { module: previewModule.trim() } : {}),
        ...(previewRecordType.trim() ? { recordType: previewRecordType.trim() } : {}),
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Could not resolve route.");
    } finally {
      setBusy(false);
    }
  }

  function actionLabel(rule: PrintRoutingRule): string {
    if (rule.action.printerId) {
      return printerNameById.get(rule.action.printerId) ?? rule.action.printerId.slice(0, 8);
    }
    if (rule.action.printerGroupId) {
      const g = groupNameById.get(rule.action.printerGroupId);
      return g ? `Group: ${g}` : `Group ${rule.action.printerGroupId.slice(0, 8)}`;
    }
    return "—";
  }

  function conditionsLabel(rule: PrintRoutingRule): string {
    const parts = [
      rule.conditions.module ? `module=${rule.conditions.module}` : null,
      rule.conditions.recordType ? `recordType=${rule.conditions.recordType}` : null,
      rule.conditions.locationId ? `location=${rule.conditions.locationId.slice(0, 8)}` : null,
      rule.conditions.divisionId ? `division=${rule.conditions.divisionId.slice(0, 8)}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "Any";
  }

  return (
    <div>
      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="alert">
          {message}
        </div>
      ) : null}

      <p className="text-muted small mb-3">
        Precedence: explicit printer → highest-priority matching rule → tenant default printer. Jobs
        record <code>job.routing.completed</code> and <code>job.failover.accepted</code> events.
      </p>

      {canManage ? (
        <form className="card border shadow-none mb-4" onSubmit={(e) => void onCreate(e)}>
          <div className="card-header">
            <h6 className="mb-0">New routing rule</h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label" htmlFor="rule-name">
                  Name
                </label>
                <input
                  id="rule-name"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label" htmlFor="rule-priority">
                  Priority
                </label>
                <input
                  id="rule-priority"
                  type="number"
                  className="form-control"
                  min={0}
                  max={10000}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) || 0)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="rule-module">
                  Module (optional)
                </label>
                <input
                  id="rule-module"
                  className="form-control"
                  placeholder="e.g. FLEET"
                  value={moduleCond}
                  onChange={(e) => setModuleCond(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="rule-record-type">
                  Record type (optional)
                </label>
                <input
                  id="rule-record-type"
                  className="form-control"
                  placeholder="e.g. fleet_vehicle"
                  value={recordTypeCond}
                  onChange={(e) => setRecordTypeCond(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label" htmlFor="rule-action-type">
                  Route to
                </label>
                <select
                  id="rule-action-type"
                  className="form-select"
                  value={actionTarget}
                  onChange={(e) => setActionTarget(e.target.value as "printer" | "group")}
                >
                  <option value="printer">Printer</option>
                  <option value="group">Printer group</option>
                </select>
              </div>
              <div className="col-md-5">
                {actionTarget === "printer" ? (
                  <>
                    <label className="form-label" htmlFor="rule-printer">
                      Printer
                    </label>
                    <select
                      id="rule-printer"
                      className="form-select"
                      value={actionPrinterId}
                      onChange={(e) => setActionPrinterId(e.target.value)}
                      required
                    >
                      <option value="">Select printer…</option>
                      {printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {printerDisplayName(p)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="form-label" htmlFor="rule-group">
                      Printer group
                    </label>
                    <select
                      id="rule-group"
                      className="form-select"
                      value={actionGroupId}
                      onChange={(e) => setActionGroupId(e.target.value)}
                      required
                    >
                      <option value="">Select group…</option>
                      {groups
                        .filter((g) => g.enabled)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !name.trim()}
              >
                Create rule
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <form className="card border shadow-none mb-4" onSubmit={(e) => void onPreview(e)}>
        <div className="card-header">
          <h6 className="mb-0">Preview route</h6>
        </div>
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label" htmlFor="preview-module">
                Module
              </label>
              <input
                id="preview-module"
                className="form-control"
                value={previewModule}
                onChange={(e) => setPreviewModule(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="preview-record-type">
                Record type
              </label>
              <input
                id="preview-record-type"
                className="form-control"
                value={previewRecordType}
                onChange={(e) => setPreviewRecordType(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <button type="submit" className="btn btn-outline-primary btn-sm" disabled={busy}>
                Resolve
              </button>
            </div>
          </div>
          {preview ? (
            <div className="mt-3 small">
              <div>
                <strong>Printer:</strong>{" "}
                {preview.printer
                  ? printerDisplayName(preview.printer)
                  : preview.printerId.slice(0, 8)}
              </div>
              <div>
                <strong>Source:</strong> {preview.source}
              </div>
              <div>
                <strong>Reason:</strong> {preview.reason}
              </div>
              {preview.ruleName ? (
                <div>
                  <strong>Rule:</strong> {preview.ruleName}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>

      <div className="card border shadow-none">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Name</th>
                <th>Conditions</th>
                <th>Action</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    Loading rules…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No routing rules yet. Without a rule, jobs need an explicit printer or a tenant
                    default.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="font-monospace">{rule.priority}</td>
                    <td>{rule.name}</td>
                    <td className="small">{conditionsLabel(rule)}</td>
                    <td className="small">{actionLabel(rule)}</td>
                    <td>
                      <span
                        className={`badge ${rule.enabled ? "bg-label-success" : "bg-label-secondary"}`}
                      >
                        {rule.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="text-end">
                      {canManage ? (
                        <div className="d-inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busy}
                            onClick={() => void onToggleEnabled(rule)}
                          >
                            {rule.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            disabled={busy}
                            onClick={() => void onDelete(rule)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </td>
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
