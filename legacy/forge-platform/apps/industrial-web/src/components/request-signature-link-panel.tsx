"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { FORM_SUBMISSIONS_API } from "@/lib/forms-module";
import type { FormSignatoryKind } from "@/lib/form-signatory";

type SignatoryRecipient = {
  userId: string;
  email: string;
  roleName: string;
  label: string;
};

type RequestSignatureResult = {
  absoluteUrl?: string;
  href?: string;
  emailed?: boolean;
  notified?: boolean;
  recipientEmail?: string | null;
};

/**
 * Send a deep link so a supervisor (or Safety Director) can open and sign a
 * saved form submission when they are not present in person.
 */
export function RequestSignatureLinkPanel({
  submissionId,
  fieldId,
  fieldLabel,
  kind,
  enabled,
}: {
  submissionId: string | null;
  fieldId: string;
  fieldLabel: string;
  kind: FormSignatoryKind;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<SignatoryRecipient[]>([]);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const roleLabel = kind === "supervisor" ? "supervisor" : "Safety Director";

  const selectedEmail = useMemo(() => {
    if (email.trim()) return email.trim();
    const match = recipients.find((row) => row.userId === userId);
    return match?.email ?? "";
  }, [email, recipients, userId]);

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<{ items?: SignatoryRecipient[] }>(
          "/api/v1/industrial/form-signatories",
          { query: { kind } },
        );
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items : [];
        setRecipients(items);
        setUserId((prev) => prev || items[0]?.userId || "");
      } catch {
        if (!cancelled) setRecipients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, kind, open]);

  if (!enabled) return null;

  if (!submissionId) {
    return (
      <small className="text-muted d-block mt-1">
        Save this form first, then you can send a link for the {roleLabel} to sign remotely.
      </small>
    );
  }

  async function sendLink() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiSend<RequestSignatureResult>(
        `${FORM_SUBMISSIONS_API}/${encodeURIComponent(submissionId!)}/request-signature`,
        "POST",
        {
          signatoryKind: kind,
          fieldId,
          ...(userId ? { userId } : {}),
          ...(selectedEmail ? { email: selectedEmail } : {}),
          appBaseUrl: window.location.origin,
        },
      );
      const absolute =
        typeof result.absoluteUrl === "string" && result.absoluteUrl.trim()
          ? result.absoluteUrl.trim()
          : typeof result.href === "string"
            ? `${window.location.origin}${result.href}`
            : null;
      setLink(absolute);
      setMessage(
        result.emailed || result.notified
          ? `Sign link sent${result.recipientEmail ? ` to ${result.recipientEmail}` : ""}.`
          : "Sign link ready.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send sign link");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const absolute =
      link ||
      `${window.location.origin}/modules/forms/?tab=fill&submission=${encodeURIComponent(submissionId!)}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setLink(absolute);
      setMessage("Link copied. Paste it into a text or email for the supervisor.");
      setError(null);
    } catch {
      setLink(absolute);
      setError("Could not copy automatically — select and copy the link below.");
    }
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={() => setOpen(true)}
        >
          Send link to {roleLabel}
        </button>
      ) : (
        <div className="border rounded p-3 bg-label-secondary">
          <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
            <strong className="small mb-0">Send remote sign link · {fieldLabel}</strong>
            <button
              type="button"
              className="btn btn-sm btn-link py-0"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="row g-2 align-items-end">
            <div className="col-md-6">
              <label className="form-label small mb-1" htmlFor={`sign-link-user-${fieldId}`}>
                {kind === "supervisor" ? "Supervisor" : "Safety Director"}
              </label>
              <select
                id={`sign-link-user-${fieldId}`}
                className="form-select form-select-sm"
                value={userId}
                onChange={(ev) => setUserId(ev.target.value)}
              >
                <option value="">Select…</option>
                {recipients.map((row) => (
                  <option key={row.userId} value={row.userId}>
                    {row.label}
                    {row.roleName ? ` (${row.roleName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small mb-1" htmlFor={`sign-link-email-${fieldId}`}>
                Or email address
              </label>
              <input
                id={`sign-link-email-${fieldId}`}
                className="form-control form-control-sm"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || (!userId && !selectedEmail)}
              onClick={() => void sendLink()}
            >
              {busy ? "Sending…" : "Send sign link"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={busy}
              onClick={() => void copyLink()}
            >
              Copy link
            </button>
          </div>
          {link ? (
            <p className="small text-break mb-0 mt-2">
              <span className="text-muted">Link: </span>
              <a href={link}>{link}</a>
            </p>
          ) : null}
          {message ? (
            <p className="small text-success mb-0 mt-2" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="small text-danger mb-0 mt-2" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
