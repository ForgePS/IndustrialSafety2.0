"use client";

import { useState, type ReactNode } from "react";
import {
  lotoCanActivateDirect,
  lotoCanEhsReview,
  lotoCanSubmitForReview,
  lotoIsNeedsCorrection,
} from "@/lib/loto";

type Props = {
  status: string;
  busy?: boolean;
  canEdit: boolean;
  canApprove: boolean;
  onEdit?: () => void;
  onSubmitForReview: () => void;
  onActivate: () => void;
  onApprove: () => void;
  onRequestChanges: (notes: string) => void;
  extras?: ReactNode;
};

export function LotoProcedureWorkflowActions({
  status,
  busy = false,
  canEdit,
  canApprove,
  onEdit,
  onSubmitForReview,
  onActivate,
  onApprove,
  onRequestChanges,
  extras,
}: Props) {
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackNotes, setSendBackNotes] = useState("");
  const [sendBackError, setSendBackError] = useState<string | null>(null);

  const showActivate = (canEdit || canApprove) && lotoCanActivateDirect(status);
  const showSubmit = canEdit && lotoCanSubmitForReview(status);
  const showEhsActions = canApprove && lotoCanEhsReview(status);
  const submitLabel = lotoIsNeedsCorrection(status)
    ? "Resubmit for review"
    : "Submit for review";
  const activateLabel = lotoIsNeedsCorrection(status) ? "Activate after corrections" : "Activate";

  function openSendBack() {
    setSendBackNotes("");
    setSendBackError(null);
    setSendBackOpen(true);
  }

  function confirmSendBack() {
    const notes = sendBackNotes.trim();
    if (!notes) {
      setSendBackError("Describe what needs to be corrected.");
      return;
    }
    setSendBackOpen(false);
    onRequestChanges(notes);
  }

  return (
    <>
      <div className="ff-action-grid">
        {canEdit && onEdit ? (
          <button type="button" className="ff-btn ff-btn-secondary" disabled={busy} onClick={onEdit}>
            Edit
          </button>
        ) : null}
        {showActivate ? (
          <button
            type="button"
            className="ff-btn"
            disabled={busy}
            onClick={onActivate}
            title="Make this procedure active for lockout issue without EHS review"
          >
            {activateLabel}
          </button>
        ) : null}
        {showSubmit ? (
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            disabled={busy}
            onClick={onSubmitForReview}
            title="Optional — send to EHS when higher validation is needed"
          >
            {submitLabel}
          </button>
        ) : null}
        {showEhsActions ? (
          <>
            <button
              type="button"
              className="ff-btn"
              disabled={busy}
              onClick={onApprove}
              title="Approve and activate this procedure"
            >
              Approve
            </button>
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={busy}
              onClick={openSendBack}
            >
              Send back
            </button>
          </>
        ) : null}
        {extras}
      </div>
      {showSubmit ? (
        <p className="ff-meta">
          Submit for review is optional when you need EHS validation. Otherwise activate the
          procedure directly.
        </p>
      ) : null}

      {sendBackOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="loto-send-back-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setSendBackOpen(false)}
        >
          <div
            style={{
              background: "var(--ff-surface, #fff)",
              color: "inherit",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              maxWidth: "28rem",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="ff-page-title" id="loto-send-back-title">
              Send back for correction
            </h2>
            <p className="ff-page-body">
              The author will see these notes and can activate or resubmit after correcting the
              procedure.
            </p>
            <div className="ff-field">
              <label htmlFor="loto-send-back-notes">Correction notes</label>
              <textarea
                id="loto-send-back-notes"
                className="ff-input"
                rows={4}
                value={sendBackNotes}
                onChange={(event) => {
                  setSendBackNotes(event.target.value);
                  setSendBackError(null);
                }}
                placeholder="What needs to be fixed before approval?"
              />
            </div>
            {sendBackError ? (
              <p className="ff-error" role="alert">
                {sendBackError}
              </p>
            ) : null}
            <div className="ff-action-grid">
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setSendBackOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className="ff-btn" onClick={confirmSendBack}>
                Send back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
