"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "@forge/web-kit";
import { SignaturePad } from "@/components/signature-pad";
import { openOshaPdfForPrint } from "@/lib/osha-pdf-print";
import { filterReportRecipients } from "@/lib/sanitation-email-pdf";
import {
  HIPAA_INITIAL_LINES,
  HIPAA_STATEMENTS,
  WC_FORM_DESCRIPTIONS,
  WC_FORM_TITLES,
  downloadPdf,
  emailWcForm,
  emptyHipaaDraft,
  fetchBlankWcFormPdf,
  fetchSignedWcFormPdf,
  getWcFormRecipients,
  getWcForms,
  guidelinesDraftError,
  hipaaDraftError,
  parseOutsideEmails,
  signWcForm,
  todayLocalIso,
  voidWcForm,
  wcFormEmailSummary,
  type GuidelinesDraft,
  type HipaaDraft,
  type WcFormKey,
  type WcFormRecipient,
  type WcFormsOverview,
  type WcSignedForm,
} from "@/lib/wc-forms";

const MAX_STAFF = 25;
const VISIBLE_LIMIT = 150;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Modal({
  title,
  subtitle,
  onClose,
  busy,
  footer,
  children,
  size = "modal-lg",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  busy: boolean;
  footer: ReactNode;
  children: ReactNode;
  size?: string;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <>
      <div className="modal-backdrop fade show" aria-hidden="true" />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size}`}>
          <div className="modal-content">
            <div className="modal-header">
              <div className="min-w-0">
                <h5 className="modal-title mb-0" id={titleId}>
                  {title}
                </h5>
                {subtitle ? (
                  <p className="text-muted small mb-0 mt-1 text-truncate">{subtitle}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                disabled={busy}
                onClick={onClose}
              />
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">{footer}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function GuidelinesSignDialog({
  caseId,
  caseLabel,
  employeeName,
  onClose,
  onSigned,
}: {
  caseId: string;
  caseLabel: string;
  employeeName: string;
  onClose: () => void;
  onSigned: (form: WcSignedForm) => void;
}) {
  const [draft, setDraft] = useState<GuidelinesDraft>({
    employeeName,
    signedDate: todayLocalIso(),
    signatureDataUrl: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newKey);
  const [preview, setPreview] = useState<string | null>(null);

  async function submit() {
    const problem = guidelinesDraftError(draft);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      onSigned(await signWcForm(caseId, "INJURY_GUIDELINES_ACK", draft, idempotencyKey));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function openSheet() {
    try {
      const { bytes } = await fetchBlankWcFormPdf("INJURY_GUIDELINES_ACK");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
      );
      setPreview(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  return (
    <Modal
      title="Employee Injury Guidelines"
      subtitle={caseLabel}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Sign acknowledgment"}
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}
      <p className="small text-muted">
        Give the employee their copy of the guidelines, then have them sign below to acknowledge
        they received it.
      </p>
      {preview ? (
        <iframe
          title="Employee Injury Guidelines"
          src={preview}
          className="w-100 border rounded mb-3"
          style={{ height: 420 }}
        />
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-outline-primary mb-3"
          onClick={() => void openSheet()}
        >
          Show the guidelines
        </button>
      )}
      <div className="mb-3">
        <label className="form-label" htmlFor="wc-guidelines-name">
          Employee name
        </label>
        <input
          id="wc-guidelines-name"
          className="form-control"
          maxLength={200}
          value={draft.employeeName}
          onChange={(ev) => setDraft({ ...draft, employeeName: ev.target.value })}
          disabled={busy}
        />
      </div>
      <p className="small mb-2">
        I received a copy of the Employee Injury Guidelines and will follow them.
      </p>
      <SignaturePad
        label="Employee signature"
        value={draft.signatureDataUrl}
        onChange={(signatureDataUrl) => setDraft((d) => ({ ...d, signatureDataUrl }))}
        signatureDate={draft.signedDate}
        onSignatureDateChange={(signedDate) => setDraft((d) => ({ ...d, signedDate }))}
        disabled={busy}
      />
    </Modal>
  );
}

function HipaaSignDialog({
  caseId,
  caseLabel,
  prefill,
  onClose,
  onSigned,
}: {
  caseId: string;
  caseLabel: string;
  prefill: WcFormsOverview["prefill"];
  onClose: () => void;
  onSigned: (form: WcSignedForm) => void;
}) {
  const [draft, setDraft] = useState<HipaaDraft>(() => emptyHipaaDraft(prefill));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newKey);
  const set = (patch: Partial<HipaaDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function submit() {
    const problem = hipaaDraftError(draft);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      onSigned(await signWcForm(caseId, "HIPAA_AUTHORIZATION", draft, idempotencyKey));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="HIPAA Authorization Form"
      subtitle={`${caseLabel} · to disclose protected health information`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Sign authorization"}
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}
      <div className="row g-3">
        <div className="col-md-8">
          <label className="form-label" htmlFor="wc-hipaa-name">
            Name
          </label>
          <input
            id="wc-hipaa-name"
            className="form-control"
            maxLength={200}
            value={draft.patientName}
            onChange={(ev) => set({ patientName: ev.target.value })}
            disabled={busy}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="wc-hipaa-dob">
            Date of birth
          </label>
          <input
            id="wc-hipaa-dob"
            type="date"
            className="form-control"
            max={todayLocalIso()}
            value={draft.dateOfBirth}
            onChange={(ev) => set({ dateOfBirth: ev.target.value })}
            disabled={busy}
          />
        </div>
        <div className="col-12">
          <label className="form-label" htmlFor="wc-hipaa-provider">
            I authorize (provider)
          </label>
          <input
            id="wc-hipaa-provider"
            className="form-control"
            maxLength={200}
            placeholder="Clinic, hospital or physician"
            value={draft.providerName}
            onChange={(ev) => set({ providerName: ev.target.value })}
            disabled={busy}
          />
          <div className="form-text">
            …to disclose the protected health information described below to Producers Rice Mill,
            Inc.
          </div>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="form-label fs-6 mb-1">Initial each line you authorize</legend>
        {HIPAA_INITIAL_LINES.map((line) => {
          const inputId = `wc-hipaa-initial-${line.key}`;
          return (
            <div key={line.key} className="d-flex gap-2 align-items-start mb-2">
              <input
                id={inputId}
                className="form-control form-control-sm text-uppercase flex-shrink-0"
                style={{ width: 72 }}
                maxLength={6}
                placeholder="Initials"
                aria-describedby={`${inputId}-text`}
                value={draft.initials[line.key]}
                onChange={(ev) =>
                  set({
                    initials: { ...draft.initials, [line.key]: ev.target.value.toUpperCase() },
                  })
                }
                disabled={busy}
              />
              <label htmlFor={inputId} id={`${inputId}-text`} className="small mb-0">
                {line.text}
              </label>
            </div>
          );
        })}
      </fieldset>

      <div className="bg-lighter rounded p-2 small mt-2">
        {HIPAA_STATEMENTS.map((statement) => (
          <p key={statement.slice(0, 24)} className="mb-2">
            {statement}
          </p>
        ))}
      </div>

      <div className="row g-3 mt-1">
        <div className="col-md-8">
          <label className="form-label" htmlFor="wc-hipaa-signer">
            Printed name of patient or personal representative
          </label>
          <input
            id="wc-hipaa-signer"
            className="form-control"
            maxLength={200}
            value={draft.signerName}
            onChange={(ev) => set({ signerName: ev.target.value })}
            disabled={busy}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="wc-hipaa-relationship">
            Relationship to patient
          </label>
          <input
            id="wc-hipaa-relationship"
            className="form-control"
            maxLength={120}
            value={draft.signerRelationship}
            onChange={(ev) => set({ signerRelationship: ev.target.value })}
            disabled={busy}
          />
        </div>
      </div>
      <div className="mt-3">
        <SignaturePad
          label="Signature of patient or personal representative"
          value={draft.signatureDataUrl}
          onChange={(signatureDataUrl) => setDraft((d) => ({ ...d, signatureDataUrl }))}
          signatureDate={draft.signedDate}
          onSignatureDateChange={(signedDate) => setDraft((d) => ({ ...d, signedDate }))}
          disabled={busy}
        />
      </div>
    </Modal>
  );
}

function EmailDialog({
  form,
  onClose,
  onSent,
}: {
  form: WcSignedForm;
  onClose: () => void;
  onSent: () => void;
}) {
  const [recipients, setRecipients] = useState<WcFormRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [outside, setOutside] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof wcFormEmailSummary> | null>(null);
  const medical = form.formKey === "HIPAA_AUTHORIZATION";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getWcFormRecipients();
        if (!cancelled) setRecipients(Array.isArray(data) ? data : []);
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

  const byId = useMemo(() => new Map(recipients.map((r) => [r.id, r])), [recipients]);
  const filtered = useMemo(() => filterReportRecipients(recipients, query), [recipients, query]);
  const parsedOutside = useMemo(() => parseOutsideEmails(outside), [outside]);
  const total = selected.length + parsedOutside.emails.length;

  function toggle(id: string) {
    setSummary(null);
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_STAFF
          ? prev
          : [...prev, id],
    );
  }

  async function send() {
    if (parsedOutside.invalid.length)
      return setError(
        `Check these email addresses: ${parsedOutside.invalid.slice(0, 3).join(", ")}`,
      );
    if (!total) return setError("Choose at least one person or enter an outside email address.");
    if (parsedOutside.emails.length > 10)
      return setError("Enter no more than 10 outside addresses.");
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const result = await emailWcForm(form.id, {
        personnelIds: selected,
        emails: parsedOutside.emails,
        message: message.trim(),
      });
      const next = wcFormEmailSummary(result);
      setSummary(next);
      if (result.sent > 0) {
        setSelected([]);
        setOutside("");
        setMessage("");
        onSent();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Email ${form.title} as PDF`}
      subtitle={`Signed by ${form.signerName} · ${formatDateTime(form.signedAt)}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {summary && summary.tone !== "danger" ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || total === 0}
            onClick={() => void send()}
          >
            {busy ? "Sending…" : `Send PDF${total ? ` to ${total}` : ""}`}
          </button>
        </>
      }
    >
      {medical ? (
        <div className="alert alert-warning py-2 small" role="note">
          This form contains protected health information. Send it only to people authorized to
          receive it.
        </div>
      ) : null}
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}
      {summary ? (
        <div className={`alert alert-${summary.tone} py-2`} role="status">
          {summary.text}
        </div>
      ) : null}

      <label className="form-label" htmlFor="wc-form-email-search">
        Producers staff
      </label>
      {selected.length ? (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {selected.map((id) => (
            <span
              key={id}
              className="badge bg-label-primary d-inline-flex align-items-center gap-1"
            >
              {byId.get(id)?.name ?? id}
              <button
                type="button"
                className="btn-close btn-close-sm"
                style={{ fontSize: "0.5rem" }}
                aria-label={`Remove ${byId.get(id)?.name ?? "recipient"}`}
                onClick={() => toggle(id)}
              />
            </span>
          ))}
        </div>
      ) : null}
      <input
        id="wc-form-email-search"
        className="form-control"
        placeholder="Search people by name, email, title, or department"
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        disabled={loading}
      />
      <div className="border rounded mt-2" style={{ maxHeight: 220, overflowY: "auto" }}>
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
              const inputId = `wc-form-email-${person.id}`;
              return (
                <li key={person.id} className="list-group-item py-2">
                  <div className="form-check mb-0">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="form-check-input"
                      checked={checked}
                      disabled={!checked && selected.length >= MAX_STAFF}
                      onChange={() => toggle(person.id)}
                    />
                    <label className="form-check-label w-100" htmlFor={inputId}>
                      <span className="fw-medium">{person.name}</span>{" "}
                      <span className="text-muted small">{person.email}</span>
                      {person.jobTitle || person.departmentName ? (
                        <span className="d-block text-muted small">
                          {[person.jobTitle, person.departmentName].filter(Boolean).join(" · ")}
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

      <label className="form-label mt-3" htmlFor="wc-form-email-outside">
        Outside email addresses
      </label>
      <textarea
        id="wc-form-email-outside"
        className={`form-control ${parsedOutside.invalid.length ? "is-invalid" : ""}`}
        rows={2}
        placeholder="clinic@example.com, carrier@example.com"
        value={outside}
        onChange={(ev) => {
          setSummary(null);
          setOutside(ev.target.value);
        }}
        disabled={busy}
      />
      <div className="form-text">
        For a clinic, physician&apos;s office or insurance carrier. Separate addresses with commas.
        Up to 10.
      </div>
      {parsedOutside.invalid.length ? (
        <div className="invalid-feedback d-block">
          Not a valid address: {parsedOutside.invalid.join(", ")}
        </div>
      ) : null}

      <label className="form-label mt-3" htmlFor="wc-form-email-message">
        Message (optional)
      </label>
      <textarea
        id="wc-form-email-message"
        className="form-control"
        rows={3}
        maxLength={2000}
        value={message}
        onChange={(ev) => setMessage(ev.target.value)}
        placeholder="Add a note to include in the email"
      />
    </Modal>
  );
}

function VoidDialog({
  form,
  onClose,
  onVoided,
}: {
  form: WcSignedForm;
  onClose: () => void;
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) return setError("Enter a reason for voiding this form.");
    setBusy(true);
    setError(null);
    try {
      await voidWcForm(form.id, reason.trim());
      onVoided();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Void ${form.title}`}
      subtitle={`Signed by ${form.signerName} · ${formatDateTime(form.signedAt)}`}
      onClose={onClose}
      busy={busy}
      size=""
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Voiding…" : "Void form"}
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}
      <p className="small">
        Signed forms can&apos;t be edited. Voiding keeps this copy on file, marked as voided, so you
        can have a new one signed.
      </p>
      <label className="form-label" htmlFor="wc-form-void-reason">
        Reason
      </label>
      <textarea
        id="wc-form-void-reason"
        className="form-control"
        rows={3}
        maxLength={1000}
        value={reason}
        onChange={(ev) => setReason(ev.target.value)}
        disabled={busy}
      />
    </Modal>
  );
}

