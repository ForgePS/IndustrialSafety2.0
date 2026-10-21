"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { HELPDESK_PRIORITIES, HELPDESK_PRIORITY_META } from "@forge/contracts";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  AttachmentPicker,
  TicketPriorityBadge,
  TicketStatusBadge,
  TicketTimeline,
} from "@/components/helpdesk/helpdesk-ui";
import {
  HELPDESK_API,
  captureTechnicalContext,
  formatDateTime,
  openTicketAttachment,
  optionLabel,
  uploadTicketAttachment,
  type CustomerTicketDetail,
  type HelpdeskConfig,
  type HelpdeskTicket,
} from "@/lib/helpdesk";

const HELP_DESK_PATH = "/help-desk/";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback;
}

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Uploads staged files to a ticket; returns the names that failed. */
async function uploadAll(base: string, files: File[], internal = false): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadTicketAttachment(base, file, internal);
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

export function HelpCenterWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketId = searchParams.get("ticket");
  const isNew = searchParams.get("new") === "1";
  const prefillSubject = searchParams.get("subject") ?? "";
  const prefillType = searchParams.get("type") ?? "";

  const [config, setConfig] = useState<HelpdeskConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [flash, setFlash] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<HelpdeskConfig>(`${HELPDESK_API}/config`)
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((err) => {
        if (!cancelled) setConfigError(errorText(err, "Could not load the Help Desk"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const go = useCallback(
    (params: Record<string, string> | null) => {
      const qs = params ? new URLSearchParams(params).toString() : "";
      router.push(qs ? `${HELP_DESK_PATH}?${qs}` : HELP_DESK_PATH);
    },
    [router],
  );

  if (configError) {
    return (
      <div>
        <div className="alert alert-danger mb-0">{configError}</div>
      </div>
    );
  }
  if (!config) {
    return (
      <div>
        <p className="text-muted mb-0">Loading Help Desk…</p>
      </div>
    );
  }

  return (
    <div>
      {flash ? (
        <div className={`alert alert-${flash.tone} alert-dismissible`} role="status">
          {flash.text}
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setFlash(null)} />
        </div>
      ) : null}
      {ticketId ? (
        <CustomerTicketView
          key={ticketId}
          ticketId={ticketId}
          config={config}
          onBack={() => {
            setFlash(null);
            go(null);
          }}
        />
      ) : isNew && config.capabilities.canCreate ? (
        <SubmitTicketForm
          config={config}
          initialSubject={prefillSubject}
          initialType={prefillType}
          onCancel={() => go(null)}
          onCreated={(ticket, failedUploads) => {
            setFlash(
              failedUploads.length
                ? {
                    tone: "warning",
                    text: `Ticket ${ticket.ticketNumber} was submitted, but ${failedUploads.join(", ")} did not upload. Add them again from the reply box below.`,
                  }
                : {
                    tone: "success",
                    text: `Ticket ${ticket.ticketNumber} was submitted. You will be notified here when Forge Support responds.`,
                  },
            );
            go({ ticket: ticket.id });
          }}
        />
      ) : (
        <HelpCenterHome
          config={config}
          onOpen={(id) => {
            setFlash(null);
            go({ ticket: id });
          }}
          onStart={(subject, type) => {
            setFlash(null);
            go({ new: "1", ...(subject ? { subject } : {}), ...(type ? { type } : {}) });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- landing + my tickets

type StatusTab = "open" | "closed" | "all";

const QUICK_STARTS = [
  { type: "TECHNICAL_ISSUE", icon: "bx-error-circle", title: "Something isn't working", body: "Errors, broken pages, or features not behaving as expected." },
  { type: "HOW_DO_I", icon: "bx-help-circle", title: "How do I...?", body: "Questions about using Forge Industrial Safety." },
  { type: "ACCOUNT_LOGIN", icon: "bx-key", title: "Login or access", body: "Sign-in trouble, permissions, or user accounts." },
  { type: "FEATURE_REQUEST", icon: "bx-bulb", title: "Suggest an improvement", body: "Ideas and feature requests for the Forge team." },
] as const;

function HelpCenterHome({
  config,
  onOpen,
  onStart,
}: {
  config: HelpdeskConfig;
  onOpen: (id: string) => void;
  onStart: (subject?: string, type?: string) => void;
}) {
  const caps = config.capabilities;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<StatusTab>("open");
  const [scope, setScope] = useState<"mine" | "company">("mine");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HelpdeskTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageSize = 20;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) });
      if (tab !== "all") params.set("status", tab);
      if (q) params.set("q", q);
      const res = await apiGet<{ items: HelpdeskTicket[]; total: number }>(`${HELPDESK_API}/tickets?${params}`);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(errorText(err, "Could not load tickets"));
    } finally {
      setLoading(false);
    }
  }, [page, q, scope, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <ModuleWorkspaceHeader
        id="help-desk-title"
        eyebrow="Forge Support"
        title="Help Desk"
        description="Get help from the Forge Industrial Safety support team and track your requests."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="card mb-4">
        <div className="card-body">
          <h5 className="mb-1">Need help?</h5>
          <p className="text-muted mb-3">Search your existing tickets, or tell us what is going on.</p>
          <form
            className="d-flex flex-column flex-md-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(search.trim());
              setPage(1);
            }}
          >
            <div className="input-group">
              <span className="input-group-text">
                <i className="bx bx-search" />
              </span>
              <input
                type="search"
                className="form-control"
                placeholder="How can we help?"
                aria-label="How can we help?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {caps.canCreate ? (
              <button type="button" className="btn btn-primary text-nowrap" onClick={() => onStart(search.trim())}>
                <i className="bx bx-plus me-1" />
                Submit a ticket
              </button>
            ) : null}
          </form>
          {q && caps.canCreate ? (
            <p className="small mb-0 mt-2">
              Don&apos;t see what you need?{" "}
              <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => onStart(q)}>
                Start a ticket about &ldquo;{q}&rdquo;
              </button>
            </p>
          ) : null}
        </div>
      </div>

      {caps.canCreate ? (
        <div className="row g-3 mb-4">
          {QUICK_STARTS.map((s) => (
            <div className="col-6 col-lg-3" key={s.type}>
              <button
                type="button"
                className="card h-100 w-100 text-start border-0 shadow-sm"
                onClick={() => onStart("", s.type)}
              >
                <div className="card-body">
                  <i className={`bx ${s.icon} fs-3 text-primary mb-2`} />
                  <div className="fw-semibold">{s.title}</div>
                  <div className="small text-muted d-none d-md-block">{s.body}</div>
                </div>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <h5 className="mb-0">{scope === "company" ? "Company tickets" : "My tickets"}</h5>
          {caps.canViewTenant ? (
            <div className="btn-group btn-group-sm" role="group" aria-label="Ticket scope">
              <button
                type="button"
                className={`btn ${scope === "mine" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => {
                  setScope("mine");
                  setPage(1);
                }}
              >
                Mine
              </button>
              <button
                type="button"
                className={`btn ${scope === "company" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => {
                  setScope("company");
                  setPage(1);
                }}
              >
                Company
              </button>
            </div>
          ) : null}
        </div>
        <div className="card-body pb-0">
          <ModuleWorkspaceTabs<StatusTab>
            tabs={[
              { id: "open", label: "Open" },
              { id: "closed", label: "Resolved / closed" },
              { id: "all", label: "All" },
            ]}
            active={tab}
            onChange={(t) => {
              setTab(t);
              setPage(1);
            }}
            ariaLabel="Ticket status"
          />
          {error ? <div className="alert alert-danger">{error}</div> : null}
        </div>
        {!loading && !items.length && !error ? (
          <div className="card-body pt-0 text-muted">
            {q ? `No tickets match "${q}".` : tab === "open" ? "You have no open tickets." : "No tickets yet."}
          </div>
        ) : null}
        <div className="list-group list-group-flush">
          {items.map((t) => (
            <button
              type="button"
              key={t.id}
              className="list-group-item list-group-item-action py-3"
              onClick={() => onOpen(t.id)}
            >
              <div className="d-flex flex-wrap justify-content-between gap-2">
                <span className="fw-semibold text-break">{t.subject}</span>
                <TicketStatusBadge status={t.status} />
              </div>
              <div className="small text-muted d-flex flex-wrap gap-3 mt-1">
                <span>{t.ticketNumber}</span>
                <span>{optionLabel(config.requestTypes, t.requestType)}</span>
                {scope === "company" ? <span>{t.requesterName}</span> : null}
                <span>Updated {formatDateTime(t.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
        {pages > 1 ? (
          <div className="card-footer d-flex justify-content-between align-items-center">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="small text-muted">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- submit a ticket

function SubmitTicketForm({
  config,
  initialSubject,
  initialType,
  onCancel,
  onCreated,
}: {
  config: HelpdeskConfig;
  initialSubject: string;
  initialType: string;
  onCancel: () => void;
  onCreated: (ticket: HelpdeskTicket, failedUploads: string[]) => void;
}) {
  const [clientRequestId] = useState(newClientRequestId);
  const [requestType, setRequestType] = useState(
    config.requestTypes.some((r) => r.code === initialType) ? initialType : "",
  );
  const [productArea, setProductArea] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [includeTech, setIncludeTech] = useState(true);
  const [showTech, setShowTech] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const techPreview = useMemo(() => captureTechnicalContext(HELP_DESK_PATH), []);

  const submit = async () => {
    if (!requestType) return setError("Choose what kind of help you need.");
    if (subject.trim().length < 3) return setError("Add a short subject (at least 3 characters).");
    if (description.trim().length < 10) return setError("Describe the issue in at least 10 characters.");
    setSubmitting(true);
    setError("");
    try {
      const res = await apiSend<{ ticket: HelpdeskTicket }>(`${HELPDESK_API}/tickets`, "POST", {
        productCode: "FORGE_INDUSTRIAL",
        requestType,
        productArea: productArea || null,
        subject: subject.trim(),
        description: description.trim(),
        customerReportedSeverity: severity || null,
        source: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "MOBILE" : "WEB",
        technicalContext: includeTech ? captureTechnicalContext(HELP_DESK_PATH) : null,
        clientRequestId,
      });
      const failed = files.length ? await uploadAll(`${HELPDESK_API}/tickets/${res.ticket.id}`, files) : [];
      onCreated(res.ticket, failed);
    } catch (err) {
      setError(errorText(err, "Could not submit the ticket. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModuleWorkspaceHeader
        id="help-desk-new-title"
        eyebrow="Help Desk"
        title="Submit a ticket"
        description="Tell us what is happening. The more detail you include, the faster we can help."
      />
      <div className="card">
        <form
          className="card-body"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="hd-type">
                What do you need help with? <span className="text-danger">*</span>
              </label>
              <select id="hd-type" className="form-select" value={requestType} onChange={(e) => setRequestType(e.target.value)} required>
                <option value="">Choose a request type</option>
                {config.requestTypes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="hd-area">
                Which part of the app?
              </label>
              <select id="hd-area" className="form-select" value={productArea} onChange={(e) => setProductArea(e.target.value)}>
                <option value="">Not sure / general</option>
                {config.productAreas.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="hd-subject">
                Subject <span className="text-danger">*</span>
              </label>
              <input
                id="hd-subject"
                className="form-control"
                maxLength={300}
                placeholder="Short summary, e.g. Inspection photos won't upload"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="col-12">
              <label className="form-label" htmlFor="hd-description">
                Description <span className="text-danger">*</span>
              </label>
              <textarea
                id="hd-description"
                className="form-control"
                rows={6}
                maxLength={20000}
                placeholder="What were you trying to do? What happened instead? Any error message?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="hd-severity">
                How much is this affecting your work?
              </label>
              <select id="hd-severity" className="form-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">Let Forge Support decide</option>
                {HELPDESK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {HELPDESK_PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
              {severity ? (
                <div className="form-text">{HELPDESK_PRIORITY_META[severity as keyof typeof HELPDESK_PRIORITY_META]?.description}</div>
              ) : null}
            </div>
            <div className="col-md-6">
              <span className="form-label d-block">Attachments</span>
              <AttachmentPicker files={files} onChange={setFiles} disabled={submitting} idPrefix="hd-new" />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input
                  id="hd-tech"
                  type="checkbox"
                  className="form-check-input"
                  checked={includeTech}
                  onChange={(e) => setIncludeTech(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="hd-tech">
                  Include technical details (browser, device, screen size, app version)
                </label>
                <button type="button" className="btn btn-link btn-sm p-0 ms-2 align-baseline" onClick={() => setShowTech((v) => !v)}>
                  {showTech ? "Hide" : "What's included?"}
                </button>
              </div>
              {showTech ? (
                <dl className="row small text-muted mt-2 mb-0">
                  {Object.entries(techPreview)
                    .filter(([k]) => k !== "userAgent")
                    .map(([k, v]) => (
                      <div className="col-sm-6 col-lg-4 d-flex gap-2" key={k}>
                        <dt className="fw-normal">{k}</dt>
                        <dd className="mb-0 text-break">{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              ) : null}
            </div>
          </div>
          {error ? <div className="alert alert-danger mt-3 mb-0">{error}</div> : null}
          <div className="d-flex flex-column-reverse flex-sm-row justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- ticket detail

function CustomerTicketView({ ticketId, config, onBack }: { ticketId: string; config: HelpdeskConfig; onBack: () => void }) {
  const [detail, setDetail] = useState<CustomerTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const base = `${HELPDESK_API}/tickets/${encodeURIComponent(ticketId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await apiGet<CustomerTicketDetail>(base));
    } catch (err) {
      setError(errorText(err, "Could not load this ticket"));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendReply = async () => {
    if (!reply.trim() && !files.length) return;
    setBusy(true);
    setActionError("");
    try {
      if (reply.trim()) await apiSend(`${base}/reply`, "POST", { body: reply.trim() });
      const failed = files.length ? await uploadAll(base, files) : [];
      setReply("");
      setFiles([]);
      if (failed.length) setActionError(`These files did not upload: ${failed.join(", ")}`);
      await load();
    } catch (err) {
      setActionError(errorText(err, "Could not send your reply"));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (action: "reopen" | "close") => {
    if (action === "close" && !window.confirm("Close this ticket? You can reopen it later if you need more help.")) return;
    setBusy(true);
    setActionError("");
    try {
      await apiSend(`${base}/${action}`, "POST", reply.trim() ? { reason: reply.trim() } : {});
      setReply("");
      await load();
    } catch (err) {
      setActionError(errorText(err, `Could not ${action} the ticket`));
    } finally {
      setBusy(false);
    }
  };

  const backButton = (
    <button type="button" className="btn btn-link px-0 mb-2" onClick={onBack}>
      <i className="bx bx-chevron-left" />
      All tickets
    </button>
  );

  if (loading && !detail) return <>{backButton}<p className="text-muted mb-0">Loading ticket…</p></>;
  if (error || !detail) {
    return (
      <>
        {backButton}
        <div className="alert alert-danger mb-0">{error || "Ticket not found"}</div>
      </>
    );
  }

  const t = detail.ticket;
  const status = t.status;

  return (
    <>
      {backButton}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-muted small mb-1">{t.ticketNumber}</p>
          <h4 className="mb-1 text-break">{t.subject}</h4>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <TicketStatusBadge status={status} />
            <TicketPriorityBadge priority={t.priority} />
            <span className="small text-muted">{t.isAssigned ? "Assigned to Forge Support" : "Awaiting assignment"}</span>
          </div>
        </div>
        <div className="d-flex gap-2">
          {detail.canReopen ? (
            <button type="button" className="btn btn-outline-warning" disabled={busy} onClick={() => void setStatus("reopen")}>
              <i className="bx bx-revision me-1" />
              Reopen
            </button>
          ) : null}
          {detail.canClose ? (
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => void setStatus("close")}>
              <i className="bx bx-check-circle me-1" />
              Close ticket
            </button>
          ) : null}
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8 order-2 order-lg-1">
          <div className="card mb-4">
            <div className="card-body">
              <TicketTimeline
                description={t.description}
                requesterName={t.requesterName}
                createdAt={t.createdAt}
                messages={detail.messages}
                attachments={detail.attachments}
                events={detail.events}
                onOpenAttachment={(a) => {
                  openTicketAttachment(base, a.id).catch((err) => setActionError(errorText(err, "Could not open the file")));
                }}
              />
            </div>
          </div>

          {detail.canReply ? (
            <div className="card">
              <div className="card-body">
                <label className="form-label" htmlFor="hd-reply">
                  Reply to Forge Support
                </label>
                {status === "RESOLVED" ? (
                  <p className="small text-warning mb-2">This ticket is resolved. Sending a reply will reopen it.</p>
                ) : null}
                {status === "WAITING_ON_CUSTOMER" ? (
                  <p className="small text-info mb-2">Forge Support is waiting on your response.</p>
                ) : null}
                <textarea
                  id="hd-reply"
                  className="form-control mb-2"
                  rows={4}
                  maxLength={20000}
                  placeholder="Add more detail or answer a question from support"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={busy}
                />
                <AttachmentPicker files={files} onChange={setFiles} disabled={busy} idPrefix="hd-reply" />
                {actionError ? <div className="alert alert-danger mt-2 mb-0">{actionError}</div> : null}
                <div className="d-flex justify-content-end mt-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || (!reply.trim() && !files.length)}
                    onClick={() => void sendReply()}
                  >
                    {busy ? "Sending…" : files.length && !reply.trim() ? "Upload files" : "Send reply"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <p className="mb-0 text-muted">
                  {status === "CLOSED"
                    ? detail.canReopen
                      ? "This ticket is closed. Reopen it to continue the conversation."
                      : "This ticket is closed."
                    : "You can view this ticket but not reply to it."}
                </p>
                {actionError ? <div className="alert alert-danger mt-2 mb-0">{actionError}</div> : null}
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-4 order-1 order-lg-2">
          <div className="card">
            <div className="card-body">
              <h6 className="mb-3">Details</h6>
              <dl className="mb-0 small">
                <dt className="text-muted fw-normal">Request type</dt>
                <dd>{optionLabel(config.requestTypes, t.requestType)}</dd>
                {t.productArea ? (
                  <>
                    <dt className="text-muted fw-normal">Area</dt>
                    <dd>{optionLabel(config.productAreas, t.productArea)}</dd>
                  </>
                ) : null}
                <dt className="text-muted fw-normal">Submitted by</dt>
                <dd>{t.requesterName}</dd>
                <dt className="text-muted fw-normal">Submitted</dt>
                <dd>{formatDateTime(t.createdAt)}</dd>
                <dt className="text-muted fw-normal">Last updated</dt>
                <dd>{formatDateTime(t.updatedAt)}</dd>
                {t.firstResponseAt ? (
                  <>
                    <dt className="text-muted fw-normal">First response</dt>
                    <dd>{formatDateTime(t.firstResponseAt)}</dd>
                  </>
                ) : null}
                {t.resolvedAt ? (
                  <>
                    <dt className="text-muted fw-normal">Resolved</dt>
                    <dd>{formatDateTime(t.resolvedAt)}</dd>
                  </>
                ) : null}
                {t.closedAt ? (
                  <>
                    <dt className="text-muted fw-normal">Closed</dt>
                    <dd className="mb-0">{formatDateTime(t.closedAt)}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
