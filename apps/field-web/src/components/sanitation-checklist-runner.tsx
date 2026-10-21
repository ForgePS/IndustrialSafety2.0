"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { FieldPhotoMarkupGate } from "@/components/field-photo-markup-gate";
import {
  answeredSanitationCount,
  buildResponsesJson,
  clearSanitationDraft,
  fileToDataUrl,
  isSanitationAnswered,
  isSanitationNo,
  isSanitationYes,
  loadSanitationDraft,
  saveSanitationDraft,
  sanitationPendingCount,
  sanitationSend,
  type SanitationAnswer,
  type SanitationDraft,
  type SanitationQuestion,
  type SanitationResponseEntry,
  type SanitationResponsePhoto,
} from "@/lib/sanitation-offline";

const API = "/api/v1/industrial/sanitation";
const MAX_PHOTOS = 10;

const ANSWER_OPTIONS = [
  { value: "PASS" as const, label: "Yes", className: "ff-answer-yes" },
  { value: "FAIL" as const, label: "No", className: "ff-answer-no" },
  { value: "NA" as const, label: "N/A", className: "ff-answer-na" },
] as const;

type Props = {
  draft: SanitationDraft;
  onExit: () => void;
  onCompleted: (msg: string) => void;
  onPendingChange?: (count: number) => void;
};

function questionPhotos(entry?: SanitationResponseEntry): SanitationResponsePhoto[] {
  if (entry?.photos?.length) return entry.photos;
  if (entry?.photoDataUrl) {
    return [
      {
        id: "legacy",
        fileName: "photo.jpg",
        contentType: "image/jpeg",
        dataUrl: entry.photoDataUrl,
      },
    ];
  }
  return [];
}

function groupBySection(questions: SanitationQuestion[]) {
  const groups: Array<{ title: string; questions: SanitationQuestion[] }> = [];
  const indexByTitle = new Map<string, number>();
  for (const q of questions) {
    const title = q.section?.trim() || "Checklist";
    const existing = indexByTitle.get(title);
    if (existing == null) {
      indexByTitle.set(title, groups.length);
      groups.push({ title, questions: [q] });
    } else {
      groups[existing]!.questions.push(q);
    }
  }
  return groups;
}

