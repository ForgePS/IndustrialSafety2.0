"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { TenantBrandHeader } from "@/components/tenant-brand-header";
import {
  clearStoredPortalSession,
  courseContentRequirementMet,
  defaultEmployeeNumberInput,
  formatClock,
  isEmployeeNumberComplete,
  isGroupPresented,
  letterFor,
  readStoredPortalSession,
  updateEmployeeNumberInput,
  writeStoredPortalSession,
  type PublicAccessLinkContext,
  type PublicCourseMaterial,
  type PublicCoursePlayer,
  type PublicPortalAssignment,
  type PublicPortalSession,
  type PublicQuizResults,
  type PublicQuizRunner,
} from "@/lib/training-public";
import { TrainingMaterialViewer } from "@/components/training-material-viewer";
import {
  fetchPublicTrainingMaterialBlob,
  fetchPublicTrainingMaterialViewUrl,
} from "@/features/training/materials";
import { trainingApi } from "@/features/training/api";
import type { TrainingMaterial } from "@/features/training/types";
import { personNameDisplay } from "@/lib/person-name-display";
import { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";

type AccessScreen = "gate" | "dashboard" | "course" | "quiz" | "results";
type DashboardTab = "training" | "transcript" | "certifications";

const DEFAULT_ACK_TEXT =
  "I acknowledge that I have reviewed this training material and understand the requirements.";

function statusBadgeClass(status: string) {
  if (status === "PASSED") return "bg-success";
  if (status === "IN_PROGRESS") return "bg-primary";
  if (status === "OVERDUE") return "bg-danger";
  return "bg-secondary";
}

function isOverdue(assignment: PublicPortalAssignment) {
  return Boolean(
    assignment.dueAt &&
    assignment.status !== "PASSED" &&
    new Date(assignment.dueAt).getTime() < Date.now(),
  );
}

function isDueSoon(assignment: PublicPortalAssignment) {
  if (!assignment.dueAt || assignment.status === "PASSED") return false;
  const due = new Date(assignment.dueAt).getTime();
  const now = Date.now();
  return due >= now && due <= now + 7 * 24 * 60 * 60 * 1000;
}

function portalMaterialRow(material: PublicCourseMaterial): TrainingMaterial {
  return {
    id: material.id,
    title: material.title,
    mimeType: material.mimeType ?? "application/octet-stream",
    originalFilename: material.originalFilename?.trim() || `${material.title}.pptx`,
    category: material.category ?? "GENERAL",
    byteSize: 0,
    status: "ACTIVE",
    visibility: "PUBLISHED",
  };
}

export function TrainingAccessPortalForm({ token }: { token: string }) {
  const apiAccess = `/api/v1/public/training/access/${encodeURIComponent(token)}`;
  const apiTraining = `/api/v1/public/training/${encodeURIComponent(token)}`;

  const [context, setContext] = useState<PublicAccessLinkContext | null>(null);
  const [portal, setPortal] = useState<PublicPortalSession | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState(defaultEmployeeNumberInput);
  const [screen, setScreen] = useState<AccessScreen>("gate");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [course, setCourse] = useState<PublicCoursePlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [runner, setRunner] = useState<PublicQuizRunner | null>(null);
  const [results, setResults] = useState<PublicQuizResults | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<{
    selectedIndex: number;
    correct: boolean;
    explanation?: string;
    correctIndex?: number;
    done: boolean;
  } | null>(null);
  const [secondsLeft, _setSecondsLeft] = useState<number | null>(null);
  type TranscriptRow = {
    id: string;
    title: string;
    courseName?: string | null;
    result?: string | null;
    scorePercent?: number | null;
    completedAt?: string | null;
    printCompletionId?: string | null;
  };
  const [completionHistory, setCompletionHistory] = useState<
    Array<{
      completion: { id: string; result: string; scorePercent: number; completedAt: string };
      assignmentTitle: string;
      sourceTitle: string;
    }>
  >([]);
  const [transcriptRows, setTranscriptRows] = useState<TranscriptRow[]>([]);
  const [dashTab, setDashTab] = useState<DashboardTab>("training");
  const [trainingStatusFilter, setTrainingStatusFilter] = useState("ALL");
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [transcriptSort, setTranscriptSort] = useState<
    "date-desc" | "date-asc" | "score-desc" | "name"
  >("date-desc");
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackSavedAt, setAckSavedAt] = useState<string | null>(null);

  const activeSession = sessionToken ?? portal?.sessionToken ?? null;
  const selectedAssignment = useMemo(
    () => portal?.assignments.find((a) => a.assignmentId === selectedAssignmentId) ?? null,
    [portal, selectedAssignmentId],
  );

  const applyTranscriptRows = useCallback((rows: TranscriptRow[] | undefined | null) => {
    const records = (rows ?? []).map((row) => ({
      ...row,
      completedAt:
        typeof row.completedAt === "string"
          ? row.completedAt
          : row.completedAt
            ? String(row.completedAt)
            : null,
    }));
    setTranscriptRows(records);
  }, []);

  const applyPortalSession = useCallback(
    (verified: PublicPortalSession) => {
      setPortal(verified);
      setEmployeeNumber(verified.employeeNumber);
      setSessionToken(verified.sessionToken);
      applyTranscriptRows(verified.trainingRecords);
      writeStoredPortalSession(token, {
        sessionToken: verified.sessionToken,
        sessionExpiresAt: verified.sessionExpiresAt,
        displayName: verified.displayName,
        employeeNumber: verified.employeeNumber,
      });
    },
    [applyTranscriptRows, token],
  );

  const credentials = useCallback(() => {
    const st = activeSession;
    return st ? { sessionToken: st } : {};
  }, [activeSession]);

  const loadCompletionHistory = useCallback(
    async (session: string) => {
      try {
        const history = await apiGet<{
          completions: Array<{
            completion: { id: string; result: string; scorePercent: number; completedAt: string };
            assignmentTitle: string;
            sourceTitle: string;
          }>;
          trainingRecords?: TranscriptRow[];
        }>(`${apiAccess}/history?sessionToken=${encodeURIComponent(session)}`);
        setCompletionHistory(history.completions ?? []);
        if (Array.isArray(history.trainingRecords)) {
          applyTranscriptRows(history.trainingRecords);
        }
      } catch (e) {
        // Keep any transcript rows already seeded from verify/resume.
        setCompletionHistory([]);
        setError(e instanceof ApiError ? e.message : "Could not refresh training transcript");
      }
    },
    [apiAccess, applyTranscriptRows],
  );

  const refreshPortal = useCallback(async () => {
    if (!activeSession) return;
    const resumed = await apiSend<PublicPortalSession>(`${apiAccess}/session/resume`, "POST", {
      sessionToken: activeSession,
    });
    applyPortalSession(resumed);
    await loadCompletionHistory(resumed.sessionToken);
  }, [activeSession, apiAccess, applyPortalSession, loadCompletionHistory]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const data = await apiGet<PublicAccessLinkContext>(apiAccess);
        if (cancelled) return;
        setContext(data);
        const stored = readStoredPortalSession(token);
        if (stored?.sessionToken) {
          const resumed = await apiSend<PublicPortalSession>(
            `${apiAccess}/session/resume`,
            "POST",
            {
              sessionToken: stored.sessionToken,
            },
          );
          if (!cancelled) {
            applyPortalSession(resumed);
            setScreen("dashboard");
            if (!resumed.assignments?.length && (resumed.trainingRecords?.length ?? 0) > 0) {
              setDashTab("transcript");
            }
            await loadCompletionHistory(resumed.sessionToken);
          }
        }
      } catch (e) {
        if (!cancelled) {
          clearStoredPortalSession(token);
          setError(
            e instanceof ApiError ? e.message : "Training portal link is invalid or revoked",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiAccess, applyPortalSession, loadCompletionHistory, token]);

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    const value = employeeNumber.trim();
    if (!isEmployeeNumberComplete(value)) {
      setError("Enter your EMPLOYEE number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const verified = await apiSend<PublicPortalSession>(`${apiAccess}/verify`, "POST", {
        employeeNumber: value,
      });
      applyPortalSession(verified);
      setScreen("dashboard");
      if (!verified.assignments?.length && (verified.trainingRecords?.length ?? 0) > 0) {
        setDashTab("transcript");
      }
      await loadCompletionHistory(verified.sessionToken);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "EMPLOYEE number could not be verified");
    } finally {
      setBusy(false);
    }
  }

  const filteredAssignments = useMemo(() => {
    const list = (portal?.assignments ?? []).filter((a) => a.status !== "PASSED");
    if (trainingStatusFilter === "ALL") return list;
    if (trainingStatusFilter === "DUE_SOON") return list.filter(isDueSoon);
    if (trainingStatusFilter === "OVERDUE") return list.filter(isOverdue);
    if (trainingStatusFilter === "REMAINING") return list.filter((a) => a.status !== "PASSED");
    return list.filter((a) => a.status === trainingStatusFilter);
  }, [portal?.assignments, trainingStatusFilter]);

  const certifications = useMemo(
    () =>
      completionHistory
        .filter((row) => row.completion.result === "PASSED")
        .sort((a, b) => b.completion.completedAt.localeCompare(a.completion.completedAt)),
    [completionHistory],
  );

  const filteredTranscript = useMemo(() => {
    const q = transcriptQuery.trim().toLowerCase();
    let rows = transcriptRows.filter((row) => {
      if (!q) return true;
      const hay = `${row.title} ${row.courseName ?? ""} ${row.result ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (transcriptSort === "name") return a.title.localeCompare(b.title);
      if (transcriptSort === "score-desc") {
        return (b.scorePercent ?? -1) - (a.scorePercent ?? -1);
      }
      const aDate = a.completedAt ?? "";
      const bDate = b.completedAt ?? "";
      if (transcriptSort === "date-asc") return aDate.localeCompare(bDate);
      return bDate.localeCompare(aDate);
    });
    return rows;
  }, [transcriptRows, transcriptQuery, transcriptSort]);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      if (activeSession) {
        await trainingApi.logoutAccessSession(token, activeSession).catch(() => undefined);
      }
    } finally {
      clearStoredPortalSession(token);
      setPortal(null);
      setSessionToken(null);
      setCompletionHistory([]);
      setTranscriptRows([]);
      setCourse(null);
      setSelectedAssignmentId(null);
      setDashTab("training");
      setScreen("gate");
      setBusy(false);
    }
  }

  async function openCourse(assignment: PublicPortalAssignment) {
    if (!activeSession) return;
    unlockTrainingAudioPlayback();
    setBusy(true);
    setError(null);
    setSelectedAssignmentId(assignment.assignmentId);
    setAcknowledged(false);
    setAckSavedAt(null);
    try {
      const player = await apiGet<PublicCoursePlayer>(
        `${apiAccess}/course/${encodeURIComponent(assignment.assignmentId)}?sessionToken=${encodeURIComponent(activeSession)}`,
      );
      setCourse(player);
      setScreen("course");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open training");
    } finally {
      setBusy(false);
    }
  }

  async function markSectionComplete(sectionId: string) {
    if (!activeSession || !course) return;
    const completed = new Set(course.progress?.sectionsCompleted ?? []);
    completed.add(sectionId);
    const requiredIds = course.sections.filter((s) => s.required).map((s) => s.id);
    const allRequiredDone = requiredIds.every((id) => completed.has(id));
    const percent =
      course.sections.length > 0
        ? Math.round((completed.size / course.sections.length) * 100)
        : allRequiredDone
          ? 100
          : 0;
    setBusy(true);
    try {
      const updated = await apiSend<{
        sectionsCompleted?: string[];
        percentComplete?: number;
        quizAvailable?: boolean;
      }>(`${apiAccess}/progress`, "POST", {
        sessionToken: activeSession,
        assignmentId: course.assignmentId,
        sectionId,
        sectionsCompleted: [...completed],
        percentComplete: percent,
        quizAvailable: allRequiredDone || course.sections.length === 0,
      });
      setCourse((prev) =>
        prev
          ? {
              ...prev,
              progress: {
                sectionsCompleted: updated.sectionsCompleted ?? [...completed],
                percentComplete: updated.percentComplete ?? percent,
                quizAvailable:
                  updated.quizAvailable ?? (allRequiredDone || prev.sections.length === 0),
              },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save progress");
    } finally {
      setBusy(false);
    }
  }

  async function saveAcknowledgement() {
    if (!activeSession || !selectedAssignmentId || !acknowledged) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await trainingApi.acknowledgeAccessCourse(token, {
        sessionToken: activeSession,
        assignmentId: selectedAssignmentId,
        acknowledgementText: DEFAULT_ACK_TEXT,
      });
      setAckSavedAt(saved.acknowledgedAt);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save acknowledgement");
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    if (!activeSession || !selectedAssignmentId) return;
    if (!acknowledged || !ackSavedAt) {
      setError("Acknowledge the course material before starting the quiz.");
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    setRunner(null);
    setPendingFeedback(null);
    try {
      const created = await apiSend<{
        attempt: { id: string };
        next: PublicQuizRunner;
      }>(`${apiTraining}/quizzes`, "POST", {
        ...credentials(),
        assignmentId: selectedAssignmentId,
      });
      setAttemptId(created.attempt.id);
      setRunner(created.next);
      setScreen("quiz");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start quiz");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(selectedIndex: number) {
    if (!attemptId || !activeSession || !runner?.question || pendingFeedback) return;
    setBusy(true);
    try {
      const res = await apiSend<{
        correct: boolean;
        done: boolean;
        explanation?: string;
        correctIndex?: number;
      }>(`${apiTraining}/attempts/${encodeURIComponent(attemptId)}/answer`, "POST", {
        ...credentials(),
        questionId: runner.question.id,
        selectedIndex,
      });
      if (runner.feedbackEnabled) {
        setPendingFeedback({
          selectedIndex,
          correct: res.correct,
          ...(res.explanation ? { explanation: res.explanation } : {}),
          ...(res.correctIndex !== undefined ? { correctIndex: res.correctIndex } : {}),
          done: res.done,
        });
        if (res.done) {
          const r = await apiSend<PublicQuizResults>(
            `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/results`,
            "POST",
            credentials(),
          );
          setResults(r);
        }
      } else if (res.done) {
        const r = await apiSend<PublicQuizResults>(
          `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/results`,
          "POST",
          credentials(),
        );
        setResults(r);
        setRunner({ done: true });
        setScreen("results");
      } else {
        const next = await apiSend<PublicQuizRunner>(
          `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/next`,
          "POST",
          credentials(),
        );
        setRunner(next);
        setPendingFeedback(null);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Answer failed";
      if (/not in progress/i.test(msg) && attemptId) {
        try {
          const r = await apiSend<PublicQuizResults>(
            `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/results`,
            "POST",
            credentials(),
          );
          setResults(r);
          setPendingFeedback(null);
          setRunner({ done: true });
          setScreen("results");
          setError(null);
          return;
        } catch {
          /* fall through */
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterFeedback() {
    if (!attemptId || !activeSession || !pendingFeedback) return;
    if (pendingFeedback.done) {
      setPendingFeedback(null);
      setRunner({ done: true });
      setScreen("results");
      return;
    }
    setBusy(true);
    try {
      setPendingFeedback(null);
      const next = await apiSend<PublicQuizRunner>(
        `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/next`,
        "POST",
        credentials(),
      );
      if (next.done) {
        setRunner({ done: true, ...(next.mode ? { mode: next.mode } : {}) });
        const r = await apiSend<PublicQuizResults>(
          `${apiTraining}/attempts/${encodeURIComponent(attemptId)}/results`,
          "POST",
          credentials(),
        );
        setResults(r);
        setScreen("results");
      } else {
        setRunner(next);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load next question");
    } finally {
      setBusy(false);
    }
  }

  function choiceClass(index: number): string {
    if (!pendingFeedback) return "btn btn-outline-primary text-start";
    if (pendingFeedback.correctIndex === index) return "btn btn-success text-start";
    if (pendingFeedback.selectedIndex === index && !pendingFeedback.correct) {
      return "btn btn-danger text-start";
    }
    return "btn btn-outline-secondary text-start";
  }

  const passingPercent = selectedAssignment?.passingPercent ?? course?.passingPercent ?? 70;
  const passed = results ? results.percent >= passingPercent : false;

  return (
    <div className="container py-4" style={{ maxWidth: "48rem" }}>
      <TenantBrandHeader
        tenantKey={context?.tenantKey}
        companyName={context?.companyName}
        logoUrl={context?.logoUrl}
        title={context?.title ?? "EMPLOYEE training"}
        subtitle="My training"
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {screen === "gate" ? (
        <div className="card">
          <div className="card-body">
            <h1 className="h4 mb-2">{context?.title ?? "EMPLOYEE training portal"}</h1>
            {context?.description ? <p className="text-muted mb-3">{context.description}</p> : null}
            {context?.portalEnabled === false ? (
              <div className="alert alert-warning mb-0">
                The company training portal is currently disabled. Contact your administrator.
              </div>
            ) : (
              <form onSubmit={(e) => void onVerify(e)}>
                <label className="form-label" htmlFor="access-employee-number">
                  EMPLOYEE number
                </label>
                <input
                  id="access-employee-number"
                  className="form-control mb-2"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(updateEmployeeNumberInput(e.target.value))}
                  placeholder={context?.employeeNumberHint?.trim() || "21055"}
                  autoComplete="off"
                  required
                />
                <p className="small text-muted mb-3">
                  Use your company employee number
                  {context?.employeeNumberPrefix ? ` (${context.employeeNumberPrefix}…)` : ""}.
                </p>
                <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                  {busy ? "Verifying…" : "Continue"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {screen === "dashboard" && portal ? (
        <div className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h2 className="h5 mb-1">{personNameDisplay(portal.displayName)}</h2>
                <p className="text-muted small mb-0">
                  #{portal.employeeNumber}
                  {portal.departmentName ? ` · ${portal.departmentName}` : ""}
                  {portal.siteName ? ` · ${portal.siteName}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Assigned</small>
                  <strong>{portal.summary.assigned}</strong>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Done</small>
                  <strong>{portal.summary.completed}</strong>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Remaining</small>
                  <strong>{portal.summary.remaining}</strong>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Due soon</small>
                  <strong>{portal.summary.dueSoon ?? 0}</strong>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Overdue</small>
                  <strong>{portal.summary.overdue}</strong>
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="border rounded p-2 text-center">
                  <small className="text-muted d-block">Certs</small>
                  <strong>{portal.summary.certifications ?? certifications.length}</strong>
                </div>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <div className="btn-group" role="group" aria-label="Portal sections">
                <button
                  type="button"
                  className={`btn btn-sm ${dashTab === "training" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDashTab("training")}
                >
                  My training
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${dashTab === "transcript" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDashTab("transcript")}
                >
                  My transcript
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${dashTab === "certifications" ? "btn-primary" : "btn-outline-primary"}`}
                  onClick={() => setDashTab("certifications")}
                >
                  My certifications
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={busy || !activeSession}
                onClick={() => {
                  if (!activeSession) return;
                  void trainingApi
                    .openAccessTrainingReport(token, activeSession)
                    .catch((e: unknown) => {
                      setError(e instanceof Error ? e.message : "Could not open training report");
                    });
                }}
              >
                Print / download report
              </button>
            </div>

            {dashTab === "training" ? (
              <>
                <div className="mb-3">
                  <label className="form-label small" htmlFor="training-status-filter">
                    Status filter
                  </label>
                  <select
                    id="training-status-filter"
                    className="form-select form-select-sm"
                    style={{ maxWidth: "14rem" }}
                    value={trainingStatusFilter}
                    onChange={(e) => setTrainingStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All open</option>
                    <option value="REMAINING">Remaining</option>
                    <option value="DUE_SOON">Due soon</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="NOT_STARTED">Not started</option>
                  </select>
                </div>
                <ul className="list-group list-group-flush">
                  {filteredAssignments.map((assignment) => (
                    <li
                      key={assignment.assignmentId}
                      className="list-group-item d-flex justify-content-between align-items-center gap-2 px-0"
                    >
                      <div>
                        <strong>{assignment.title}</strong>
                        <div className="small text-muted">{assignment.sourceTitle}</div>
                        {assignment.dueAt ? (
                          <div className="small text-muted">
                            Due {assignment.dueAt.slice(0, 10)}
                            {isOverdue(assignment)
                              ? " · Overdue"
                              : isDueSoon(assignment)
                                ? " · Due soon"
                                : ""}
                          </div>
                        ) : null}
                        {assignment.bestPercent != null ? (
                          <div className="small text-muted">Score: {assignment.bestPercent}%</div>
                        ) : assignment.status === "PASSED" ? (
                          <div className="small text-muted">Passed</div>
                        ) : null}
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className={`badge ${statusBadgeClass(
                            isOverdue(assignment) ? "OVERDUE" : assignment.status,
                          )}`}
                        >
                          {(isOverdue(assignment) ? "OVERDUE" : assignment.status).replace(
                            /_/g,
                            " ",
                          )}
                          {assignment.status === "PASSED" && assignment.bestPercent != null
                            ? ` · ${assignment.bestPercent}%`
                            : ""}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          disabled={busy}
                          onClick={() => void openCourse(assignment)}
                        >
                          {assignment.status === "PASSED" ? "View" : "Open"}
                        </button>
                      </div>
                    </li>
                  ))}
                  {!filteredAssignments.length ? (
                    <li className="list-group-item text-muted px-0">
                      No training matches this filter.
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}

            {dashTab === "transcript" ? (
              <>
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <input
                    className="form-control form-control-sm"
                    style={{ maxWidth: "16rem" }}
                    placeholder="Search transcript"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                  />
                  <select
                    className="form-select form-select-sm"
                    style={{ maxWidth: "12rem" }}
                    value={transcriptSort}
                    onChange={(e) => setTranscriptSort(e.target.value as typeof transcriptSort)}
                  >
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                    <option value="score-desc">Highest score</option>
                    <option value="name">Course name</option>
                  </select>
                </div>
                <ul className="list-group list-group-flush">
                  {filteredTranscript.map((row) => {
                    const completedAt =
                      typeof row.completedAt === "string" ? row.completedAt.slice(0, 10) : null;
                    const resultLabel = (row.result ?? "COMPLETED").replace(/_/g, " ");
                    const scoreLabel = row.scorePercent != null ? `${row.scorePercent}%` : null;
                    return (
                      <li
                        key={row.id}
                        className="list-group-item d-flex justify-content-between align-items-center gap-2 px-0"
                      >
                        <div>
                          <strong>{row.title}</strong>
                          <div className="small text-muted">
                            {[
                              row.courseName && row.courseName !== row.title
                                ? row.courseName
                                : null,
                              resultLabel,
                              scoreLabel,
                              completedAt,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        {row.printCompletionId ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busy || !activeSession}
                            onClick={() => {
                              if (!activeSession || !row.printCompletionId) return;
                              void trainingApi
                                .openAccessCompletionPrintable(
                                  token,
                                  activeSession,
                                  row.printCompletionId,
                                )
                                .catch((e: unknown) => {
                                  setError(
                                    e instanceof Error ? e.message : "Could not print quiz results",
                                  );
                                });
                            }}
                          >
                            Print
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                  {!filteredTranscript.length ? (
                    <li className="list-group-item text-muted px-0">No transcript entries yet.</li>
                  ) : null}
                </ul>
              </>
            ) : null}

            {dashTab === "certifications" ? (
              <ul className="list-group list-group-flush">
                {certifications.map((row) => (
                  <li
                    key={row.completion.id}
                    className="list-group-item d-flex justify-content-between align-items-center gap-2 px-0"
                  >
                    <div>
                      <strong>{row.assignmentTitle}</strong>
                      <div className="small text-muted">
                        Certificate of completion · {row.completion.scorePercent}% ·{" "}
                        {row.completion.completedAt.slice(0, 10)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={busy || !activeSession}
                      onClick={() => {
                        if (!activeSession) return;
                        void trainingApi
                          .openAccessCompletionPrintable(token, activeSession, row.completion.id)
                          .catch((e: unknown) => {
                            setError(e instanceof Error ? e.message : "Could not open certificate");
                          });
                      }}
                    >
                      View / print
                    </button>
                  </li>
                ))}
                {!certifications.length ? (
                  <li className="list-group-item text-muted px-0">
                    No certifications yet. Passed courses appear here.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      {screen === "course" && course ? (
        <div className="card">
          <div className="card-body">
            <button
              type="button"
              className="btn btn-link btn-sm px-0 mb-2"
              onClick={() => setScreen("dashboard")}
            >
              ← Back to my training
            </button>
            <h2 className="h5">{course.title}</h2>
            {course.assigneeStatus === "PASSED" ? (
              <p className="small text-success mb-2">
                Passed
                {course.bestPercent != null ? ` · ${course.bestPercent}%` : ""}
                {course.passingPercent ? ` (required ${course.passingPercent}%)` : ""}
              </p>
            ) : (
              <p className="small text-muted mb-2">Pass {course.passingPercent}%</p>
            )}
            {isGroupPresented(course) && course.assigneeStatus !== "PASSED" ? (
              <div className="alert alert-info small py-2">
                This course was presented to your group
                {course.contentPresentedAt
                  ? ` on ${new Date(course.contentPresentedAt).toLocaleDateString()}`
                  : ""}
                . You can take the quiz now. Reviewing the content below is optional.
              </div>
            ) : null}
            {course.material && activeSession ? (
              <TrainingMaterialViewer
                embedded
                immersive
                material={portalMaterialRow(course.material)}
                fetchBlob={(materialId) =>
                  fetchPublicTrainingMaterialBlob({
                    accessToken: token,
                    materialId,
                    sessionToken: activeSession,
                    accessPortal: true,
                  })
                }
                fetchViewUrl={(materialId) =>
                  fetchPublicTrainingMaterialViewUrl({
                    accessToken: token,
                    materialId,
                    sessionToken: activeSession,
                    accessPortal: true,
                  })
                }
                onClose={() => undefined}
              />
            ) : null}
            {course.sections.length ? (
              <div className="vstack gap-3 mb-3">
                {course.sections.map((section) => {
                  const done = (course.progress?.sectionsCompleted ?? []).includes(section.id);
                  return (
                    <div key={section.id} className="border rounded p-3">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <strong>{section.title}</strong>
                        {done ? <span className="badge bg-success">Done</span> : null}
                      </div>
                      {section.contentBody ? (
                        <div className="small mb-2" style={{ whiteSpace: "pre-wrap" }}>
                          {section.contentBody}
                        </div>
                      ) : (
                        <p className="small text-muted mb-2">
                          Review this section before continuing.
                        </p>
                      )}
                      {!done ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          disabled={busy}
                          onClick={() => void markSectionComplete(section.id)}
                        >
                          Mark complete
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted">
                No course sections configured. You can proceed to the quiz.
              </p>
            )}
            {course.assigneeStatus !== "PASSED" ? (
              <div className="border rounded p-3 mb-3">
                <div className="form-check">
                  <input
                    id="course-ack"
                    type="checkbox"
                    className="form-check-input"
                    checked={acknowledged}
                    onChange={(e) => {
                      setAcknowledged(e.target.checked);
                      if (!e.target.checked) setAckSavedAt(null);
                    }}
                  />
                  <label className="form-check-label" htmlFor="course-ack">
                    {DEFAULT_ACK_TEXT}
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary mt-2"
                  disabled={busy || !acknowledged || Boolean(ackSavedAt)}
                  onClick={() => void saveAcknowledgement()}
                >
                  {ackSavedAt ? "Acknowledged" : "Save acknowledgement"}
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                busy ||
                course.assigneeStatus === "PASSED" ||
                !ackSavedAt ||
                !courseContentRequirementMet(course)
              }
              onClick={() => void startQuiz()}
            >
              {course.assigneeStatus === "PASSED" ? "Completed" : "Start quiz"}
            </button>
          </div>
        </div>
      ) : null}

      {screen === "quiz" && runner?.question ? (
        <div className="card">
          <div className="card-body">
            <p className="small text-muted mb-2">
              Question {(runner.index ?? 0) + 1}
              {runner.total ? ` of ${runner.total}` : ""}
              {secondsLeft != null ? ` · ${formatClock(secondsLeft)}` : ""}
            </p>
            <h2 className="h6 mb-3">{runner.question.stem}</h2>
            <div className="vstack gap-2">
              {runner.question.choices.map((choice, index) => (
                <button
                  key={index}
                  type="button"
                  className={choiceClass(index)}
                  disabled={busy || Boolean(pendingFeedback)}
                  onClick={() => void submitAnswer(index)}
                >
                  {letterFor(index)}. {choice}
                </button>
              ))}
            </div>
            {pendingFeedback ? (
              <div
                className={`alert mt-3 ${pendingFeedback.correct ? "alert-success" : "alert-danger"}`}
                role="status"
              >
                <strong>{pendingFeedback.correct ? "Correct" : "Incorrect"}</strong>
                {pendingFeedback.explanation ? (
                  <div className="mt-1">{pendingFeedback.explanation}</div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-primary mt-3"
                  onClick={() => void continueAfterFeedback()}
                  disabled={busy}
                >
                  {pendingFeedback.done ? "View results" : "Continue"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {screen === "results" && results ? (
        <div className="card">
          <div className="card-body text-center">
            <div
              className={`rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center ${
                passed ? "bg-label-success" : "bg-label-warning"
              }`}
              style={{ width: "5.5rem", height: "5.5rem", fontSize: "2rem", fontWeight: 800 }}
            >
              {results.letterGrade}
            </div>
            <h2 className="h5">
              {results.scoreTotal > 0
                ? `${results.scoreCorrect}/${results.scoreTotal} correct · ${results.percent}%`
                : `${results.percent}%`}
            </h2>
            <p className={passed ? "text-success" : "text-warning"}>
              {passed
                ? "You passed."
                : `Passing score is ${passingPercent}%. You can retake the quiz.`}
            </p>
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              {attemptId && activeSession ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    void trainingApi
                      .openAccessAttemptPrintable(token, activeSession, attemptId)
                      .catch((e: unknown) => {
                        setError(e instanceof Error ? e.message : "Could not print quiz results");
                      });
                  }}
                >
                  Print results
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => {
                  void refreshPortal().then(() => setScreen("dashboard"));
                }}
              >
                Back to my training
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
