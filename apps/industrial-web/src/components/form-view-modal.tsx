"use client";

import type { ReactNode } from "react";

type FormViewModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

export function FormViewModal({ title, subtitle, onClose, footer, children }: FormViewModalProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-view-modal-title"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") onClose();
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
        role="document"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div className="min-w-0">
              <h5 className="modal-title mb-0" id="form-view-modal-title">
                {title}
              </h5>
              {subtitle ? <p className="text-muted small mb-0 mt-1">{subtitle}</p> : null}
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">Preview — fields are read-only.</p>
            <div className="row g-3">{children}</div>
          </div>
          {footer ? <div className="modal-footer flex-wrap gap-2">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
