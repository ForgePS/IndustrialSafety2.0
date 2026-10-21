"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { TenantBrandHeader } from "@/components/tenant-brand-header";
import {
  clearStoredPortalSession,
  defaultEmployeeNumberInput,
  formatClock,
  isEmployeeNumberComplete,
  isTrainingAccessPortalPath,
  letterFor,
  readStoredPortalSession,
  resolveTrainingPublicToken,
  updateEmployeeNumberInput,
  writeStoredPortalSession,
  type PublicQuizResults,
  type PublicQuizRunner,
  type PublicTrainingAssignee,
  type PublicTrainingContext,
} from "@/lib/training-public";
import { TrainingAccessPortalForm } from "@/components/training-access-portal";
import { TrainingPortalLauncher } from "@/components/training-portal-launcher";
import { TrainingMaterialViewer } from "@/components/training-material-viewer";
import { fetchPublicTrainingMaterialBlob, fetchPublicTrainingMaterialViewUrl } from "@/features/training/materials";
import type { TrainingMaterial } from "@/features/training/types";
import { personNameDisplay } from "@/lib/person-name-display";
import { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";

type PendingFeedback = {
  selectedIndex: number;
  correct: boolean;
  explanation?: string;
  pageRef?: string;
  correctIndex?: number;
  done: boolean;
};

type PublicScreen = "gate" | "assignment" | "quiz" | "results";

function TrainingPublicForm({ token }: { token: string }) {
  const [context, setContext] = useState<PublicTrainingContext | null>(null);
  const [assignee, setAssignee] = useState<PublicTrainingAssignee | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [employeeNumber, setEmployeeNumber] = useState(defaultEmployeeNumberInput);
  const [screen, setScreen] = useState<PublicScreen>("gate");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [runner, setRunner] = useState<PublicQuizRunner | null>(null);
  const [results, setResults] = useState<PublicQuizResults | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const loadContext = useCallback(async () => {
    const data = await apiGet<PublicTrainingContext>(
      `/api/v1/public/training/${encodeURIComponent(token)}`,
    );
    setContext(data);
  }, [token]);

  const applyAssigneeSession = useCallback(
    (verified: PublicTrainingAssignee) => {
      setAssignee(verified);
      setEmployeeNumber(verified.employeeNumber);
      if (verified.sessionToken) {
        setSessionToken(verified.sessionToken);
        writeStoredPortalSession(token, {
          sessionToken: verified.sessionToken,
          sessionExpiresAt: verified.sessionExpiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          displayName: verified.displayName,
          employeeNumber: verified.employeeNumber,
        });
      }
    },
    [token],
  );

  const publicCredentials = useCallback(() => {
    if (sessionToken) return { sessionToken };
    if (assignee?.sessionToken) return { sessionToken: assignee.sessionToken };
    if (assignee?.employeeNumber) return { employeeNumber: assignee.employeeNumber };
    const trimmed = employeeNumber.trim();
    return trimmed ? { employeeNumber: trimmed } : {};
  }, [assignee, employeeNumber, sessionToken]);

  const clearPortalSession = useCallback(async () => {
    const activeToken = sessionToken ?? assignee?.sessionToken ?? readStoredPortalSession(token)?.sessionToken;
    clearStoredPortalSession(token);
    setSessionToken(null);
    if (activeToken) {
      try {
        await apiSend(
          `/api/v1/public/training/${encodeURIComponent(token)}/session/logout`,
          "POST",
          { sessionToken: activeToken },
        );
      } catch {
        // Best-effort logout when switching employees or leaving the gate.
      }
    }
  }, [assignee?.sessionToken, sessionToken, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await loadContext();
        const stored = readStoredPortalSession(token);
        if (stored?.sessionToken) {
          const resumed = await apiSend<PublicTrainingAssignee>(
            `/api/v1/public/training/${encodeURIComponent(token)}/session/resume`,
            "POST",
            { sessionToken: stored.sessionToken },
          );
          if (!cancelled) {
            applyAssigneeSession(resumed);
            setScreen("assignment");
          }
        }
      } catch (e) {
        if (!cancelled) {
          if (readStoredPortalSession(token)) {
            clearStoredPortalSession(token);
          }
          if (!(e instanceof ApiError && e.message.includes("session"))) {
            setError(e instanceof ApiError ? e.message : "Training link is invalid or revoked");
          }
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadContext, applyAssigneeSession]);

  useEffect(() => {
    if (!runner?.timerSeconds || pendingFeedback || runner.done || !runner.question) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(runner.timerSeconds);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev == null || prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner?.question?.id, runner?.timerSeconds, runner?.done, pendingFeedback, busy]);

  useEffect(() => {
    if (secondsLeft === 0 && runner?.question && !pendingFeedback && !busy) {
      void submitAnswer(999, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const quizProgressPct = useMemo(() => {
    if (!runner || runner.done) return 100;
    if (runner.mode === "ADAPTIVE" && runner.mastery?.total) {
      return Math.round((runner.mastery.mastered / runner.mastery.total) * 100);
    }
    if (runner.total) return Math.round(((runner.index ?? 0) / runner.total) * 100);
    return 0;
  }, [runner]);

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    const value = employeeNumber.trim();
    if (!isEmployeeNumberComplete(value)) {
      setError("Enter your EMPLOYEE number.");
      return;
    }
    unlockTrainingAudioPlayback();
    setBusy(true);
    setError(null);
    try {
      const verified = await apiSend<PublicTrainingAssignee>(
        `/api/v1/public/training/${encodeURIComponent(token)}/verify`,
        "POST",
        { employeeNumber: value },
      );
      applyAssigneeSession(verified);
      setScreen("assignment");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "EMPLOYEE number not recognized for this assignment");
    } finally {
      setBusy(false);
    }
  }

  function applyNextPayload(next: PublicQuizRunner) {
    if (next.done) {
      setRunner({ done: true, ...(next.mode ? { mode: next.mode } : {}), ...(next.mastery ? { mastery: next.mastery } : {}) });
      return;
    }
    setRunner(next);
    setPendingFeedback(null);
  }

  async function startQuiz() {
    if (!assignee) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setRunner(null);
    setPendingFeedback(null);
    try {
      const created = await apiSend<{
        attempt: { id: string };
        next: PublicQuizRunner;
      }>(`/api/v1/public/training/${encodeURIComponent(token)}/quizzes`, "POST", publicCredentials());
      setAttemptId(created.attempt.id);
      applyNextPayload(created.next);
      setScreen("quiz");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start quiz");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(selectedIndex: number, fromTimeout = false) {
    if (!attemptId || !assignee || !runner?.question || pendingFeedback) return;
    setBusy(true);
    setSecondsLeft(null);
    try {
      const res = await apiSend<{
        correct: boolean;
        done: boolean;
        explanation?: string;
        pageRef?: string;
        correctIndex?: number;
      }>(`/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/answer`, "POST", {
        ...publicCredentials(),
        questionId: runner.question.id,
        selectedIndex: fromTimeout ? 999 : selectedIndex,
      });

      const showFeedback = Boolean(runner.feedbackEnabled ?? context?.feedbackEnabled) || fromTimeout;
      if (showFeedback) {
        setPendingFeedback({
          selectedIndex: fromTimeout ? 999 : selectedIndex,
          correct: res.correct,
          ...(res.explanation ? { explanation: res.explanation } : {}),
          ...(res.pageRef ? { pageRef: res.pageRef } : {}),
          ...(res.correctIndex !== undefined ? { correctIndex: res.correctIndex } : {}),
          done: res.done,
        });
        if (res.done) {
          const r = await apiSend<PublicQuizResults>(
            `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/results`,
            "POST",
            publicCredentials(),
          );
          setResults(r);
        }
      } else if (res.done) {
        const r = await apiSend<PublicQuizResults>(
          `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/results`,
          "POST",
          publicCredentials(),
        );
        setResults(r);
        setRunner({ done: true });
        setScreen("results");
      } else {
        const next = await apiSend<PublicQuizRunner>(
          `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/next`,
          "POST",
          publicCredentials(),
        );
        applyNextPayload(next);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Answer failed";
      if (/not in progress/i.test(msg) && attemptId) {
        try {
          const r = await apiSend<PublicQuizResults>(
            `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/results`,
            "POST",
            publicCredentials(),
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
    if (!attemptId || !assignee || !pendingFeedback) return;
    if (pendingFeedback.done) {
      setPendingFeedback(null);
      setRunner((prev) => ({ done: true, ...(prev?.mode ? { mode: prev.mode } : {}) }));
      setScreen("results");
      return;
    }
    setBusy(true);
    try {
      setPendingFeedback(null);
      const next = await apiSend<PublicQuizRunner>(
        `/api/v1/public/training/${encodeURIComponent(token)}/attempts/${encodeURIComponent(attemptId)}/next`,
        "POST",
        publicCredentials(),
      );
      applyNextPayload(next);
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

  const passed =
    results && assignee ? results.percent >= (assignee.passingPercent ?? context?.passingPercent ?? 70) : false;

  return (
    <div className="container py-4" style={{ maxWidth: "48rem" }}>
      <TenantBrandHeader
        tenantKey={context?.tenantKey}
        companyName={context?.companyName}
        logoUrl={context?.logoUrl}
        title={context?.title ?? "Training assignment"}
        subtitle="Training assignment"
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {busy && !context ? (
        <p className="text-muted">Loading assignment…</p>
      ) : null}

      {context && screen === "gate" ? (
        <div className="card">
          <div className="card-body">
            <h1 className="h4 mb-2">{context.title}</h1>
            <p className="text-muted mb-1">{context.sourceTitle}</p>
            {context.description ? <p className="mb-3">{context.description}</p> : null}
            <p className="small text-muted mb-3">
              Pass {context.passingPercent}%
              {context.dueAt ? ` · Due ${new Date(context.dueAt).toLocaleDateString()}` : ""}
            </p>
            <form onSubmit={(e) => void onVerify(e)}>
              <label className="form-label" htmlFor="training-public-employee">
                EMPLOYEE number
              </label>
              <input
                id="training-public-employee"
                className="form-control mb-3"
                placeholder="21055"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(updateEmployeeNumberInput(e.target.value))}
                autoComplete="off"
                required
              />
              <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                Continue
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {context && assignee && screen === "assignment" ? (
        <div className="card">
          <div className="card-body">
            <div className="d-flex justify-content-between flex-wrap gap-2 mb-2">
              <div>
                <h2 className="h5 mb-1">{assignee.title}</h2>
                <p className="text-muted small mb-0">
                  {personNameDisplay(assignee.displayName)} · #{assignee.employeeNumber}
                </p>
              </div>
              <span
                className={`badge align-self-start ${
                  assignee.status === "PASSED"
                    ? "bg-success"
                    : assignee.status === "IN_PROGRESS"
                      ? "bg-primary"
                      : "bg-secondary"
                }`}
              >
                {assignee.status.replace(/_/g, " ")}
              </span>
            </div>
            {assignee.description ? <p>{assignee.description}</p> : null}
            <p className="text-muted small">
              {assignee.sourceTitle} · Pass {assignee.passingPercent}%
              {assignee.bestPercent != null ? ` · Best ${assignee.bestPercent}%` : ""}
            </p>
            {context.material && (sessionToken ?? assignee?.sessionToken) ? (
              <TrainingMaterialViewer
                embedded
                immersive
                material={{
                  id: context.material.id,
                  title: context.material.title,
                  mimeType: context.material.mimeType ?? "application/octet-stream",
                  originalFilename:
                    context.material.originalFilename?.trim() || `${context.material.title}.pptx`,
                  category: context.material.category ?? "GENERAL",
                  byteSize: 0,
                  status: "ACTIVE",
                  visibility: "PUBLISHED",
                } satisfies TrainingMaterial}
                fetchBlob={(materialId) =>
                  fetchPublicTrainingMaterialBlob({
                    accessToken: token,
                    materialId,
                    sessionToken: (sessionToken ?? assignee?.sessionToken)!,
                  })
                }
                fetchViewUrl={(materialId) =>
                  fetchPublicTrainingMaterialViewUrl({
                    accessToken: token,
                    materialId,
                    sessionToken: (sessionToken ?? assignee?.sessionToken)!,
                  })
                }
                onClose={() => undefined}
              />
            ) : context.material ? (
              <div className="alert alert-secondary small" role="status">
                Study material linked: <strong>{context.material.title}</strong>. Sign in again to
                view it in the browser.
              </div>
            ) : null}
            <div className="d-flex flex-wrap gap-2 mt-3">
              {assignee.status === "PASSED" ? (
                <p className="text-success mb-0">You have already passed this assignment.</p>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startQuiz()}>
                  {assignee.status === "IN_PROGRESS" ? "Resume quiz" : "Take quiz"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  void (async () => {
                    await clearPortalSession();
                    setAssignee(null);
                    setEmployeeNumber(defaultEmployeeNumberInput());
                    setScreen("gate");
                  })();
                }}
              >
                Switch EMPLOYEE
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {screen === "quiz" && runner?.question && !runner.done ? (
        <div>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <div className="text-muted small">
              {runner.mode === "ADAPTIVE" ? (
                <>
                  Adaptive · Mastered {runner.mastery?.mastered ?? 0}/{runner.mastery?.total ?? "—"}
                </>
              ) : (
                <>
                  Question {(runner.index ?? 0) + 1}
                  {runner.total ? ` of ${runner.total}` : ""}
                </>
              )}
              {context ? ` · ${context.title}` : ""}
            </div>
            {secondsLeft != null ? (
              <span
                className={`badge ${
                  secondsLeft <= 12 ? "bg-danger" : secondsLeft <= 30 ? "bg-warning" : "bg-label-secondary"
                }`}
              >
                {formatClock(secondsLeft)}
              </span>
            ) : null}
          </div>
          <div className="progress mb-3" style={{ height: "0.4rem" }} aria-hidden>
            <div className="progress-bar" style={{ width: `${quizProgressPct}%` }} />
          </div>
          <h5 className="mb-3">{runner.question.stem}</h5>
          <div className="d-grid gap-2">
            {runner.question.choices.map((choice, i) => (
              <button
                key={`${runner.question!.id}-${i}`}
                type="button"
                className={choiceClass(i)}
                disabled={busy || Boolean(pendingFeedback)}
                onClick={() => void submitAnswer(i)}
              >
                <strong className="me-2">{letterFor(i)}.</strong>
                {choice}
              </button>
            ))}
          </div>
          {pendingFeedback ? (
            <div
              className={`alert mt-3 ${pendingFeedback.correct ? "alert-success" : "alert-danger"}`}
              role="status"
            >
              <strong>
                {pendingFeedback.selectedIndex === 999
                  ? "Time expired"
                  : pendingFeedback.correct
                    ? "Correct"
                    : "Incorrect"}
              </strong>
              {pendingFeedback.explanation ? <div className="mt-1">{pendingFeedback.explanation}</div> : null}
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
      ) : null}

      {(screen === "results" || (results && runner?.done)) && results ? (
        <div className="card">
          <div className="card-body text-center">
            <div
              className={`d-inline-flex align-items-center justify-content-center rounded-circle mb-3 ${
                passed ? "bg-label-success" : "bg-label-warning"
              }`}
              style={{ width: "5.5rem", height: "5.5rem", fontSize: "2rem", fontWeight: 800 }}
            >
              {results.letterGrade}
            </div>
            <h2 className="h5 mb-1">
              {results.scoreCorrect}/{results.scoreTotal} correct · {results.percent}%
            </h2>
            <p className={passed ? "text-success" : "text-warning"}>
              {passed
                ? "You passed this assignment."
                : `Passing score is ${assignee?.passingPercent ?? context?.passingPercent ?? 70}%. You can try again.`}
            </p>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => {
                setResults(null);
                setRunner(null);
                setAttemptId(null);
                setScreen("assignment");
              }}
            >
              Back to assignment
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TrainingPublicWorkspaceInner() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const token = resolveTrainingPublicToken({
    pathname,
    routeToken: typeof params?.token === "string" ? params.token : null,
    queryToken: searchParams.get("token"),
  });

  if (!token) {
    if (isTrainingAccessPortalPath(pathname)) {
      return <TrainingPortalLauncher />;
    }
    return (
      <div className="container py-5">
        <div className="alert alert-warning mb-0">Training link is missing or invalid.</div>
      </div>
    );
  }

  if (isTrainingAccessPortalPath(pathname)) {
    return <TrainingAccessPortalForm token={token} />;
  }

  return <TrainingPublicForm token={token} />;
}

export function TrainingPublicWorkspace() {
  return (
    <Suspense
      fallback={
        <div className="container py-5">
          <p className="text-muted mb-0">Loading training assignment…</p>
        </div>
      }
    >
      <TrainingPublicWorkspaceInner />
    </Suspense>
  );
}
