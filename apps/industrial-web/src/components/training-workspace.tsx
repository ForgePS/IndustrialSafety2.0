"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { TransactionAttestationPanel } from "@/components/transaction-attestation-panel";
import { trainingApi } from "@/features/training/api";
import type {
  TrainingChapter,
  TrainingQuestion,
  TrainingSource,
  TrainingTab,
} from "@/features/training/types";

type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean }>;
};

export function TrainingWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.training.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.training.manage") || permissions.has("industrial.admin");

  const [tab, setTab] = useState<TrainingTab>("library");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<TrainingSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<TrainingChapter[]>([]);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [progress, setProgress] = useState<{
    stats: Array<Record<string, unknown>>;
    recentAttempts: Array<Record<string, unknown>>;
  } | null>(null);
  const [inProgress, setInProgress] = useState<Array<{ id: string; sourceId: string }>>([]);

  // Quiz runner state
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [quizMode, setQuizMode] = useState<"STANDARD" | "ADAPTIVE">("STANDARD");
  const [optionCount, setOptionCount] = useState(4);
  const [feedbackOn, setFeedbackOn] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [runner, setRunner] = useState<{
    question?: { id: string; stem: string; choices: string[]; pageRef?: string };
    index?: number;
    total?: number;
    done?: boolean;
    lastFeedback?: { correct: boolean; explanation?: string; pageRef?: string };
  } | null>(null);
  const [results, setResults] = useState<{
    percent: number;
    letterGrade: string;
    scoreCorrect: number;
    scoreTotal: number;
    chapterBreakdown: Array<{ chapterId: string; correct: number; total: number }>;
  } | null>(null);

  // Author forms
  const [sourceForm, setSourceForm] = useState({ title: "", edition: "", description: "" });
  const [chapterForm, setChapterForm] = useState({ title: "", pageRange: "" });
  const [questionForm, setQuestionForm] = useState({
    chapterId: "",
    stem: "",
    choices: "A\nB\nC\nD",
    correctIndex: 0,
    explanation: "",
    pageRef: "",
    status: "DRAFT",
  });
  const [busy, setBusy] = useState(false);

  const modEntry = bootstrap?.modules.find((m) => m.code === "TRAINING");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled ?? true) && canView;

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const refreshSources = useCallback(async () => {
    const data = await trainingApi.listSources();
    setSources(data.items ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          // Soft-fail: still allow when permissions present
          setBootstrap({ industrialEnabled: true, modules: [{ code: "TRAINING", awsEnabled: true }] });
          setError(e instanceof ApiError ? e.message : null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!awsReady) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshSources();
        const ip = await trainingApi.inProgress();
        if (!cancelled) setInProgress(ip ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load training");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, refreshSources]);

  async function openSource(id: string) {
    setSelectedSourceId(id);
    setBusy(true);
    setError(null);
    try {
      const [chs, qs] = await Promise.all([
        trainingApi.listChapters(id),
        trainingApi.listQuestions(id),
      ]);
      setChapters(Array.isArray(chs) ? chs : []);
      setQuestions(Array.isArray(qs) ? qs : []);
      setSelectedChapters([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load source");
    } finally {
      setBusy(false);
    }
  }

  async function loadRecords() {
    setBusy(true);
    try {
      const data = await trainingApi.listRecords();
      setRecords(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load records");
    } finally {
      setBusy(false);
    }
  }

  async function loadProgress() {
    setBusy(true);
    try {
      setProgress(await trainingApi.progress());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load progress");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab === "records") void loadRecords();
    if (tab === "progress") void loadProgress();
  }, [tab]);

  async function onCreateSource(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    try {
      const row = await trainingApi.createSource(sourceForm);
      setSourceForm({ title: "", edition: "", description: "" });
      await refreshSources();
      await openSource(row.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create source failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishSource(status: "DRAFT" | "PUBLISHED") {
    if (!selectedSourceId || !canManage) return;
    setBusy(true);
    try {
      await trainingApi.updateSource(selectedSourceId, { status });
      await refreshSources();
      await openSource(selectedSourceId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateChapter(e: FormEvent) {
    e.preventDefault();
    if (!selectedSourceId || !canManage) return;
    setBusy(true);
    try {
      await trainingApi.createChapter(selectedSourceId, {
        title: chapterForm.title,
        ...(chapterForm.pageRange ? { pageRange: chapterForm.pageRange } : {}),
        sortOrder: chapters.length,
      });
      setChapterForm({ title: "", pageRange: "" });
      await openSource(selectedSourceId);
      await refreshSources();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create chapter failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selectedSourceId || !canManage) return;
    const choices = questionForm.choices
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await trainingApi.createQuestion(selectedSourceId, {
        chapterId: questionForm.chapterId,
        stem: questionForm.stem,
        choices,
        correctIndex: Number(questionForm.correctIndex),
        ...(questionForm.explanation ? { explanation: questionForm.explanation } : {}),
        ...(questionForm.pageRef ? { pageRef: questionForm.pageRef } : {}),
        status: questionForm.status,
      });
      setQuestionForm({
        chapterId: questionForm.chapterId,
        stem: "",
        choices: "A\nB\nC\nD",
        correctIndex: 0,
        explanation: "",
        pageRef: "",
        status: "DRAFT",
      });
      await openSource(selectedSourceId);
      await refreshSources();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create question failed");
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    if (!selectedSourceId || !selectedChapters.length) {
      setError("Select a source and at least one chapter");
      return;
    }
    setBusy(true);
    setResults(null);
    setRunner(null);
    try {
      const created = await trainingApi.createQuiz({
        sourceId: selectedSourceId,
        chapterIds: selectedChapters,
        mode: quizMode,
        optionCount,
        feedbackEnabled: feedbackOn,
        timerSeconds: null,
      });
      setAttemptId(created.attempt.id);
      const next = await trainingApi.nextQuestion(created.attempt.id);
      setRunner({
        ...(next.question ? { question: next.question } : {}),
        ...(next.index !== undefined ? { index: next.index } : {}),
        ...(next.total !== undefined ? { total: next.total } : {}),
        done: next.done,
      });
      setTab("quiz");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start quiz");
    } finally {
      setBusy(false);
    }
  }

  async function resumeQuiz(id: string) {
    setBusy(true);
    try {
      await trainingApi.resume(id);
      setAttemptId(id);
      const next = await trainingApi.nextQuestion(id);
      if (next.done) {
        const r = await trainingApi.results(id);
        setResults(r);
        setRunner({ done: true });
      } else {
        setResults(null);
        setRunner({
          ...(next.question ? { question: next.question } : {}),
          ...(next.index !== undefined ? { index: next.index } : {}),
          ...(next.total !== undefined ? { total: next.total } : {}),
          done: false,
        });
      }
      setTab("quiz");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resume failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(selectedIndex: number) {
    if (!attemptId || !runner?.question) return;
    setBusy(true);
    try {
      const res = await trainingApi.answer(attemptId, runner.question.id, selectedIndex);
      const feedback = {
        correct: res.correct,
        ...(res.explanation ? { explanation: res.explanation } : {}),
        ...(res.pageRef ? { pageRef: res.pageRef } : {}),
      };
      if (res.done) {
        const r = await trainingApi.results(attemptId);
        setResults(r);
        setRunner({
          done: true,
          lastFeedback: feedback,
        });
      } else {
        const next = await trainingApi.nextQuestion(attemptId);
        setRunner({
          ...(next.question ? { question: next.question } : {}),
          ...(next.index !== undefined ? { index: next.index } : {}),
          ...(next.total !== undefined ? { total: next.total } : {}),
          done: next.done,
          lastFeedback: feedback,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Answer failed");
    } finally {
      setBusy(false);
    }
  }

  async function bookmarkCurrent() {
    if (!attemptId || !runner?.question) return;
    try {
      await trainingApi.bookmark(attemptId, runner.question.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bookmark failed");
    }
  }

  async function retake(mode: "wrong" | "bookmarked" | "same" | "new") {
    if (!attemptId) return;
    setBusy(true);
    try {
      const created = await trainingApi.retake(attemptId, mode);
      setAttemptId(created.attempt.id);
      setResults(null);
      const next = await trainingApi.nextQuestion(created.attempt.id);
      setRunner({
        ...(next.question ? { question: next.question } : {}),
        ...(next.index !== undefined ? { index: next.index } : {}),
        ...(next.total !== undefined ? { total: next.total } : {}),
        done: next.done,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Retake failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return <ModuleUnavailable moduleName={moduleName} status="permission" />;
  }
  if (bootstrap && !awsReady) {
    return <ModuleUnavailable moduleName={moduleName} status="disabled" />;
  }

  const tabs: Array<{ id: TrainingTab; label: string; show?: boolean }> = [
    { id: "library", label: "Library" },
    { id: "quiz", label: "Quiz" },
    { id: "progress", label: "Progress" },
    { id: "records", label: "Records" },
    { id: "author", label: "Author", show: canManage },
  ];

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h4 className="mb-0">{moduleName}</h4>
        {busy ? <span className="text-muted small">Working…</span> : null}
      </div>
      <div className="card-body">
        {error ? (
          <div className="alert alert-warning" role="alert">
            {error}
            <button type="button" className="btn-close float-end" onClick={() => setError(null)} />
          </div>
        ) : null}

        <ul className="nav nav-pills mb-3" role="tablist">
          {tabs
            .filter((t) => t.show !== false)
            .map((t) => (
              <li className="nav-item" key={t.id}>
                <button
                  type="button"
                  className={`nav-link ${tab === t.id ? "active" : ""}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              </li>
            ))}
        </ul>

        {tab === "library" ? (
          <div>
            {inProgress.length > 0 ? (
              <div className="mb-3">
                <h6>Resume in progress</h6>
                <div className="d-flex flex-wrap gap-2">
                  {inProgress.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => void resumeQuiz(a.id)}
                    >
                      Resume attempt
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="row g-3">
              <div className="col-md-5">
                <h6>Sources</h6>
                <div className="list-group">
                  {sources.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`list-group-item list-group-item-action ${
                        selectedSourceId === s.id ? "active" : ""
                      }`}
                      onClick={() => void openSource(s.id)}
                    >
                      <div className="fw-semibold">{s.title}</div>
                      <small>
                        {s.status} · {s.chapterCount} chapters · {s.questionCount} questions
                      </small>
                    </button>
                  ))}
                  {!sources.length ? (
                    <div className="text-muted">No published sources yet.</div>
                  ) : null}
                </div>
              </div>
              <div className="col-md-7">
                {selectedSource ? (
                  <>
                    <h6>{selectedSource.title}</h6>
                    <p className="text-muted">{selectedSource.description}</p>
                    <h6 className="mt-3">Chapters</h6>
                    {chapters.map((c) => {
                      const qCount = questions.filter((q) => q.chapterId === c.id).length;
                      const checked = selectedChapters.includes(c.id);
                      return (
                        <label key={c.id} className="d-flex align-items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedChapters((prev) =>
                                checked ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                              )
                            }
                          />
                          <span>
                            {c.title}{" "}
                            <span className="text-muted">({qCount} questions)</span>
                          </span>
                        </label>
                      );
                    })}
                    <div className="row g-2 align-items-end mt-2">
                      <div className="col-auto">
                        <label className="form-label mb-0" htmlFor="training-quiz-mode">Mode</label>
                        <select
                          id="training-quiz-mode"
                          className="form-select"
                          value={quizMode}
                          onChange={(e) =>
                            setQuizMode(e.target.value === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD")
                          }
                        >
                          <option value="STANDARD">Standard</option>
                          <option value="ADAPTIVE">Adaptive</option>
                        </select>
                      </div>
                      <div className="col-auto">
                        <label className="form-label mb-0" htmlFor="training-option-count">Options</label>
                        <select
                          id="training-option-count"
                          className="form-select"
                          value={optionCount}
                          onChange={(e) => setOptionCount(Number(e.target.value))}
                        >
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </div>
                      <div className="col-auto form-check mt-4">
                        <input
                          id="fb"
                          className="form-check-input"
                          type="checkbox"
                          checked={feedbackOn}
                          onChange={(e) => setFeedbackOn(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="fb">
                          Instant feedback
                        </label>
                      </div>
                      <div className="col-auto">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!selectedChapters.length}
                          onClick={() => void startQuiz()}
                        >
                          Start quiz
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted">Select a source to build a quiz.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "quiz" ? (
          <div>
            {!attemptId && !results ? (
              <p className="text-muted">Start a quiz from the Library tab.</p>
            ) : null}
            {runner?.lastFeedback ? (
              <div
                className={`alert ${runner.lastFeedback.correct ? "alert-success" : "alert-danger"}`}
              >
                {runner.lastFeedback.correct ? "Correct" : "Incorrect"}
                {runner.lastFeedback.explanation ? (
                  <div className="mt-1">{runner.lastFeedback.explanation}</div>
                ) : null}
                {runner.lastFeedback.pageRef ? (
                  <div className="small text-muted">Ref: {runner.lastFeedback.pageRef}</div>
                ) : null}
              </div>
            ) : null}
            {runner?.question && !runner.done ? (
              <div>
                <div className="d-flex justify-content-between mb-2">
                  <span className="text-muted">
                    Question {(runner.index ?? 0) + 1}
                    {runner.total ? ` of ${runner.total}` : ""}
                  </span>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void bookmarkCurrent()}>
                    Bookmark
                  </button>
                </div>
                <h5>{runner.question.stem}</h5>
                <div className="d-grid gap-2 mt-3">
                  {runner.question.choices.map((c, i) => (
                    <button
                      key={`${runner.question!.id}-${i}`}
                      type="button"
                      className="btn btn-outline-primary text-start"
                      disabled={busy}
                      onClick={() => void submitAnswer(i)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {results ? (
              <div>
                <h5>Results</h5>
                <p className="mb-1">
                  Score: {results.scoreCorrect}/{results.scoreTotal} ({results.percent}%) — Grade{" "}
                  <strong>{results.letterGrade}</strong>
                </p>
                {attemptId ? (
                  <div className="mb-3">
                    <TransactionAttestationPanel
                      templateKey="TRAINING_COMPLETION"
                      module="training"
                      recordType="industrial_training_attempt"
                      recordId={attemptId}
                      action="QUIZ_COMPLETED"
                    />
                  </div>
                ) : null}
                <h6 className="mt-3">Chapter breakdown</h6>
                <ul>
                  {results.chapterBreakdown.map((b) => {
                    const ch = chapters.find((c) => c.id === b.chapterId);
                    return (
                      <li key={b.chapterId}>
                        {ch?.title ?? b.chapterId}: {b.correct}/{b.total}
                      </li>
                    );
                  })}
                </ul>
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => void retake("wrong")}>
                    Retake wrong
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => void retake("bookmarked")}
                  >
                    Retake bookmarked
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void retake("same")}>
                    Retake same
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void retake("new")}>
                    New shuffle
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "progress" ? (
          <div>
            <h6>Your stats</h6>
            {!progress?.stats?.length ? (
              <p className="text-muted">No progress yet. Complete a quiz to see stats.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Attempts</th>
                      <th>Correct</th>
                      <th>Avg %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.stats.map((s) => (
                      <tr key={String(s.id)}>
                        <td>{String(s.sourceId)}</td>
                        <td>{String(s.attemptCount)}</td>
                        <td>{String(s.correctCount)}</td>
                        <td>{String(s.avgScore ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h6 className="mt-3">Recent attempts</h6>
            <ul>
              {(progress?.recentAttempts ?? []).map((a) => (
                <li key={String(a.id)}>
                  {String(a.status)} — {String(a.scoreCorrect)}/{String(a.scoreTotal)} —{" "}
                  {String(a.updatedAt ?? "")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tab === "records" ? (
          <div>
            <h6>Completion records</h6>
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={String(r.id)}>
                      <td>{String(r.title ?? "")}</td>
                      <td>{String(r.status ?? "")}</td>
                      <td>{String(r.updatedAt ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!records.length ? <p className="text-muted">No completion records.</p> : null}
          </div>
        ) : null}

        {tab === "author" && canManage ? (
          <div className="row g-4">
            <div className="col-lg-4">
              <h6>Create source</h6>
              <form onSubmit={(e) => void onCreateSource(e)}>
                <div className="mb-2">
                  <input
                    className="form-control"
                    placeholder="Title"
                    required
                    value={sourceForm.title}
                    onChange={(e) => setSourceForm({ ...sourceForm, title: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <input
                    className="form-control"
                    placeholder="Edition"
                    value={sourceForm.edition}
                    onChange={(e) => setSourceForm({ ...sourceForm, edition: e.target.value })}
                  />
                </div>
                <div className="mb-2">
                  <textarea
                    className="form-control"
                    placeholder="Description"
                    rows={2}
                    value={sourceForm.description}
                    onChange={(e) => setSourceForm({ ...sourceForm, description: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary btn-sm" type="submit">
                  Create
                </button>
              </form>
              <h6 className="mt-4">Sources</h6>
              <div className="list-group">
                {sources.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`list-group-item list-group-item-action ${
                      selectedSourceId === s.id ? "active" : ""
                    }`}
                    onClick={() => void openSource(s.id)}
                  >
                    {s.title} · {s.status}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-lg-8">
              {selectedSource ? (
                <>
                  <div className="d-flex gap-2 mb-3">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      onClick={() => void publishSource("PUBLISHED")}
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => void publishSource("DRAFT")}
                    >
                      Unpublish
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => {
                        setTab("library");
                        void openSource(selectedSource.id);
                      }}
                    >
                      Preview as learner
                    </button>
                  </div>
                  <h6>Add chapter</h6>
                  <form className="row g-2 mb-3" onSubmit={(e) => void onCreateChapter(e)}>
                    <div className="col-md-6">
                      <input
                        className="form-control"
                        placeholder="Chapter title"
                        required
                        value={chapterForm.title}
                        onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
                      />
                    </div>
                    <div className="col-md-3">
                      <input
                        className="form-control"
                        placeholder="Page range"
                        value={chapterForm.pageRange}
                        onChange={(e) =>
                          setChapterForm({ ...chapterForm, pageRange: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-md-3">
                      <button className="btn btn-outline-primary w-100" type="submit">
                        Add chapter
                      </button>
                    </div>
                  </form>
                  <ul>
                    {chapters.map((c) => (
                      <li key={c.id}>
                        {c.sortOrder + 1}. {c.title}
                      </li>
                    ))}
                  </ul>
                  <h6 className="mt-3">Add question</h6>
                  <form onSubmit={(e) => void onCreateQuestion(e)}>
                    <div className="mb-2">
                      <select
                        className="form-select"
                        required
                        value={questionForm.chapterId}
                        onChange={(e) =>
                          setQuestionForm({ ...questionForm, chapterId: e.target.value })
                        }
                      >
                        <option value="">Select chapter</option>
                        {chapters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-2">
                      <textarea
                        className="form-control"
                        placeholder="Question stem"
                        required
                        rows={2}
                        value={questionForm.stem}
                        onChange={(e) => setQuestionForm({ ...questionForm, stem: e.target.value })}
                      />
                    </div>
                    <div className="mb-2">
                      <textarea
                        className="form-control"
                        placeholder="Choices (one per line)"
                        required
                        rows={4}
                        value={questionForm.choices}
                        onChange={(e) =>
                          setQuestionForm({ ...questionForm, choices: e.target.value })
                        }
                      />
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="training-q-correct">Correct index</label>
                        <input
                          id="training-q-correct"
                          type="number"
                          min={0}
                          className="form-control"
                          value={questionForm.correctIndex}
                          onChange={(e) =>
                            setQuestionForm({
                              ...questionForm,
                              correctIndex: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="training-q-status">Status</label>
                        <select
                          id="training-q-status"
                          className="form-select"
                          value={questionForm.status}
                          onChange={(e) =>
                            setQuestionForm({ ...questionForm, status: e.target.value })
                          }
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="PUBLISHED">Published</option>
                        </select>
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="training-q-pageref">Page ref</label>
                        <input
                          id="training-q-pageref"
                          className="form-control"
                          value={questionForm.pageRef}
                          onChange={(e) =>
                            setQuestionForm({ ...questionForm, pageRef: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label" htmlFor="training-q-explanation">Explanation</label>
                        <input
                          id="training-q-explanation"
                          className="form-control"
                          value={questionForm.explanation}
                          onChange={(e) =>
                            setQuestionForm({ ...questionForm, explanation: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <button className="btn btn-primary btn-sm" type="submit">
                      Save question
                    </button>
                  </form>
                  <h6 className="mt-4">Questions ({questions.length})</h6>
                  <ul className="small">
                    {questions.map((q) => (
                      <li key={q.id}>
                        [{q.status}] {q.stem.slice(0, 120)}
                        {canManage ? (
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            onClick={() =>
                              void trainingApi
                                .updateQuestion(q.id, {
                                  status: q.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
                                })
                                .then(() => openSource(selectedSource.id))
                            }
                          >
                            {q.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted">Select or create a source to author content.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
