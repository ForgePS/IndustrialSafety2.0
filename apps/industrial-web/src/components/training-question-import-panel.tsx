"use client";

import { useState } from "react";
import { ApiError } from "@forge/web-kit";
import {
  downloadQuestionImportCsvTemplate,
  downloadQuestionImportTemplate,
  importTrainingQuizFile,
} from "@/lib/training-question-import";

type Props = {
  sourceId: string;
  sourceTitle?: string;
  disabled?: boolean;
  /** Compact layout for embedding in course cards. */
  compact?: boolean;
  onImported: () => void | Promise<void>;
  onError: (message: string | null) => void;
};

export function TrainingQuestionImportPanel({
  sourceId,
  sourceTitle,
  disabled = false,
  compact = false,
  onImported,
  onError,
}: Props) {
  const [defaultStatus, setDefaultStatus] = useState<"DRAFT" | "PUBLISHED">("PUBLISHED");
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file || disabled || uploading) return;
    setUploading(true);
    onError(null);
    setLastResult(null);
    try {
      const result = await importTrainingQuizFile(sourceId, file, defaultStatus);
      setLastResult(
        `Imported ${result.questionsCreated} question${result.questionsCreated === 1 ? "" : "s"}.`,
      );
      await onImported();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  const body = (
    <>
      <div
        className={`d-flex flex-wrap justify-content-between align-items-start gap-2 ${compact ? "mb-2" : "mb-2"}`}
      >
        <div>
          <h6 className={compact ? "small fw-semibold mb-1" : "mb-1"}>Upload quiz / test</h6>
          <p className="text-muted small mb-0">
            Import questions from Excel, CSV, JSON, or PDF{sourceTitle ? ` for ${sourceTitle}` : ""}
            . Assignments only use <strong>Published</strong> questions.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={disabled || uploading}
            onClick={downloadQuestionImportCsvTemplate}
          >
            CSV template
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={disabled || uploading}
            onClick={downloadQuestionImportTemplate}
          >
            JSON template
          </button>
        </div>
      </div>
      <div className="row g-2 align-items-end">
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor={`import-status-${sourceId}`}>
            Default status
          </label>
          <select
            id={`import-status-${sourceId}`}
            className="form-select form-select-sm"
            value={defaultStatus}
            disabled={disabled || uploading}
            onChange={(e) =>
              setDefaultStatus(e.target.value === "PUBLISHED" ? "PUBLISHED" : "DRAFT")
            }
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        <div className="col-md-8">
          <label className="form-label small mb-1" htmlFor={`import-file-${sourceId}`}>
            Quiz / test file
          </label>
          <input
            id={`import-file-${sourceId}`}
            type="file"
            className="form-control form-control-sm"
            accept=".csv,.xlsx,.xls,.pdf,.json,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              void handleFile(file);
            }}
          />
        </div>
      </div>
      <div className="form-text mt-2">
        Excel/CSV columns: <code>Question</code> (or <code>stem</code>), <code>correct</code>,{" "}
        <code>choice1</code>…<code>choice4</code> (or columns A–D). PDF: numbered questions with
        A/B/C/D and <code>Answer: B</code> lines.
        {uploading ? " Importing…" : ""}
      </div>
      {lastResult ? <div className="text-success small mt-2">{lastResult}</div> : null}
    </>
  );

  if (compact) {
    return <div className="border-top pt-3 mt-3">{body}</div>;
  }

  return (
    <div className="card border mb-3">
      <div className="card-body">{body}</div>
    </div>
  );
}
