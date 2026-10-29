"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { TrainingMaterialsPanel } from "@/components/training-materials-panel";
import { TrainingMaterialViewer } from "@/components/training-material-viewer";
import { TrainingQuestionImportPanel } from "@/components/training-question-import-panel";
import { TransactionAttestationPanel } from "@/components/transaction-attestation-panel";
import { trainingApi } from "@/features/training/api";
import type {
  TrainingAssignment,
  TrainingMaterial,
  TrainingQuestion,
  TrainingSource,
  TrainingTab,
} from "@/features/training/types";
import { canViewInApp, isTrainingVideoFile } from "@/features/training/materials";
import { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";

type RunnerState = {
  question?: { id: string; stem: string; choices: string[]; pageRef?: string };
  index?: number;
  total?: number;
  done?: boolean;
  mode?: string;
  feedbackEnabled?: boolean;
  timerSeconds?: number | null;
  mastery?: { mastered: number; total: number };
};

type PendingFeedback = {
  selectedIndex: number;
  correct: boolean;
  explanation?: string;
  pageRef?: string;
  correctIndex?: number;
  done: boolean;
};

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];
const TIMER_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
] as const;

function letterFor(index: number) {
  return CHOICE_LETTERS[index] ?? String(index + 1);
}

function formatClock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function masteryFromAttempt(attempt?: Record<string, unknown>) {
  const mastery = (attempt?.masteryState ?? {}) as { mastered?: string[]; remaining?: string[] };
  const questionIds = Array.isArray(attempt?.questionIds) ? (attempt!.questionIds as string[]) : [];
  return {
    mastered: (mastery.mastered ?? []).length,
    total: questionIds.length || (mastery.mastered?.length ?? 0) + (mastery.remaining?.length ?? 0),
  };
}

