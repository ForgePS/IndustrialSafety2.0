"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";

type QcSource = { id: string; title: string };

type QcQuestionStat = {
  stem: string;
  sourceId: string;
  sourceTitle: string;
  presented: number;
  correct: number;
  incorrect: number;
  correctRate: number;
};

type QcDashboard = {
  filters: { sourceId: string | null; days: number | null; since: string | null };
  sources: QcSource[];
  summary: {
    totalCompletions: number;
    passed: number;
    failed: number;
    passRate: number;
    firstAttemptPassRate: number;
    firstAttemptCount: number;
    avgScore: number;
    avgAttemptsToPass: number;
    uniqueLearners: number;
    inProgressAttempts: number;
    completedAttempts: number;
    questionsPresented: number;
  };
  scoreDistribution: Array<{ label: string; count: number; percent: number }>;
  byCourse: Array<{
    sourceId: string;
    title: string;
    completions: number;
    passed: number;
    failed: number;
    passRate: number;
    avgScore: number;
  }>;
  attemptBreakdown: Array<{
    attemptNumber: number;
    count: number;
    passed: number;
    passRate: number;
  }>;
  trend: Array<{ period: string; completions: number; passed: number; passRate: number }>;
  lowQuestions: QcQuestionStat[];
  highQuestions: QcQuestionStat[];
  questionStats: QcQuestionStat[];
  recentCompletions: Array<{
    id: string;
    employeeNumber: string;
    sourceId: string;
    sourceTitle: string;
    scorePercent: number;
    passingPercent: number;
    result: string;
    attemptNumber: number;
    completedAt: string;
  }>;
};

type DaysFilter = "" | "30" | "90" | "180" | "365";

type LegacyQcDashboard = {
  summary: QcDashboard["summary"];
  questionStats: Array<{
    stem: string;
    presented: number;
    correct?: number;
    incorrect?: number;
    correctRate: number;
    sourceId?: string;
    sourceTitle?: string;
  }>;
};

function normalizeQcDashboard(raw: QcDashboard | LegacyQcDashboard): QcDashboard {
  if ("byCourse" in raw && "trend" in raw) return raw as QcDashboard;
  const legacy = raw as LegacyQcDashboard;
  const questionStats = (legacy.questionStats ?? []).map((q) => ({
    stem: q.stem,
    sourceId: q.sourceId ?? "",
    sourceTitle: q.sourceTitle?.trim() || "—",
    presented: q.presented,
    correct: q.correct ?? Math.round((q.presented * q.correctRate) / 100),
    incorrect: q.incorrect ?? q.presented - Math.round((q.presented * q.correctRate) / 100),
    correctRate: q.correctRate,
  }));
  return {
    filters: { sourceId: null, days: null, since: null },
    sources: [],
    summary: {
      totalCompletions: legacy.summary.totalCompletions,
      passed: legacy.summary.passed,
      failed: legacy.summary.failed,
      passRate: legacy.summary.passRate,
      firstAttemptPassRate: legacy.summary.firstAttemptPassRate,
      firstAttemptCount: 0,
      avgScore: legacy.summary.avgScore,
      avgAttemptsToPass: 0,
      uniqueLearners: 0,
      inProgressAttempts: 0,
      completedAttempts: 0,
      questionsPresented: questionStats.reduce((sum, q) => sum + q.presented, 0),
    },
    scoreDistribution: [],
    byCourse: [],
    attemptBreakdown: [],
    trend: [],
    lowQuestions: questionStats,
    highQuestions: [],
    questionStats,
    recentCompletions: [],
  };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="border rounded p-3 h-100 bg-body">
      <small className="text-muted d-block text-uppercase" style={{ letterSpacing: "0.04em" }}>
        {label}
      </small>
      <strong className="fs-4 d-block mt-1">{value}</strong>
      {hint ? <span className="small text-muted">{hint}</span> : null}
    </div>
  );
}

