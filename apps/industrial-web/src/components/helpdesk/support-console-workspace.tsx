"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  HELPDESK_DISPOSITIONS,
  HELPDESK_PRIORITIES,
  HELPDESK_TICKET_STATUSES,
} from "@forge/contracts";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import {
  AttachmentPicker,
  TicketPriorityBadge,
  TicketStatusBadge,
  TicketTimeline,
} from "@/components/helpdesk/helpdesk-ui";
import {
  HELPDESK_API,
  dispositionLabel,
  formatAge,
  formatDateTime,
  openTicketAttachment,
  optionLabel,
  priorityLabel,
  statusLabel,
  uploadTicketAttachment,
  type HelpdeskConfig,
  type SupportAgent,
  type SupportSummary,
  type SupportTicket,
  type SupportTicketDetail,
} from "@/lib/helpdesk";

const SUPPORT_PATH = "/help-desk/support/";
const SUPPORT_API = `${HELPDESK_API}/support`;

type Tag = { id: string; slug: string; label: string; color: string | null };

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback;
}

const QUEUES = [
  { id: "open", label: "All open" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "waiting_customer", label: "Waiting on customer" },
  { id: "waiting_forge", label: "Waiting on Forge" },
  { id: "feature_requests", label: "Feature requests" },
  { id: "bugs", label: "Bugs" },
  { id: "known_issues", label: "Known issues" },
  { id: "closed", label: "Resolved / closed" },
  { id: "all", label: "Everything" },
] as const;
type QueueId = (typeof QUEUES)[number]["id"];

