"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { trainingApi } from "@/features/training/api";
import { personNameDisplay } from "@/lib/person-name-display";

type DashTab = "assigned" | "completed" | "transcript";

type MyTrainingPayload = Awaited<ReturnType<typeof trainingApi.myTraining>>;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "PASSED" || normalized === "COMPLETED") return "bg-label-success";
  if (normalized === "IN_PROGRESS") return "bg-label-primary";
  if (normalized === "OVERDUE") return "bg-label-danger";
  return "bg-label-secondary";
}

function statusLabel(status: string) {
  const normalized = status.toUpperCase().replace(/_/g, " ");
  if (normalized === "PASSED") return "Completed";
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "IN PROGRESS") return "In progress";
  if (normalized === "NOT STARTED") return "Not started";
  if (normalized === "OVERDUE") return "Overdue";
  if (normalized === "ASSIGNED") return "Assigned";
  return normalized
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function isOverdue(dueAt: string | null | undefined, status: string) {
  if (!dueAt || status.toUpperCase() === "PASSED") return false;
  const due = new Date(dueAt).getTime();
  return Number.isFinite(due) && due < Date.now();
}

export function MyTrainingWorkspace() {
  const [data, setData] = useState<MyTrainingPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [tab, setTab] = useState<DashTab>("assigned");
  const [transcriptQuery, setTranscriptQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await trainingApi.myTraining();
      setData(res);
      if (res.linked && res.summary.assigned === 0 && res.summary.completed > 0) {
        setTab("transcript");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your training");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openRows = data?.openAssignments ?? [];
  const records = data?.trainingRecords ?? [];
  const completedRows = useMemo(
    () =>
      records.filter((row) => {
        const result = String(row.result ?? "").toUpperCase();
        return result === "PASSED" || result === "COMPLETED";
      }),
    [records],
  );
  const transcriptRows = useMemo(() => {
    const q = transcriptQuery.trim().toLowerCase();
    return records.filter((row) => {
      if (!q) return true;
      return `${row.title} ${row.courseName ?? ""} ${row.result ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [records, transcriptQuery]);

  async function printReport() {
    setPrintError(null);
    try {
      await trainingApi.openMyTrainingReport();
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Could not open transcript report");
    }
  }

  async function printRow(row: MyTrainingPayload["trainingRecords"][number]) {
    setPrintError(null);
    try {
      if (row.printCompletionId) {
        await trainingApi.openMyCompletionPrintable(row.printCompletionId);
        return;
      }
      if (row.kind === "record" || !row.printCompletionId) {
        await trainingApi.openMyTrainingRecordPrintable(row.id);
      }
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Could not open printable");
    }
  }

  return (
    <div className="container-xxl flex-grow-1 container-p-y" data-walkthrough="employee-my-training">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h4 className="mb-1">My Training</h4>
          <p className="text-muted mb-0">
            Open your assigned courses, review completions, and print your transcript.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !data?.linked}
            onClick={() => void printReport()}
          >
            Print / download transcript
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-warning">{error}</div> : null}
      {printError ? <div className="alert alert-warning">{printError}</div> : null}

      {busy && !data ? <p className="text-muted">Loading your training…</p> : null}

      {data && !data.linked ? (
        <div className="card">
          <div className="card-body">
            <h5 className="mb-2">Personnel link required</h5>
            <p className="mb-3 text-muted">
              Your login is not linked to an employee personnel file yet, so assigned training and
              transcripts cannot be shown. Ask an administrator to set your user on your personnel
              record, then refresh this page.
            </p>
            <Link href="/profile/" className="btn btn-outline-primary btn-sm">
              Open my profile
            </Link>
          </div>
        </div>
      ) : null}

      {data?.linked ? (
        <>
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-muted small">Assigned</div>
                  <div className="fs-3 fw-semibold">{data.summary.assigned}</div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-muted small">Completed</div>
                  <div className="fs-3 fw-semibold">{data.summary.completed}</div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-muted small">Overdue</div>
                  <div className="fs-3 fw-semibold">{data.summary.overdue}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3 small text-muted">
            {personNameDisplay(data.displayName) || "Employee"}
            {data.employeeNumber ? ` · ${data.employeeNumber}` : ""}
          </div>

          <div className="btn-group mb-3" role="tablist" aria-label="My Training sections">
            <button
              type="button"
              className={`btn btn-sm ${tab === "assigned" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setTab("assigned")}
            >
              Assigned
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tab === "completed" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setTab("completed")}
            >
              Completed
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tab === "transcript" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setTab("transcript")}
            >
              Transcript
            </button>
          </div>

          {tab === "assigned" ? (
            <div className="card">
              <div className="card-body">
                <ul className="list-group list-group-flush">
                  {openRows.map((row, index) => {
                    const assignmentId = String(row.assignment.id ?? "").trim();
                    const status = String(row.assignee.status ?? "ASSIGNED");
                    const overdue = isOverdue(row.assignment.dueAt, status);
                    return (
                      <li
                        key={`${assignmentId || row.assignment.title}-${index}`}
                        className="list-group-item d-flex flex-wrap justify-content-between align-items-start gap-3 px-0"
                      >
                        <div>
                          <div className="fw-semibold">{row.assignment.title}</div>
                          <div className="small text-muted">{row.sourceTitle}</div>
                          <div className="small text-muted">
                            Due {formatDate(row.assignment.dueAt)}
                          </div>
                        </div>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className={`badge ${statusBadge(overdue ? "OVERDUE" : status)}`}>
                            {statusLabel(overdue ? "OVERDUE" : status)}
                          </span>
                          {assignmentId ? (
                            <Link
                              href={`/my-training/assignments/${encodeURIComponent(assignmentId)}/`}
                              className="btn btn-sm btn-primary"
                            >
                              Open
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                  {!openRows.length ? (
                    <li className="list-group-item text-muted px-0">
                      No open training assignments right now.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "completed" ? (
            <div className="card">
              <div className="card-body table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Result</th>
                      <th>Score</th>
                      <th>Completed</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {row.title}
                          {row.courseName && row.courseName !== row.title ? (
                            <div className="small text-muted">{row.courseName}</div>
                          ) : null}
                        </td>
                        <td>{row.result ?? "—"}</td>
                        <td>{row.scorePercent != null ? `${row.scorePercent}%` : "—"}</td>
                        <td>{formatDate(row.completedAt)}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => void printRow(row)}
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!completedRows.length ? (
                      <tr>
                        <td colSpan={5} className="text-muted">
                          No completed courses yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "transcript" ? (
            <div className="card">
              <div className="card-body">
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    style={{ maxWidth: 320 }}
                    placeholder="Search transcript"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => void printReport()}
                  >
                    Print full transcript
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Result</th>
                        <th>Score</th>
                        <th>Date</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transcriptRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.title}
                            {row.courseName && row.courseName !== row.title ? (
                              <div className="small text-muted">{row.courseName}</div>
                            ) : null}
                          </td>
                          <td>{row.result ?? "—"}</td>
                          <td>{row.scorePercent != null ? `${row.scorePercent}%` : "—"}</td>
                          <td>{formatDate(row.completedAt)}</td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => void printRow(row)}
                            >
                              Print
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!transcriptRows.length ? (
                        <tr>
                          <td colSpan={5} className="text-muted">
                            No transcript entries yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
