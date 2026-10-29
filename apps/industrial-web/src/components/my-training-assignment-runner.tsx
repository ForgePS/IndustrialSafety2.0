"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { TrainingMaterialViewer } from "@/components/training-material-viewer";
import { trainingApi } from "@/features/training/api";
import { canViewInApp } from "@/features/training/materials";
import type { TrainingAssignment, TrainingMaterial } from "@/features/training/types";
import { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";

type Step = "loading" | "overview" | "material" | "quiz" | "results" | "error";

type QuizNext = {
  done: boolean;
  index?: number;
  total?: number;
  feedbackEnabled?: boolean;
  question?: { id: string; stem: string; choices: string[] };
};

type QuizResults = {
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  letterGrade: string;
};

const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F"];

export function MyTrainingAssignmentRunner({ assignmentId }: { assignmentId: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [assignment, setAssignment] = useState<TrainingAssignment | null>(null);
  const [material, setMaterial] = useState<TrainingMaterial | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [next, setNext] = useState<QuizNext | null>(null);
  const [results, setResults] = useState<QuizResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    explanation?: string;
    selectedIndex: number;
  } | null>(null);

  const load = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      const a = await trainingApi.getAssignment(assignmentId);
      setAssignment(a);
      let matched: TrainingMaterial | null = null;
      if (a.sourceId) {
        const mats = await trainingApi.listMaterials({ sourceId: a.sourceId });
        const items = mats.items ?? [];
        if (a.materialId) {
          matched = items.find((m) => m.id === a.materialId) ?? null;
        }
        if (!matched) matched = items[0] ?? null;
      }
      setMaterial(matched);
      setStep("overview");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this training.");
      setStep("error");
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openMaterial() {
    if (!material) {
      setAcknowledged(true);
      return;
    }
    if (!canViewInApp(material.mimeType, material.originalFilename)) {
      setError("This file type is not supported for in-app viewing.");
      return;
    }
    unlockTrainingAudioPlayback();
    setStep("material");
  }

  async function startQuiz() {
    if (!assignment?.sourceId) {
      setError("This assignment has no course linked for a quiz.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);
    setResults(null);
    try {
      const created = await trainingApi.createQuiz({
        sourceId: assignment.sourceId,
        mode: assignment.quizMode === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD",
        optionCount: assignment.optionCount || 4,
        feedbackEnabled: assignment.feedbackEnabled !== false,
        timerSeconds: assignment.timerSeconds ?? null,
        assignmentId: assignment.id,
      });
      setAttemptId(created.attempt.id);
      const payload = await trainingApi.nextQuestion(created.attempt.id);
      setNext(payload);
      setStep(payload.done ? "results" : "quiz");
      if (payload.done) {
        const score = await trainingApi.results(created.attempt.id);
        setResults(score);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(selectedIndex: number) {
    if (!attemptId || !next?.question) return;
    setBusy(true);
    setError(null);
    try {
      const res = await trainingApi.answer(attemptId, next.question.id, selectedIndex);
      if (next.feedbackEnabled !== false) {
        setFeedback({
          correct: res.correct,
          ...(res.explanation ? { explanation: res.explanation } : {}),
          selectedIndex,
        });
      }
      if (res.done) {
        const score = await trainingApi.results(attemptId);
        setResults(score);
        setStep("results");
        return;
      }
      const payload = await trainingApi.nextQuestion(attemptId);
      setNext(payload);
      setFeedback(null);
      if (payload.done) {
        const score = await trainingApi.results(attemptId);
        setResults(score);
        setStep("results");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit answer.");
    } finally {
      setBusy(false);
    }
  }

  const passed = String(assignment?.myStatus ?? "").toUpperCase() === "PASSED";

  return (
    <div className="container-xxl flex-grow-1 container-p-y">
      <div className="mb-3">
        <Link href="/my-training/" className="btn btn-sm btn-outline-secondary">
          Back to My Training
        </Link>
      </div>

      {step === "loading" ? <p className="text-muted">Loading assignment…</p> : null}
      {error ? <div className="alert alert-warning">{error}</div> : null}

      {step === "error" ? (
        <div className="card">
          <div className="card-body">
            <p className="mb-0">This training is unavailable for your account.</p>
          </div>
        </div>
      ) : null}

      {assignment && step === "overview" ? (
        <div className="card">
          <div className="card-body">
            <h4 className="mb-1">{assignment.title}</h4>
            <p className="text-muted">{assignment.sourceTitle}</p>
            <div className="small text-muted mb-3">
              Status: {(assignment.myStatus ?? "ASSIGNED").replace(/_/g, " ")}
              {assignment.myBestPercent != null ? ` · Best ${assignment.myBestPercent}%` : ""}
              {assignment.dueAt ? ` · Due ${String(assignment.dueAt).slice(0, 10)}` : ""}
            </div>
            <div className="d-flex flex-wrap gap-2">
              {material ? (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={busy}
                  onClick={() => void openMaterial()}
                >
                  Review material
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || (material != null && !acknowledged && !passed)}
                onClick={() => void startQuiz()}
              >
                {passed ? "Retake quiz" : "Start quiz"}
              </button>
            </div>
            {material && !acknowledged && !passed ? (
              <div className="form-check mt-3">
                <input
                  id="my-training-ack"
                  className="form-check-input"
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="my-training-ack">
                  I reviewed the training material and understand the requirements.
                </label>
              </div>
            ) : null}
            {!material ? (
              <p className="small text-muted mt-3 mb-0">
                No study material is attached. You can start the quiz directly.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {assignment && step === "material" && material ? (
        <div className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
              <h5 className="mb-0">{material.title}</h5>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setStep("overview")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setAcknowledged(true);
                    setStep("overview");
                  }}
                >
                  Mark reviewed
                </button>
              </div>
            </div>
            <TrainingMaterialViewer
              material={material}
              onClose={() => setStep("overview")}
              onTakeQuiz={() => {
                setAcknowledged(true);
                void startQuiz();
              }}
            />
          </div>
        </div>
      ) : null}

      {step === "quiz" && next?.question ? (
        <div className="card">
          <div className="card-body">
            <div className="small text-muted mb-2">
              Question {(next.index ?? 0) + 1}
              {next.total != null ? ` of ${next.total}` : ""}
            </div>
            <h5 className="mb-3">{next.question.stem}</h5>
            {feedback ? (
              <div className={`alert ${feedback.correct ? "alert-success" : "alert-warning"}`}>
                {feedback.correct ? "Correct" : "Incorrect"}
                {feedback.explanation ? <div className="mt-1">{feedback.explanation}</div> : null}
                <button
                  type="button"
                  className="btn btn-sm btn-primary mt-2"
                  disabled={busy}
                  onClick={() => setFeedback(null)}
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="d-grid gap-2">
                {next.question.choices.map((choice, index) => (
                  <button
                    key={`${next.question!.id}-${index}`}
                    type="button"
                    className="btn btn-outline-secondary text-start"
                    disabled={busy}
                    onClick={() => void answer(index)}
                  >
                    <strong className="me-2">{CHOICE_LETTERS[index] ?? index + 1}.</strong>
                    {choice}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {step === "results" && results ? (
        <div className="card">
          <div className="card-body">
            <h4 className="mb-2">Quiz results</h4>
            <p className="mb-1">
              Score: {results.scoreCorrect}/{results.scoreTotal} ({results.percent}%) · Grade{" "}
              {results.letterGrade}
            </p>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Link href="/my-training/" className="btn btn-primary">
                Back to My Training
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={() => void startQuiz()}
              >
                Retake
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
