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
  const submitLabel = lotoIsNeedsCorrection(status) ? "Resubmit for review" : "Submit for review";
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
      <div className="d-flex flex-wrap gap-2 align-items-center">
        {canEdit && onEdit ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy}
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
        {showActivate ? (
          <button
            type="button"
            className="btn btn-sm btn-success"
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
            className="btn btn-sm btn-outline-primary"
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
              className="btn btn-sm btn-success"
              disabled={busy}
              onClick={onApprove}
              title="Approve and activate this procedure"
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
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
        <p className="text-muted small mb-0 mt-2 w-100">
          Submit for review is optional when you need EHS validation. Otherwise activate the
          procedure directly.
        </p>
      ) : null}

      {sendBackOpen ? (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-close, same as the other Forge modals; keyboard users close with the Close/Cancel button
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="loto-send-back-title"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setSendBackOpen(false)}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stops backdrop click-to-close from firing inside the dialog; not a control */}
          <div
            className="modal-dialog modal-dialog-centered"
            role="document"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="loto-send-back-title">
                  Send back for correction
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setSendBackOpen(false)}
                />
              </div>
              <div className="modal-body">
                <p className="text-muted small mb-2">
                  The author will see these notes and can activate or resubmit after correcting the
                  procedure.
                </p>
                <label className="form-label" htmlFor="loto-send-back-notes">
                  Correction notes
                </label>
                <textarea
                  id="loto-send-back-notes"
                  className="form-control"
                  rows={4}
                  value={sendBackNotes}
                  onChange={(event) => {
                    setSendBackNotes(event.target.value);
                    setSendBackError(null);
                  }}
                  placeholder="What needs to be fixed before approval?"
                />
                {sendBackError ? (
                  <p className="text-danger small mt-2 mb-0">{sendBackError}</p>
                ) : null}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setSendBackOpen(false)}
                >
                  Cancel
                </button>
                <button type="button" className="btn btn-danger" onClick={confirmSendBack}>
                  Send back
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