export function SupportConsoleWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketId = searchParams.get("ticket");
  const [config, setConfig] = useState<HelpdeskConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const loadLookups = useCallback(async () => {
    const [a, t] = await Promise.all([
      apiGet<{ agents: SupportAgent[] }>(`${SUPPORT_API}/agents`).catch(() => ({ agents: [] })),
      apiGet<{ tags: Tag[] }>(`${SUPPORT_API}/tags`).catch(() => ({ tags: [] })),
    ]);
    setAgents(a.agents ?? []);
    setTags(t.tags ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<HelpdeskConfig>(`${HELPDESK_API}/config`)
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        if (c.capabilities.isSupportAgent) void loadLookups();
      })
      .catch((err) => {
        if (!cancelled) setConfigError(errorText(err, "Could not load the support console"));
      });
    return () => {
      cancelled = true;
    };
  }, [loadLookups]);

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
        <p className="text-muted mb-0">Loading support console…</p>
      </div>
    );
  }
  if (!config.capabilities.isSupportAgent) {
    return (
      <div>
        <div className="alert alert-warning mb-0">
          The support console is only available to Forge Support staff.
        </div>
      </div>
    );
  }

  return (
    <div>
      {ticketId ? (
        <SupportTicketWorkspace
          key={ticketId}
          ticketId={ticketId}
          config={config}
          agents={agents}
          tags={tags}
          onTagsChanged={() => void loadLookups()}
          onBack={() => router.push(SUPPORT_PATH)}
        />
      ) : (
        <SupportDashboard
          config={config}
          agents={agents}
          tags={tags}
          onOpen={(id) => router.push(`${SUPPORT_PATH}?ticket=${encodeURIComponent(id)}`)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dashboard + queue

function SupportDashboard({
  config,
  agents,
  tags,
  onOpen,
}: {
  config: HelpdeskConfig;
  agents: SupportAgent[];
  tags: Tag[];
  onOpen: (id: string) => void;
}) {
  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [queue, setQueue] = useState<QueueId>("open");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [requestType, setRequestType] = useState("");
  const [productArea, setProductArea] = useState("");
  const [assignee, setAssignee] = useState("");
  const [tagId, setTagId] = useState("");
  const [sort, setSort] = useState("priority");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageSize = 50;

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
      const params = new URLSearchParams({
        queue,
        sort,
        page: String(page),
        pageSize: String(pageSize),
      });
      const filters: Record<string, string> = {
        q,
        priority,
        status,
        requestType,
        productArea,
        assigneeUserId: assignee,
        tagId,
      };
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      const [s, list] = await Promise.all([
        apiGet<SupportSummary>(`${SUPPORT_API}/summary`),
        apiGet<{ items: SupportTicket[]; total: number }>(`${SUPPORT_API}/tickets?${params}`),
      ]);
      setSummary(s);
      setItems(list.items ?? []);
      setTotal(list.total ?? 0);
    } catch (err) {
      setError(errorText(err, "Could not load tickets"));
    } finally {
      setLoading(false);
    }
  }, [assignee, page, priority, productArea, q, queue, requestType, sort, status, tagId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickQueue = (id: QueueId) => {
    setQueue(id);
    setPage(1);
  };

  const cards: Array<{ label: string; value: number | undefined; tone: string; queue?: QueueId }> =
    [
      { label: "Open", value: summary?.open, tone: "primary", queue: "open" },
      { label: "Critical", value: summary?.critical, tone: "danger", queue: "critical" },
      { label: "High", value: summary?.high, tone: "warning", queue: "high" },
      { label: "Unassigned", value: summary?.unassigned, tone: "info", queue: "unassigned" },
      { label: "Assigned to me", value: summary?.mine, tone: "primary", queue: "mine" },
      {
        label: "Waiting on customer",
        value: summary?.waitingOnCustomer,
        tone: "secondary",
        queue: "waiting_customer",
      },
      {
        label: "Waiting on Forge",
        value: summary?.waitingOnForge,
        tone: "dark",
        queue: "waiting_forge",
      },
      { label: "New today", value: summary?.newToday, tone: "info" },
      { label: "Resolved today", value: summary?.resolvedToday, tone: "success" },
    ];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(
    q || priority || status || requestType || productArea || assignee || tagId,
  );

  return (
    <>
      <ModuleWorkspaceHeader
        id="support-console-title"
        eyebrow="Forge Support"
        title="Support Console"
        description={
          summary?.crossTenant
            ? "Tickets from every Forge Industrial Safety customer."
            : "Support tickets for your organization."
        }
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="row g-3 mb-4">
        {cards.map((c) => (
          <div className="col-6 col-md-4 col-xl" key={c.label}>
            <button
              type="button"
              className={`card h-100 w-100 text-start shadow-sm ${c.queue && c.queue === queue ? `border border-${c.tone}` : "border-0"}`}
              onClick={() => c.queue && pickQueue(c.queue)}
              disabled={!c.queue}
              style={c.queue ? undefined : { cursor: "default", opacity: 1 }}
            >
              <div className="card-body py-3">
                <div className="small text-muted text-nowrap">{c.label}</div>
                <div className={`fs-4 fw-semibold text-${c.tone}`}>{c.value ?? "–"}</div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Support queues">
        {QUEUES.map((qd) => (
          <button
            type="button"
            key={qd.id}
            role="tab"
            aria-selected={queue === qd.id}
            className={`btn btn-sm rounded-pill ${queue === qd.id ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => pickQueue(qd.id)}
          >
            {qd.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-body border-bottom">
          <div className="row g-2">
            <div className="col-12 col-lg-4">
              <input
                type="search"
                className="form-control"
                placeholder="Search ticket #, subject, customer, requester, tag"
                aria-label="Search tickets"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-4 col-lg-2">
              <select
                className="form-select"
                aria-label="Priority"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any priority</option>
                {HELPDESK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-2">
              <select
                className="form-select"
                aria-label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any status</option>
                {HELPDESK_TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-2">
              <select
                className="form-select"
                aria-label="Request type"
                value={requestType}
                onChange={(e) => {
                  setRequestType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any request type</option>
                {config.requestTypes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-2">
              <select
                className="form-select"
                aria-label="Product area"
                value={productArea}
                onChange={(e) => {
                  setProductArea(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any area</option>
                {config.productAreas.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-3">
              <select
                className="form-select"
                aria-label="Assignee"
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any assignee</option>
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-3">
              <select
                className="form-select"
                aria-label="Tag"
                value={tagId}
                onChange={(e) => {
                  setTagId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-4 col-lg-3">
              <select
                className="form-select"
                aria-label="Sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="priority">Priority, then oldest</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Recently updated</option>
              </select>
            </div>
            {hasFilters ? (
              <div className="col-6 col-md-4 col-lg-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary w-100"
                  onClick={() => {
                    setSearch("");
                    setQ("");
                    setPriority("");
                    setStatus("");
                    setRequestType("");
                    setProductArea("");
                    setAssignee("");
                    setTagId("");
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {error ? <div className="alert alert-danger m-3">{error}</div> : null}
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Customer</th>
                <th>Subject</th>
                <th>Product / area</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Created</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen(t.id);
                  }}
                >
                  <td className="text-nowrap fw-semibold">{t.ticketNumber}</td>
                  <td className="text-nowrap">{t.tenantName ?? "Unknown"}</td>
                  <td style={{ minWidth: 220 }}>
                    <div className="text-break">{t.subject}</div>
                    <div className="small text-muted">{t.requesterName}</div>
                  </td>
                  <td className="small">
                    <div>{optionLabel(config.requestTypes, t.requestType)}</div>
                    {t.productArea ? (
                      <div className="text-muted">
                        {optionLabel(config.productAreas, t.productArea)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <TicketPriorityBadge priority={t.priority} />
                  </td>
                  <td>
                    <TicketStatusBadge status={t.status} />
                  </td>
                  <td className="text-nowrap small">
                    {t.assignedUserName ?? <span className="text-muted">Unassigned</span>}
                  </td>
                  <td className="text-nowrap small">{formatDateTime(t.createdAt)}</td>
                  <td className="text-nowrap small">{formatAge(t.createdAt)}</td>
                </tr>
              ))}
              {!loading && !items.length ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    No tickets in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span className="small text-muted">
            {total} ticket{total === 1 ? "" : "s"}
          </span>
          {pages > 1 ? (
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
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
      </div>
    </>
  );
}

// ---------------------------------------------------------------- ticket workspace

type ComposerMode = "reply" | "internal";

function SupportTicketWorkspace({
  ticketId,
  config,
  agents,
  tags,
  onTagsChanged,
  onBack,
}: {
  ticketId: string;
  config: HelpdeskConfig;
  agents: SupportAgent[];
  tags: Tag[];
  onTagsChanged: () => void;
  onBack: () => void;
}) {
  const { me } = useAuth();
  const caps = config.capabilities;
  const base = `${SUPPORT_API}/tickets/${encodeURIComponent(ticketId)}`;
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<ComposerMode>(caps.canRespond ? "reply" : "internal");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [nextStatus, setNextStatus] = useState("");

  const [statusTarget, setStatusTarget] = useState("");
  const [disposition, setDisposition] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [watcherToAdd, setWatcherToAdd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await apiGet<SupportTicketDetail>(base);
      setDetail(d);
      setDisposition(d.ticket.disposition ?? "");
      setStatusTarget("");
    } catch (err) {
      setError(errorText(err, "Could not load this ticket"));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setActionError("");
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setActionError(
          "Someone else updated this ticket. It has been reloaded; please review and try again.",
        );
        await load();
      } else {
        setActionError(errorText(err, fallback));
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: ComposerMode) => {
    if (next === mode) return;
    if (body.trim()) {
      const ok = window.confirm(
        next === "internal"
          ? "Switch to Internal note? Your draft will be saved as an internal note that the customer cannot see."
          : "Switch to Reply to customer? Your draft will be SENT TO THE CUSTOMER.",
      );
      if (!ok) return;
    }
    setMode(next);
    setNextStatus("");
  };

  const send = async () => {
    if (!body.trim() && !files.length) return;
    const internal = mode === "internal";
    const text = body.trim();
    const pending = files;
    await run(
      async () => {
        if (text) {
          if (internal) await apiSend(`${base}/internal-note`, "POST", { body: text });
          else
            await apiSend(`${base}/reply`, "POST", { body: text, nextStatus: nextStatus || null });
          setBody("");
          setNextStatus("");
        }
        const failed: File[] = [];
        for (const f of pending) {
          try {
            await uploadTicketAttachment(base, f, internal);
          } catch {
            failed.push(f);
          }
        }
        setFiles(failed);
        if (failed.length)
          throw new Error(`These files did not upload: ${failed.map((f) => f.name).join(", ")}`);
      },
      internal ? "Could not save the internal note" : "Could not send the reply",
    );
  };

  if (loading && !detail) return <p className="text-muted mb-0">Loading ticket…</p>;
  if (error || !detail) {
    return (
      <>
        <button type="button" className="btn btn-link px-0 mb-2" onClick={onBack}>
          <i className="bx bx-chevron-left" />
          Back to queue
        </button>
        <div className="alert alert-danger mb-0">{error || "Ticket not found"}</div>
      </>
    );
  }

  const t = detail.ticket;
  const tech = Object.entries(t.technicalContext ?? {}).filter(([k]) => k !== "userAgent");
  const watcherIds = new Set(detail.watchers.map((w) => w.userId));
  const isInternal = mode === "internal";

  return (
    <>
      <button type="button" className="btn btn-link px-0 mb-2" onClick={onBack}>
        <i className="bx bx-chevron-left" />
        Back to queue
      </button>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-muted small mb-1">
            {t.ticketNumber} · {t.tenantName ?? "Unknown customer"}
          </p>
          <h4 className="mb-1 text-break">{t.subject}</h4>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <TicketStatusBadge status={t.status} />
            <TicketPriorityBadge priority={t.priority} />
            {t.disposition ? (
              <span className="badge bg-label-dark">{dispositionLabel(t.disposition)}</span>
            ) : null}
            {detail.tags.map((tag) => (
              <span key={tag.id} className="badge bg-label-secondary">
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {actionError ? (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {actionError}
          <button
            type="button"
            className="btn-close"
            aria-label="Dismiss"
            onClick={() => setActionError("")}
          />
        </div>
      ) : null}

      <div className="row g-4">
        {/* Left: customer + context */}
        <div className="col-lg-3 order-2 order-lg-1">
          <div className="card mb-4">
            <div className="card-body">
              <h6 className="mb-3">Customer</h6>
              <dl className="small mb-0">
                <dt className="text-muted fw-normal">Organization</dt>
                <dd>{t.tenantName ?? "Unknown"}</dd>
                <dt className="text-muted fw-normal">Requester</dt>
                <dd className="text-break">
                  {t.requesterName}
                  {t.requesterEmail ? (
                    <>
                      <br />
                      <a href={`mailto:${t.requesterEmail}`}>{t.requesterEmail}</a>
                    </>
                  ) : null}
                </dd>
                <dt className="text-muted fw-normal">Request type</dt>
                <dd>{optionLabel(config.requestTypes, t.requestType)}</dd>
                {t.productArea ? (
                  <>
                    <dt className="text-muted fw-normal">Area</dt>
                    <dd>{optionLabel(config.productAreas, t.productArea)}</dd>
                  </>
                ) : null}
                <dt className="text-muted fw-normal">Customer-reported severity</dt>
                <dd>
                  {t.customerReportedSeverity
                    ? priorityLabel(t.customerReportedSeverity)
                    : "Not provided"}
                </dd>
                <dt className="text-muted fw-normal">Source</dt>
                <dd>{t.source}</dd>
                <dt className="text-muted fw-normal">Created</dt>
                <dd>
                  {formatDateTime(t.createdAt)} ({formatAge(t.createdAt)} ago)
                </dd>
                <dt className="text-muted fw-normal">First response</dt>
                <dd className="mb-0">
                  {t.firstResponseAt ? formatDateTime(t.firstResponseAt) : "Not yet"}
                </dd>
              </dl>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <h6 className="mb-3">Technical details</h6>
              {tech.length ? (
                <dl className="small mb-0">
                  {tech.map(([k, v]) => (
                    <div key={k} className="d-flex justify-content-between gap-2">
                      <dt className="text-muted fw-normal">{k}</dt>
                      <dd className="mb-1 text-end text-break">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="small text-muted mb-0">
                  The customer did not include technical details.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center: conversation + composer */}
        <div className="col-lg-6 order-1 order-lg-2">
          <div className="card mb-4">
            <div className="card-body">
              <TicketTimeline
                description={t.description}
                requesterName={t.requesterName}
                createdAt={t.createdAt}
                messages={detail.messages}
                attachments={detail.attachments}
                events={detail.events}
                supportView
                onOpenAttachment={(a) => {
                  openTicketAttachment(base, a.id).catch((err) =>
                    setActionError(errorText(err, "Could not open the file")),
                  );
                }}
                {...(caps.canRespond
                  ? {
                      onDeleteAttachment: (a) => {
                        if (!window.confirm(`Remove ${a.originalFilename} from this ticket?`))
                          return;
                        void run(
                          () =>
                            apiSend(`${base}/attachments/${encodeURIComponent(a.id)}`, "DELETE"),
                          "Could not remove the file",
                        );
                      },
                    }
                  : {})}
              />
            </div>
          </div>

          {caps.canRespond || caps.canInternalNote ? (
            <div className={`card border-2 ${isInternal ? "border-warning" : "border-primary"}`}>
              <div className="card-header p-0">
                <div className="btn-group w-100" role="tablist" aria-label="Message type">
                  {caps.canRespond ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!isInternal}
                      className={`btn rounded-0 ${!isInternal ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => switchMode("reply")}
                    >
                      <i className="bx bx-reply me-1" />
                      Reply to customer
                    </button>
                  ) : null}
                  {caps.canInternalNote ? (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isInternal}
                      className={`btn rounded-0 ${isInternal ? "btn-warning" : "btn-outline-warning"}`}
                      onClick={() => switchMode("internal")}
                    >
                      <i className="bx bx-lock-alt me-1" />
                      Internal note
                    </button>
                  ) : null}
                </div>
              </div>
              <div className={`card-body pt-3 ${isInternal ? "bg-label-warning" : ""}`}>
                <p
                  className={`small fw-semibold mb-2 ${isInternal ? "text-warning" : "text-primary"}`}
                >
                  {isInternal ? (
                    <>
                      <i className="bx bx-lock-alt me-1" />
                      Only Forge staff can see this note. The customer will not be notified.
                    </>
                  ) : (
                    <>
                      <i className="bx bx-envelope me-1" />
                      The customer will see this reply and be notified.
                    </>
                  )}
                </p>
                <textarea
                  className="form-control mb-2"
                  rows={5}
                  maxLength={20000}
                  aria-label={isInternal ? "Internal note" : "Reply to customer"}
                  placeholder={
                    isInternal ? "Notes for the support team" : "Write your reply to the customer"
                  }
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={busy}
                />
                <AttachmentPicker
                  files={files}
                  onChange={setFiles}
                  disabled={busy}
                  idPrefix="hd-support"
                />
                {isInternal && files.length ? (
                  <p className="small text-warning mb-0">
                    These files will be internal and hidden from the customer.
                  </p>
                ) : null}
                <div className="d-flex flex-wrap justify-content-end align-items-center gap-2 mt-2">
                  {!isInternal && caps.canChangeStatus && detail.allowedStatuses.length ? (
                    <select
                      className="form-select form-select-sm w-auto"
                      aria-label="Status after sending"
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Keep status ({statusLabel(t.status)})</option>
                      {detail.allowedStatuses.map((s) => (
                        <option key={s} value={s}>
                          Send and set {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className={`btn ${isInternal ? "btn-warning" : "btn-primary"}`}
                    disabled={busy || (!body.trim() && !files.length)}
                    onClick={() => void send()}
                  >
                    {busy ? "Saving…" : isInternal ? "Save internal note" : "Send to customer"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: properties */}
        <div className="col-lg-3 order-3">
          {caps.canChangeStatus ? (
            <div className="card mb-4">
              <div className="card-body">
                <h6 className="mb-3">Status</h6>
                <select
                  className="form-select mb-2"
                  aria-label="New status"
                  value={statusTarget}
                  onChange={(e) => setStatusTarget(e.target.value)}
                  disabled={busy || !detail.allowedStatuses.length}
                >
                  <option value="">Currently {statusLabel(t.status)}</option>
                  {detail.allowedStatuses.map((s) => (
                    <option key={s} value={s}>
                      Move to {statusLabel(s)}
                    </option>
                  ))}
                </select>
                <select
                  className="form-select mb-2"
                  aria-label="Disposition"
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  disabled={busy}
                >
                  <option value="">No disposition</option>
                  {HELPDESK_DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>
                      {dispositionLabel(d)}
                    </option>
                  ))}
                </select>
                <textarea
                  className="form-control mb-2"
                  rows={2}
                  placeholder="Internal note about this change (optional)"
                  aria-label="Status change note"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn btn-outline-primary w-100"
                  disabled={busy || !statusTarget}
                  onClick={() =>
                    void run(
                      () =>
                        apiSend(`${base}/status`, "POST", {
                          status: statusTarget,
                          disposition: disposition || null,
                          note: statusNote.trim() || null,
                          expectedVersion: t.recordVersion,
                        }),
                      "Could not change the status",
                    ).then((ok) => ok && setStatusNote(""))
                  }
                >
                  Update status
                </button>
              </div>
            </div>
          ) : null}

          <div className="card mb-4">
            <div className="card-body">
              <h6 className="mb-3">Priority</h6>
              <select
                className="form-select"
                aria-label="Priority"
                value={t.priority}
                disabled={busy || !caps.canChangePriority}
                onChange={(e) =>
                  void run(
                    () =>
                      apiSend(`${base}/priority`, "POST", {
                        priority: e.target.value,
                        expectedVersion: t.recordVersion,
                      }),
                    "Could not change the priority",
                  )
                }
              >
                {HELPDESK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-body">
              <h6 className="mb-3">Assignee</h6>
              <select
                className="form-select mb-2"
                aria-label="Assignee"
                value={t.assignedUserId ?? ""}
                disabled={busy || !caps.canAssign}
                onChange={(e) =>
                  void run(
                    () =>
                      apiSend(`${base}/assign`, "POST", { assigneeUserId: e.target.value || null }),
                    "Could not assign the ticket",
                  )
                }
              >
                <option value="">Unassigned</option>
                {t.assignedUserId && !agents.some((a) => a.userId === t.assignedUserId) ? (
                  <option value={t.assignedUserId}>
                    {t.assignedUserName ?? "Current assignee"}
                  </option>
                ) : null}
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.name}
                  </option>
                ))}
              </select>
              {caps.canAssign && me?.userId && t.assignedUserId !== me.userId ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary w-100"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => apiSend(`${base}/assign`, "POST", { assigneeUserId: me.userId }),
                      "Could not assign the ticket",
                    )
                  }
                >
                  <i className="bx bx-user-check me-1" />
                  Assign to me
                </button>
              ) : null}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-body">
              <h6 className="mb-3">Tags</h6>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {detail.tags.length ? (
                  detail.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="badge bg-label-secondary d-inline-flex align-items-center gap-1"
                    >
                      {tag.label}
                      {caps.canManageWatchers ? (
                        <button
                          type="button"
                          className="btn btn-link p-0 text-reset"
                          aria-label={`Remove tag ${tag.label}`}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => apiSend(`${base}/tags`, "POST", { remove: [tag.id] }),
                              "Could not remove the tag",
                            )
                          }
                        >
                          <i className="bx bx-x" />
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="small text-muted">No tags</span>
                )}
              </div>
              {caps.canManageWatchers ? (
                <form
                  className="input-group input-group-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newTag.trim();
                    if (!label) return;
                    void run(
                      () => apiSend(`${base}/tags`, "POST", { add: [label] }),
                      "Could not add the tag",
                    ).then((ok) => {
                      if (ok) {
                        setNewTag("");
                        onTagsChanged();
                      }
                    });
                  }}
                >
                  <input
                    className="form-control"
                    list="hd-tag-options"
                    placeholder="Add tag"
                    aria-label="Add tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    disabled={busy}
                  />
                  <datalist id="hd-tag-options">
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.label} />
                    ))}
                  </datalist>
                  <button
                    type="submit"
                    className="btn btn-outline-primary"
                    disabled={busy || !newTag.trim()}
                  >
                    Add
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h6 className="mb-3">Watchers</h6>
              {detail.watchers.length ? (
                <ul className="list-unstyled small mb-2">
                  {detail.watchers.map((w) => (
                    <li key={w.userId} className="d-flex align-items-center gap-2 py-1">
                      <i className="bx bx-show text-muted" />
                      <span className="text-truncate">{w.name}</span>
                      {caps.canManageWatchers ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-danger p-0 ms-auto"
                          aria-label={`Remove watcher ${w.name}`}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => apiSend(`${base}/watchers`, "POST", { remove: [w.userId] }),
                              "Could not remove the watcher",
                            )
                          }
                        >
                          <i className="bx bx-x" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small text-muted mb-2">No watchers</p>
              )}
              {caps.canManageWatchers ? (
                <div className="input-group input-group-sm">
                  <select
                    className="form-select"
                    aria-label="Add watcher"
                    value={watcherToAdd}
                    onChange={(e) => setWatcherToAdd(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Add a watcher</option>
                    {agents
                      .filter((a) => !watcherIds.has(a.userId))
                      .map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={busy || !watcherToAdd}
                    onClick={() =>
                      void run(
                        () => apiSend(`${base}/watchers`, "POST", { add: [watcherToAdd] }),
                        "Could not add the watcher",
                      ).then((ok) => ok && setWatcherToAdd(""))
                    }
                  >
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