export function TrainingStudyPanel({
  moduleName,
  focusTab,
  focusSourceId,
  onFocusApplied,
}: {
  moduleName: string;
  focusTab?: TrainingTab;
  focusSourceId?: string;
  onFocusApplied?: () => void;
}) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.training.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.training.manage") || permissions.has("industrial.admin");

  const [tab, setTab] = useState<TrainingTab>("assignments");
  const { explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "TRAINING",
    canView,
  });
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<TrainingSource[]>([]);
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [previewMaterial, setPreviewMaterial] = useState<TrainingMaterial | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [progress, setProgress] = useState<{
    stats: Array<Record<string, unknown>>;
    recentAttempts: Array<Record<string, unknown>>;
  } | null>(null);
  const [inProgress, setInProgress] = useState<
    Array<{ id: string; sourceId: string; status: string; updatedAt: string }>
  >([]);
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  const [quizMode, setQuizMode] = useState<"STANDARD" | "ADAPTIVE">("STANDARD");
  const [optionCount, setOptionCount] = useState(4);
  const [feedbackOn, setFeedbackOn] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [runner, setRunner] = useState<RunnerState | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [results, setResults] = useState<{
    percent: number;
    letterGrade: string;
    scoreCorrect: number;
    scoreTotal: number;
    wrongQuestionIds: string[];
    bookmarkedQuestionIds: string[];
  } | null>(null);

  const [sourceForm, setSourceForm] = useState({ title: "", edition: "", description: "" });
  const [questionForm, setQuestionForm] = useState({
    stem: "",
    choices: "A\nB\nC\nD",
    correctIndex: 0,
    explanation: "",
    pageRef: "",
    status: "DRAFT",
  });
  const [busy, setBusy] = useState(false);
  const timeoutArmedRef = useRef(false);

  const selectedSource = useMemo(
    () => sources.find((s) => s.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const filteredSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => {
      const hay = `${s.title} ${s.edition ?? ""} ${s.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sources, sourceQuery]);

  const publishedQuestionCount = useMemo(() => {
    if (!selectedSourceId) return 0;
    return questions.filter((q) => q.status === "PUBLISHED").length;
  }, [questions, selectedSourceId]);

  const quizProgressPct = useMemo(() => {
    if (runner?.mode === "ADAPTIVE" && runner.mastery?.total) {
      return Math.min(100, Math.round((runner.mastery.mastered / runner.mastery.total) * 100));
    }
    if (!runner?.total || runner.total <= 0) return 0;
    const idx = (runner.index ?? 0) + (pendingFeedback ? 1 : 0);
    return Math.min(100, Math.round((idx / runner.total) * 100));
  }, [runner, pendingFeedback]);

  const refreshSources = useCallback(async () => {
    const data = await trainingApi.listSources();
    setSources(data.items ?? []);
  }, []);

  const openSource = useCallback(async (id: string) => {
    setSelectedSourceId(id);
    setBusy(true);
    setError(null);
    try {
      const qs = await trainingApi.listQuestions(id);
      setQuestions(Array.isArray(qs) ? qs : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load course");
    } finally {
      setBusy(false);
    }
  }, []);

  const applyNextPayload = useCallback(
    (next: Awaited<ReturnType<typeof trainingApi.nextQuestion>>) => {
      if (next.done) {
        setRunner({
          done: true,
          ...(next.mode ? { mode: next.mode } : {}),
          ...(next.mastery ? { mastery: next.mastery } : {}),
        });
        return;
      }
      setRunner({
        ...(next.question ? { question: next.question } : {}),
        ...(next.index !== undefined ? { index: next.index } : {}),
        ...(next.total !== undefined ? { total: next.total } : {}),
        done: false,
        ...(next.mode ? { mode: next.mode } : {}),
        ...(next.feedbackEnabled !== undefined ? { feedbackEnabled: next.feedbackEnabled } : {}),
        ...(next.timerSeconds !== undefined ? { timerSeconds: next.timerSeconds } : {}),
        ...(next.mastery ? { mastery: next.mastery } : {}),
      });
      const limit = next.timerSeconds == null ? 0 : Number(next.timerSeconds);
      timeoutArmedRef.current = limit > 0;
      setSecondsLeft(limit > 0 ? limit : null);
    },
    [],
  );

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

  useEffect(() => {
    if (!focusTab && !focusSourceId) return;
    if (focusTab) setTab(focusTab);
    if (focusSourceId) void openSource(focusSourceId);
    onFocusApplied?.();
  }, [focusTab, focusSourceId, onFocusApplied, openSource]);

  useEffect(() => {
    if (secondsLeft == null || pendingFeedback || !runner?.question || runner.done) return;
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev == null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft, pendingFeedback, runner?.question, runner?.done]);

  useEffect(() => {
    if (secondsLeft !== 0 || pendingFeedback || !attemptId || !runner?.question || busy) return;
    if (!timeoutArmedRef.current) return;
    timeoutArmedRef.current = false;
    void submitAnswer(999, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timeout path only
  }, [secondsLeft]);

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

  async function loadMaterials() {
    setBusy(true);
    try {
      const data = await trainingApi.listMaterials();
      setMaterials(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load materials");
    } finally {
      setBusy(false);
    }
  }

  async function linkMaterialSource(material: TrainingMaterial, sourceId: string | null) {
    if (!canManage) return;
    const next = sourceId?.trim() || null;
    if ((material.sourceId ?? null) === next) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.updateMaterial(material.id, { sourceId: next });
      await loadMaterials();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not link material to course");
    } finally {
      setBusy(false);
    }
  }

  async function removeMaterial(material: TrainingMaterial) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Delete “${material.title}”? This removes the file for all learners and cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await trainingApi.archiveMaterial(material.id);
      if (previewMaterial?.id === material.id) closeMaterialPreview();
      await loadMaterials();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete material");
    } finally {
      setBusy(false);
    }
  }

  const linkableSources = useMemo(
    () => (canManage ? sources : sources.filter((s) => s.status === "PUBLISHED")),
    [canManage, sources],
  );

  async function loadAssignments() {
    setBusy(true);
    try {
      const data = await trainingApi.listAssignments();
      setAssignments(data.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load assignments");
    } finally {
      setBusy(false);
    }
  }

  function assignmentStatusTone(status?: string | null) {
    const normalized = String(status ?? "NOT_STARTED").toUpperCase();
    if (normalized === "COMPLETED" || normalized === "PASSED") return "success";
    if (normalized === "IN_PROGRESS") return "primary";
    if (normalized === "OVERDUE") return "danger";
    return "secondary";
  }

  async function startQuizFromAssignment(assignment: TrainingAssignment) {
    setBusy(true);
    setResults(null);
    setRunner(null);
    setPendingFeedback(null);
    setBookmarkedIds(new Set());
    setError(null);
    setActiveAssignmentId(assignment.id);
    try {
      setSelectedSourceId(assignment.sourceId);
      setQuizMode(assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD");
      setOptionCount(assignment.optionCount || 4);
      setFeedbackOn(assignment.feedbackEnabled !== false);
      setTimerSeconds(assignment.timerSeconds ?? 0);
      const created = await trainingApi.createQuiz({
        sourceId: assignment.sourceId,
        mode: assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD",
        optionCount: assignment.optionCount || 4,
        feedbackEnabled: assignment.feedbackEnabled !== false,
        timerSeconds: assignment.timerSeconds ?? null,
        assignmentId: assignment.id,
      });
      setAttemptId(created.attempt.id);
      const next = await trainingApi.nextQuestion(created.attempt.id);
      applyNextPayload(next);
      setTab("quiz");
      closeMaterialPreview();
      const ip = await trainingApi.inProgress();
      setInProgress(ip ?? []);
      await loadAssignments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start assignment quiz");
    } finally {
      setBusy(false);
    }
  }

  function closeMaterialPreview() {
    setPreviewMaterial(null);
  }

  function openMaterial(material: TrainingMaterial) {
    setError(null);
    if (!canViewInApp(material.mimeType, material.originalFilename)) {
      setError("This file type is not supported for in-app viewing.");
      return;
    }
    // Unlock autoplay during this click so slide narration can start without a second tap.
    unlockTrainingAudioPlayback();
    setPreviewMaterial(material);
  }

  async function startQuizFromMaterial(material: TrainingMaterial, assignmentId?: string | null) {
    const sourceId = material.sourceId?.trim();
    if (!sourceId) {
      setError("No quiz is linked to this material. Choose a course in Library.");
      setTab("library");
      return;
    }
    setBusy(true);
    setResults(null);
    setRunner(null);
    setPendingFeedback(null);
    setBookmarkedIds(new Set());
    setError(null);
    try {
      setSelectedSourceId(sourceId);
      const linkedAssignment = assignmentId
        ? assignments.find((a) => a.id === assignmentId)
        : assignments.find((a) => a.materialId === material.id || a.sourceId === sourceId);
      if (linkedAssignment) {
        setActiveAssignmentId(linkedAssignment.id);
        setQuizMode(linkedAssignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD");
        setOptionCount(linkedAssignment.optionCount || 4);
        setFeedbackOn(linkedAssignment.feedbackEnabled !== false);
        setTimerSeconds(linkedAssignment.timerSeconds ?? 0);
      } else {
        setActiveAssignmentId(assignmentId ?? null);
      }
      const publishedCount = (await trainingApi.listQuestions(sourceId)).filter(
        (q) => q.status === "PUBLISHED",
      ).length;
      if (!publishedCount) {
        setError("This material's course has no published questions available for a quiz.");
        setTab("library");
        return;
      }
      const created = await trainingApi.createQuiz({
        sourceId,
        mode: linkedAssignment?.quizMode === "ADAPTIVE" ? "ADAPTIVE" : quizMode,
        optionCount: linkedAssignment?.optionCount || optionCount,
        feedbackEnabled: linkedAssignment?.feedbackEnabled ?? feedbackOn,
        timerSeconds:
          linkedAssignment?.timerSeconds != null
            ? linkedAssignment.timerSeconds
            : timerSeconds > 0
              ? timerSeconds
              : null,
        ...(linkedAssignment?.id || assignmentId
          ? { assignmentId: linkedAssignment?.id ?? assignmentId! }
          : {}),
      });
      setAttemptId(created.attempt.id);
      const next = await trainingApi.nextQuestion(created.attempt.id);
      applyNextPayload(next);
      setTab("quiz");
      closeMaterialPreview();
      const ip = await trainingApi.inProgress();
      setInProgress(ip ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start quiz");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (tab === "assignments") {
      void loadAssignments();
      void loadMaterials();
    }
    if (tab === "records") void loadRecords();
    if (tab === "progress") void loadProgress();
    if (tab === "materials") void loadMaterials();
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
      setError(err instanceof ApiError ? err.message : "Create course failed");
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

  async function archiveSource(source: TrainingSource) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Archive “${source.title}”? Open assignments for this course will be closed. Materials stay linked so you can reactivate the course later.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await trainingApi.archiveSource(source.id);
      if (selectedSourceId === source.id) {
        setSelectedSourceId(null);
        setQuestions([]);
      }
      await Promise.all([refreshSources(), loadMaterials()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive course");
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
        stem: questionForm.stem,
        choices,
        correctIndex: Number(questionForm.correctIndex),
        ...(questionForm.explanation ? { explanation: questionForm.explanation } : {}),
        ...(questionForm.pageRef ? { pageRef: questionForm.pageRef } : {}),
        status: questionForm.status,
      });
      setQuestionForm({
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

  async function deleteQuestion(question: TrainingQuestion) {
    if (!selectedSourceId || !canManage) return;
    if (!window.confirm(`Delete this question?\n\n${question.stem.slice(0, 200)}`)) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.deleteQuestion(question.id);
      await openSource(selectedSourceId);
      await refreshSources();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete question");
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    if (!selectedSourceId || !publishedQuestionCount) {
      setError("Select a course with published questions");
      return;
    }
    setBusy(true);
    setResults(null);
    setRunner(null);
    setPendingFeedback(null);
    setBookmarkedIds(new Set());
    try {
      const created = await trainingApi.createQuiz({
        sourceId: selectedSourceId,
        mode: quizMode,
        optionCount,
        feedbackEnabled: feedbackOn,
        timerSeconds: timerSeconds > 0 ? timerSeconds : null,
      });
      setAttemptId(created.attempt.id);
      const next = await trainingApi.nextQuestion(created.attempt.id);
      applyNextPayload(next);
      setTab("quiz");
      const ip = await trainingApi.inProgress();
      setInProgress(ip ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start quiz");
    } finally {
      setBusy(false);
    }
  }

  async function resumeQuiz(id: string) {
    setBusy(true);
    setPendingFeedback(null);
    setBookmarkedIds(new Set());
    try {
      await trainingApi.resume(id);
      setAttemptId(id);
      const next = await trainingApi.nextQuestion(id);
      if (next.done) {
        const r = await trainingApi.results(id);
        setResults(r);
        setBookmarkedIds(new Set(r.bookmarkedQuestionIds ?? []));
        setRunner({
          done: true,
          ...(next.mode ? { mode: next.mode } : {}),
          ...(next.mastery ? { mastery: next.mastery } : {}),
        });
      } else {
        setResults(null);
        applyNextPayload(next);
      }
      setTab("quiz");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resume failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(selectedIndex: number, fromTimeout = false) {
    if (!attemptId || !runner?.question || pendingFeedback) return;
    setBusy(true);
    setSecondsLeft(null);
    try {
      const res = await trainingApi.answer(attemptId, runner.question.id, selectedIndex);
      const mastery = masteryFromAttempt(res.attempt as Record<string, unknown> | undefined);
      setRunner((prev) => (prev ? { ...prev, mastery } : prev));

      const showFeedback = Boolean(runner.feedbackEnabled ?? feedbackOn) || fromTimeout;
      if (showFeedback) {
        setPendingFeedback({
          selectedIndex,
          correct: res.correct,
          ...(res.explanation ? { explanation: res.explanation } : {}),
          ...(res.pageRef ? { pageRef: res.pageRef } : {}),
          ...(res.correctIndex !== undefined ? { correctIndex: res.correctIndex } : {}),
          done: res.done,
        });
        if (res.done) {
          const r = await trainingApi.results(attemptId);
          setResults(r);
          setBookmarkedIds(new Set(r.bookmarkedQuestionIds ?? []));
        }
      } else if (res.done) {
        const r = await trainingApi.results(attemptId);
        setResults(r);
        setBookmarkedIds(new Set(r.bookmarkedQuestionIds ?? []));
        setRunner({ done: true, ...(mastery.total ? { mastery } : {}) });
      } else {
        const next = await trainingApi.nextQuestion(attemptId);
        applyNextPayload(next);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Answer failed";
      if (/not in progress/i.test(msg) && attemptId) {
        try {
          const r = await trainingApi.results(attemptId);
          setResults(r);
          setBookmarkedIds(new Set(r.bookmarkedQuestionIds ?? []));
          setPendingFeedback(null);
          setRunner({ done: true });
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
    if (!attemptId || !pendingFeedback) return;
    if (pendingFeedback.done) {
      setPendingFeedback(null);
      setRunner((prev) => ({
        done: true,
        ...(prev?.mode ? { mode: prev.mode } : {}),
        ...(prev?.mastery ? { mastery: prev.mastery } : {}),
      }));
      return;
    }
    setBusy(true);
    try {
      setPendingFeedback(null);
      const next = await trainingApi.nextQuestion(attemptId);
      applyNextPayload(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load next question");
    } finally {
      setBusy(false);
    }
  }

  async function bookmarkCurrent() {
    if (!attemptId || !runner?.question) return;
    const qid = runner.question.id;
    try {
      await trainingApi.bookmark(attemptId, qid);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (next.has(qid)) next.delete(qid);
        else next.add(qid);
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bookmark failed");
    }
  }

  async function retake(mode: "wrong" | "bookmarked" | "same" | "new") {
    if (!attemptId) return;
    setBusy(true);
    setPendingFeedback(null);
    try {
      const created = await trainingApi.retake(attemptId, mode);
      setAttemptId(created.attempt.id);
      setResults(null);
      setBookmarkedIds(new Set());
      const next = await trainingApi.nextQuestion(created.attempt.id);
      applyNextPayload(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Retake failed");
    } finally {
      setBusy(false);
    }
  }

  function choiceClass(i: number) {
    if (!pendingFeedback) return "btn btn-outline-primary text-start";
    const isCorrect =
      pendingFeedback.correctIndex !== undefined
        ? i === pendingFeedback.correctIndex
        : pendingFeedback.correct && i === pendingFeedback.selectedIndex;
    const isSelected = i === pendingFeedback.selectedIndex;
    if (isCorrect) return "btn btn-success text-start";
    if (isSelected && !pendingFeedback.correct) return "btn btn-danger text-start";
    return "btn btn-outline-secondary text-start opacity-75";
  }

  if (!canView) {
    return <ModuleUnavailable moduleName={moduleName} status="permission" />;
  }
  if (explicitlyDisabled) {
    return <ModuleUnavailable moduleName={moduleName} status="disabled" />;
  }

  const tabs: Array<{ id: TrainingTab; label: string; show?: boolean }> = [
    { id: "assignments", label: "Assignments" },
    { id: "library", label: "Library" },
    { id: "materials", label: "Materials" },
    { id: "quiz", label: "Quiz" },
    { id: "progress", label: "Progress" },
    { id: "records", label: "Records" },
    { id: "author", label: "Author", show: canManage },
  ];

  const currentBookmarked = Boolean(runner?.question && bookmarkedIds.has(runner.question.id));

  return (
    <div>
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

      {tab === "assignments" ? (
        <div>
          <div className="mb-3">
            <h6 className="mb-1">My assignments</h6>
            <p className="text-muted small mb-0">
              Training assigned to you. Review linked materials, then take the quiz to complete each
              assignment.
            </p>
          </div>
          {previewMaterial ? (
            <TrainingMaterialViewer
              material={previewMaterial}
              onClose={closeMaterialPreview}
              onTakeQuiz={(material) => void startQuizFromMaterial(material, activeAssignmentId)}
              {...(canManage
                ? {
                    onDelete: (material: TrainingMaterial) => void removeMaterial(material),
                    deleteBusy: busy,
                  }
                : {})}
            />
          ) : null}
          <ul className="list-group">
            {assignments.map((assignment) => {
              const linkedMaterial = (() => {
                if (assignment.materialId) {
                  const exact = materials.find((m) => m.id === assignment.materialId);
                  if (exact) return exact;
                }
                const forSource = materials
                  .filter((m) => m.sourceId === assignment.sourceId)
                  .sort((a, b) =>
                    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
                  );
                // Prefer a video when the assignment did not pin a specific material.
                const video = forSource.find((m) => isTrainingVideoFile(m));
                return video ?? forSource[0] ?? null;
              })();
              const status = assignment.myStatus ?? "NOT_STARTED";
              const dueLabel = assignment.dueAt
                ? new Date(assignment.dueAt).toLocaleDateString()
                : "No deadline";
              return (
                <li key={assignment.id} className="list-group-item">
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                    <div>
                      <div className="fw-semibold">{assignment.title}</div>
                      <div className="text-muted small">
                        {assignment.sourceTitle} · Pass {assignment.passingPercent}% · Due{" "}
                        {dueLabel}
                      </div>
                      {assignment.description ? (
                        <div className="text-muted small mt-1">{assignment.description}</div>
                      ) : null}
                      {assignment.myBestPercent != null ? (
                        <div className="small mt-1">Best score: {assignment.myBestPercent}%</div>
                      ) : null}
                    </div>
                    <span className={`badge bg-label-${assignmentStatusTone(status)}`}>
                      {status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    {linkedMaterial ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => {
                          setActiveAssignmentId(assignment.id);
                          openMaterial(linkedMaterial);
                        }}
                      >
                        Review material
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={busy || status === "COMPLETED"}
                      onClick={() => void startQuizFromAssignment(assignment)}
                    >
                      {status === "COMPLETED" ? "Completed" : "Take quiz"}
                    </button>
                  </div>
                </li>
              );
            })}
            {!assignments.length ? (
              <li className="list-group-item text-muted">
                No assignments yet. Your supervisor can assign training from the agency dashboard.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === "library" ? (
        <div>
          {inProgress.length > 0 ? (
            <div
              className="alert alert-primary d-flex flex-wrap align-items-center gap-2"
              role="status"
            >
              <span className="fw-semibold me-auto">Resume in progress</span>
              {inProgress.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => void resumeQuiz(a.id)}
                >
                  Resume quiz
                </button>
              ))}
            </div>
          ) : null}

          <div className="row g-4">
            <div className="col-lg-5">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Courses</h6>
                <span className="text-muted small">{filteredSources.length}</span>
              </div>
              <input
                className="form-control mb-3"
                placeholder="Search courses…"
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                aria-label="Search courses"
              />
              <div className="list-group">
                {filteredSources.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`list-group-item list-group-item-action ${
                      selectedSourceId === s.id ? "active" : ""
                    }`}
                    onClick={() => void openSource(s.id)}
                  >
                    <div className="fw-semibold">{s.title}</div>
                    <small className={selectedSourceId === s.id ? "" : "text-muted"}>
                      {s.edition ? `${s.edition} · ` : ""}
                      {s.questionCount} questions
                      {s.status !== "PUBLISHED" ? ` · ${s.status}` : ""}
                    </small>
                  </button>
                ))}
                {!filteredSources.length ? (
                  <div className="list-group-item text-muted">
                    {sources.length ? "No courses match that search." : "No published courses yet."}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="col-lg-7">
              {selectedSource ? (
                <>
                  <h5 className="mb-1">{selectedSource.title}</h5>
                  {selectedSource.edition ? (
                    <p className="text-muted small mb-2">{selectedSource.edition}</p>
                  ) : null}
                  {selectedSource.description ? (
                    <p className="text-muted">{selectedSource.description}</p>
                  ) : null}

                  <h6>Quiz settings</h6>
                  <p className="text-muted small">
                    {publishedQuestionCount} published question
                    {publishedQuestionCount === 1 ? "" : "s"} in this course.
                  </p>
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="training-quiz-mode">
                        Mode
                      </label>
                      <select
                        id="training-quiz-mode"
                        className="form-select"
                        value={quizMode}
                        onChange={(e) =>
                          setQuizMode(e.target.value === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD")
                        }
                      >
                        <option value="STANDARD">Standard — fixed question set</option>
                        <option value="ADAPTIVE">Adaptive — drill until mastery</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="training-option-count">
                        Answer options
                      </label>
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
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="training-timer">
                        Per-question timer
                      </label>
                      <select
                        id="training-timer"
                        className="form-select"
                        value={timerSeconds}
                        onChange={(e) => setTimerSeconds(Number(e.target.value))}
                      >
                        {TIMER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <div className="form-check form-switch">
                        <input
                          id="training-feedback"
                          className="form-check-input"
                          type="checkbox"
                          checked={feedbackOn}
                          onChange={(e) => setFeedbackOn(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor="training-feedback">
                          Show feedback after each answer
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex flex-wrap align-items-center gap-3">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!publishedQuestionCount || busy}
                      onClick={() => void startQuiz()}
                    >
                      Start quiz
                    </button>
                    <span className="text-muted small">
                      Uses all published questions for this course
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0">
                  Select a course, set mode / options / timer / feedback, then start.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "materials" ? (
        <div>
          <div className="mb-3">
            <h6 className="mb-1">Study materials</h6>
            <p className="text-muted small mb-0">
              PowerPoints, videos, PDFs, and other files shared by your facility — organized by
              category. Managers can link each file to a course for quiz follow-up.
            </p>
          </div>

          {previewMaterial ? (
            <TrainingMaterialViewer
              material={previewMaterial}
              onClose={closeMaterialPreview}
              onTakeQuiz={(material) => void startQuizFromMaterial(material)}
              {...(canManage
                ? {
                    onDelete: (material: TrainingMaterial) => void removeMaterial(material),
                    deleteBusy: busy,
                  }
                : {})}
            />
          ) : null}

          <TrainingMaterialsPanel
            materials={materials}
            canManage={canManage}
            busy={busy}
            linkableSources={linkableSources}
            onOpen={(material) => void openMaterial(material)}
            {...(canManage
              ? {
                  onLinkSource: (material: TrainingMaterial, sourceId: string | null) =>
                    void linkMaterialSource(material, sourceId),
                  onArchive: (material: TrainingMaterial) => void removeMaterial(material),
                }
              : {})}
          />
        </div>
      ) : null}

      {tab === "quiz" ? (
        <div>
          {!attemptId && !results ? (
            <div className="alert alert-secondary mb-0" role="status">
              <h6 className="alert-heading mb-1">No quiz in progress</h6>
              <p className="mb-2">
                Start from Assignments or Library: open an assignment, review materials if needed,
                then take the quiz.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm me-2"
                onClick={() => setTab("assignments")}
              >
                Go to Assignments
              </button>
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => setTab("library")}
              >
                Go to Library
              </button>
            </div>
          ) : null}

          {runner?.question && !runner.done ? (
            <div className="mx-auto" style={{ maxWidth: "42rem" }}>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <div className="text-muted small">
                  {runner.mode === "ADAPTIVE" ? (
                    <>
                      Adaptive · Mastered {runner.mastery?.mastered ?? 0}/
                      {runner.mastery?.total ?? runner.total ?? "—"}
                    </>
                  ) : (
                    <>
                      Question {(runner.index ?? 0) + 1}
                      {runner.total ? ` of ${runner.total}` : ""}
                    </>
                  )}
                  {selectedSource ? ` · ${selectedSource.title}` : ""}
                  {runner.question.pageRef ? ` · p. ${runner.question.pageRef}` : ""}
                </div>
                <div className="d-flex align-items-center gap-2">
                  {secondsLeft != null ? (
                    <span
                      className={`badge ${
                        secondsLeft <= 12
                          ? "bg-danger"
                          : secondsLeft <= 30
                            ? "bg-warning"
                            : "bg-label-secondary"
                      }`}
                    >
                      {formatClock(secondsLeft)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`btn btn-sm ${currentBookmarked ? "btn-warning" : "btn-outline-secondary"}`}
                    onClick={() => void bookmarkCurrent()}
                    disabled={Boolean(pendingFeedback)}
                  >
                    <i
                      className={`bx ${currentBookmarked ? "bxs-bookmark" : "bx-bookmark"} me-1`}
                    />
                    {currentBookmarked ? "Bookmarked" : "Bookmark"}
                  </button>
                </div>
              </div>

              <div className="progress mb-3" style={{ height: "0.4rem" }} aria-hidden>
                <div
                  className="progress-bar"
                  role="progressbar"
                  style={{ width: `${quizProgressPct}%` }}
                />
              </div>

              <h5 className="mb-3">{runner.question.stem}</h5>

              <div className="d-grid gap-2">
                {runner.question.choices.map((c, i) => (
                  <button
                    key={`${runner.question!.id}-${i}`}
                    type="button"
                    className={choiceClass(i)}
                    disabled={busy || Boolean(pendingFeedback)}
                    onClick={() => void submitAnswer(i)}
                  >
                    <strong className="me-2">{letterFor(i)}.</strong>
                    {c}
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
                  {pendingFeedback.explanation ? (
                    <div className="mt-1">{pendingFeedback.explanation}</div>
                  ) : null}
                  {pendingFeedback.pageRef ? (
                    <div className="small mt-1">Ref: {pendingFeedback.pageRef}</div>
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
          ) : null}

          {results && !pendingFeedback && (runner?.done || !runner?.question) ? (
            <div className="mx-auto" style={{ maxWidth: "42rem" }}>
              <div className="text-center mb-4">
                <div
                  className="d-inline-flex align-items-center justify-content-center rounded-circle bg-label-primary mb-3"
                  style={{ width: "5.5rem", height: "5.5rem", fontSize: "2rem", fontWeight: 800 }}
                  aria-label={`Grade ${results.letterGrade}`}
                >
                  {results.letterGrade}
                </div>
                <h5 className="mb-1">
                  {results.scoreCorrect}/{results.scoreTotal} correct · {results.percent}%
                </h5>
                <p className="text-muted mb-0">
                  Retake weak areas, bookmarked items, the same set, or a fresh shuffle.
                </p>
              </div>

              {attemptId ? (
                <div className="mb-4">
                  <TransactionAttestationPanel
                    templateKey="TRAINING_COMPLETION"
                    module="training"
                    recordType="industrial_training_attempt"
                    recordId={attemptId}
                    action="QUIZ_COMPLETED"
                  />
                </div>
              ) : null}

              <div className="d-flex flex-wrap gap-2">
                {attemptId ? (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      void trainingApi.openAttemptPrintable(attemptId).catch((e: unknown) => {
                        setError(e instanceof Error ? e.message : "Could not print quiz results");
                      });
                    }}
                  >
                    Print results
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void retake("wrong")}
                  disabled={!results.wrongQuestionIds.length}
                >
                  Retake wrong
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => void retake("bookmarked")}
                  disabled={!results.bookmarkedQuestionIds.length}
                >
                  Retake bookmarked
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => void retake("same")}
                >
                  Retake same
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => void retake("new")}
                >
                  New shuffle
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setTab("library")}
                >
                  Back to Library
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "progress" ? (
        <div>
          <div className="row g-3 mb-4">
            <div className="col-sm-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="fs-3 fw-bold">{progress?.stats?.length ?? 0}</div>
                  <div className="text-muted small text-uppercase">Courses tracked</div>
                </div>
              </div>
            </div>
            <div className="col-sm-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="fs-3 fw-bold">{(progress?.recentAttempts ?? []).length}</div>
                  <div className="text-muted small text-uppercase">Recent attempts</div>
                </div>
              </div>
            </div>
            <div className="col-sm-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="fs-3 fw-bold">{inProgress.length}</div>
                  <div className="text-muted small text-uppercase">In progress</div>
                </div>
              </div>
            </div>
          </div>

          <h6>Source performance</h6>
          {!progress?.stats?.length ? (
            <p className="text-muted">No progress yet. Complete a quiz to see stats.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Attempts</th>
                    <th>Correct</th>
                    <th>Mastered</th>
                    <th>Avg %</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.stats.map((s) => {
                    const sourceTitle =
                      sources.find((src) => src.id === String(s.sourceId))?.title ??
                      String(s.sourceId);
                    return (
                      <tr key={String(s.id ?? s.sourceId)}>
                        <td>{sourceTitle}</td>
                        <td>{String(s.attemptCount ?? "—")}</td>
                        <td>{String(s.correctCount ?? "—")}</td>
                        <td>{String(s.masteredCount ?? "—")}</td>
                        <td>{String(s.avgScore ?? "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h6 className="mt-4">Recent attempts</h6>
          <ul className="list-group">
            {(progress?.recentAttempts ?? []).map((a) => (
              <li
                key={String(a.id)}
                className="list-group-item d-flex justify-content-between flex-wrap gap-2"
              >
                <span>
                  {String(a.status)} — {String(a.scoreCorrect)}/{String(a.scoreTotal)}
                </span>
                <span className="text-muted small">{String(a.updatedAt ?? "")}</span>
              </li>
            ))}
            {!progress?.recentAttempts?.length ? (
              <li className="list-group-item text-muted">No recent attempts.</li>
            ) : null}
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
            <h6>Create course</h6>
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
            <h6 className="mt-4">Courses</h6>
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
                <div className="d-flex flex-wrap gap-2 mb-3">
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
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => void archiveSource(selectedSource)}
                    disabled={busy}
                  >
                    Archive
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
                <TrainingQuestionImportPanel
                  sourceId={selectedSource.id}
                  sourceTitle={selectedSource.title}
                  disabled={busy}
                  onImported={async () => {
                    await openSource(selectedSource.id);
                    await refreshSources();
                  }}
                  onError={setError}
                />
                <h6 className="mt-3">Add question</h6>
                <form onSubmit={(e) => void onCreateQuestion(e)}>
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
                      <label className="form-label" htmlFor="training-q-correct">
                        Correct index
                      </label>
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
                      <label className="form-label" htmlFor="training-q-status">
                        Status
                      </label>
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
                      <label className="form-label" htmlFor="training-q-pageref">
                        Page ref
                      </label>
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
                      <label className="form-label" htmlFor="training-q-explanation">
                        Explanation
                      </label>
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
                <ul className="list-group list-group-flush small">
                  {questions.map((q) => (
                    <li
                      key={q.id}
                      className="list-group-item px-0 d-flex justify-content-between align-items-start gap-2"
                    >
                      <div className="min-w-0">
                        <span
                          className={`badge me-2 ${q.status === "PUBLISHED" ? "bg-label-success" : "bg-label-secondary"}`}
                        >
                          {q.status}
                        </span>
                        {q.stem}
                      </div>
                      <div className="d-flex flex-wrap gap-1 flex-shrink-0">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          disabled={busy}
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
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-danger p-0"
                          disabled={busy}
                          onClick={() => void deleteQuestion(q)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                  {!questions.length ? (
                    <li className="list-group-item px-0 text-muted">No questions yet.</li>
                  ) : null}
                </ul>
              </>
            ) : (
              <p className="text-muted">Select or create a source to author content.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
