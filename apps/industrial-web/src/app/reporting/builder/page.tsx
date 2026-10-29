"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { BUILT_IN_REPORTS } from "@/lib/reporting-catalog";
import {
  BUILDER_FIELD_OPTIONS,
  REPORT_RELATIVE_DATE_OPTIONS,
  chartSeriesFromResult,
  createSavedReport,
  fetchReportDatasets,
  formatReportCell,
  runReport,
  type ReportDataset,
  type ReportRunFields,
  type ReportRunResult,
} from "@/lib/reporting-api";

const STEPS = ["Source", "Fields", "Filters", "Name", "Preview"] as const;

function PreviewBarChart({ series }: { series: Array<{ label: string; value: number }> }) {
  const max = Math.max(...series.map((s) => s.value), 1);
  return (
    <div className="mb-3" aria-label="Preview chart">
      <p className="small text-muted mb-2">Preview chart (value by category)</p>
      <div className="d-flex align-items-end gap-2" style={{ minHeight: 120 }}>
        {series.map((s) => (
          <div key={s.label} className="text-center flex-fill" style={{ minWidth: 36 }}>
            <div className="small text-muted mb-1">{s.value}</div>
            <div
              className="bg-primary rounded-top mx-auto"
              style={{
                width: "70%",
                height: `${Math.max(8, Math.round((s.value / max) * 96))}px`,
              }}
              title={`${s.label}: ${s.value}`}
            />
            <div className="small text-truncate mt-1" title={s.label}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportingBuilderInner() {
  const searchParams = useSearchParams();
  const sourceFromQuery = searchParams?.get("source")?.trim() ?? "";
  const initialSource =
    sourceFromQuery && BUILT_IN_REPORTS.some((r) => r.key === sourceFromQuery)
      ? sourceFromQuery
      : (BUILT_IN_REPORTS[0]?.key ?? "");

  const [step, setStep] = useState(0);
  const [sourceKey, setSourceKey] = useState(initialSource);
  const [datasets, setDatasets] = useState<ReportDataset[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [extraFields, setExtraFields] = useState("");
  const [relativeDateRange, setRelativeDateRange] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [aggregateCount, setAggregateCount] = useState(false);
  const [filtersText, setFiltersText] = useState("{\n  \n}");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<ReportRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [savedAsTemplate, setSavedAsTemplate] = useState(false);

  useEffect(() => {
    if (sourceFromQuery && BUILT_IN_REPORTS.some((r) => r.key === sourceFromQuery)) {
      setSourceKey(sourceFromQuery);
    }
  }, [sourceFromQuery]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchReportDatasets();
        if (!cancelled) setDatasets(data.items ?? []);
      } catch {
        if (!cancelled) setDatasets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceMeta = useMemo(
    () =>
      datasets.find((r) => r.key === sourceKey) ??
      BUILT_IN_REPORTS.find((r) => r.key === sourceKey) ??
      null,
    [datasets, sourceKey],
  );

  const fieldOptions = useMemo(() => {
    const fromDataset = datasets.find((d) => d.key === sourceKey)?.fields;
    if (fromDataset?.length) return fromDataset;
    return (
      BUILDER_FIELD_OPTIONS[sourceKey] ?? [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created" },
      ]
    );
  }, [datasets, sourceKey]);

  const supportsGroupBy =
    datasets.find((d) => d.key === sourceKey)?.supportsGroupBy ??
    (sourceKey.startsWith("workers_comp.") || sourceKey.startsWith("incidents."));

  function toggleField(key: string) {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function parseFilters(): Record<string, unknown> {
    const trimmed = filtersText.trim();
    if (!trimmed || trimmed === "{" || trimmed === "{\n  \n}") return {};
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Filters must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  function buildRunFields() {
    const freeform = extraFields
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const fields = [...new Set([...selectedFields, ...freeform])];
    let filters: Record<string, unknown> = {};
    try {
      filters = parseFilters();
    } catch {
      filters = {};
    }
    const run: ReportRunFields = {
      filters,
      limit: 100,
    };
    if (fields.length) run.fields = fields;
    if (relativeDateRange) {
      run.relativeDateRange = relativeDateRange as
        "last_7_days" | "last_30_days" | "this_month" | "prior_month";
    }
    if (groupBy) run.groupBy = groupBy;
    if (aggregateCount && groupBy) run.aggregate = "count";
    return run;
  }

  function buildPayload(): Record<string, unknown> {
    return buildRunFields();
  }

  async function onPreview() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      parseFilters();
      const result = await runReport(sourceKey, buildRunFields());
      setPreview(result);
      setStep(4);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Preview failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim() || !sourceKey) {
      setError("Name and source report are required.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payloadJson = buildPayload();
      const created = await createSavedReport({
        name: name.trim(),
        description: description.trim() || null,
        sourceKey,
        category: sourceMeta && "category" in sourceMeta ? sourceMeta.category : null,
        moduleCode: sourceMeta && "module" in sourceMeta ? sourceMeta.module : null,
        payloadJson,
        origin: saveAsTemplate ? "template" : "saved",
      });
      setSavedId(created.id);
      setSavedAsTemplate(saveAsTemplate);
      setMessage(
        saveAsTemplate ? `Template “${created.name}” saved.` : `Report “${created.name}” saved.`,
      );
      setSelectedFields([]);
      setExtraFields("");
      setRelativeDateRange("");
      setGroupBy("");
      setAggregateCount(false);
      setFiltersText("{\n  \n}");
      setName("");
      setDescription("");
      setPreview(null);
      setSaveAsTemplate(false);
      setStep(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save report");
    } finally {
      setBusy(false);
    }
  }

  const chartSeries = preview ? chartSeriesFromResult(preview) : null;
  const sourceOptions = datasets.length
    ? datasets
    : BUILT_IN_REPORTS.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
      }));

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Library</p>
          <h1 className="h4 mb-1">Custom builder</h1>
          <p className="text-muted mb-0">
            Pick a built-in source, choose fields and filters, then save a tenant report definition.
          </p>
        </div>
        <Link href="/reporting/saved/" className="btn btn-outline-secondary">
          Saved reports
        </Link>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success" role="status">
          {message}{" "}
          {savedId ? (
            <Link
              href={savedAsTemplate ? "/reporting/templates/" : "/reporting/saved/"}
              className="alert-link"
            >
              {savedAsTemplate ? "View templates" : "View saved reports"}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3">
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2 mb-3">
            {STEPS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={`btn btn-sm ${idx === step ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setStep(idx)}
              >
                {idx + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 ? (
            <div>
              <label className="form-label" htmlFor="builder-source">
                Source report
              </label>
              <select
                id="builder-source"
                className="form-select"
                value={sourceKey}
                onChange={(e) => {
                  setSourceKey(e.target.value);
                  setSelectedFields([]);
                  setGroupBy("");
                  setAggregateCount(false);
                  setPreview(null);
                }}
              >
                {sourceOptions.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name} ({r.key})
                  </option>
                ))}
              </select>
              {sourceMeta && "description" in sourceMeta ? (
                <p className="text-muted small mt-2 mb-0">{sourceMeta.description}</p>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <p className="small text-muted mb-2">
                Select fields to include when running this report.
              </p>
              <div className="row g-2 mb-3">
                {fieldOptions.map((field) => (
                  <div key={field.key} className="col-md-4">
                    <label className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedFields.includes(field.key)}
                        onChange={() => toggleField(field.key)}
                      />
                      <span className="form-check-label">{field.label}</span>
                    </label>
                  </div>
                ))}
              </div>
              <label className="form-label" htmlFor="builder-extra-fields">
                Extra fields (comma-separated)
              </label>
              <input
                id="builder-extra-fields"
                className="form-control"
                value={extraFields}
                onChange={(e) => setExtraFields(e.target.value)}
                placeholder="customField1, customField2"
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="builder-relative-date">
                  Relative date range
                </label>
                <select
                  id="builder-relative-date"
                  className="form-select"
                  value={relativeDateRange}
                  onChange={(e) => setRelativeDateRange(e.target.value)}
                >
                  {REPORT_RELATIVE_DATE_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {supportsGroupBy ? (
                <>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="builder-groupby">
                      Group by
                    </label>
                    <select
                      id="builder-groupby"
                      className="form-select"
                      value={groupBy}
                      onChange={(e) => setGroupBy(e.target.value)}
                    >
                      <option value="">None</option>
                      {fieldOptions.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={aggregateCount}
                        disabled={!groupBy}
                        onChange={(e) => setAggregateCount(e.target.checked)}
                      />
                      <span className="form-check-label">Aggregate count by group</span>
                    </label>
                  </div>
                </>
              ) : null}
              <div className="col-12">
                <label className="form-label" htmlFor="builder-filters">
                  Filters (JSON)
                </label>
                <textarea
                  id="builder-filters"
                  className="form-control font-monospace"
                  rows={6}
                  value={filtersText}
                  onChange={(e) => setFiltersText(e.target.value)}
                />
                <p className="small text-muted mt-2 mb-0">
                  Optional object merged into run input. Leave empty for none.
                </p>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <form onSubmit={(e) => void onSave(e)}>
              <div className="mb-3">
                <label className="form-label" htmlFor="builder-name">
                  Report name
                </label>
                <input
                  id="builder-name"
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="builder-description">
                  Description
                </label>
                <textarea
                  id="builder-description"
                  className="form-control"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="form-check mb-3">
                <input
                  id="builder-as-template"
                  type="checkbox"
                  className="form-check-input"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="builder-as-template">
                  Save as template (appears under Templates)
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : saveAsTemplate ? "Save template" : "Save report"}
              </button>
            </form>
          ) : null}

          {step === 4 ? (
            <div>
              <div className="form-check mb-3">
                <input
                  id="builder-as-template-preview"
                  type="checkbox"
                  className="form-check-input"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="builder-as-template-preview">
                  Save as template
                </label>
              </div>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={busy}
                  onClick={() => void onPreview()}
                >
                  {busy ? "Running…" : "Refresh preview"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !name.trim()}
                  onClick={() => void onSave()}
                >
                  {busy ? "Saving…" : saveAsTemplate ? "Save template" : "Save report"}
                </button>
              </div>
              {preview ? (
                <>
                  <p className="small text-muted mb-2">
                    Preview of <code>{sourceKey}</code> · {preview.rows.length} rows
                  </p>
                  {chartSeries ? <PreviewBarChart series={chartSeries} /> : null}
                  <div className="table-responsive" style={{ maxHeight: 360 }}>
                    <table className="table table-sm table-striped mb-0">
                      <thead>
                        <tr>
                          {preview.columns.map((col) => (
                            <th key={col.key}>{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 50).map((row, idx) => (
                          <tr key={idx}>
                            {preview.columns.map((col) => (
                              <td key={col.key}>{formatReportCell(row[col.key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0">
                  Run a preview to see sample rows from the source report.
                </p>
              )}
            </div>
          ) : null}

          <div className="d-flex justify-content-between mt-4">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            <div className="d-flex gap-2">
              {step < 4 ? (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => {
                    if (step === 3 && !name.trim()) {
                      setError("Enter a name before continuing.");
                      return;
                    }
                    setError(null);
                    setStep((s) => Math.min(4, s + 1));
                  }}
                >
                  Next
                </button>
              ) : null}
              {step === 3 || step === 4 ? null : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void onPreview()}
                >
                  Preview
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ReportingBuilderPage() {
  return (
    <Suspense fallback={<div className="text-muted">Loading builder…</div>}>
      <ReportingBuilderInner />
    </Suspense>
  );
}
