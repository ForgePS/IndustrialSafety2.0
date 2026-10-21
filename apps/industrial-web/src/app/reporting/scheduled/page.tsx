"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import {
  cronToFriendlySchedule,
  DEFAULT_FRIENDLY_SCHEDULE,
  describeCronExpression,
  describeFriendlyDraft,
  formatNextRun,
  friendlyScheduleToCron,
  HOUR_OPTIONS,
  parseRecipientEmails,
  REPORT_SCHEDULE_TIMEZONE,
  WEEKDAY_OPTIONS,
  type FriendlyScheduleDraft,
  type ScheduleFrequency,
} from "@/lib/report-schedule-friendly";
import {
  createSavedReport,
  createSchedule,
  deleteSchedule,
  fetchLibraryReports,
  fetchSchedules,
  patchSchedule,
  runDueSchedules,
  WC_WEEKLY_STATUS_REPORT_KEY,
  type LibraryReportItem,
  type ReportExportFormat,
  type ReportScheduleRow,
} from "@/lib/reporting-api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFETY_DIRECTOR_MARKER = "role:SAFETY_DIRECTOR";
const WC_WEEKLY_DEFAULT: FriendlyScheduleDraft = { frequency: "weekly", weekday: 5, hourCentral: 7 };

function isDirectorMarker(email: string): boolean {
  return email.trim().toUpperCase() === SAFETY_DIRECTOR_MARKER.toUpperCase();
}

function reportLabel(row: ReportScheduleRow, library: LibraryReportItem[]): string {
  const saved = library.find((r) => r.id === row.reportDefinitionId);
  if (saved) return saved.name;
  const builtin = row.sourceKey ? library.find((r) => r.key === row.sourceKey) : undefined;
  return builtin?.name ?? row.name;
}