function HorizontalBars({
  rows,
  valueKey,
  labelKey,
  maxValue,
}: {
  rows: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  maxValue?: number;
}) {
  const peak = Math.max(1, maxValue ?? Math.max(0, ...rows.map((r) => Number(r[valueKey] || 0))));
  if (!rows.length) {
    return <p className="text-muted small mb-0">No data in this range.</p>;
  }
  return (
    <div className="vstack gap-2">
      {rows.map((row) => {
        const value = Number(row[valueKey] || 0);
        const width = Math.max(2, Math.round((value / peak) * 100));
        return (
          <div key={String(row[labelKey])}>
            <div className="d-flex justify-content-between small mb-1">
              <span className="text-truncate pe-2">{String(row[labelKey])}</span>
              <span className="text-muted text-nowrap">{value}</span>
            </div>
            <div className="progress" style={{ height: 8 }} role="presentation">
              <div className="progress-bar" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TrainingQcPanel() {
  const [data, setData] = useState<QcDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [days, setDays] = useState<DaysFilter>("90");
  const [questionView, setQuestionView] = useState<"low" | "high" | "all">("low");

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const query: Record<string, string> = {};
      if (sourceId) query.sourceId = sourceId;
      if (days) query.days = days;
      const res = await apiGet<QcDashboard | LegacyQcDashboard>("/api/v1/industrial/training/qc", {
        query,
      });
      setData(normalizeQcDashboard(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load QC analytics");
    } finally {
      setBusy(false);
    }
  }, [sourceId, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const questionRows = useMemo(() => {
    if (!data) return [];
    if (questionView === "high") return data.highQuestions;
    if (questionView === "all") return data.questionStats;
    return data.lowQuestions;
  }, [data, questionView]);

  function exportAnalytics() {
    if (!data) return;
    const rows: string[][] = [
      ["Section", "Metric", "Value"],
      ["Summary", "Completions", String(data.summary.totalCompletions)],
      ["Summary", "Passed", String(data.summary.passed)],
      ["Summary", "Failed", String(data.summary.failed)],
      ["Summary", "Pass rate %", String(data.summary.passRate)],
      ["Summary", "First-attempt pass rate %", String(data.summary.firstAttemptPassRate)],
      ["Summary", "Average score %", String(data.summary.avgScore)],
      ["Summary", "Avg attempts to pass", String(data.summary.avgAttemptsToPass)],
      ["Summary", "Unique learners", String(data.summary.uniqueLearners)],
      [],
      ["Course", "Completions", "Passed", "Failed", "Pass rate %", "Avg score %"],
      ...data.byCourse.map((c) => [
        c.title,
        String(c.completions),
        String(c.passed),
        String(c.failed),
        String(c.passRate),
        String(c.avgScore),
      ]),
      [],
      ["Question", "Course", "Presented", "Correct", "Incorrect", "Correct rate %"],
      ...data.questionStats.map((q) => [
        q.stem,
        q.sourceTitle,
        String(q.presented),
        String(q.correct),
        String(q.incorrect),
        String(q.correctRate),
      ]),
      [],
      ["Employee #", "Course", "Score %", "Result", "Attempt #", "Completed at"],
      ...data.recentCompletions.map((c) => [
        c.employeeNumber,
        c.sourceTitle,
        String(c.scorePercent),
        c.result,
        String(c.attemptNumber),
        c.completedAt,
      ]),
    ];
    downloadCsv(`training-qc-${days || "all"}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  return (
    <div className="vstack gap-3">
      <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h6 className="mb-0">Training QC analytics</h6>
            <small className="text-muted">
              Completions, pass rates, retries, score distribution, and question performance.
            </small>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <select
              className="form-select form-select-sm"
              style={{ minWidth: 180 }}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              aria-label="Filter by course"
            >
              <option value="">All courses</option>
              {(data?.sources ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <select
              className="form-select form-select-sm"
              style={{ minWidth: 140 }}
              value={days}
              onChange={(e) => setDays(e.target.value as DaysFilter)}
              aria-label="Time range"
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 180 days</option>
              <option value="365">Last 12 months</option>
              <option value="">All time</option>
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={!data || busy}
              onClick={exportAnalytics}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="card-body">
          {error ? (
            <div className="alert alert-danger mb-0" role="alert">
              {error}
            </div>
          ) : null}
          {!data && !error ? (
            <p className="text-muted mb-0">{busy ? "Loading analytics…" : "No QC data."}</p>
          ) : null}
          {data ? (
            <div className="row g-3">
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="Pass rate"
                  value={`${data.summary.passRate}%`}
                  hint={`${data.summary.passed} passed · ${data.summary.failed} failed`}
                />
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="First-attempt pass"
                  value={`${data.summary.firstAttemptPassRate}%`}
                  hint={`${data.summary.firstAttemptCount} first attempts`}
                />
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="Avg score"
                  value={`${data.summary.avgScore}%`}
                  hint="All completions"
                />
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="Completions"
                  value={data.summary.totalCompletions}
                  hint={`${data.summary.uniqueLearners} unique learners`}
                />
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="Avg attempts to pass"
                  value={data.summary.avgAttemptsToPass}
                  hint={`${data.summary.inProgressAttempts} in progress`}
                />
              </div>
              <div className="col-6 col-md-4 col-xl-2">
                <MetricCard
                  label="Question answers"
                  value={data.summary.questionsPresented}
                  hint={`${data.summary.completedAttempts} completed quizzes`}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {data ? (
        <>
          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="mb-0">Score distribution</h6>
                </div>
                <div className="card-body">
                  <HorizontalBars
                    rows={data.scoreDistribution.map((b) => ({
                      label: `${b.label} (${b.percent}%)`,
                      count: b.count,
                    }))}
                    labelKey="label"
                    valueKey="count"
                  />
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="mb-0">Monthly completions</h6>
                </div>
                <div className="card-body">
                  <HorizontalBars
                    rows={data.trend.map((t) => ({
                      label: `${t.period} · ${t.passRate}% pass`,
                      count: t.completions,
                    }))}
                    labelKey="label"
                    valueKey="count"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-7">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="mb-0">Performance by course</h6>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-sm mb-0 align-middle">
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th className="text-end">Completions</th>
                          <th className="text-end">Pass rate</th>
                          <th className="text-end">Avg score</th>
                          <th className="text-end">Failed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byCourse.map((c) => (
                          <tr key={c.sourceId}>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 text-start"
                                onClick={() => setSourceId(c.sourceId)}
                              >
                                {c.title}
                              </button>
                            </td>
                            <td className="text-end">{c.completions}</td>
                            <td className="text-end">
                              <span
                                className={
                                  c.passRate >= 80
                                    ? "text-success"
                                    : c.passRate >= 60
                                      ? "text-warning"
                                      : "text-danger"
                                }
                              >
                                {c.passRate}%
                              </span>
                            </td>
                            <td className="text-end">{c.avgScore}%</td>
                            <td className="text-end">{c.failed}</td>
                          </tr>
                        ))}
                        {!data.byCourse.length ? (
                          <tr>
                            <td colSpan={5} className="text-muted px-3 py-3">
                              No completions in this range.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-5">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="mb-0">Retry analysis</h6>
                </div>
                <div className="card-body p-0">
                  <div className="table-responsive">
                    <table className="table table-sm mb-0 align-middle">
                      <thead>
                        <tr>
                          <th>Attempt #</th>
                          <th className="text-end">Count</th>
                          <th className="text-end">Pass rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.attemptBreakdown.map((row) => (
                          <tr key={row.attemptNumber}>
                            <td>{row.attemptNumber}</td>
                            <td className="text-end">{row.count}</td>
                            <td className="text-end">{row.passRate}%</td>
                          </tr>
                        ))}
                        {!data.attemptBreakdown.length ? (
                          <tr>
                            <td colSpan={3} className="text-muted px-3 py-3">
                              No attempt data yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <h6 className="mb-0">Question analytics</h6>
              <div className="btn-group btn-group-sm" role="group" aria-label="Question view">
                <button
                  type="button"
                  className={`btn btn-outline-primary ${questionView === "low" ? "active" : ""}`}
                  onClick={() => setQuestionView("low")}
                >
                  Needs review
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-primary ${questionView === "high" ? "active" : ""}`}
                  onClick={() => setQuestionView("high")}
                >
                  Strong
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-primary ${questionView === "all" ? "active" : ""}`}
                  onClick={() => setQuestionView("all")}
                >
                  All
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-sm mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Course</th>
                      <th className="text-end">Presented</th>
                      <th className="text-end">Correct</th>
                      <th className="text-end">Incorrect</th>
                      <th className="text-end">Correct rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionRows.map((q, i) => (
                      <tr key={`${q.sourceId}-${i}-${q.stem.slice(0, 24)}`}>
                        <td style={{ maxWidth: 420 }}>{q.stem}</td>
                        <td className="small text-muted">{q.sourceTitle}</td>
                        <td className="text-end">{q.presented}</td>
                        <td className="text-end">{q.correct}</td>
                        <td className="text-end">{q.incorrect}</td>
                        <td className="text-end">
                          <span
                            className={
                              q.correctRate >= 80
                                ? "text-success"
                                : q.correctRate >= 60
                                  ? "text-warning"
                                  : "text-danger"
                            }
                          >
                            {q.correctRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!questionRows.length ? (
                      <tr>
                        <td colSpan={6} className="text-muted px-3 py-3">
                          No question analytics for this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h6 className="mb-0">Recent completions</h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-sm mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>EMPLOYEE #</th>
                      <th>Course</th>
                      <th className="text-end">Score</th>
                      <th>Result</th>
                      <th className="text-end">Attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCompletions.map((c) => (
                      <tr key={c.id}>
                        <td className="small text-nowrap">{formatWhen(c.completedAt)}</td>
                        <td>{c.employeeNumber}</td>
                        <td>{c.sourceTitle}</td>
                        <td className="text-end">
                          {c.scorePercent}%
                          <span className="text-muted small"> / {c.passingPercent}%</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              c.result === "PASSED" ? "bg-label-success" : "bg-label-danger"
                            }`}
                          >
                            {c.result}
                          </span>
                        </td>
                        <td className="text-end">{c.attemptNumber}</td>
                      </tr>
                    ))}
                    {!data.recentCompletions.length ? (
                      <tr>
                        <td colSpan={6} className="text-muted px-3 py-3">
                          No completions recorded yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
