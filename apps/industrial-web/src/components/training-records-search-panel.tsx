"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@forge/web-kit";
import { trainingApi, type TrainingRecordSearchRow } from "@/features/training/api";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const raw = typeof value === "string" ? value : value.toISOString();
  return raw.slice(0, 10);
}

export function TrainingRecordsSearchPanel() {
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [course, setCourse] = useState("");
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TrainingRecordSearchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const hasFilter = Boolean(course.trim() || q.trim());
  const pageCount = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  const filteredCourseOptions = useMemo(() => {
    const needle = draftQ.trim().toLowerCase();
    if (!needle || course) return courseNames;
    return courseNames.filter((name) => name.toLowerCase().includes(needle)).slice(0, 200);
  }, [courseNames, draftQ, course]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const names = await trainingApi.listRecordCourseNames();
        if (!cancelled) setCourseNames(names);
      } catch (e) {
        if (!cancelled) {
          setCatalogError(
            e instanceof ApiError ? e.message : "Could not load training course list",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(
    async (nextPage = 1, overrides?: { course?: string; q?: string }) => {
      const nextCourse = overrides?.course ?? course;
      const nextQ = overrides?.q ?? q;
      if (!nextCourse.trim() && !nextQ.trim()) {
        setItems([]);
        setTotal(0);
        setPage(1);
        setError(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await trainingApi.searchRecords({
          ...(nextCourse.trim() ? { course: nextCourse.trim() } : {}),
          ...(nextQ.trim() && !nextCourse.trim() ? { q: nextQ.trim() } : {}),
          page: nextPage,
          pageSize: 50,
        });
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
        setPageSize(res.pageSize);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not search training records");
        setItems([]);
        setTotal(0);
      } finally {
        setBusy(false);
      }
    },
    [course, q],
  );

  function applyTextSearch(event: FormEvent) {
    event.preventDefault();
    const nextQ = draftQ.trim();
    if (!nextQ) return;
    const exact =
      courseNames.find((name) => name.toLowerCase() === nextQ.toLowerCase()) ?? "";
    if (exact) {
      setCourse(exact);
      setQ("");
      setDraftQ(exact);
      void search(1, { course: exact, q: "" });
      return;
    }
    setCourse("");
    setQ(nextQ);
    void search(1, { course: "", q: nextQ });
  }

  function selectCourse(name: string) {
    setCourse(name);
    setQ("");
    setDraftQ(name);
    void search(1, { course: name, q: "" });
  }

  function clearSearch() {
    setCourse("");
    setQ("");
    setDraftQ("");
    setItems([]);
    setTotal(0);
    setPage(1);
    setError(null);
  }

  return (
    <div className="card">
      <div className="card-body">
        <form className="row g-2 align-items-end mb-3" onSubmit={applyTextSearch}>
          <div className="col-md-8">
            <label className="form-label" htmlFor="training-record-search-q">
              Search training type / course
            </label>
            <input
              id="training-record-search-q"
              className="form-control"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="e.g. forklift, lockout, HACCP"
              disabled={busy}
              list="training-record-course-suggestions"
            />
            <datalist id="training-record-course-suggestions">
              {filteredCourseOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="col-md-4 d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || !draftQ.trim()}>
              {busy ? "Searching…" : "Search"}
            </button>
            {hasFilter ? (
              <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={clearSearch}>
                Clear
              </button>
            ) : null}
          </div>
        </form>

        {catalogError ? <div className="alert alert-warning">{catalogError}</div> : null}
        {error ? <div className="alert alert-warning">{error}</div> : null}

        {courseNames.length ? (
          <div className="mb-3">
            <div className="small text-muted mb-2">Or pick a known training type</div>
            <div className="d-flex flex-wrap gap-2" style={{ maxHeight: 140, overflowY: "auto" }}>
              {filteredCourseOptions.slice(0, 40).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`btn btn-sm ${course === name ? "btn-primary" : "btn-outline-secondary"}`}
                  disabled={busy}
                  onClick={() => selectCourse(name)}
                >
                  {name}
                </button>
              ))}
              {filteredCourseOptions.length > 40 ? (
                <span className="small text-muted align-self-center">
                  +{filteredCourseOptions.length - 40} more — type to narrow
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {!hasFilter ? (
          <p className="text-muted mb-0">
            Search or select a training type to see who has that record.
          </p>
        ) : null}

        {hasFilter ? (
          <>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <div className="small text-muted">
                {busy
                  ? "Searching…"
                  : `${total} record${total === 1 ? "" : "s"}${
                      course ? ` for “${course}”` : q ? ` matching “${q}”` : ""
                    }`}
              </div>
              {pageCount > 1 ? (
                <div className="d-flex gap-2 align-items-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy || page <= 1}
                    onClick={() => void search(page - 1)}
                  >
                    Previous
                  </button>
                  <span className="small text-muted">
                    Page {page} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy || page >= pageCount}
                    onClick={() => void search(page + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Emp #</th>
                    <th>Course</th>
                    <th>Result</th>
                    <th>Score</th>
                    <th>Attempts</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const name = personNameDisplay(row.displayName) || "Unlinked record";
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.personnelId ? (
                            <Link href={personFileHref(row.personnelId)} className="fw-semibold">
                              {name}
                            </Link>
                          ) : (
                            <span className="text-muted">{name}</span>
                          )}
                          {row.personnelArchived ? (
                            <span className="badge bg-label-secondary ms-2">Archived</span>
                          ) : null}
                        </td>
                        <td>{row.employeeNumber || "—"}</td>
                        <td>
                          {row.title}
                          {row.courseName && row.courseName !== row.title ? (
                            <div className="small text-muted">{row.courseName}</div>
                          ) : null}
                        </td>
                        <td>{row.result || "—"}</td>
                        <td>{row.scorePercent != null ? `${row.scorePercent}%` : "—"}</td>
                        <td>{row.attemptNumber != null ? `#${row.attemptNumber}` : "—"}</td>
                        <td>{formatDate(row.completedAt)}</td>
                      </tr>
                    );
                  })}
                  {!busy && !items.length ? (
                    <tr>
                      <td colSpan={7} className="text-muted">
                        No training records matched that search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
