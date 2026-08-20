"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { SignaturePad } from "@/components/signature-pad";
import { YearSelectDateInput } from "@/components/year-select-date-input";
import { useProfileSignature } from "@/hooks/use-profile-signature";
import { isBirthDateField } from "@/lib/date-field";
import {
  FORMS_API,
  FORM_SUBMISSIONS_API,
  FORM_TABS,
  FORM_TAB_META,
  buildFormAnswersPayload,
  extractFormFields,
  formStatusBadgeClass,
  hydrateFormAnswers,
  parseFormFieldsInput,
  parseFormTab,
  type FormField,
  type FormTabId,
} from "@/lib/forms-module";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

function FormsEmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-5">
      <div className="avatar avatar-lg mx-auto mb-3">
        <span className="avatar-initial rounded-circle bg-label-secondary">
          <i className={`bx ${icon}`} />
        </span>
      </div>
      <p className="text-muted mb-0">{message}</p>
    </div>
  );
}

function renderFillField(
  field: FormField,
  answers: Record<string, string>,
  setAnswers: (next: Record<string, string>) => void,
  profileSignature?: string | null,
) {
  const set = (value: string) => setAnswers({ ...answers, [field.id]: value });
  const inputId = `form-fill-${field.id}`;
  const value = answers[field.id] ?? "";

  if (field.type === "content") {
    const paragraphs = String(field.content ?? "")
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    return (
      <div className="col-12" key={field.id}>
        <div className="card border shadow-none bg-label-secondary">
          <div className="card-body">
            <h6 className="card-title mb-3">{field.label}</h6>
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-muted mb-0">Policy text unavailable.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (field.type === "signature") {
    return (
      <div className="col-12" key={field.id}>
        <SignaturePad
          label={field.label}
          value={value}
          onChange={set}
          profileSignature={profileSignature ?? null}
        />
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="col-12" key={field.id}>
        <div className="form-check">
          <input
            id={inputId}
            className="form-check-input"
            type="checkbox"
            checked={value === "true"}
            onChange={(ev) => set(ev.target.checked ? "true" : "")}
          />
          <label className="form-check-label" htmlFor={inputId}>
            {field.label}
          </label>
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="col-12" key={field.id}>
        <label className="form-label" htmlFor={inputId}>
          {field.label}
        </label>
        <textarea
          id={inputId}
          className="form-control"
          rows={4}
          required={field.required}
          value={value}
          onChange={(ev) => set(ev.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select" || field.type === "radio") {
    return (
      <div className="col-md-6" key={field.id}>
        <label className="form-label" htmlFor={inputId}>
          {field.label}
        </label>
        <select
          id={inputId}
          className="form-select"
          required={field.required}
          value={value}
          onChange={(ev) => set(ev.target.value)}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "date" && isBirthDateField(field)) {
    return (
      <div className="col-md-6" key={field.id}>
        <label className="form-label" id={inputId}>
          {field.label}
        </label>
        <YearSelectDateInput
          id={inputId}
          value={value}
          onChange={set}
          required={field.required === true}
          mode="birth"
        />
      </div>
    );
  }

  return (
    <div className="col-md-6" key={field.id}>
      <label className="form-label" htmlFor={inputId}>
        {field.label}
      </label>
      <input
        id={inputId}
        className="form-control"
        type={field.type}
        required={field.required}
        value={value}
        onChange={(ev) => set(ev.target.value)}
      />
    </div>
  );
}

export function FormsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.forms.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.forms.manage") || permissions.has("industrial.admin");
  const { signatureUrl: profileSignature } = useProfileSignature(canView);

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<FormTabId>(() => parseFormTab(searchParams.get("tab")));
  const [definitions, setDefinitions] = useState<Array<Record<string, unknown>>>([]);
  const [submissions, setSubmissions] = useState<Array<Record<string, unknown>>>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(
    () => searchParams.get("form") || null,
  );
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(
    () => searchParams.get("submission") || null,
  );
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(
    () => searchParams.get("submission") || null,
  );
  const [createForm, setCreateForm] = useState({
    title: "",
    category: "",
    fields: "Submitted by|text\nLocation|text\nDate|date\nNotes|textarea",
  });

  const modEntry = bootstrap?.modules.find((m) => m.code === "FORMS");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled ?? true) && canView;

  const selectedForm = useMemo(
    () => definitions.find((row) => String(row.id) === selectedFormId) ?? null,
    [definitions, selectedFormId],
  );
  const fillFields = useMemo(
    () => (selectedForm ? extractFormFields(selectedForm) : []),
    [selectedForm],
  );
  const editingSubmission = useMemo(
    () =>
      editingSubmissionId
        ? (submissions.find((row) => String(row.id) === editingSubmissionId) ?? null)
        : null,
    [editingSubmissionId, submissions],
  );

  const filteredDefinitions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return definitions.filter((row) => {
      if (status && String(row.status ?? "").toUpperCase() !== status.toUpperCase()) return false;
      if (!needle) return true;
      return [row.title, row.name, row.formKey, row.category]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(needle));
    });
  }, [definitions, q, status]);

  const filteredSubmissions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return submissions.filter((row) => {
      if (selectedFormId && String(row.formDefinitionId ?? "") !== selectedFormId) return false;
      if (status && String(row.status ?? "").toUpperCase() !== status.toUpperCase()) return false;
      if (!needle) return true;
      return [row.title, row.name]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(needle));
    });
  }, [q, selectedFormId, status, submissions]);

  const syncUrl = useCallback(
    (next: { tab?: FormTabId; form?: string | null; submission?: string | null }) => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = next.tab ?? tab;
      if (nextTab === "library") params.delete("tab");
      else params.set("tab", nextTab);
      const formId = next.form === undefined ? selectedFormId : next.form;
      if (formId) params.set("form", formId);
      else params.delete("form");
      const submissionId =
        next.submission === undefined ? selectedSubmissionId : next.submission;
      if (submissionId) params.set("submission", submissionId);
      else params.delete("submission");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [selectedFormId, selectedSubmissionId, tab],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [defs, subs] = await Promise.all([
        apiGet<ListResponse>(FORMS_API, { query: { page: "1", pageSize: "100" } }),
        apiGet<ListResponse>(FORM_SUBMISSIONS_API, { query: { page: "1", pageSize: "100" } }),
      ]);
      setDefinitions(defs.items ?? []);
      setSubmissions(subs.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load forms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boot = await apiGet<Bootstrap>("/api/v1/industrial/bootstrap");
        if (!cancelled) setBootstrap(boot);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load module bootstrap");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadAll();
  }, [awsReady, loadAll]);

  // Deep-link / refresh: hydrate the submission into the fill form once data is loaded.
  useEffect(() => {
    if (!editingSubmissionId || loading) return;
    const row = submissions.find((item) => String(item.id) === editingSubmissionId);
    if (!row) return;
    const formId = String(row.formDefinitionId ?? "");
    const form = definitions.find((def) => String(def.id) === formId);
    if (!form) return;
    if (selectedFormId !== formId) setSelectedFormId(formId);
    setAnswers((prev) =>
      Object.keys(prev).length > 0 ? prev : hydrateFormAnswers(row.answers, extractFormFields(form)),
    );
  }, [definitions, editingSubmissionId, loading, selectedFormId, submissions]);

  function openForm(id: string, nextTab: FormTabId = "fill") {
    setSelectedFormId(id);
    setSelectedSubmissionId(null);
    setEditingSubmissionId(null);
    setAnswers({});
    setTab(nextTab);
    syncUrl({ tab: nextTab, form: id, submission: null });
  }

  function openSubmission(id: string) {
    const row = submissions.find((item) => String(item.id) === id);
    const formId = row ? String(row.formDefinitionId ?? "") : "";
    const form = formId
      ? (definitions.find((def) => String(def.id) === formId) ?? null)
      : null;
    setSelectedSubmissionId(id);
    setEditingSubmissionId(id);
    if (formId) setSelectedFormId(formId);
    if (row && form) {
      setAnswers(hydrateFormAnswers(row.answers, extractFormFields(form)));
    } else if (row) {
      setAnswers(hydrateFormAnswers(row.answers, []));
    } else {
      setAnswers({});
    }
    setTab("fill");
    syncUrl({
      tab: "fill",
      form: formId || selectedFormId,
      submission: id,
    });
  }

  function startNewSubmission() {
    if (!selectedFormId) return;
    setEditingSubmissionId(null);
    setSelectedSubmissionId(null);
    setAnswers({});
    setTab("fill");
    syncUrl({ tab: "fill", form: selectedFormId, submission: null });
  }

  async function loadPrintableHtml(): Promise<string | null> {
    if (!editingSubmissionId) return null;
    setError(null);
    try {
      const data = await apiGet<{ html: string; title?: string }>(
        `${FORM_SUBMISSIONS_API}/${encodeURIComponent(editingSubmissionId)}/printable`,
      );
      return data.html;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load printable form");
      return null;
    }
  }

  function openPrintablePopup(html: string, autoPrint: boolean) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(
      url,
      "forge-form-printable",
      "popup=yes,width=960,height=720,scrollbars=yes,resizable=yes",
    );
    if (!popup) {
      URL.revokeObjectURL(url);
      setError("Pop-up blocked — allow pop-ups to preview or print this form.");
      return;
    }
    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    };
    const watch = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(watch);
        cleanup();
      }
    }, 800);
    if (autoPrint) {
      window.setTimeout(() => {
        try {
          popup.focus();
          popup.print();
        } catch {
          // User can still print from the popup toolbar.
        }
      }, 500);
    } else {
      popup.focus();
    }
  }

  async function previewSubmission() {
    const html = await loadPrintableHtml();
    if (!html) return;
    openPrintablePopup(html, false);
  }

  async function printSubmission() {
    const html = await loadPrintableHtml();
    if (!html) return;
    openPrintablePopup(html, true);
  }

  async function downloadSubmission() {
    const html = await loadPrintableHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const title = String(
      editingSubmission?.title ?? selectedForm?.title ?? selectedForm?.name ?? "form-submission",
    )
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
    anchor.href = url;
    anchor.download = `${title || "form-submission"}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function onCreateDefinition(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      const fields = parseFormFieldsInput(createForm.fields);
      const created = await apiSend<Record<string, unknown>>(FORMS_API, "POST", {
        title: createForm.title.trim(),
        name: createForm.title.trim(),
        category: createForm.category.trim() || undefined,
        formKey: createForm.category.trim() || undefined,
        fields,
        schemaJson: { fields },
      });
      setCreateForm({
        title: "",
        category: "",
        fields: "Submitted by|text\nLocation|text\nDate|date\nNotes|textarea",
      });
      await loadAll();
      if (created.id) openForm(String(created.id), "fill");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create form");
    } finally {
      setCreating(false);
    }
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !selectedFormId) return;
    setCreating(true);
    setError(null);
    try {
      const payload = buildFormAnswersPayload(answers, fillFields);
      if (editingSubmissionId) {
        await apiSend<Record<string, unknown>>(
          `${FORM_SUBMISSIONS_API}/${encodeURIComponent(editingSubmissionId)}`,
          "PATCH",
          {
            title: String(
              editingSubmission?.title ??
                selectedForm?.title ??
                selectedForm?.name ??
                "Form submission",
            ),
            answers: payload,
          },
        );
        await loadAll();
        setTab("submissions");
        setSelectedSubmissionId(editingSubmissionId);
        syncUrl({
          tab: "submissions",
          form: selectedFormId,
          submission: editingSubmissionId,
        });
      } else {
        const created = await apiSend<Record<string, unknown>>(FORM_SUBMISSIONS_API, "POST", {
          formDefinitionId: selectedFormId,
          title: String(selectedForm?.title ?? selectedForm?.name ?? "Form submission"),
          answers: payload,
        });
        setAnswers({});
        setEditingSubmissionId(null);
        await loadAll();
        setTab("submissions");
        setSelectedSubmissionId(created.id ? String(created.id) : null);
        syncUrl({
          tab: "submissions",
          form: selectedFormId,
          submission: created.id ? String(created.id) : null,
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : editingSubmissionId
            ? "Could not save form changes"
            : "Could not submit form",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view forms.</p>
      </div>
    );
  }

  if (bootstrap && !awsReady) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
    );
  }

  if (!bootstrap) {
    return (
      <section role="status" aria-live="polite">
        <ModuleWorkspaceHeader title={moduleName} description="Checking module availability…" />
      </section>
    );
  }

  return (
    <section aria-labelledby="forms-title">
      <ModuleWorkspaceHeader
        id="forms-title"
        eyebrow="Operations"
        title={moduleName}
        description={FORM_TAB_META[tab].description}
        onRefresh={() => void loadAll()}
        refreshing={loading}
      />

      <div className="row g-4 mb-4">
        <div className="col-sm-6 col-xl-4">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <p className="text-muted small mb-1">Forms</p>
              <h4 className="mb-0">{definitions.length}</h4>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-xl-4">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <p className="text-muted small mb-1">Submissions</p>
              <h4 className="mb-0">{submissions.length}</h4>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-xl-4">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <p className="text-muted small mb-1">Selected form</p>
              <h6 className="mb-0">
                {selectedForm
                  ? String(selectedForm.title ?? selectedForm.name ?? "Untitled form")
                  : "None"}
              </h6>
            </div>
          </div>
        </div>
      </div>

      <ModuleWorkspaceTabs
        tabs={FORM_TABS}
        active={tab}
        onChange={(id) => {
          setTab(id);
          syncUrl({ tab: id });
        }}
        ariaLabel="Forms sections"
        tabPanelLabel={FORM_TAB_META[tab].label}
      >
        <FilterPanel
          searchId="forms-search"
          searchValue={q}
          onSearchChange={setQ}
          statusId="forms-status"
          statusValue={status}
          onStatusChange={setStatus}
          chips={[
            ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
            ...(status
              ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }]
              : []),
            ...(selectedFormId
              ? [
                  {
                    id: "form",
                    label: `Form: ${String(selectedForm?.title ?? selectedForm?.name ?? "Selected")}`,
                    onRemove: () => {
                      setSelectedFormId(null);
                      syncUrl({ form: null });
                    },
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            setQ("");
            setStatus("");
            setSelectedFormId(null);
            syncUrl({ form: null });
          }}
          onSubmit={() => undefined}
        />

        {error ? (
          <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
            <span className="flex-grow-1">{error}</span>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void loadAll()}>
              Retry
            </button>
          </div>
        ) : null}

        {tab === "library" ? (
          <>
            {loading ? (
              <p className="text-muted" role="status">
                Loading forms…
              </p>
            ) : filteredDefinitions.length === 0 ? (
              <FormsEmptyState icon="bx-file" message="No forms yet. Create one below to start collecting submissions." />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Form</th>
                      <th scope="col">Category</th>
                      <th scope="col">Fields</th>
                      <th scope="col">Status</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDefinitions.map((row) => {
                      const id = String(row.id);
                      const fieldCount = extractFormFields(row).length;
                      return (
                        <tr
                          key={id}
                          className={id === selectedFormId ? "table-active" : undefined}
                          role="button"
                          tabIndex={0}
                          onClick={() => openForm(id)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              openForm(id);
                            }
                          }}
                        >
                          <td>{String(row.title ?? row.name ?? "Untitled form")}</td>
                          <td className="text-muted">
                            {String(row.formKey ?? row.category ?? "—")}
                          </td>
                          <td>{fieldCount}</td>
                          <td>
                            <span className={`badge ${formStatusBadgeClass(String(row.status ?? "ACTIVE"))}`}>
                              {String(row.status ?? "ACTIVE")}
                            </span>
                          </td>
                          <td className="text-muted">
                            {row.updatedAt ? new Date(String(row.updatedAt)).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canManage ? (
              <div className="card border shadow-none mt-4">
                <div className="card-header">
                  <h6 className="card-title mb-0">Create form</h6>
                </div>
                <div className="card-body">
                  <form onSubmit={(e) => void onCreateDefinition(e)} aria-label="Create form">
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="form-title">
                          Form name
                        </label>
                        <input
                          id="form-title"
                          className="form-control"
                          required
                          value={createForm.title}
                          onChange={(ev) =>
                            setCreateForm((prev) => ({ ...prev, title: ev.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="form-category">
                          Category
                        </label>
                        <input
                          id="form-category"
                          className="form-control"
                          value={createForm.category}
                          onChange={(ev) =>
                            setCreateForm((prev) => ({ ...prev, category: ev.target.value }))
                          }
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label" htmlFor="form-fields">
                          Fields (one per line: Label|type|option — use signature for sign pads)
                        </label>
                        <textarea
                          id="form-fields"
                          className="form-control"
                          rows={5}
                          required
                          value={createForm.fields}
                          onChange={(ev) =>
                            setCreateForm((prev) => ({ ...prev, fields: ev.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-3" disabled={creating}>
                      {creating ? "Saving…" : "Create form"}
                    </button>
                  </form>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === "fill" ? (
          selectedForm ? (
            <form onSubmit={(e) => void onSubmitForm(e)} aria-label="Fill form">
              <div className="mb-3 d-flex flex-wrap align-items-start justify-content-between gap-2">
                <div>
                  <h6 className="mb-1">{String(selectedForm.title ?? selectedForm.name)}</h6>
                  <p className="text-muted small mb-0">
                    {editingSubmissionId
                      ? "Edit any field, including signatures, then save your changes."
                      : "Complete the fields and submit to save this record."}
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {editingSubmissionId ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void previewSubmission()}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void printSubmission()}
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => void downloadSubmission()}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={startNewSubmission}
                      >
                        Start new submission
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="row g-3">
                {fillFields.map((field) =>
                  renderFillField(field, answers, setAnswers, profileSignature),
                )}
              </div>
              {canManage ? (
                <button type="submit" className="btn btn-primary mt-3" disabled={creating}>
                  {creating
                    ? editingSubmissionId
                      ? "Saving…"
                      : "Submitting…"
                    : editingSubmissionId
                      ? "Save changes"
                      : "Submit form"}
                </button>
              ) : (
                <p className="text-muted mt-3 mb-0">Submitting requires industrial.forms.manage.</p>
              )}
            </form>
          ) : (
            <FormsEmptyState icon="bx-edit" message="Choose a form from the Forms tab to fill it out." />
          )
        ) : null}

        {tab === "submissions" ? (
          loading ? (
            <p className="text-muted" role="status">
              Loading submissions…
            </p>
          ) : filteredSubmissions.length === 0 ? (
            <FormsEmptyState icon="bx-check-square" message="No submissions yet." />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Submission</th>
                    <th scope="col">Form</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((row) => {
                    const id = String(row.id);
                    const form = definitions.find(
                      (def) => String(def.id) === String(row.formDefinitionId ?? ""),
                    );
                    return (
                      <tr
                        key={id}
                        className={id === selectedSubmissionId ? "table-active" : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => openSubmission(id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            openSubmission(id);
                          }
                        }}
                      >
                        <td>{String(row.title ?? row.name ?? "Submission")}</td>
                        <td className="text-muted">
                          {String(form?.title ?? form?.name ?? "—")}
                        </td>
                        <td>
                          <span className={`badge ${formStatusBadgeClass(String(row.status ?? "SUBMITTED"))}`}>
                            {String(row.status ?? "SUBMITTED")}
                          </span>
                        </td>
                        <td className="text-muted">
                          {row.submittedAt
                            ? new Date(String(row.submittedAt)).toLocaleString()
                            : row.updatedAt
                              ? new Date(String(row.updatedAt)).toLocaleString()
                              : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-muted small mt-2 mb-0">
                Select a submission to open it for editing.
              </p>
            </div>
          )
        ) : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
