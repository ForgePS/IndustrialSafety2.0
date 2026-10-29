"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  SANITATION_EMAIL_PDF_MAX_RECIPIENTS,
  emailPdfResultSummary,
  filterReportRecipients,
  parseReportRecipients,
  type EmailPdfResult,
  type ReportRecipient,
} from "@/lib/sanitation-email-pdf";

const API = "/api/v1/industrial/sanitation";
const VISIBLE_LIMIT = 150;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export function SanitationEmailPdfDialog({
  inspectionId,
  inspectionLabel,
  onClose,
}: {
  inspectionId: string;
  inspectionLabel: string;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailPdfResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<unknown>(`${API}/report-recipients`);
        if (!cancelled) setRecipients(parseReportRecipients(data));
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const byId = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [recipients]);
  const filtered = useMemo(() => filterReportRecipients(recipients, query), [recipients, query]);
  const atLimit = selected.length >= SANITATION_EMAIL_PDF_MAX_RECIPIENTS;

  function toggle(id: string) {
    setResult(null);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= SANITATION_EMAIL_PDF_MAX_RECIPIENTS
          ? prev
          : [...prev, id],
    );
  }

  async function send() {
    if (!selected.length || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const data = await apiSend<EmailPdfResult>(
        `${API}/inspections/${encodeURIComponent(inspectionId)}/email-pdf`,
        "POST",
        { personnelIds: selected, message: message.trim(), timeZone },
      );
      setResult(data);
      if (data.sent > 0) {
        setSelected([]);
        setMessage("");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const summary = result ? emailPdfResultSummary(result) : null;

  return (
    <>
      <div className="modal-backdrop fade show" aria-hidden="true" />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="san-email-pdf-title"
      >
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <div className="min-w-0">
                <h5 className="modal-title mb-0" id="san-email-pdf-title">
                  Email report as PDF
                </h5>
                <p className="text-muted small mb-0 mt-1 text-truncate">{inspectionLabel}</p>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                disabled={sending}
                onClick={onClose}
              />
            </div>
            <div className="modal-body">
              {error ? (
                <div className="alert alert-danger py-2" role="alert">
                  {error}
                </div>
              ) : null}
              {summary ? (
                <div className={`alert alert-${summary.tone} py-2`} role="status">
                  {summary.message}
                </div>
              ) : null}

              <label className="form-label" htmlFor="san-email-pdf-search">
                Recipients
              </label>
              {selected.length ? (
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {selected.map((id) => {
                    const person = byId.get(id);
                    return (
                      <span
                        key={id}
                        className="badge bg-label-primary d-inline-flex align-items-center gap-1"
                      >
                        {person?.name ?? id}
                        <button
                          type="button"
                          className="btn-close btn-close-sm"
                          style={{ fontSize: "0.5rem" }}
                          aria-label={`Remove ${person?.name ?? "recipient"}`}
                          onClick={() => toggle(id)}
                        />
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <input
                id="san-email-pdf-search"
                className="form-control"
                placeholder="Search people by name, email, title, or department"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                disabled={loading}
              />
              <div className="form-text">
                Only people with an email address on their personnel record are listed. Up to{" "}
                {SANITATION_EMAIL_PDF_MAX_RECIPIENTS} recipients.
              </div>
              <div className="border rounded mt-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                {loading ? (
                  <div className="p-3 text-muted small">Loading people…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-3 text-muted small">
                    {recipients.length
                      ? "No one matches that search."
                      : "No personnel have an email address on file."}
                  </div>
                ) : (
                  <ul className="list-group list-group-flush">
                    {filtered.slice(0, VISIBLE_LIMIT).map((person) => {
                      const checked = selected.includes(person.id);
                      const inputId = `san-email-pdf-${person.id}`;
                      return (
                        <li key={person.id} className="list-group-item py-2">
                          <div className="form-check mb-0">
                            <input
                              id={inputId}
                              type="checkbox"
                              className="form-check-input"
                              checked={checked}
                              disabled={!checked && atLimit}
                              onChange={() => toggle(person.id)}
                            />
                            <label className="form-check-label w-100" htmlFor={inputId}>
                              <span className="fw-medium">{person.name}</span>{" "}
                              <span className="text-muted small">{person.email}</span>
                              {person.jobTitle || person.departmentName ? (
                                <span className="d-block text-muted small">
                                  {[person.jobTitle, person.departmentName]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              ) : null}
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {filtered.length > VISIBLE_LIMIT ? (
                <div className="form-text">
                  Showing the first {VISIBLE_LIMIT} of {filtered.length}. Search to narrow the list.
                </div>
              ) : null}

              <label className="form-label mt-3" htmlFor="san-email-pdf-message">
                Message (optional)
              </label>
              <textarea
                id="san-email-pdf-message"
                className="form-control"
                rows={3}
                maxLength={2000}
                value={message}
                onChange={(ev) => setMessage(ev.target.value)}
                placeholder="Add a note to include in the email"
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={sending}
                onClick={onClose}
              >
                {result?.sent ? "Done" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={sending || selected.length === 0}
                onClick={() => void send()}
              >
                {sending
                  ? "Sending…"
                  : `Send PDF${selected.length ? ` to ${selected.length}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
