"use client";

import { useMemo, useState } from "react";
import type { TrainingTeamSummary } from "@/features/training/types";
import {
  buildMissedTrainingCsv,
  buildMissedTrainingPrintHtml,
  buildMissedTrainingReport,
  daysLateLabel,
  formatReportDay,
  groupByDepartment,
  localDay,
  NO_DEPARTMENT,
} from "@/lib/training-missed-report";
import { downloadText, openPrintHtml, openPrintWindow } from "@/lib/sanitation-module";

type Props = {
  roster: TrainingTeamSummary["roster"] | null;
  canManage: boolean;
  onRefresh: () => void;
};

export function TrainingMissedReport({ roster, canManage, onRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => buildMissedTrainingReport(roster ?? []), [roster]);
  const departmentNames = useMemo(() => groupByDepartment(people).map((d) => d.name), [people]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inDepartment = department
      ? people.filter((p) => (p.departmentName || NO_DEPARTMENT) === department)
      : people;
    if (!q) return inDepartment;
    return inDepartment.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.employeeNumber ?? "").toLowerCase().includes(q) ||
        p.trainings.some((t) => t.title.toLowerCase().includes(q)),
    );
  }, [people, search, department]);
  const departments = useMemo(() => groupByDepartment(visible), [visible]);
  const total = visible.reduce((sum, p) => sum + p.trainings.length, 0);

  const print = () => {
    setError(null);
    const w = openPrintWindow();
    try {
      openPrintHtml(buildMissedTrainingPrintHtml(visible), w);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the print window");
    }
  };

  const exportCsv = () => {
    downloadText(
      `missed-trainings-${localDay(new Date())}.csv`,
      buildMissedTrainingCsv(visible),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0">
          <h4 className="mb-1">Missed trainings</h4>
          <p className="text-muted mb-0">
            Everyone with training not started and past its due date. The day after the due date
            counts as 1 day late.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={onRefresh}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={!visible.length}
            onClick={exportCsv}
          >
            <i className="bx bx-download me-1" aria-hidden />
            CSV
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!visible.length}
            onClick={print}
          >
            <i className="bx bx-printer me-1" aria-hidden />
            Print
          </button>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          You need training manage access to see this report.
        </div>
      ) : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
        <input
          type="search"
          className="form-control form-control-sm"
          style={{ maxWidth: "20rem" }}
          placeholder="Search name, employee #, or training"
          aria-label="Search missed trainings"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: "16rem" }}
          aria-label="Filter by department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {departmentNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-muted small">
          {visible.length} {visible.length === 1 ? "person" : "people"} · {total}{" "}
          {total === 1 ? "training" : "trainings"}
        </span>
      </div>

      {roster === null && canManage ? (
        <p className="text-muted">Loading…</p>
      ) : !visible.length ? (
        <p className="text-muted">
          {people.length
            ? "No one matches this search."
            : "No missed trainings. Everyone is on time."}
        </p>
      ) : (
        departments.map((dept) => (
          <section key={dept.name} className="mb-4">
            <h5 className="mb-2 pb-1 border-bottom d-flex flex-wrap align-items-baseline gap-2">
              {dept.name}
              <span className="text-muted small fw-normal">
                {dept.people.length} {dept.people.length === 1 ? "person" : "people"}
              </span>
            </h5>
            {dept.people.map((person) => (
              <div key={person.key} className="card mb-3">
                <div className="card-header py-2 d-flex flex-wrap justify-content-between gap-2">
                  <span className="fw-semibold">
                    {person.name}
                    {person.employeeNumber ? (
                      <span className="text-muted fw-normal ms-2">#{person.employeeNumber}</span>
                    ) : null}
                    {person.siteName ? (
                      <span className="text-muted fw-normal ms-2">{person.siteName}</span>
                    ) : null}
                  </span>
                  <span className="badge bg-label-danger">{person.trainings.length} missed</span>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Training</th>
                        <th>Assigned</th>
                        <th>Due by</th>
                        <th>Days late</th>
                      </tr>
                    </thead>
                    <tbody>
                      {person.trainings.map((t) => (
                        <tr key={t.assignmentId}>
                          <td>{t.title}</td>
                          <td>{formatReportDay(t.assignedOn)}</td>
                          <td>{formatReportDay(t.dueOn)}</td>
                          <td className="text-danger fw-semibold">{daysLateLabel(t.daysLate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}