type Dialog =
  | { kind: "sign"; formKey: WcFormKey }
  | { kind: "email"; form: WcSignedForm }
  | { kind: "void"; form: WcSignedForm }
  | null;

/** "Forms" tab on a workers' comp case: the Producers injury guidelines and HIPAA authorization. */
export function WorkersCompFormsPanel({
  caseId,
  caseLabel,
}: {
  caseId: string;
  caseLabel: string;
}) {
  const [overview, setOverview] = useState<WcFormsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getWcForms(caseId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withPdf(
    id: string,
    run: () => Promise<{ bytes: Uint8Array; filename: string }>,
    mode: "print" | "download",
  ) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const { bytes, filename } = await run();
      if (mode === "download") downloadPdf(bytes, filename);
      else {
        const message = openOshaPdfForPrint(bytes, filename, "wc-form");
        if (message) setNotice(message);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !overview)
    return <div className="card card-body text-muted small">Loading forms…</div>;
  if (!overview) {
    return (
      <div className="alert alert-danger" role="alert">
        {error ?? "Could not load forms."}
      </div>
    );
  }
  if (!overview.available) {
    return (
      <div className="card card-body text-muted small">
        Injury forms are not set up for this company.
      </div>
    );
  }

  const access = {
    INJURY_GUIDELINES_ACK: overview.permissions.guidelines,
    HIPAA_AUTHORIZATION: overview.permissions.hipaa,
  };
  const formKeys = (Object.keys(access) as WcFormKey[]).filter((key) => access[key].read);

  return (
    <div className="d-flex flex-column gap-3">
      {error ? (
        <div className="alert alert-danger py-2 mb-0" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-info py-2 mb-0" role="status">
          {notice}
        </div>
      ) : null}
      {overview.caseArchived ? (
        <div className="alert alert-secondary py-2 mb-0">
          This case is archived. Signed forms can still be printed and emailed.
        </div>
      ) : null}

      <div className="row g-3">
        {formKeys.map((key) => (
          <div key={key} className="col-md-6">
            <div className="card h-100">
              <div className="card-body d-flex flex-column">
                <h6 className="mb-1">{WC_FORM_TITLES[key]}</h6>
                <p className="small text-muted flex-grow-1">{WC_FORM_DESCRIPTIONS[key]}</p>
                <div className="d-flex flex-wrap gap-2">
                  {access[key].act && !overview.caseArchived ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => setDialog({ kind: "sign", formKey: key })}
                    >
                      Fill out &amp; sign
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busyId === `blank-${key}`}
                    onClick={() =>
                      void withPdf(`blank-${key}`, () => fetchBlankWcFormPdf(key), "print")
                    }
                  >
                    Print blank form
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header d-flex align-items-center justify-content-between">
          <h6 className="mb-0">Signed forms</h6>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {overview.forms.length === 0 ? (
          <div className="card-body text-muted small">
            No forms have been signed on this case yet.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Signed by</th>
                  <th scope="col">Signed</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-end">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.forms.map((form) => {
                  const canAct = access[form.formKey]?.act === true;
                  const voided = form.status === "VOIDED";
                  return (
                    <tr key={form.id} className={voided ? "text-muted" : undefined}>
                      <td>{form.title}</td>
                      <td>
                        {form.signerName}
                        {form.signerRelationship && form.signerRelationship !== "Self" ? (
                          <span className="d-block small text-muted">
                            {form.signerRelationship}
                          </span>
                        ) : null}
                      </td>
                      <td className="small">{formatDateTime(form.signedAt)}</td>
                      <td className="small">
                        {voided ? (
                          <>
                            <span className="badge bg-label-secondary">Voided</span>
                            {form.voidReason ? (
                              <span className="d-block text-muted">{form.voidReason}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="badge bg-label-success">Signed</span>
                        )}
                        {form.emailCount ? (
                          <span className="d-block text-muted">
                            Emailed {form.emailCount} time{form.emailCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-end">
                        <div className="d-inline-flex flex-wrap justify-content-end gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            disabled={busyId === form.id}
                            onClick={() =>
                              void withPdf(form.id, () => fetchSignedWcFormPdf(form.id), "print")
                            }
                          >
                            Print
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busyId === form.id}
                            onClick={() =>
                              void withPdf(form.id, () => fetchSignedWcFormPdf(form.id), "download")
                            }
                          >
                            Download
                          </button>
                          {canAct && !voided ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => setDialog({ kind: "email", form })}
                              >
                                Email
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => setDialog({ kind: "void", form })}
                              >
                                Void
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === "sign" && dialog.formKey === "INJURY_GUIDELINES_ACK" ? (
        <GuidelinesSignDialog
          caseId={caseId}
          caseLabel={caseLabel}
          employeeName={overview.prefill.employeeName}
          onClose={() => setDialog(null)}
          onSigned={() => {
            setDialog(null);
            setNotice("Employee Injury Guidelines acknowledgment signed.");
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "sign" && dialog.formKey === "HIPAA_AUTHORIZATION" ? (
        <HipaaSignDialog
          caseId={caseId}
          caseLabel={caseLabel}
          prefill={overview.prefill}
          onClose={() => setDialog(null)}
          onSigned={() => {
            setDialog(null);
            setNotice("HIPAA Authorization signed.");
            void load();
          }}
        />
      ) : null}
      {dialog?.kind === "email" ? (
        <EmailDialog
          form={dialog.form}
          onClose={() => setDialog(null)}
          onSent={() => void load()}
        />
      ) : null}
      {dialog?.kind === "void" ? (
        <VoidDialog
          form={dialog.form}
          onClose={() => setDialog(null)}
          onVoided={() => {
            setDialog(null);
            setNotice(`${dialog.form.title} voided.`);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
