"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { FxButton } from "@forge/fx-ui";
import { FxActionBar } from "@/fx/forms/FxActionBar";
import { FxTextarea } from "@/fx/forms/fields";
import { FxFormSection } from "@/fx/forms/FxForm";
import { FxValidationSummary } from "@/fx/forms/FxValidationSummary";
import { FormSectionBoundary } from "@/fx/forms/FormSectionBoundary";
import {
  addReviewComment,
  approveIncident,
  listReviewComments,
  listValidationRuns,
  returnIncident,
  submitForReview,
  validateIncident,
  type ReviewComment,
  type ValidationIssue,
} from "@/lib/rms-api";
import styles from "../app/page.module.css";
import "@/fx/forms/forms.css";

export type OfficerReviewPresentation = "legacy" | "fx";

export function OfficerReviewPanel({
  tenantId,
  incidentId,
  status,
  onChanged,
  presentation = "legacy",
}: {
  tenantId: string;
  incidentId: string;
  status: string;
  onChanged: () => void;
  presentation?: OfficerReviewPresentation;
}) {
  const { hasPermission } = useAuth();
  const canReview = hasPermission("rms.neris.incident.review");
  const canSubmit = hasPermission("rms.neris.incident.submit_review");
  const canApprove = hasPermission("rms.neris.incident.approve");
  const canReturn = hasPermission("rms.neris.incident.return");

  const [submitNote, setSubmitNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [commentRows, validation] = await Promise.all([
        canReview ? listReviewComments(tenantId, incidentId) : Promise.resolve([]),
        validateIncident(tenantId, incidentId).catch(() => null),
      ]);
      setComments(commentRows);
      setIssues(validation?.findings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review data");
    }
  }, [tenantId, incidentId, canReview]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      onChanged();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const validationMessages = issues.map((issue) => `[${issue.severity}] ${issue.message}`);

  if (presentation === "fx") {
    return (
      <FormSectionBoundary title="Officer review">
        <div className="rms-fx-form" data-testid="rms-fx-officer-review">
          <FxFormSection title="Officer review" description={`Current status: ${status}`}>
            {error ? <FxValidationSummary errors={[error]} /> : null}
            {message ? (
              <p className={styles.success} role="status">
                {message}
              </p>
            ) : null}

            <FxFormSection title="Validation results">
              {validationMessages.length === 0 ? (
                <p className={styles.muted}>No validation issues reported.</p>
              ) : (
                <FxValidationSummary title="Validation findings" errors={validationMessages} />
              )}
              <FxActionBar>
                <FxButton
                  type="button"
                  tone="secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const runs = await listValidationRuns(tenantId, incidentId);
                      if (runs[0]) {
                        setIssues([]);
                      }
                      await validateIncident(tenantId, incidentId);
                    }, "Validation refreshed")
                  }
                >
                  Re-run validation
                </FxButton>
              </FxActionBar>
            </FxFormSection>

            {canSubmit ? (
              <FxFormSection title="Submit for review">
                <FxTextarea
                  id="submit-note"
                  label="Submit note"
                  value={submitNote}
                  onChange={(event) => setSubmitNote(event.target.value)}
                  rows={3}
                />
                <FxActionBar>
                  <FxButton
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        () => submitForReview(tenantId, incidentId, submitNote.trim() || undefined),
                        "Submitted for review",
                      )
                    }
                  >
                    Submit for review
                  </FxButton>
                </FxActionBar>
              </FxFormSection>
            ) : null}

            {canReview ? (
              <FxFormSection title="Review comment">
                <FxTextarea
                  id="review-comment"
                  label="Review comment"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  rows={3}
                />
                <FxActionBar>
                  <FxButton
                    type="button"
                    tone="secondary"
                    disabled={busy || !commentBody.trim()}
                    onClick={() =>
                      void runAction(async () => {
                        await addReviewComment(tenantId, incidentId, commentBody.trim());
                        setCommentBody("");
                      }, "Comment added")
                    }
                  >
                    Add comment
                  </FxButton>
                </FxActionBar>
              </FxFormSection>
            ) : null}

            {comments.length > 0 ? (
              <FxFormSection title="Comments">
                <ul>
                  {comments.map((comment) => (
                    <li key={comment.id}>
                      <span className={styles.mono}>{comment.authorUserId.slice(0, 8)}…</span>:{" "}
                      {comment.body}
                    </li>
                  ))}
                </ul>
              </FxFormSection>
            ) : null}

            {canReturn ? (
              <FxFormSection title="Return for correction">
                <FxTextarea
                  id="return-reason"
                  label="Return reason"
                  required
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  rows={3}
                />
                <FxActionBar>
                  <FxButton
                    type="button"
                    tone="secondary"
                    disabled={busy || !returnReason.trim()}
                    onClick={() =>
                      void runAction(
                        () => returnIncident(tenantId, incidentId, returnReason.trim(), []),
                        "Returned for correction",
                      )
                    }
                  >
                    Return for correction
                  </FxButton>
                </FxActionBar>
              </FxFormSection>
            ) : null}

            {canApprove ? (
              <FxActionBar>
                <FxButton
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(() => approveIncident(tenantId, incidentId), "Incident approved")
                  }
                >
                  Approve
                </FxButton>
              </FxActionBar>
            ) : null}
          </FxFormSection>
        </div>
      </FormSectionBoundary>
    );
  }

  return (
    <div className={styles.panel}>
      <h2>Officer review</h2>
      <p className={styles.muted}>Current status: {status}</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <div className={styles.panel}>
        <h2>Validation results</h2>
        {issues.length === 0 ? (
          <p className={styles.muted}>No validation issues reported.</p>
        ) : (
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                [{issue.severity}] {issue.message}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={busy}
            onClick={() =>
              void runAction(async () => {
                const runs = await listValidationRuns(tenantId, incidentId);
                if (runs[0]) {
                  setIssues([]);
                }
                await validateIncident(tenantId, incidentId);
              }, "Validation refreshed")
            }
          >
            Re-run validation
          </button>
        </div>
      </div>

      {canSubmit ? (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label htmlFor="submit-note">Submit note</label>
            <textarea
              id="submit-note"
              value={submitNote}
              onChange={(event) => setSubmitNote(event.target.value)}
              rows={3}
            />
          </div>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() =>
              void runAction(
                () => submitForReview(tenantId, incidentId, submitNote.trim() || undefined),
                "Submitted for review",
              )
            }
          >
            Submit for review
          </button>
        </div>
      ) : null}

      {canReview ? (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label htmlFor="review-comment">Review comment</label>
            <textarea
              id="review-comment"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              rows={3}
            />
          </div>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={busy || !commentBody.trim()}
            onClick={() =>
              void runAction(async () => {
                await addReviewComment(tenantId, incidentId, commentBody.trim());
                setCommentBody("");
              }, "Comment added")
            }
          >
            Add comment
          </button>
        </div>
      ) : null}

      {comments.length > 0 ? (
        <div className={styles.panel}>
          <h2>Comments</h2>
          <ul>
            {comments.map((comment) => (
              <li key={comment.id}>
                <span className={styles.mono}>{comment.authorUserId.slice(0, 8)}…</span>:{" "}
                {comment.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canReturn ? (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label htmlFor="return-reason">Return reason</label>
            <textarea
              id="return-reason"
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={3}
              required
            />
          </div>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={busy || !returnReason.trim()}
            onClick={() =>
              void runAction(
                () => returnIncident(tenantId, incidentId, returnReason.trim(), []),
                "Returned for correction",
              )
            }
          >
            Return for correction
          </button>
        </div>
      ) : null}

      {canApprove ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() =>
              void runAction(() => approveIncident(tenantId, incidentId), "Incident approved")
            }
          >
            Approve
          </button>
        </div>
      ) : null}
    </div>
  );
}
