"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { loadOrgFilterCatalogs } from "@/lib/personnel-lookups";
import {
  DEFAULT_SUPPLIES_REPORT_FILTERS,
  SUPPLIES_REPORT_PRESETS,
  SUPPLIES_REPORT_TYPES,
  SUPPLIES_TRANSACTION_TYPES,
  buildSuppliesReportCsv,
  buildSuppliesReportQuery,
  defaultFieldsForReportType,
  downloadSuppliesReportCsv,
  fieldsForReportType,
  formatSuppliesReportCell,
  loadSuppliesCustomReports,
  normalizeSuppliesReportFields,
  relativeDate,
  saveSuppliesCustomReports,
  slugifySuppliesReportName,
  todayIso,
  type SuppliesCustomReportTemplate,
  type SuppliesReportFilters,
  type SuppliesReportType,
} from "@/lib/safety-supplies-reports";

type Option = { id: string; label: string };

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page?: number;
  pageSize?: number;
  total?: number;
  reportType?: string;
};

const INVENTORY_TYPES = [
  "CONSUMABLE",
  "REUSABLE",
  "SERIALIZED",
  "LOT_CONTROLLED",
  "EMPLOYEE_ASSIGNED",
] as const;

function newTemplateId(): string {
  return `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SafetySuppliesReportBuilder({
  items,
  locations,
  categories,
  sites = [],
  onError,
}: {
  items: Option[];
  locations: Option[];
  categories: Option[];
  sites?: Option[];
  onError: (msg: string) => void;
}) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";

  const [reportName, setReportName] = useState("Custom supplies report");
  const [filters, setFilters] = useState<SuppliesReportFilters>(DEFAULT_SUPPLIES_REPORT_FILTERS);
  const [selectedFields, setSelectedFields] = useState<string[]>(
    defaultFieldsForReportType("transactions"),
  );
  const [savedReports, setSavedReports] = useState<SuppliesCustomReportTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);

  useEffect(() => {
    setSavedReports(loadSuppliesCustomReports(tenantId));
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const catalogs = await loadOrgFilterCatalogs(tenantId || undefined);
        if (cancelled) return;
        setDepartments(
          catalogs.departments.map((d) => ({
            id: d.id,
            label: d.label || d.id,
          })),
        );
        setDivisions(
          [
            ...new Set((catalogs.divisions ?? []).map((d) => String(d).trim()).filter(Boolean)),
          ].sort((a, b) => a.localeCompare(b)),
        );
      } catch {
        if (!cancelled) {
          setDepartments([]);
          setDivisions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const availableFields = useMemo(
    () => fieldsForReportType(filters.reportType),
    [filters.reportType],
  );

  const fieldGroups = useMemo(() => {
    const map = new Map<string, typeof availableFields>();
    for (const field of availableFields) {
      const list = map.get(field.group) ?? [];
      list.push(field);
      map.set(field.group, list);
    }
    return map;
  }, [availableFields]);

  const activeFields = useMemo(
    () => normalizeSuppliesReportFields(selectedFields, filters.reportType),
    [selectedFields, filters.reportType],
  );

  const patchFilters = useCallback((patch: Partial<SuppliesReportFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (patch.reportType && patch.reportType !== prev.reportType) {
        setSelectedFields(defaultFieldsForReportType(patch.reportType));
      }
      return next;
    });
    setActiveTemplateId(null);
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<ListResponse>("/api/v1/industrial/supplies/reports/custom", {
        query: buildSuppliesReportQuery(filters),
      });
      setRows(res.items ?? []);
      setTotal(res.total ?? res.items?.length ?? 0);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not run supplies report");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, onError]);

  function toggleField(id: string) {
    setSelectedFields((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
    setActiveTemplateId(null);
  }

  function applyPreset(presetId: string) {
    const preset = SUPPLIES_REPORT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const nextFilters: SuppliesReportFilters = {
      ...DEFAULT_SUPPLIES_REPORT_FILTERS,
      ...preset.filters,
      reportType: (preset.filters?.reportType ?? "transactions") as SuppliesReportType,
    };
    if (preset.relativeDays) {
      nextFilters.dateFrom = relativeDate(-preset.relativeDays);
      nextFilters.dateTo = todayIso();
    }
    setReportName(preset.name);
    setFilters(nextFilters);
    setSelectedFields(normalizeSuppliesReportFields(preset.fields, nextFilters.reportType));
    setActiveTemplateId(null);
  }

  function loadTemplate(template: SuppliesCustomReportTemplate) {
    const reportType = template.filters.reportType ?? "transactions";
    setReportName(template.name);
    setFilters({ ...DEFAULT_SUPPLIES_REPORT_FILTERS, ...template.filters, reportType });
    setSelectedFields(normalizeSuppliesReportFields(template.fields, reportType));
    setActiveTemplateId(template.id);
  }

  function saveTemplate() {
    if (!tenantId) return;
    const name = reportName.trim();
    if (!name) {
      onError("Enter a name for this custom report.");
      return;
    }
    if (activeFields.length === 0) {
      onError("Select at least one column for the report.");
      return;
    }
    const now = new Date().toISOString();
    const existing = savedReports.find((t) => t.id === activeTemplateId);
    const next: SuppliesCustomReportTemplate = existing
      ? {
          ...existing,
          name,
          fields: activeFields,
          filters: { ...filters },
          updatedAt: now,
        }
      : {
          id: newTemplateId(),
          name,
          fields: activeFields,
          filters: { ...filters },
          createdAt: now,
          updatedAt: now,
        };
    const merged = existing
      ? savedReports.map((t) => (t.id === existing.id ? next : t))
      : [next, ...savedReports];
    setSavedReports(merged);
    saveSuppliesCustomReports(tenantId, merged);
    setSaveNotice(existing ? `Updated “${name}”.` : `Saved “${name}”.`);
    setReportName("Custom supplies report");
    setFilters(DEFAULT_SUPPLIES_REPORT_FILTERS);
    setSelectedFields(defaultFieldsForReportType("transactions"));
    setActiveTemplateId(null);
  }

  function deleteTemplate(id: string) {
    if (!tenantId) return;
    const merged = savedReports.filter((t) => t.id !== id);
    setSavedReports(merged);
    saveSuppliesCustomReports(tenantId, merged);
    if (activeTemplateId === id) setActiveTemplateId(null);
  }

  function exportCsv() {
    if (activeFields.length === 0) {
      onError("Select at least one column to export.");
      return;
    }
    const csv = buildSuppliesReportCsv(rows, activeFields);
    downloadSuppliesReportCsv(slugifySuppliesReportName(reportName), csv);
  }

  const showDateFilters =
    filters.reportType === "transactions" ||
    filters.reportType === "usage" ||
    filters.reportType === "ppe";
  const showTxnType = filters.reportType === "transactions";
  const showLocation = filters.reportType === "inventory" || filters.reportType === "expiring";
  const showSourceDest = filters.reportType === "transactions";
  const showOrg =
    filters.reportType === "transactions" ||
    filters.reportType === "usage" ||
    filters.reportType === "ppe";
  const showStatus = filters.reportType === "ppe" || filters.reportType === "expiring";
  const showDays = filters.reportType === "expiring";
  const showInventoryType =
    filters.reportType === "transactions" ||
    filters.reportType === "usage" ||
    filters.reportType === "inventory";

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card border shadow-none">
        <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h6 className="card-title mb-0">Custom report builder</h6>
            <p className="text-muted small mb-0">
              Filter by items, dates, locations, divisions, departments, and more — then choose
              columns and export CSV.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={loading}
              onClick={() => void runReport()}
            >
              {loading ? "Running…" : "Run report"}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={loading || rows.length === 0}
              onClick={exportCsv}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={saveTemplate}
            >
              Save template
            </button>
          </div>
        </div>
        <div className="card-body">
          {saveNotice ? (
            <div className="alert alert-success py-2" role="status">
              {saveNotice}
            </div>
          ) : null}
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="supplies-report-name">
                Report name
              </label>
              <input
                id="supplies-report-name"
                className="form-control form-control-sm"
                value={reportName}
                onChange={(e) => {
                  setReportName(e.target.value);
                  setSaveNotice(null);
                }}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="supplies-report-type">
                Report type
              </label>
              <select
                id="supplies-report-type"
                className="form-select form-select-sm"
                value={filters.reportType}
                onChange={(e) => patchFilters({ reportType: e.target.value as SuppliesReportType })}
              >
                {SUPPLIES_REPORT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="supplies-report-preset">
                Quick presets
              </label>
              <select
                id="supplies-report-preset"
                className="form-select form-select-sm"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyPreset(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Apply a preset…</option>
                {SUPPLIES_REPORT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row g-3">
            {showDateFilters ? (
              <>
                <div className="col-6 col-md-3">
                  <label className="form-label" htmlFor="supplies-report-from">
                    Date from
                  </label>
                  <input
                    id="supplies-report-from"
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.dateFrom}
                    onChange={(e) => patchFilters({ dateFrom: e.target.value })}
                  />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label" htmlFor="supplies-report-to">
                    Date to
                  </label>
                  <input
                    id="supplies-report-to"
                    type="date"
                    className="form-control form-control-sm"
                    value={filters.dateTo}
                    onChange={(e) => patchFilters({ dateTo: e.target.value })}
                  />
                </div>
              </>
            ) : null}

            {showDays ? (
              <div className="col-6 col-md-3">
                <label className="form-label" htmlFor="supplies-report-days">
                  Days ahead
                </label>
                <input
                  id="supplies-report-days"
                  type="number"
                  min={1}
                  className="form-control form-control-sm"
                  value={filters.days}
                  onChange={(e) => patchFilters({ days: e.target.value })}
                />
              </div>
            ) : null}

            <div className="col-md-3">
              <label className="form-label" htmlFor="supplies-report-item">
                Item
              </label>
              <select
                id="supplies-report-item"
                className="form-select form-select-sm"
                value={filters.itemId}
                onChange={(e) => patchFilters({ itemId: e.target.value })}
              >
                <option value="">All items</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label" htmlFor="supplies-report-site">
                Facility location
              </label>
              <select
                id="supplies-report-site"
                className="form-select form-select-sm"
                value={filters.siteId}
                onChange={(e) => patchFilters({ siteId: e.target.value })}
              >
                <option value="">All facilities</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label" htmlFor="supplies-report-category">
                Category
              </label>
              <select
                id="supplies-report-category"
                className="form-select form-select-sm"
                value={filters.categoryId}
                onChange={(e) => patchFilters({ categoryId: e.target.value })}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {showInventoryType ? (
              <div className="col-md-3">
                <label className="form-label" htmlFor="supplies-report-inv-type">
                  Inventory type
                </label>
                <select
                  id="supplies-report-inv-type"
                  className="form-select form-select-sm"
                  value={filters.inventoryType}
                  onChange={(e) => patchFilters({ inventoryType: e.target.value })}
                >
                  <option value="">All types</option>
                  {INVENTORY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showLocation ? (
              <div className="col-md-3">
                <label className="form-label" htmlFor="supplies-report-location">
                  Location
                </label>
                <select
                  id="supplies-report-location"
                  className="form-select form-select-sm"
                  value={filters.locationId}
                  onChange={(e) => patchFilters({ locationId: e.target.value })}
                >
                  <option value="">All locations</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showSourceDest ? (
              <>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="supplies-report-source">
                    Source location
                  </label>
                  <select
                    id="supplies-report-source"
                    className="form-select form-select-sm"
                    value={filters.sourceLocationId}
                    onChange={(e) => patchFilters({ sourceLocationId: e.target.value })}
                  >
                    <option value="">Any source</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="supplies-report-dest">
                    Destination location
                  </label>
                  <select
                    id="supplies-report-dest"
                    className="form-select form-select-sm"
                    value={filters.destinationLocationId}
                    onChange={(e) => patchFilters({ destinationLocationId: e.target.value })}
                  >
                    <option value="">Any destination</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="supplies-report-either-loc">
                    Any location (source or dest)
                  </label>
                  <select
                    id="supplies-report-either-loc"
                    className="form-select form-select-sm"
                    value={filters.locationId}
                    onChange={(e) => patchFilters({ locationId: e.target.value })}
                  >
                    <option value="">Any</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {showTxnType ? (
              <div className="col-md-3">
                <label className="form-label" htmlFor="supplies-report-txn-type">
                  Transaction type
                </label>
                <select
                  id="supplies-report-txn-type"
                  className="form-select form-select-sm"
                  value={filters.transactionType}
                  onChange={(e) => patchFilters({ transactionType: e.target.value })}
                >
                  <option value="">All types</option>
                  {SUPPLIES_TRANSACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showOrg ? (
              <>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="supplies-report-division">
                    Division
                  </label>
                  <select
                    id="supplies-report-division"
                    className="form-select form-select-sm"
                    value={filters.divisionName}
                    onChange={(e) => patchFilters({ divisionName: e.target.value })}
                  >
                    <option value="">All divisions</option>
                    {divisions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="supplies-report-department">
                    Department
                  </label>
                  <select
                    id="supplies-report-department"
                    className="form-select form-select-sm"
                    value={filters.departmentId}
                    onChange={(e) => patchFilters({ departmentId: e.target.value })}
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {showStatus ? (
              <div className="col-md-3">
                <label className="form-label" htmlFor="supplies-report-status">
                  Status
                </label>
                <select
                  id="supplies-report-status"
                  className="form-select form-select-sm"
                  value={filters.status}
                  onChange={(e) => patchFilters({ status: e.target.value })}
                >
                  <option value="">All statuses</option>
                  {filters.reportType === "ppe" ? (
                    <>
                      <option value="ASSIGNED">ASSIGNED</option>
                      <option value="RETURNED">RETURNED</option>
                      <option value="LOST">LOST</option>
                    </>
                  ) : (
                    <>
                      <option value="CURRENT">CURRENT</option>
                      <option value="EXPIRED">EXPIRED</option>
                      <option value="QUARANTINED">QUARANTINED</option>
                    </>
                  )}
                </select>
              </div>
            ) : null}

            <div className="col-md-6">
              <label className="form-label" htmlFor="supplies-report-q">
                Search
              </label>
              <input
                id="supplies-report-q"
                className="form-control form-control-sm"
                placeholder="Item, personnel, lot, reason…"
                value={filters.q}
                onChange={(e) => patchFilters({ q: e.target.value })}
              />
            </div>
          </div>

          <hr className="my-3" />

          <div className="row g-3">
            {[...fieldGroups.entries()].map(([group, fields]) => (
              <div key={group} className="col-md-4">
                <div className="fw-semibold small mb-2">{group}</div>
                <div className="d-flex flex-column gap-1">
                  {fields.map((field) => (
                    <label key={field.id} className="form-check small mb-0">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={activeFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                      />
                      <span className="form-check-label">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {savedReports.length > 0 ? (
            <>
              <hr className="my-3" />
              <div className="fw-semibold small mb-2">Saved templates</div>
              <div className="d-flex flex-wrap gap-2">
                {savedReports.map((tpl) => (
                  <div key={tpl.id} className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn ${activeTemplateId === tpl.id ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => loadTemplate(tpl)}
                    >
                      {tpl.name}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      title="Delete template"
                      onClick={() => deleteTemplate(tpl.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="card border shadow-none">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="card-title mb-0">Results</h6>
          <span className="text-muted small">
            {loading ? "Loading…" : `${rows.length} shown${total ? ` of ${total}` : ""}`}
          </span>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0">
            <thead>
              <tr>
                {activeFields.map((id) => {
                  const field = availableFields.find((f) => f.id === id);
                  return (
                    <th key={id} scope="col">
                      {field?.label ?? id}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(activeFields.length, 1)} className="text-muted">
                    {loading ? "Running report…" : "No rows yet. Set filters and click Run report."}
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={String(row.id ?? `${row.itemId ?? "row"}-${idx}`)}>
                    {activeFields.map((id) => (
                      <td key={id}>{formatSuppliesReportCell(row[id]) || "—"}</td>
                    ))}
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