function recipientSummary(row: ReportScheduleRow): string {
  const list = row.recipients ?? [];
  if (list.length === 0) return "No recipients";
  const labels = list.map((r) => (isDirectorMarker(r.email) ? "Safety Directors" : r.email));
  return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more` : labels.join(", ");
}

export default function ReportingScheduledPage() {
  const [items, setItems] = useState<ReportScheduleRow[]>([]);
  const [library, setLibrary] = useState<LibraryReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningDue, setRunningDue] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportChoice, setReportChoice] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<FriendlyScheduleDraft>(DEFAULT_FRIENDLY_SCHEDULE);
  const [format, setFormat] = useState<ReportExportFormat>("csv");
  const [emails, setEmails] = useState("");
  const [includeDirectors, setIncludeDirectors] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const formRef = useRef<HTMLDivElement | null>(null);
  const appliedQuery = useRef(false);

  const savedReports = useMemo(
    () => library.filter((r) => r.origin === "saved" && r.id),
    [library],
  );
  const builtinReports = useMemo(() => library.filter((r) => r.origin === "builtin"), [library]);
  const scheduleSummary = useMemo(() => describeFriendlyDraft(draft), [draft]);
  const editingRow = editingId ? items.find((r) => r.id === editingId) ?? null : null;
  const isWcWeekly =
    reportChoice === `builtin:${WC_WEEKLY_STATUS_REPORT_KEY}` ||
    savedReports.some((r) => r.id === reportChoice && r.sourceKey === WC_WEEKLY_STATUS_REPORT_KEY) ||
    editingRow?.sourceKey === WC_WEEKLY_STATUS_REPORT_KEY;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sched, lib] = await Promise.all([
        fetchSchedules(),
        fetchLibraryReports().catch(() => ({ items: [] as LibraryReportItem[], total: 0 })),
      ]);
      setItems(sched.items);
      setLibrary(lib.items);
      return { rows: sched.items, libraryItems: lib.items };
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load scheduled reports");
      return { rows: [] as ReportScheduleRow[], libraryItems: [] as LibraryReportItem[] };
    } finally {
      setLoading(false);
    }
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setReportChoice("");
    setName("");
    setDraft(DEFAULT_FRIENDLY_SCHEDULE);
    setFormat("csv");
    setEmails("");
    setIncludeDirectors(false);
    setEnabled(true);
  }, []);

  const startEdit = useCallback((row: ReportScheduleRow) => {
    const recipients = row.recipients ?? [];
    setEditingId(row.id);
    setReportChoice(row.reportDefinitionId);
    setName(row.name);
    setDraft(cronToFriendlySchedule(row.cronExpression));
    setFormat((["csv", "xlsx", "pdf"].includes(row.format) ? row.format : "csv") as ReportExportFormat);
    setEmails(
      recipients
        .filter((r) => !isDirectorMarker(r.email))
        .map((r) => r.email)
        .join("\n"),
    );
    setIncludeDirectors(recipients.some((r) => isDirectorMarker(r.email)));
    setEnabled(row.enabled);
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    void load().then(({ rows, libraryItems }) => {
      if (appliedQuery.current) return;
      appliedQuery.current = true;
      const params = new URLSearchParams(window.location.search);
      const editId = params.get("edit");
      const editRow = editId ? rows.find((r) => r.id === editId) : undefined;
      if (editRow) {
        startEdit(editRow);
        return;
      }
      const reportKey = params.get("report");
      if (reportKey) {
        const selected = libraryItems.find((r) => r.id === reportKey || r.key === reportKey);
        setReportChoice(UUID_RE.test(reportKey) ? reportKey : `builtin:${reportKey}`);
        if (selected) setName(selected.name);
        if ((selected?.sourceKey ?? reportKey) === WC_WEEKLY_STATUS_REPORT_KEY) {
          setDraft(WC_WEEKLY_DEFAULT);
          setFormat("pdf");
        }
      }
    });
  }, [load, startEdit]);

  function onReportChange(value: string) {
    setReportChoice(value);
    const selected = value.startsWith("builtin:")
      ? builtinReports.find((r) => r.key === value.slice("builtin:".length))
      : savedReports.find((r) => r.id === value);
    if (selected && !name.trim()) setName(selected.name);
    const sourceKey = value.startsWith("builtin:") ? value.slice("builtin:".length) : selected?.sourceKey;
    if (sourceKey === WC_WEEKLY_STATUS_REPORT_KEY) {
      setDraft(WC_WEEKLY_DEFAULT);
      setFormat("pdf");
    }
  }

  async function resolveDefinitionId(choice: string): Promise<string> {
    if (UUID_RE.test(choice)) return choice;
    const key = choice.startsWith("builtin:") ? choice.slice("builtin:".length) : choice;
    const saved = savedReports.find((r) => r.sourceKey === key || r.key === key);
    if (saved?.id) return saved.id;
    const builtin = builtinReports.find((r) => r.key === key);
    const created = await createSavedReport({
      name: builtin?.name ?? (name.trim() || key),
      sourceKey: key,
      payloadJson: {},
    });
    return created.id;
  }

  function buildRecipients(): Array<{ email: string }> {
    const list = parseRecipientEmails(emails).map((email) => ({ email }));
    if (includeDirectors) list.push({ email: SAFETY_DIRECTOR_MARKER });
    return list;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || (!editingId && !reportChoice)) {
      setMessage("Choose a report and give this schedule a name.");
      return;
    }
    const recipients = buildRecipients();
    if (isWcWeekly && recipients.length === 0) {
      setMessage("Add at least one email so the weekly status has somewhere to go.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const common = {
        name: name.trim(),
        cronExpression: friendlyScheduleToCron(draft),
        timezone: REPORT_SCHEDULE_TIMEZONE,
        format,
        recipients,
        enabled,
      };
      if (editingId) {
        await patchSchedule(editingId, common);
        setMessage("Schedule updated.");
      } else {
        const definitionId = await resolveDefinitionId(reportChoice);
        await createSchedule({ reportDefinitionId: definitionId, ...common });
        setMessage("Schedule saved. We’ll email it on the cadence you chose.");
      }
      resetForm();
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save the schedule");
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(row: ReportScheduleRow) {
    setBusyId(row.id);
    setMessage(null);
    try {
      await patchSchedule(row.id, { enabled: !row.enabled });
      setMessage(row.enabled ? `Paused “${row.name}”.` : `Resumed “${row.name}”.`);
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not update the schedule");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Stop this scheduled report?")) return;
    setBusyId(id);
    try {
      await deleteSchedule(id);
      if (editingId === id) resetForm();
      setMessage("Schedule removed.");
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not remove the schedule");
    } finally {
      setBusyId(null);
    }
  }

  async function onRunDue() {
    setRunningDue(true);
    setMessage(null);
    try {
      const result = await runDueSchedules();
      const ok = result.results.filter((r) => r.status === "SUCCEEDED").length;
      const fail = result.results.filter((r) => r.status === "FAILED").length;
      setMessage(
        result.processed === 0
          ? "Nothing is due to send right now."
          : `Sent ${ok} report${ok === 1 ? "" : "s"}${fail ? `, ${fail} failed` : ""}.`,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not send due reports");
    } finally {
      setRunningDue(false);
    }
  }

  function setFrequency(frequency: ScheduleFrequency) {
    setDraft((prev) => ({ ...prev, frequency }));
  }

  const hasReports = savedReports.length > 0 || builtinReports.length > 0;

  return (
    <>
      <div className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <p className="settings-admin-sidebar__eyebrow mb-2">Workspace</p>
          <h1 className="h4 mb-1">Scheduled reports</h1>
          <p className="text-muted mb-0">
            Choose how often a report is emailed. Times use US Central.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary"
          disabled={runningDue}
          onClick={() => void onRunDue()}
        >
          {runningDue ? "Sending…" : "Send due reports now"}
        </button>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      ) : null}

      <div className="card border shadow-none mb-3" ref={formRef}>
        <div className="card-body">
          <h2 className="h6 mb-1">{editingId ? "Edit schedule" : "New schedule"}</h2>
          <p className="text-muted small mb-3">
            {editingId
              ? "Change when it sends, the file type, or who receives it."
              : "Pick a report, how often to send it, and who should receive it."}
          </p>
          <form className="row g-3" onSubmit={(e) => void onSubmit(e)}>
            <div className="col-md-6">
              <label className="form-label" htmlFor="sched-report">
                Report
              </label>
              {editingRow ? (
                <input
                  id="sched-report"
                  className="form-control"
                  value={reportLabel(editingRow, library)}
                  disabled
                  readOnly
                />
              ) : (
                <select
                  id="sched-report"
                  className="form-select"
                  value={reportChoice}
                  onChange={(e) => onReportChange(e.target.value)}
                  required
                >
                  <option value="">Select a report…</option>
                  {savedReports.length > 0 ? (
                    <optgroup label="Saved reports">
                      {savedReports.map((r) => (
                        <option key={r.id!} value={r.id!}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {builtinReports.length > 0 ? (
                    <optgroup label="Report library">
                      {builtinReports.map((r) => (
                        <option key={r.key} value={`builtin:${r.key}`}>
                          {r.module ? `${r.module} – ${r.name}` : r.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              )}
              {!hasReports && !loading ? (
                <div className="form-text">
                  Browse the <Link href="/reporting/library/">report library</Link> first.
                </div>
              ) : null}
              {isWcWeekly ? (
                <div className="form-text">
                  Sends the Workers&apos; Comp weekly status email (open cases, location, days away /
                  restricted, and Thursday notes) to everyone listed below.
                </div>
              ) : null}
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="sched-name">
                Name
              </label>
              <input
                id="sched-name"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly safety summary"
                required
              />
            </div>

            <div className="col-md-4">
              <label className="form-label" htmlFor="sched-frequency">
                How often
              </label>
              <select
                id="sched-frequency"
                className="form-select"
                value={draft.frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Once a month (1st)</option>
              </select>
            </div>

            {draft.frequency === "weekly" ? (
              <div className="col-md-4">
                <label className="form-label" htmlFor="sched-weekday">
                  Day of week
                </label>
                <select
                  id="sched-weekday"
                  className="form-select"
                  value={draft.weekday}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, weekday: Number(e.target.value) }))
                  }
                >
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="col-md-4">
              <label className="form-label" htmlFor="sched-hour">
                Time (US Central)
              </label>
              <select
                id="sched-hour"
                className="form-select"
                value={draft.hourCentral}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, hourCentral: Number(e.target.value) }))
                }
              >
                {HOUR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {isWcWeekly ? null : (
              <div className="col-md-4">
                <label className="form-label" htmlFor="sched-format">
                  File type
                </label>
                <select
                  id="sched-format"
                  className="form-select"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
                >
                  <option value="csv">Spreadsheet (CSV)</option>
                  <option value="xlsx">Excel (XLSX)</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            )}

            <div className="col-md-8">
              <label className="form-label" htmlFor="sched-email">
                Email to
              </label>
              <textarea
                id="sched-email"
                className="form-control"
                rows={3}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={"safety@company.com\nhr@company.com, manager@company.com"}
              />
              <div className="form-text">One per line, or separate with commas.</div>
              <div className="form-check mt-2">
                <input
                  id="sched-directors"
                  type="checkbox"
                  className="form-check-input"
                  checked={includeDirectors}
                  onChange={(e) => setIncludeDirectors(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="sched-directors">
                  Also send to Safety Directors
                </label>
              </div>
            </div>

            <div className="col-md-4">
              <span className="form-label d-block">Status</span>
              <div className="form-check form-switch">
                <input
                  id="sched-enabled"
                  type="checkbox"
                  role="switch"
                  className="form-check-input"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="sched-enabled">
                  {enabled ? "On" : "Paused"}
                </label>
              </div>
            </div>

            <div className="col-12">
              <p className="small text-muted mb-2" role="status">
                Summary: <strong>{scheduleSummary}</strong>
              </p>
            </div>
            <div className="col-12 d-flex flex-wrap gap-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || (!editingId && !hasReports)}
              >
                {saving ? "Saving…" : editingId ? "Save changes" : "Save schedule"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={saving}
                  onClick={resetForm}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>

      <div className="card border shadow-none">
        {loading ? (
          <div className="card-body text-muted">Loading schedules…</div>
        ) : items.length === 0 ? (
          <div className="card-body">
            <AdminEmptyState
              title="No scheduled reports yet"
              description="Create a schedule above so a report emails automatically."
              action={
                <Link href="/reporting/library/" className="btn btn-sm btn-outline-primary">
                  Report library
                </Link>
              }
            />
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>When it sends</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Last sent</th>
                  <th>Next send</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={row.id === editingId ? "table-active" : undefined}>
                    <td>
                      <div className="fw-medium">{row.name}</div>
                      <div className="small text-muted">{reportLabel(row, library)}</div>
                    </td>
                    <td className="small">
                      {describeCronExpression(row.cronExpression, row.timezone)}
                    </td>
                    <td className="small text-muted">{recipientSummary(row)}</td>
                    <td>{row.enabled ? "On" : "Paused"}</td>
                    <td className="small text-muted">
                      {row.lastRunAt ? formatNextRun(row.lastRunAt) : "Never"}
                    </td>
                    <td className="small text-muted">
                      {row.enabled ? formatNextRun(row.nextRunAt) : "Paused"}
                    </td>
                    <td className="text-end text-nowrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary me-1"
                        disabled={busyId === row.id}
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-1"
                        disabled={busyId === row.id}
                        onClick={() => void onToggle(row)}
                      >
                        {row.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={busyId === row.id}
                        onClick={() => void onDelete(row.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