export function SanitationChecklistRunner({
  draft: initial,
  onExit,
  onCompleted,
  onPendingChange,
}: Props) {
  const [inspectionId, setInspectionId] = useState(initial.inspectionId);
  const [questions] = useState(initial.questions);
  const [responses, setResponses] = useState<Record<string, SanitationResponseEntry>>(
    () => loadSanitationDraft(initial.inspectionId)?.responses ?? initial.responses ?? {},
  );
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{
    questionId: string;
    photo: SanitationResponsePhoto;
  } | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const answered = answeredSanitationCount(questions, responses);
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  const sections = useMemo(() => groupBySection(questions), [questions]);

  const persistLocal = useCallback(
    (nextResponses: Record<string, SanitationResponseEntry>) => {
      const draft: SanitationDraft = {
        ...initial,
        inspectionId,
        responses: nextResponses,
        index: 0,
        savedAt: new Date().toISOString(),
      };
      saveSanitationDraft(draft);
    },
    [initial, inspectionId],
  );

  const scheduleServerSave = useCallback(
    (nextResponses: Record<string, SanitationResponseEntry>) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void (async () => {
          try {
            const result = await sanitationSend(
              `${API}/inspections/${encodeURIComponent(inspectionId)}/responses`,
              "POST",
              { responsesJson: buildResponsesJson(questions, nextResponses) },
              { offlineClientId: initial.offlineClientId },
            );
            onPendingChange?.(sanitationPendingCount());
            if (result.queued) return;
          } catch {
            // Draft remains local.
          }
        })();
      }, 700);
    },
    [inspectionId, questions, initial.offlineClientId, onPendingChange],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function patchResponse(questionId: string, patch: Partial<SanitationResponseEntry>) {
    setResponses((prev) => {
      const prevEntry = prev[questionId] ?? { result: "" as SanitationAnswer };
      const nextEntry: SanitationResponseEntry = { ...prevEntry, ...patch };
      if (patch.photos) {
        delete nextEntry.photoDataUrl;
      }
      const next = { ...prev, [questionId]: nextEntry };
      persistLocal(next);
      scheduleServerSave(next);
      return next;
    });
  }

  function setAnswer(question: SanitationQuestion, answer: SanitationAnswer) {
    patchResponse(question.id, {
      result: answer,
      label: question.label,
      ...(question.severity ? { severity: question.severity } : {}),
    });
    if (isSanitationNo(answer)) {
      setExpandedIds((prev) => ({ ...prev, [question.id]: true }));
    }
  }

  function toggleExpanded(questionId: string) {
    setExpandedIds((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }

  const missingNoNotes = useMemo(() => {
    return questions.filter((q) => {
      const entry = responses[q.id];
      if (!isSanitationNo(entry?.result)) return false;
      return !String(entry?.notes ?? "").trim();
    });
  }, [questions, responses]);

  const allAnswered = useMemo(() => {
    return questions.every((q) => isSanitationAnswered(responses[q.id]?.result));
  }, [questions, responses]);

  async function onPhoto(questionId: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const existing = questionPhotos(responses[questionId]);
      if (existing.length >= MAX_PHOTOS) return;
      const file = Array.from(files)[0];
      if (!file) return;
      const dataUrl = await fileToDataUrl(file);
      setPendingPhoto({
        questionId,
        photo: {
          id: crypto.randomUUID(),
          fileName: file.name || "photo.jpg",
          contentType: file.type || "image/jpeg",
          dataUrl,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach photo");
    } finally {
      setBusy(false);
    }
  }

  function commitSanitationPhoto(photo: SanitationResponsePhoto) {
    if (!pendingPhoto) return;
    const questionId = pendingPhoto.questionId;
    const existing = questionPhotos(responses[questionId]);
    patchResponse(questionId, {
      photos: [...existing, photo].slice(0, MAX_PHOTOS),
    });
    setPendingPhoto(null);
  }

  function removePhoto(questionId: string, photoId: string) {
    const next = questionPhotos(responses[questionId]).filter((p) => p.id !== photoId);
    patchResponse(questionId, { photos: next });
  }

  function clearSignatureCanvas() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function signatureDataUrl(): string | null {
    if (signatureName.trim()) return `typed:${signatureName.trim()}`;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) return null;
    return canvas.toDataURL("image/png");
  }

  function rapidPass() {
    setResponses((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        if (isSanitationAnswered(next[q.id]?.result)) continue;
        next[q.id] = {
          ...(next[q.id] ?? { result: "" }),
          result: "PASS",
          label: q.label,
          ...(q.severity ? { severity: q.severity } : {}),
        };
      }
      persistLocal(next);
      scheduleServerSave(next);
      return next;
    });
  }

  async function complete() {
    if (!allAnswered) {
      setError("Answer every checklist item before completing.");
      return;
    }
    if (missingNoNotes.length) {
      setError("Notes are required for every No answer.");
      setExpandedIds((prev) => {
        const next = { ...prev };
        for (const q of missingNoNotes) next[q.id] = true;
        return next;
      });
      setReview(false);
      return;
    }
    const sig = signatureDataUrl();
    if (!sig) {
      setError("Add an inspector signature (typed name or drawing) before completing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const responsesJson = buildResponsesJson(questions, responses);
      const signaturesJson = [
        {
          type: "INSPECTOR",
          signedAt: new Date().toISOString(),
          value: sig,
          name: signatureName.trim() || null,
        },
      ];
      const saveResult = await sanitationSend(
        `${API}/inspections/${encodeURIComponent(inspectionId)}/responses`,
        "POST",
        { responsesJson },
        { offlineClientId: initial.offlineClientId },
      );
      const completeResult = await sanitationSend(
        `${API}/inspections/${encodeURIComponent(inspectionId)}/complete`,
        "POST",
        { responsesJson, signaturesJson },
        { offlineClientId: initial.offlineClientId },
      );
      onPendingChange?.(sanitationPendingCount());
      clearSanitationDraft(inspectionId);
      if (initial.offlineClientId !== inspectionId) {
        clearSanitationDraft(initial.offlineClientId);
      }
      if (saveResult.queued || completeResult.queued) {
        onCompleted("Inspection saved offline — will sync when online.");
      } else {
        const status =
          completeResult.data && typeof completeResult.data.complianceStatus === "string"
            ? completeResult.data.complianceStatus
            : "COMPLETED";
        onCompleted(`Inspection submitted (${status}).`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete inspection");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const latest = loadSanitationDraft(initial.offlineClientId) ?? loadSanitationDraft(inspectionId);
    if (latest && latest.inspectionId !== inspectionId) {
      setInspectionId(latest.inspectionId);
    }
  }, [initial.offlineClientId, inspectionId]);

  if (!questions.length) {
    return (
      <div className="ff-stack">
        <p className="ff-error">This template has no checklist questions.</p>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  if (review) {
    return (
      <div className="ff-stack">
        <h1 className="ff-page-title">Review &amp; sign</h1>
        <p className="ff-page-body">{initial.title}</p>
        <div className="ff-card">
          <p className="ff-hint ff-hint--left">
            {answered} / {questions.length} answered · {progress}%
          </p>
          <p className="ff-hint ff-hint--left">
            No answers: {questions.filter((q) => isSanitationNo(responses[q.id]?.result)).length}
          </p>
          {missingNoNotes.length ? (
            <p className="ff-error">
              {missingNoNotes.length} No answer(s) still need notes.
            </p>
          ) : null}
        </div>
        <label className="ff-field">
          <span className="ff-label">Inspector name (typed signature)</span>
          <input
            className="ff-input"
            value={signatureName}
            onChange={(e) => setSignatureName(e.target.value)}
            placeholder="Full name"
          />
        </label>
        <span className="ff-label">Or draw signature</span>
        <canvas
          ref={signatureCanvasRef}
          width={320}
          height={110}
          className="ff-input ff-signature-canvas"
          style={{ touchAction: "none", height: 110 }}
          onPointerDown={(ev) => {
            drawingRef.current = true;
            const canvas = signatureCanvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            const rect = canvas.getBoundingClientRect();
            ctx.strokeStyle = "#222";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(
              ((ev.clientX - rect.left) / rect.width) * canvas.width,
              ((ev.clientY - rect.top) / rect.height) * canvas.height,
            );
            (ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            if (!drawingRef.current) return;
            const canvas = signatureCanvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            const rect = canvas.getBoundingClientRect();
            ctx.lineTo(
              ((ev.clientX - rect.left) / rect.width) * canvas.width,
              ((ev.clientY - rect.top) / rect.height) * canvas.height,
            );
            ctx.stroke();
          }}
          onPointerUp={() => {
            drawingRef.current = false;
          }}
        />
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => clearSignatureCanvas()}>
          Clear drawing
        </button>
        {error ? <p className="ff-error">{error}</p> : null}
        <button
          type="button"
          className="ff-btn ff-btn-primary"
          disabled={busy || !allAnswered || missingNoNotes.length > 0}
          onClick={() => void complete()}
        >
          {busy ? "Submitting…" : "Complete inspection"}
        </button>
        <button type="button" className="ff-btn ff-btn-secondary" onClick={() => setReview(false)}>
          Back to checklist
        </button>
      </div>
    );
  }

  return (
    <div className="ff-stack">
      <div className="ff-progress-wrap" aria-label={`Progress ${progress}%`}>
        <div className="ff-progress-bar" style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
      <h1 className="ff-page-title" style={{ fontSize: 22 }}>
        {initial.title || "Sanitation inspection"}
      </h1>
      <p className="ff-hint ff-hint--left">
        {answered} / {questions.length} answered · {progress}%
      </p>
      {error ? <p className="ff-error">{error}</p> : null}

      {sections.map((section) => (
        <section key={section.title} className="ff-sanitation-section">
          <h2 className="ff-sanitation-section__title">{section.title}</h2>
          {section.questions.map((q) => {
            const entry = responses[q.id];
            const result = entry?.result ?? "";
            const isNo = isSanitationNo(result);
            const isYes = isSanitationYes(result);
            const expanded = Boolean(expandedIds[q.id]) || isNo;
            const photos = questionPhotos(entry);
            const hasNotes = Boolean(String(entry?.notes ?? "").trim());
            return (
              <div
                key={q.id}
                className={`ff-sanitation-item${isNo ? " is-fail" : ""}`}
              >
                <button
                  type="button"
                  className="ff-sanitation-item__question"
                  aria-expanded={expanded}
                  onClick={() => toggleExpanded(q.id)}
                >
                  <span aria-hidden>{expanded ? "▾" : "▸"}</span>
                  <span className="ff-sanitation-item__question-text">
                    <span className="ff-sanitation-item__label">{q.label}</span>
                    {!expanded && q.regulationRef ? (
                      <span className="ff-hint ff-hint--left">{q.regulationRef}</span>
                    ) : null}
                    {!expanded && (hasNotes || photos.length > 0) ? (
                      <span className="ff-hint ff-hint--left">
                        {hasNotes ? "Notes added" : ""}
                        {hasNotes && photos.length > 0 ? " · " : ""}
                        {photos.length > 0 ? `${photos.length} photo(s)` : ""}
                      </span>
                    ) : null}
                    {!expanded && !isNo ? (
                      <span className="ff-hint ff-hint--left">
                        Tap to add optional notes or photos
                      </span>
                    ) : null}
                  </span>
                </button>

                <div
                  className="ff-answer-row ff-answer-row--compact"
                  role="group"
                  aria-label={`Answer ${q.label}`}
                >
                  {ANSWER_OPTIONS.map((ans) => {
                    const selected =
                      result === ans.value ||
                      (ans.value === "PASS" && isYes) ||
                      (ans.value === "FAIL" && isNo);
                    return (
                      <button
                        key={ans.value}
                        type="button"
                        className={`ff-answer-btn ${ans.className}${selected ? " is-selected" : ""}`}
                        aria-pressed={selected}
                        disabled={busy}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setAnswer(q, ans.value);
                        }}
                      >
                        {ans.label}
                      </button>
                    );
                  })}
                </div>

                {expanded ? (
                  <div className="ff-sanitation-item__details">
                    {q.description ? <p className="ff-page-body">{q.description}</p> : null}
                    {q.regulationRef ? (
                      <p className="ff-hint ff-hint--left">{q.regulationRef}</p>
                    ) : null}
                    {q.measurementRequired ? (
                      <div className="ff-sanitation-measure">
                        <label className="ff-label">
                          Dust depth
                          <input
                            className="ff-input"
                            type="number"
                            step="any"
                            min="0"
                            value={entry?.dustDepth ?? ""}
                            onChange={(e) =>
                              patchResponse(q.id, { dustDepth: e.target.value })
                            }
                          />
                        </label>
                        <label className="ff-label">
                          Unit
                          <select
                            className="ff-input"
                            value={entry?.dustUnit ?? "INCHES"}
                            onChange={(e) =>
                              patchResponse(q.id, {
                                dustUnit: e.target.value as "INCHES" | "MM",
                              })
                            }
                          >
                            <option value="INCHES">INCHES</option>
                            <option value="MM">MM</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                    <label className="ff-label">
                      Notes{isNo ? " (required)" : " (optional)"}
                      <textarea
                        className={`ff-input${isNo && !hasNotes ? " is-invalid" : ""}`}
                        rows={3}
                        value={entry?.notes ?? ""}
                        required={isNo}
                        onChange={(e) => patchResponse(q.id, { notes: e.target.value })}
                        placeholder={
                          isNo
                            ? "Required: describe the issue and any corrective action"
                            : "Optional observations or follow-up detail"
                        }
                      />
                    </label>
                    {isNo && !hasNotes ? (
                      <p className="ff-error">Notes are required for No answers.</p>
                    ) : null}
                    <label
                      className="ff-btn ff-btn-secondary"
                      style={{ display: "block", textAlign: "center" }}
                    >
                      {photos.length >= MAX_PHOTOS
                        ? `Photo limit reached (${MAX_PHOTOS})`
                        : q.photoRequired && isNo
                          ? `Add photos (recommended) · ${photos.length}/${MAX_PHOTOS}`
                          : `Add photos · ${photos.length}/${MAX_PHOTOS}`}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        hidden
                        disabled={busy || photos.length >= MAX_PHOTOS}
                        onChange={(e) => {
                          void onPhoto(q.id, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {photos.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {photos.map((p) => (
                          <div key={p.id} style={{ position: "relative" }}>
                            <img
                              src={p.dataUrl}
                              alt={p.fileName}
                              style={{
                                width: 64,
                                height: 64,
                                objectFit: "cover",
                                borderRadius: 6,
                              }}
                            />
                            <button
                              type="button"
                              className="ff-btn ff-btn-secondary"
                              style={{
                                position: "absolute",
                                top: -6,
                                right: -6,
                                padding: "0 6px",
                                minHeight: 24,
                              }}
                              aria-label={`Remove ${p.fileName}`}
                              onClick={() => removePhoto(q.id, p.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}

      <button type="button" className="ff-btn ff-btn-secondary" disabled={busy} onClick={rapidPass}>
        Rapid Pass remaining
      </button>
      <button
        type="button"
        className="ff-btn ff-btn-primary"
        disabled={busy || !allAnswered}
        onClick={() => {
          if (missingNoNotes.length) {
            setError("Notes are required for every No answer.");
            setExpandedIds((prev) => {
              const next = { ...prev };
              for (const q of missingNoNotes) next[q.id] = true;
              return next;
            });
            return;
          }
          setError(null);
          setReview(true);
        }}
      >
        Review &amp; sign
      </button>
      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        onClick={() => {
          persistLocal(responses);
          onExit();
        }}
      >
        Save &amp; exit
      </button>
      <FieldPhotoMarkupGate
        open={Boolean(pendingPhoto)}
        module="sanitation"
        pending={pendingPhoto ? { original: pendingPhoto.photo } : null}
        onCancel={() => setPendingPhoto(null)}
        onSaveWithoutMarkup={(photo) => commitSanitationPhoto(photo)}
        onSaveWithMarkup={(photo) => commitSanitationPhoto(photo)}
      />
    </div>
  );
}
