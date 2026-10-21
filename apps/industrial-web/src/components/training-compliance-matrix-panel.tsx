"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { trainingApi } from "@/features/training/api";
import {
  EMPTY_ORG_FILTER_CATALOGS,
  loadOrgFilterCatalogs,
  type OrgFilterCatalogs,
} from "@/lib/personnel-lookups";
import { personNameDisplay } from "@/lib/person-name-display";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import type { DepartmentOption, DivisionOption } from "@/lib/personnel-assignment";

type MatrixCell = {
  status: string;
  bestPercent: number | null;
  completedAt: string | null;
  dueAt: string | null;
  assignmentTitle: string;
};

type MatrixRow = {
  personnelId: string;
  displayName: string;
  employeeNumber: string | null;
  departmentName: string | null;
  siteName: string | null;
  jobTitle: string | null;
  cells: Record<string, MatrixCell | null>;
};

function cellClass(cell: MatrixCell | null) {
  if (!cell) return "bg-light text-muted";
  if (cell.status === "PASSED") return "bg-success text-white";
  if (cell.status === "OVERDUE" || (cell.dueAt && new Date(cell.dueAt) < new Date() && cell.status !== "PASSED")) {
    return "bg-danger text-white";
  }
  if (cell.status === "IN_PROGRESS" || cell.status === "FAILED") return "bg-warning";
  return "bg-secondary text-white";
}

function cellLabel(cell: MatrixCell | null) {
  if (!cell) return "—";
  if (cell.status === "PASSED") {
    return cell.bestPercent != null ? `${cell.bestPercent}%` : "Pass";
  }
  return cell.status.replace(/_/g, " ");
}

export function TrainingComplianceMatrixPanel() {
  const [courses, setCourses] = useState<Array<{ sourceId: string; title: string }>>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [deptNameFilter, setDeptNameFilter] = useState("");
  const [search, setSearch] = useState("");
  const [orgCatalogs, setOrgCatalogs] = useState<OrgFilterCatalogs>(EMPTY_ORG_FILTER_CATALOGS);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [data, catalogs] = await Promise.all([
        trainingApi.complianceMatrix(),
        loadOrgFilterCatalogs().catch(() => EMPTY_ORG_FILTER_CATALOGS),
      ]);
      setCourses(data.courses ?? []);
      setRows(data.rows ?? []);
      setOrgCatalogs(catalogs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load compliance matrix");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const siteLabel =
      orgCatalogs.sites.find((s) => s.id === siteFilter)?.label ?? siteFilter;
    return rows.filter((row) => {
      if (siteFilter && row.siteName !== siteLabel && row.siteName !== siteFilter) return false;
      if (deptNameFilter && row.departmentName !== deptNameFilter && row.departmentName !== deptFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${row.displayName} ${row.employeeNumber ?? ""} ${row.jobTitle ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, siteFilter, deptFilter, deptNameFilter, search, orgCatalogs.sites]);

  function exportCsv() {
    const headers = [
      "Employee",
      "Employee number",
      "Department",
      "Location",
      "Job title",
      ...courses.map((c) => c.title),
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of filtered) {
      const cells = courses.map((c) => {
        const cell = row.cells[c.sourceId];
        if (!cell) return "Not assigned";
        return cell.status === "PASSED"
          ? `PASSED${cell.bestPercent != null ? ` ${cell.bestPercent}%` : ""}`
          : cell.status;
      });
      lines.push(
        [
          personNameDisplay(row.displayName),
          row.employeeNumber ?? "",
          row.departmentName ?? "",
          row.siteName ?? "",
          row.jobTitle ?? "",
          ...cells,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training-compliance-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {error ? <div className="alert alert-danger">{error}</div> : null}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-end">
        <div>
          <label className="form-label small mb-1" htmlFor="matrix-search">
            Search
          </label>
          <input
            id="matrix-search"
            className="form-control form-control-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or EMP#"
          />
        </div>
        <div className="row g-2 flex-grow-1" style={{ minWidth: "18rem", maxWidth: "36rem" }}>
          <OrgLocationCascade
            idPrefix="matrix"
            size="sm"
            colClass="col-6"
            locationEmptyLabel="All locations"
            showDivision={false}
            sites={orgCatalogs.sites}
            departments={orgCatalogs.departments as DepartmentOption[]}
            divisionEntries={orgCatalogs.divisionEntries as DivisionOption[]}
            value={{
              siteId: siteFilter,
              siteName: orgCatalogs.sites.find((s) => s.id === siteFilter)?.label ?? "",
              divisionName: divisionFilter,
              departmentId: deptFilter,
              departmentName: deptNameFilter,
            }}
            onChange={(next) => {
              setSiteFilter(next.siteId);
              setDivisionFilter(next.divisionName);
              setDeptFilter(next.departmentId);
              setDeptNameFilter(next.departmentName?.trim() || "");
            }}
          />
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={!filtered.length || !courses.length}
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>
      {busy && !rows.length ? <p className="text-muted">Loading matrix…</p> : null}
      <div className="table-responsive border rounded" style={{ maxHeight: "70vh" }}>
        <table className="table table-sm table-bordered mb-0 align-middle">
          <thead className="table-light sticky-top">
            <tr>
              <th style={{ minWidth: "10rem" }}>Employee</th>
              <th>Dept</th>
              <th>Location</th>
              {courses.map((c) => (
                <th key={c.sourceId} className="small" style={{ minWidth: "6rem" }}>
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.personnelId}>
                <td>
                  <strong>{personNameDisplay(row.displayName)}</strong>
                  <div className="small text-muted">{row.employeeNumber}</div>
                </td>
                <td className="small">{row.departmentName ?? "—"}</td>
                <td className="small">{row.siteName ?? "—"}</td>
                {courses.map((c) => {
                  const cell = row.cells[c.sourceId] ?? null;
                  return (
                    <td key={c.sourceId} className={`text-center small ${cellClass(cell)}`} title={cell?.assignmentTitle}>
                      {cellLabel(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!filtered.length && !busy ? (
              <tr>
                <td colSpan={3 + courses.length} className="text-muted text-center py-4">
                  No personnel rows match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
