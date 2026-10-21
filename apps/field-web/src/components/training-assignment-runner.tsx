"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CHOICE_LETTERS,
  canInlinePreview,
  fieldTrainingApi,
  isTrainingVideoFile,
  resolveTrainingVideoPlaybackMime,
  type FieldTrainingAssignment,
  type FieldTrainingMaterial,
  type QuizAnswerResult,
  type QuizNext,
  type QuizResults,
} from "@/lib/training-api";
import { formatDueLabel } from "@/lib/my-work";

type Step = "loading" | "overview" | "material" | "quiz" | "feedback" | "results" | "error";

export function TrainingAssignmentRunner({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [assignment, setAssignment] = useState<FieldTrainingAssignment | null>(null);
  const [material, setMaterial] = useState<FieldTrainingMaterial | null>(null);
  const [materialUrl, setMaterialUrl] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [next, setNext] = useState<QuizNext | null>(null);
  const [feedback, setFeedback] = useState<(QuizAnswerResult & { selectedIndex: number }) | null>(
    null,
  );
  const [results, setResults] = useState<QuizResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      const a = await fieldTrainingApi.getAssignment(assignmentId);
      setAssignment(a);
      if (a.myStatus === "PASSED") {
        setStep("overview");
        return;
      }
      const materialId = a.materialId?.trim();
      if (materialId) {
        let matched: FieldTrainingMaterial | null = null;
        if (a.sourceId) {
          try {
            const mats = await fieldTrainingApi.listMaterials(a.sourceId);
            matched = mats.items.find((m) => m.id === materialId) ?? null;
          } catch {
            matched = null;
          }
        }
        setMaterial(
          matched ?? {
            id: materialId,
            title: a.sourceTitle || a.title,
            mimeType: null,
            originalFilename: null,
          },
        );
      } else if (a.sourceId) {
        const mats = await fieldTrainingApi.listMaterials(a.sourceId);
        const preferred =
          mats.items.find((m) => isTrainingVideoFile(m)) ?? mats.items[0] ?? null;
        setMaterial(preferred);
      }
      setStep("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this training.");
      setStep("error");
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openMaterial() {
    if (!material?.id) {
      setStep("overview");
      setAcknowledged(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let url: string | null = null;
      let mimeType = material.mimeType ?? null;
      let originalFilename = material.originalFilename ?? null;
      try {
        const view = await fieldTrainingApi.materialViewUrl(material.id);
        url = view.viewUrl;
        mimeType = view.mimeType ?? mimeType;
        originalFilename = view.originalFilename ?? originalFilename;
      } catch {
        const file = await fieldTrainingApi.materialDownloadUrl(material.id);
        url = file.downloadUrl;
        mimeType = file.mimeType ?? mimeType;
        originalFilename = file.originalFilename ?? originalFilename;
      }
      setMaterialUrl(url);
      setMaterial((prev) =>
        prev
          ? {
              ...prev,
              mimeType,
              originalFilename,
            }
          : prev,
      );
      setStep("material");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open training material.");
    } finally {
      setBusy(false);
    }
  }

  async function startQuiz() {
    setBusy(true);
    setError(null);
    try {
      const created = await fieldTrainingApi.createQuiz(assignmentId);
      setAttemptId(created.attempt.id);
      const q = await fieldTrainingApi.nextQuestion(created.attempt.id);
      setNext(q);
      setFeedback(null);
      setStep(q.done ? "results" : "quiz");
      if (q.done) {
        const r = await fieldTrainingApi.results(created.attempt.id);
        setResults(r);
        setStep("results");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(selectedIndex: number) {
    if (!attemptId || !next?.question) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await fieldTrainingApi.answer(
        attemptId,
        next.question.id,
        selectedIndex,
      );
      if (next.feedbackEnabled !== false) {
        setFeedback({ ...answer, selectedIndex });
        setStep("feedback");
      } else if (answer.done) {
        const r = await fieldTrainingApi.results(attemptId);
        setResults(r);
        setStep("results");
      } else {
        const q = await fieldTrainingApi.nextQuestion(attemptId);
        setNext(q);
        setStep("quiz");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterFeedback() {
    if (!attemptId || !feedback) return;
    setBusy(true);
    try {
      if (feedback.done) {
        const r = await fieldTrainingApi.results(attemptId);
        setResults(r);
        setStep("results");
      } else {
        const q = await fieldTrainingApi.nextQuestion(attemptId);
        setNext(q);
        setFeedback(null);
        setStep("quiz");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue the quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function retake(mode: "wrong" | "same" | "new" = "same") {
    if (!attemptId) {
      await startQuiz();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Prefer fresh quiz with assignmentId so personnel completion stays linked.
      if (mode === "same" || mode === "new") {
        await startQuiz();
        return;
      }
      const created = await fieldTrainingApi.retake(attemptId, mode);
      setAttemptId(created.attempt.id);
      const q = await fieldTrainingApi.nextQuestion(created.attempt.id);
      setNext(q);
      setFeedback(null);
      setResults(null);
      setStep("quiz");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a retake.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") {
    return <p className="ff-page-body">Loading training…</p>;
  }

  if (step === "error" || !assignment) {
    return (
      <>
        <h1 className="ff-page-title">Training unavailable</h1>
        <p className="ff-error" role="alert">
          {error ?? "This assignment could not be opened."}
        </p>
        <button type="button" className="ff-btn" onClick={() => void load()}>
          Try again
        </button>
      </>
    );
  }

  const passed =
    assignment.myStatus === "PASSED" ||
    (results != null && results.percent >= (assignment.passingPercent ?? 70));
  const progressLabel =
    next?.total && next.index != null
      ? `${Math.min(next.index + 1, next.total)} of ${next.total}`
      : null;

  if (step === "results" && results) {
    return (
      <>
        <p className="ff-brand-mark">Training Complete</p>
        <h1 className="ff-page-title">{passed ? "PASS" : "Not yet passed"}</h1>
        <div className="ff-due-card">
          <strong>
            Score: {results.percent}% ({results.letterGrade})
          </strong>
          <p>
            {results.scoreCorrect} of {results.scoreTotal} correct · Passing is{" "}
            {assignment.passingPercent}%
          </p>
          <p className="ff-meta">
            {new Date().toLocaleString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        {passed ? (
          <p className="ff-success" role="status">
            Posted to your training record, compliance record, and audit log.
          </p>
        ) : (
          <p className="ff-page-body">Review the material and try again when you are ready.</p>
        )}
        {!passed ? (
          <button type="button" className="ff-btn" disabled={busy} onClick={() => void retake("same")}>
            Retake quiz
          </button>
        ) : null}
        {results.wrongQuestionIds?.length ? (
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            disabled={busy}
            onClick={() => void retake("wrong")}
          >
            Retake missed questions
          </button>
        ) : null}
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/training/")}>
          Done
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => router.push("/more/records/")}
        >
          View transcript
        </button>
      </>
    );
  }

  if (step === "feedback" && feedback && next?.question) {
    return (
      <>
        <p className="ff-section-title">{progressLabel}</p>
        <h1 className="ff-page-title">{feedback.correct ? "Correct" : "Incorrect"}</h1>
        <p className="ff-page-body">{next.question.stem}</p>
        {feedback.explanation ? <p className="ff-meta">{feedback.explanation}</p> : null}
        <button type="button" className="ff-btn" disabled={busy} onClick={() => void continueAfterFeedback()}>
          {feedback.done ? "See results" : "Next"}
        </button>
      </>
    );
  }

  if (step === "quiz" && next?.question) {
    return (
      <>
        <div className="ff-progress-wrap" aria-label={`Question ${progressLabel}`}>
          <div
            className="ff-progress-bar"
            style={{
              width:
                next.total && next.index != null
                  ? `${Math.round(((next.index + 1) / next.total) * 100)}%`
                  : "10%",
            }}
          />
        </div>
        <p className="ff-section-title">{progressLabel}</p>
        <h1 className="ff-page-title" style={{ fontSize: 20 }}>
          {next.question.stem}
        </h1>
        {error ? (
          <p className="ff-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="ff-choice-list">
          {next.question.choices.map((choice, index) => (
            <button
              key={`${next.question!.id}-${index}`}
              type="button"
              className="ff-choice-btn"
              disabled={busy}
              onClick={() => void submitAnswer(index)}
            >
              <span className="ff-choice-letter">{CHOICE_LETTERS[index] ?? index + 1}</span>
              <span>{choice}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (step === "material") {
    const mime = material?.mimeType ?? "";
    const filename = material?.originalFilename ?? null;
    const inline = canInlinePreview(mime, filename);
    const isVideo = isTrainingVideoFile({ mimeType: mime, filename });
    const videoType = resolveTrainingVideoPlaybackMime({ mimeType: mime, filename });
    return (
      <>
        <h1 className="ff-page-title">{assignment.title}</h1>
        <p className="ff-page-body">Review the material, then acknowledge to unlock the quiz.</p>
        {materialUrl && inline && mime.startsWith("image/") ? (
          <img src={materialUrl} alt={material?.title || "Training material"} className="ff-material-frame" />
        ) : null}
        {materialUrl && inline && mime === "application/pdf" ? (
          <iframe title="Training PDF" src={materialUrl} className="ff-material-frame" />
        ) : null}
        {materialUrl && inline && isVideo ? (
          // Training videos may not ship captions; still expose accessible controls.
          // eslint-disable-next-line jsx-a11y/media-has-caption -- source media is tenant-provided
          <video
            key={materialUrl}
            controls
            className="ff-material-frame"
            playsInline
            preload="metadata"
            aria-label={material?.title || "Training video"}
            ref={(el) => {
              if (!el) return;
              el.setAttribute("playsinline", "true");
              el.setAttribute("webkit-playsinline", "true");
            }}
          >
            <source src={materialUrl} type={videoType} />
          </video>
        ) : null}
        {materialUrl && !inline ? (
          <a className="ff-btn" href={materialUrl} target="_blank" rel="noreferrer">
            Open material
          </a>
        ) : null}
        <label className="ff-ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          I have reviewed this training material
        </label>
        <button
          type="button"
          className="ff-btn"
          disabled={!acknowledged || busy}
          onClick={() => void startQuiz()}
        >
          Start quiz
        </button>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setStep("overview")}>
          Back
        </button>
      </>
    );
  }

  // overview
  return (
    <>
      <p className="ff-brand-mark">{assignment.sourceTitle || "Training"}</p>
      <h1 className="ff-page-title">{assignment.title}</h1>
      {assignment.description ? <p className="ff-page-body">{assignment.description}</p> : null}
      <div className="ff-work-summary">
        <div className="ff-work-row">
          <span>Status</span>
          <span className="ff-work-count">{assignment.myStatus || "NOT_STARTED"}</span>
        </div>
        <div className="ff-work-row">
          <span>Due</span>
          <span>{formatDueLabel(assignment.dueAt ?? null)}</span>
        </div>
        <div className="ff-work-row">
          <span>Passing score</span>
          <span>{assignment.passingPercent}%</span>
        </div>
        {assignment.myBestPercent != null ? (
          <div className="ff-work-row">
            <span>Best score</span>
            <span>{assignment.myBestPercent}%</span>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}
      {assignment.myStatus === "PASSED" ? (
        <p className="ff-success" role="status">
          You already passed this training.
        </p>
      ) : (
        <>
          <button type="button" className="ff-btn" disabled={busy} onClick={() => void openMaterial()}>
            {material ? "Review material" : "Start quiz"}
          </button>
          {material ? (
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={busy}
              onClick={() => {
                setAcknowledged(true);
                void startQuiz();
              }}
            >
              Skip to quiz
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
