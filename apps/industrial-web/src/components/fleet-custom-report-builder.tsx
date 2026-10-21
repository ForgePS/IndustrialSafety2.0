"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import {
  DEFAULT_FLEET_REPORT_FILTERS,
  FLEET_REPORT_FIELDS,
  FLEET_REPORT_GROUPS,
  FLEET_REPORT_PRESETS,
  buildFleetReportCsv,
  filterFleetReportRows,
  formatFleetReportCell,
  loadFleetCustomReports,
  normalizeFleetReportFields,
  saveFleetCustomReports,
  slugifyFleetReportName,
  type FleetCustomReportTemplate,
  type FleetReportFilters,
} from "@/lib/fleet-reports";
import { FLEET_ASSET_STATUS_OPTIONS, FLEET_ASSET_TYPE_OPTIONS } from "@/lib/fleet";
import { printFleetReport } from "@/lib/fleet-print";
import { FleetPrintHeader } from "@/components/fleet-print-header";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};

function newTemplateId(): string {
  return `rpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FleetCustomReportBuilder({ onError }: { onError: (msg: string) => void }) {
  const { me } = useAuth();
  const tenantId = me?.tenantId ?? "";

  const [reportName, setReportName] = useState("Custom asset report");
  const [selectedFields, setSelectedFields] = useState<string[]>(
    FLEET_REPORT_PRESETS[0]!.fields,
  );
  const [filters, setFilters] = useState<FleetReportFilters>(DEFAULT_FLEET_REPORT_FILTERS);
  const [savedReports, setSavedReports] = useState<FleetCustomReportTemplate[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [printMounted, setPrintMounted] = useState(false);

  useEffect(() => {
    setPrintMounted(true);
  }, []);

  useEffect(() => {
    setSavedReports(loadFleetCustomReports(tenantId));
  }, [tenantId]);

  const fieldGroups = useMemo(() => {
    const map = new Map<string, typeof FLEET_REPORT_FIELDS>();
    for (const group of FLEET_REPORT_GROUPS) {
      map.set(
        group,
        FLEET_REPORT_FIELDS.filter((f) => f.group === group),
      );
    }
    return map;
  }, []);

  const filteredRows = useMemo(
    () => filterFleetReportRows(rows, filters),
    [rows, filters],
  );

  const activeFields = useMemo(
    () => normalizeFleetReportFields(selectedFields),
    [selectedFields],
  );

  const loadFleetRows = useCallback(async () => {
    setLoading(true);
    try {
      const all: Array<Record<string, unknown>> = [];
      let page = 1;
      const pageSize = 500;
      for (;;) {
        const res = await apiGet<ListResponse>("/api/v1/industrial/fleet/vehicles", {
          query: {
            page: String(page),
            pageSize: String(pageSize),
            ...(filters.includeRemoved ? { removed: "true" } : {}),
            ...(filters.assetType ? { assetType: filters.assetType } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.insured ? { insured: filters.insured } : {}),
          },
        });
        all.push(...(res.items ?? []));
        if (!res.items?.length || all.length >= (res.total ?? all.length)) break;
        if ((res.items?.length ?? 0) < pageSize) break;
        page += 1;
        if (page > 20) break;
      }
      setRows(all);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not load fleet assets for report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    filters.assetType,
    filters.includeRemoved,
    filters.insured,
    filters.status,
    onError,
  ]);

  useEffect(() => {
    void loadFleetRows();
  }, [loadFleetRows]);

  function toggleField(id: string) {
    setSelectedFields((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
    setActiveTemplateId(null);
  }

  function applyPreset(presetId: string) {
    const preset = FLEET_REPORT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setReportName(preset.name);
    setSelectedFields([...preset.fields]);
    if (preset.filters) {
      setFilters({ ...DEFAULT_FLEET_REPORT_FILTERS, ...preset.filters });
    }
    setActiveTemplateId(null);
  }

  function loadTemplate(template: FleetCustomReportTemplate) {
    setReportName(template.name);
    setSelectedFields([...template.fields]);
    setFilters({ ...DEFAULT_FLEET_REPORT_FILTERS, ...template.filters });
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
    const next: FleetCustomReportTemplate = existing
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
    saveFleetCustomReports(tenantId, merged);
    setSaveNotice(existing ? `Updated “${name}”.` : `Saved “${name}”.`);
    setReportName("Custom asset report");
    setSelectedFields(FLEET_REPORT_PRESETS[0]!.fields);
    setFilters(DEFAULT_FLEET_REPORT_FILTERS);
    setActiveTemplateId(null);
  }

  function deleteTemplate(id: string) {
    if (!tenantId) return;
    const merged = savedReports.filter((t) => t.id !== id);
    setSavedReports(merged);
    saveFleetCustomReports(tenantId, merged);
    if (activeTemplateId === id) setActiveTemplateId(null);
  }

  function exportCsv() {
    if (activeFields.length === 0) {
      onError("Select at least one column for the report.");
      return;
    }
    const csv = buildFleetReportCsv(filteredRows, activeFields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-${slugifyFleetReportName(reportName) || "custom-report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    if (activeFields.length === 0) {
      onError("Select at least one column for the report.");
      return;
    }
    printFleetReport();
  }

  const customPrintReport = (
    <div className="fleet-custom-report__print-only card" aria-hidden="true">
      <div className="card-body">
        <FleetPrintHeader
          title={reportName.trim() || "Fleet asset report"}
          subtitle={`${filteredRows.length} asset${filteredRows.length === 1 ? "" : "s"} · Printed ${new Date().toLocaleString()}`}
        />
        <table className="table table-sm table-bordered mb-0">
          <thead>
            <tr>
              {activeFields.map((id) => (
                <th key={id}>{FLEET_REPORT_FIELDS.find((f) => f.id === id)?.label ?? id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={String(row.id)}>
                {activeFields.map((id) => (
                  <td key={id}>{formatFleetReportCell(row[id])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <>
      <div className="fleet-custom-report">
      <div className="card border shadow-none mb-4">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h6 className="card-title mb-0">Custom asset report</h6>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={loading}
              onClick={() => void loadFleetRows()}
            >
              Refresh data
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={loading || activeFields.length === 0}
              onClick={() => exportCsv()}
            >
              <i className="bx bx-download me-1" aria-hidden />
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary fleet-custom-report__print-btn"
              disabled={loading || activeFields.length === 0 || filteredRows.length === 0}
              onClick={() => printReport()}
            >
              <i className="bx bx-printer me-1" aria-hidden />
              Print
            </button>
          </div>
        </div>
        <div className="card-body">
          {saveNotice ? (
            <div className="alert alert-success py-2" role="status">
              {saveNotice}
            </div>
          ) : null}
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <label className="form-label" htmlFor="fleet-custom-report-name">
                Report name
              </label>
              <input
                id="fleet-custom-report-name"
                className="form-control form-control-sm"
                value={reportName}
                onChange={(e) => {
                  setReportName(e.target.value);
                  setSaveNotice(null);
                }}
              />
            </div>
            <div className="col-md-8 d-flex flex-wrap align-items-end gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={saveTemplate}>
                Save custom report
              </button>
              {savedReports.length > 0 ? (
                <span className="text-muted small align-self-center">
                  {savedReports.length} saved
                </span>
              ) : null}
            </div>
          </div>

          <p className="text-muted small">Quick presets</p>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {FLEET_REPORT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => applyPreset(preset.id)}
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>

          {savedReports.length > 0 ? (
            <>
              <p className="text-muted small mb-2">Saved custom reports</p>
              <div className="d-flex flex-wrap gap-2 mb-4">
                {savedReports.map((template) => (
                  <div key={template.id} className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn ${activeTemplateId === template.id ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => loadTemplate(template)}
                    >
                      {template.name}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => deleteTemplate(template.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <p className="text-muted small mb-2">Filters</p>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <label className="form-label" htmlFor="fleet-report-q">
                Search
              </label>
              <input
                id="fleet-report-q"
                className="form-control form-control-sm"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="VIN, plate, DRIVER…"
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="fleet-report-type">
                Type
              </label>
              <select
                id="fleet-report-type"
                className="form-select form-select-sm"
                value={filters.assetType}
                onChange={(e) => setFilters((f) => ({ ...f, assetType: e.target.value }))}
              >
                <option value="">All</option>
                {FLEET_ASSET_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="fleet-report-status">
                Status
              </label>
              <select
                id="fleet-report-status"
                className="form-select form-select-sm"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">Any active</option>
                {FLEET_ASSET_STATUS_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="fleet-report-insured">
                Insured
              </label>
              <select
                id="fleet-report-insured"
                className="form-select form-select-sm"
                value={filters.insured}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    insured: e.target.value as FleetReportFilters["insured"],
                  }))
                }
              >
                <option value="">All</option>
                <option value="true">Insured</option>
                <option value="false">Not insured</option>
              </select>
            </div>
            <div className="col-md-3 d-flex align-items-end">
              <div className="form-check mb-2">
                <input
                  id="fleet-report-removed"
                  type="checkbox"
                  className="form-check-input"
                  checked={filters.includeRemoved}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, includeRemoved: e.target.checked }))
                  }
                />
                <label className="form-check-label" htmlFor="fleet-report-removed">
                  Include removed / disposed assets
                </label>
              </div>
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() =>
                setSelectedFields(FLEET_REPORT_FIELDS.map((f) => f.id))
              }
            >
              Select all columns
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setSelectedFields([])}
            >
              Clear columns
            </button>
            <span className="text-muted small align-self-center">
              {activeFields.length} column{activeFields.length === 1 ? "" : "s"} selected
            </span>
          </div>

          <div className="row g-3 mb-4">
            {[...fieldGroups.entries()].map(([group, fields]) => (
              <div key={group} className="col-md-4 col-lg-3">
                <p className="fw-semibold small mb-2">{group}</p>
                <div className="border rounded p-2" style={{ maxHeight: 200, overflowY: "auto" }}>
                  {fields.map((field) => (
                    <label
                      key={field.id}
                      className="d-flex align-items-start gap-2 py-1 mb-0 small"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input mt-1"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-muted small mb-2">
            Preview ({filteredRows.length} asset{filteredRows.length === 1 ? "" : "s"})
            {loading ? " — loading…" : ""}
          </p>
          <div className="table-responsive fleet-custom-report__preview">
            <table className="table table-sm table-bordered mb-0">
              <thead>
                <tr>
                  {activeFields.map((id) => (
                    <th key={id}>{FLEET_REPORT_FIELDS.find((f) => f.id === id)?.label ?? id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(activeFields.length, 1)} className="text-muted">
                      No assets match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.slice(0, 25).map((row) => (
                    <tr key={String(row.id)}>
                      {activeFields.map((id) => (
                        <td key={id}>{formatFleetReportCell(row[id])}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 25 ? (
            <p className="text-muted small mt-2 mb-0">
              Showing first 25 rows in preview. Export or print includes all{" "}
              {filteredRows.length} matching assets.
            </p>
          ) : null}
        </div>
      </div>
      {printMounted ? customPrintReport : null}
      </div>
    </>
  );
}
