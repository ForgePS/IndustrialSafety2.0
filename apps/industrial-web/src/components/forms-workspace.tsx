"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { SignaturePad } from "@/components/signature-pad";
import { RequestSignatureLinkPanel } from "@/components/request-signature-link-panel";
import { FormBuilderModal, type FormBuilderModalMode } from "@/components/form-builder-modal";
import { FormEmployeeNumberField } from "@/components/form-employee-number-field";
import { FormViewModal } from "@/components/form-view-modal";
import { YearSelectDateInput } from "@/components/year-select-date-input";
import { duplicateFormFieldsForCopy, duplicateFormTitle } from "@/lib/form-builder";
import { useProfileSignature } from "@/hooks/use-profile-signature";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { isBirthDateField } from "@/lib/date-field";
import {
  DEFAULT_FORMS_SORT,
  FORMS_API,
  FORMS_SORT_OPTIONS,
  FORM_SUBMISSIONS_API,
  FORM_TABS,
  FORM_TAB_META,
  buildFormAnswersPayload,
  collectFormTypeOptions,
  extractFormFields,
  fetchFormDefinitionPrintable,
  createFormDefinition,
  formStatusBadgeClass,
  formTypeLabel,
  groupRowsByFormType,
  hydrateFormAnswers,
  isEmployeeNumberField,
  parseFormTab,
  parseFormsSort,
  resolveFormLocationLabel,
  resolveFormSubjectPersonnelId,
  SAMPLE_FORM_IMPORT_JSON,
  sortFormDefinitions,
  sortFormSubmissions,
  updateFormDefinition,
  archiveFormDefinition,
  importFormCatalog,
  downloadJsonFile,
  importFormChecklistFile,
  importChecklistUploadFile,
  readFileAsBase64,
  type FormCatalogImportSummary,
  type FormField,
  type FormsSort,
  type FormTabId,
} from "@/lib/forms-module";
import {
  FORM_STATUS_PENDING_SIGNATURE,
  canDeleteForms,
  formSignatoryKindForField,
  hasDeferredSignatoryFields,
  isDeferredSignatoryField,
  isEhsDirectorSignatureField,
  isSignatureAnswerPresent,
  principalCanSignEhsDirector,
  type SignatoryRoleRef,
} from "@/lib/form-signatory";
import {
  formatYesNoAnswer,
  normalizeYesNoAnswer,
  validateYesNoFormFields,
  yesNoNotesFieldId,
  type YesNoNaAnswer,
} from "@/lib/form-yesno";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

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
  canSignEhsDirector = false,
  submissionId: string | null = null,
  canRequestSignLink = false,
  readOnly = false,
  locationOptions: ReadonlyArray<{ id: string; name: string }> = [],
  onEmployeePersonnelResolved?: (fieldId: string, personnelId: string | null) => void,
) {
  const set = (value: string) => {
    if (readOnly) return;
    setAnswers({ ...answers, [field.id]: value });
  };
  const inputId = `form-fill-${field.id}`;
  const value = answers[field.id] ?? "";
  const deferRequired = isDeferredSignatoryField(field);

  if (field.type === "label") {
    return (
      <div className="col-12" key={field.id}>
        <h6 className="border-bottom pb-2 mb-0 mt-3 fw-semibold">{field.label}</h6>
      </div>
    );
  }

  if (isEmployeeNumberField(field)) {
    return (
      <Fragment key={field.id}>
        <FormEmployeeNumberField
          id={inputId}
          label={field.label}
          value={value}
          required={field.required === true}
          readOnly={readOnly}
          onChange={set}
          onPersonnelResolved={(personnelId) => {
            onEmployeePersonnelResolved?.(field.id, personnelId);
          }}
        />
      </Fragment>
    );
  }

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
    const ehsOnly = isEhsDirectorSignatureField(field);
    const locked = ehsOnly && !canSignEhsDirector;
    const signatoryKind = formSignatoryKindForField(field);
    const unsigned = !isSignatureAnswerPresent(value);
    return (
      <div className="col-12" key={field.id}>
        <SignaturePad
          label={field.label}
          value={value}
          onChange={set}
          disabled={locked || readOnly}
          profileSignature={locked || readOnly ? null : (profileSignature ?? null)}
        />
        {locked ? (
          <small className="text-muted d-block mt-1">
            Only the Safety Director can sign this field. Save the form now; they are notified when
            a signature is still needed.
          </small>
        ) : signatoryKind && unsigned ? (
          <small className="text-muted d-block mt-1">
            Optional for now — save the form and send a sign link, or the{" "}
            {signatoryKind === "supervisor" ? "supervisor" : "Safety Director"} can sign later.
          </small>
        ) : null}
        {canRequestSignLink && unsigned && signatoryKind ? (
          <RequestSignatureLinkPanel
            submissionId={submissionId}
            fieldId={field.id}
            fieldLabel={field.label}
            kind={signatoryKind}
            enabled={canRequestSignLink}
          />
        ) : null}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="col-12" key={field.id}>
        <div className="border rounded p-3">
          <div className="form-check mb-0">
            <input
              id={inputId}
              className="form-check-input"
              type="checkbox"
              checked={value === "true"}
              disabled={readOnly}
              required={field.required === true}
              onChange={(ev) => set(ev.target.checked ? "true" : "")}
            />
            <label className="form-check-label fw-medium" htmlFor={inputId}>
              {field.label}
              {field.required ? <span className="text-danger ms-1">*</span> : null}
            </label>
          </div>
          <p className="text-muted small mb-0 mt-2">Check to confirm.</p>
        </div>
      </div>
    );
  }

  if (field.type === "yesno") {
    const answer = normalizeYesNoAnswer(value) ?? "";
    const notesId = yesNoNotesFieldId(field.id);
    const notes = answers[notesId] ?? "";
    const setAnswer = (next: YesNoNaAnswer) => {
      if (readOnly) return;
      const patch: Record<string, string> = { ...answers, [field.id]: next };
      if (next !== "NO") patch[notesId] = "";
      setAnswers(patch);
    };
    const setNotes = (next: string) => {
      if (readOnly) return;
      setAnswers({ ...answers, [notesId]: next });
    };
    return (
      <div className="col-12" key={field.id}>
        <div
          className={`border rounded p-3 ${answer === "NO" ? "border-danger bg-label-danger bg-opacity-10" : ""}`}
        >
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <span className="fw-medium">{field.label}</span>
            <div className="btn-group" role="group" aria-label={`${field.label} answer`}>
              {(["YES", "NO", "NA"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`btn btn-sm ${
                    choice === "NO"
                      ? answer === choice
                        ? "btn-danger"
                        : "btn-outline-danger"
                      : answer === choice
                        ? choice === "YES"
                          ? "btn-success"
                          : "btn-secondary"
                        : "btn-outline-secondary"
                  }`}
                  onClick={() => setAnswer(choice)}
                  disabled={readOnly}
                >
                  {formatYesNoAnswer(choice)}
                </button>
              ))}
            </div>
          </div>
          {answer === "NO" ? (
            <div>
              <label className="form-label small" htmlFor={notesId}>
                Note required *
              </label>
              <textarea
                id={notesId}
                className="form-control form-control-sm"
                rows={2}
                required
                disabled={readOnly}
                value={notes}
                onChange={(ev) => setNotes(ev.target.value)}
              />
            </div>
          ) : (
            <p className="text-muted small mb-0">Answer Yes, No, or N/A. No requires a note.</p>
          )}
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
          required={field.required && !deferRequired}
          disabled={readOnly}
          value={value}
          onChange={(ev) => set(ev.target.value)}
        />
      </div>
    );
  }

  if (field.type === "location") {
    const displayValue = resolveFormLocationLabel(value, locationOptions);
    return (
      <div className="col-md-6" key={field.id}>
        <label className="form-label" htmlFor={inputId}>
          {field.label}
        </label>
        {readOnly ? (
          <input
            id={inputId}
            className="form-control"
            readOnly
            disabled
            value={displayValue || "—"}
          />
        ) : (
          <>
            <select
              id={inputId}
              className="form-select"
              required={field.required && !deferRequired}
              value={value}
              onChange={(ev) => set(ev.target.value)}
            >
              <option value="">Select location…</option>
              {locationOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            {locationOptions.length === 0 ? (
              <small className="text-muted d-block mt-1">
                No locations configured. Add them in Settings → Dropdowns → Locations / sites.
              </small>
            ) : null}
          </>
        )}
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
          required={field.required && !deferRequired}
          disabled={readOnly}
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
          disabled={readOnly}
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
        required={field.required && !deferRequired}
        disabled={readOnly}
        value={value}
        onChange={(ev) => set(ev.target.value)}
      />
      {deferRequired && field.type === "date" ? (
        <small className="text-muted d-block mt-1">
          Optional until the related signature is added.
        </small>
      ) : null}
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
  const canDelete = canDeleteForms({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    permissions: me?.permissions,
  });
  const canSubmitForms =
    canManage ||
    permissions.has("industrial.personnel.manage") ||
    permissions.has("industrial.fleet.manage");
  const { signatureUrl: profileSignature } = useProfileSignature(canView);
  const { facilities: locationOptions } = useIndustrialFacility();

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "FORMS",
    canView,
  });
  const [tab, setTab] = useState<FormTabId>(() => parseFormTab(searchParams.get("tab")));
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: FORM_TABS,
        moduleCode: "FORMS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "library",
      ),
    );
  }, [visibleTabs]);
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
  const [sort, setSort] = useState<FormsSort>(() => parseFormsSort(searchParams.get("sort")));
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get("type") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Employee # field id → resolved personnel UUID (null when not found). */
  const [employeePersonnelByField, setEmployeePersonnelByField] = useState<
    Record<string, string | null>
  >({});
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(
    () => searchParams.get("submission") || null,
  );
  /** Only set when opening Forms from a personnel profile — connects the fill to that person. */
  const subjectPersonnelId = searchParams.get("personnel")?.trim() || null;
  const [viewModalFormId, setViewModalFormId] = useState<string | null>(null);
  const [builderModal, setBuilderModal] = useState<{
    mode: FormBuilderModalMode;
    formId: string | null;
    title: string;
    category: string;
    fields: FormField[];
  } | null>(null);
  const [savingDefinition, setSavingDefinition] = useState(false);
  const [deletingForm, setDeletingForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importIncludeSubmissions, setImportIncludeSubmissions] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<FormCatalogImportSummary | null>(null);
  const [importFormTitle, setImportFormTitle] = useState("");
  const [importFormCategory, setImportFormCategory] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const deepLinkFetchAttempted = useRef<string | null>(null);
  const [roleList, setRoleList] = useState<SignatoryRoleRef[]>([]);
  const canSignEhsDirector = principalCanSignEhsDirector(roleList);

  const selectedForm = useMemo(
    () => definitions.find((row) => String(row.id) === selectedFormId) ?? null,
    [definitions, selectedFormId],
  );
  const fillFields = useMemo(
    () => (selectedForm ? extractFormFields(selectedForm) : []),
    [selectedForm],
  );
  const hasDeferredSignatures = useMemo(() => hasDeferredSignatoryFields(fillFields), [fillFields]);
  const editingSubmission = useMemo(
    () =>
      editingSubmissionId
        ? (submissions.find((row) => String(row.id) === editingSubmissionId) ?? null)
        : null,
    [editingSubmissionId, submissions],
  );

  const viewModalForm = useMemo(
    () =>
      viewModalFormId
        ? (definitions.find((row) => String(row.id) === viewModalFormId) ?? null)
        : null,
    [definitions, viewModalFormId],
  );
  const viewModalFields = useMemo(
    () => (viewModalForm ? extractFormFields(viewModalForm) : []),
    [viewModalForm],
  );

  const definitionsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of definitions) {
      const id = String(row.id ?? "");
      if (id) map.set(id, row);
    }
    return map;
  }, [definitions]);

  const typeOptions = useMemo(() => collectFormTypeOptions(definitions), [definitions]);

  const filteredDefinitions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = definitions.filter((row) => {
      if (status && String(row.status ?? "").toUpperCase() !== status.toUpperCase()) return false;
      if (typeFilter && formTypeLabel(row) !== typeFilter) return false;
      if (!needle) return true;
      return [row.title, row.name, row.formKey, row.category]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(needle));
    });
    return sortFormDefinitions(filtered, sort);
  }, [definitions, q, sort, status, typeFilter]);

  const filteredSubmissions = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = submissions.filter((row) => {
      if (selectedFormId && String(row.formDefinitionId ?? "") !== selectedFormId) return false;
      if (status && String(row.status ?? "").toUpperCase() !== status.toUpperCase()) return false;
      const form = definitionsById.get(String(row.formDefinitionId ?? ""));
      if (typeFilter && formTypeLabel(form) !== typeFilter) return false;
      if (!needle) return true;
      return [row.title, row.name, form?.title, form?.name, form?.category, form?.formKey]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(needle));
    });
    return sortFormSubmissions(filtered, definitionsById, sort);
  }, [definitionsById, q, selectedFormId, sort, status, submissions, typeFilter]);

  const definitionGroups = useMemo(
    () =>
      sort === "type"
        ? groupRowsByFormType(filteredDefinitions, (row) => formTypeLabel(row))
        : [{ type: "", items: filteredDefinitions }],
    [filteredDefinitions, sort],
  );

  const submissionGroups = useMemo(
    () =>
      sort === "type"
        ? groupRowsByFormType(filteredSubmissions, (row) =>
            formTypeLabel(definitionsById.get(String(row.formDefinitionId ?? ""))),
          )
        : [{ type: "", items: filteredSubmissions }],
    [definitionsById, filteredSubmissions, sort],
  );

  const syncUrl = useCallback(
    (next: {
      tab?: FormTabId;
      form?: string | null;
      submission?: string | null;
      sort?: FormsSort;
      type?: string | null;
    }) => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = next.tab ?? tab;
      if (nextTab === "library") params.delete("tab");
      else params.set("tab", nextTab);
      const formId = next.form === undefined ? selectedFormId : next.form;
      if (formId) params.set("form", formId);
      else params.delete("form");
      const submissionId = next.submission === undefined ? selectedSubmissionId : next.submission;
      if (submissionId) params.set("submission", submissionId);
      else params.delete("submission");
      if (subjectPersonnelId) params.set("personnel", subjectPersonnelId);
      else params.delete("personnel");
      const nextSort = next.sort ?? sort;
      if (nextSort && nextSort !== DEFAULT_FORMS_SORT) params.set("sort", nextSort);
      else params.delete("sort");
      const nextType = next.type === undefined ? typeFilter : next.type;
      if (nextType) params.set("type", nextType);
      else params.delete("type");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [selectedFormId, selectedSubmissionId, sort, subjectPersonnelId, tab, typeFilter],
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

  /** List payloads omit schemaJson — hydrate from detail when Fill/View/Builder needs fields. */
  const ensureFormSchema = useCallback(
    async (formId: string) => {
      const existing = definitions.find((row) => String(row.id) === formId);
      const schema = existing?.schemaJson;
      if (schema && typeof schema === "object" && !Array.isArray(schema)) {
        const fields = (schema as { fields?: unknown }).fields;
        const questions = (schema as { questions?: unknown }).questions;
        if (Array.isArray(fields) || Array.isArray(questions)) return existing!;
      }
      const full = await apiGet<Record<string, unknown>>(
        `${FORMS_API}/${encodeURIComponent(formId)}`,
      );
      setDefinitions((prev) => {
        const index = prev.findIndex((row) => String(row.id) === formId);
        if (index < 0) return [...prev, full];
        const next = [...prev];
        next[index] = { ...next[index], ...full };
        return next;
      });
      return full;
    },
    [definitions],
  );

  useEffect(() => {
    if (!canView) {
      setRoleList([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const profile = await apiGet<{ roles?: SignatoryRoleRef[] }>("/api/v1/auth/profile");
        if (!cancelled) setRoleList(Array.isArray(profile.roles) ? profile.roles : []);
      } catch {
        if (!cancelled) setRoleList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadAll();
  }, [awsReady, loadAll]);

  // Deep-link / refresh: hydrate the submission into Fill only when the URL
  // still points at that submission. Do not force Fill if the user left the tab.
  useEffect(() => {
    if (!editingSubmissionId || loading || !awsReady) return;
    if (tab !== "fill") return;
    const row = submissions.find((item) => String(item.id) === editingSubmissionId);
    if (row) {
      deepLinkFetchAttempted.current = null;
      const formId = String(row.formDefinitionId ?? selectedFormId ?? "");
      const form = formId ? (definitions.find((def) => String(def.id) === formId) ?? null) : null;
      if (formId && selectedFormId !== formId) setSelectedFormId(formId);
      setAnswers((prev) =>
        Object.keys(prev).length > 0
          ? prev
          : hydrateFormAnswers(row.answers, form ? extractFormFields(form) : []),
      );
      return;
    }

    if (deepLinkFetchAttempted.current === editingSubmissionId) return;
    deepLinkFetchAttempted.current = editingSubmissionId;

    let cancelled = false;
    void (async () => {
      try {
        const fetched = await apiGet<Record<string, unknown>>(
          `${FORM_SUBMISSIONS_API}/${encodeURIComponent(editingSubmissionId)}`,
        );
        if (cancelled) return;
        setSubmissions((prev) =>
          prev.some((item) => String(item.id) === String(fetched.id)) ? prev : [fetched, ...prev],
        );
        const formId = String(fetched.formDefinitionId ?? selectedFormId ?? "");
        if (formId) setSelectedFormId(formId);
        syncUrl({ tab: "fill", form: formId || selectedFormId, submission: editingSubmissionId });
      } catch {
        // Leave deep-link state; user can still browse the library.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    awsReady,
    definitions,
    editingSubmissionId,
    loading,
    selectedFormId,
    submissions,
    syncUrl,
    tab,
  ]);

  function clearSubmissionEdit() {
    setEditingSubmissionId(null);
    setSelectedSubmissionId(null);
    setAnswers({});
    setEmployeePersonnelByField({});
  }

  function clearFormFilter() {
    setSelectedFormId(null);
    clearSubmissionEdit();
  }

  function clearBrowseFilters() {
    setQ("");
    setStatus("");
    setTypeFilter("");
    setSort(DEFAULT_FORMS_SORT);
    clearFormFilter();
  }

  function openForm(id: string, nextTab: FormTabId = "fill") {
    setSelectedFormId(id);
    setViewModalFormId(null);
    setBuilderModal(null);
    clearSubmissionEdit();
    setTab(nextTab);
    syncUrl({ tab: nextTab, form: id, submission: null });
    void ensureFormSchema(id).catch(() => {
      /* keep list row; Fill will show defaults until retry */
    });
  }

  function selectLibraryForm(id: string) {
    setSelectedFormId(id);
  }

  function openViewModal(formId: string) {
    setSelectedFormId(formId);
    setViewModalFormId(formId);
    setBuilderModal(null);
    void ensureFormSchema(formId).catch(() => {
      /* modal can still show title/status from list row */
    });
  }

  async function openBuilderModal(formId: string | null, mode: FormBuilderModalMode) {
    let form = formId ? definitions.find((row) => String(row.id) === formId) : null;
    if (formId && mode !== "create") {
      try {
        form = await ensureFormSchema(formId);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load form for editing");
        return;
      }
    }
    const sourceFields = form ? extractFormFields(form) : [];
    const category = form ? formTypeLabel(form) : "";
    const baseTitle = form ? String(form.title ?? form.name ?? "") : "";
    setBuilderModal({
      mode,
      formId: mode === "edit" && formId ? formId : null,
      title:
        mode === "duplicate" ? duplicateFormTitle(baseTitle) : mode === "create" ? "" : baseTitle,
      category: category === "Uncategorized" ? "" : category,
      fields:
        mode === "duplicate"
          ? duplicateFormFieldsForCopy(sourceFields)
          : mode === "create"
            ? []
            : sourceFields,
    });
    setViewModalFormId(null);
    if (formId) setSelectedFormId(formId);
  }

  async function saveBuilderModal() {
    if (!builderModal || !canManage) return;
    if (builderModal.fields.length === 0) {
      setError("Add at least one field before saving.");
      return;
    }
    setSavingDefinition(true);
    setError(null);
    try {
      const title = builderModal.title.trim();
      const category = builderModal.category.trim();
      const payload = {
        title,
        name: title,
        category: category || undefined,
        formKey: category || undefined,
        fields: builderModal.fields,
        schemaJson: { fields: builderModal.fields },
      };
      if (builderModal.mode === "edit" && builderModal.formId) {
        await updateFormDefinition(builderModal.formId, payload);
      } else {
        const created = await createFormDefinition(payload);
        if (created.id) setSelectedFormId(String(created.id));
      }
      await loadAll();
      setBuilderModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save form template");
    } finally {
      setSavingDefinition(false);
    }
  }

  function openSubmission(id: string) {
    const row = submissions.find((item) => String(item.id) === id);
    const formId = row ? String(row.formDefinitionId ?? "") : "";
    const form = formId ? (definitions.find((def) => String(def.id) === formId) ?? null) : null;
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
    clearSubmissionEdit();
    setTab("fill");
    syncUrl({ tab: "fill", form: selectedFormId, submission: null });
  }

  function browseTab(next: FormTabId) {
    // Re-click Submissions: reset filters so you can pick another form's records.
    if (next === "submissions" && tab === "submissions") {
      clearBrowseFilters();
      setTab("submissions");
      syncUrl({
        tab: "submissions",
        form: null,
        submission: null,
        type: null,
        sort: DEFAULT_FORMS_SORT,
      });
      return;
    }
    // Leaving Fill for browse tabs must drop the open submission, otherwise the
    // URL deep-link effect keeps yanking the user back to Fill.
    if (next === "submissions" || next === "library") {
      clearSubmissionEdit();
      setTab(next);
      syncUrl({ tab: next, submission: null });
      return;
    }
    setTab(next);
    syncUrl({ tab: next });
  }

  function backToSubmissions() {
    clearSubmissionEdit();
    setTab("submissions");
    syncUrl({ tab: "submissions", submission: null });
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

  async function loadDefinitionPrintableHtml(formId: string): Promise<string | null> {
    setError(null);
    try {
      const data = await fetchFormDefinitionPrintable(formId);
      return data.html;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load printable form");
      return null;
    }
  }

  async function previewDefinitionForm(formId: string | null = selectedFormId) {
    if (!formId) return;
    const html = await loadDefinitionPrintableHtml(formId);
    if (html) openPrintablePopup(html, false);
  }

  async function printBlankDefinitionForm(formId: string | null = selectedFormId) {
    if (!formId) return;
    const html = await loadDefinitionPrintableHtml(formId);
    if (html) openPrintablePopup(html, true);
  }

  async function deleteFormTemplate(formId: string, title: string) {
    if (!canDelete || deletingForm) return;
    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThis archives the form template and removes it from the library. Existing submissions are kept.`,
    );
    if (!confirmed) return;
    setDeletingForm(true);
    setError(null);
    try {
      await archiveFormDefinition(formId);
      // Optimistic: drop from library immediately — do not reload every form schema.
      setDefinitions((prev) => prev.filter((row) => String(row.id) !== formId));
      if (selectedFormId === formId) {
        setSelectedFormId(null);
        syncUrl({ form: null });
      }
      if (viewModalFormId === formId) setViewModalFormId(null);
      if (builderModal?.formId === formId) setBuilderModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete form");
    } finally {
      setDeletingForm(false);
    }
  }

  function browseFormSubmissions() {
    if (!selectedFormId) return;
    clearSubmissionEdit();
    setTab("submissions");
    syncUrl({ tab: "submissions", form: selectedFormId, submission: null });
  }

  async function runFormImport(payload: Record<string, unknown>, dryRun: boolean) {
    if (!canManage) return;
    setImporting(true);
    setError(null);
    setImportNotice(null);
    setImportSummary(null);
    try {
      const summary = await importFormCatalog({
        ...payload,
        dryRun,
        includeSubmissions: importIncludeSubmissions,
      });
      setImportSummary(summary);
      if (dryRun) {
        setImportNotice(
          `Preview: ${summary.definitionsUpserted} template(s) and ${summary.submissionsUpserted} submission(s) would be imported.`,
        );
      } else {
        setImportNotice(
          `Imported ${summary.definitionsUpserted} template(s) and ${summary.submissionsUpserted} submission(s).`,
        );
        await loadAll();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not import forms");
    } finally {
      setImporting(false);
    }
  }

  async function onImportFileSelected(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isChecklist =
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".pdf");
    setImporting(true);
    setError(null);
    setImportNotice(null);
    setImportSummary(null);
    try {
      if (isChecklist) {
        const overrides = {
          ...(importFormTitle.trim() ? { title: importFormTitle.trim() } : {}),
          ...(importFormCategory.trim() ? { category: importFormCategory.trim() } : {}),
        };
        const summary = lower.endsWith(".pdf")
          ? await importFormChecklistFile({
              filename: file.name,
              contentBase64: await readFileAsBase64(file),
              ...overrides,
            })
          : await importChecklistUploadFile(file, overrides);
        setImportSummary(summary);
        setImportNotice(
          `Imported ${summary.definitionsUpserted} checklist template(s) with Yes / No / N/A items.`,
        );
        await loadAll();
      } else {
        const text = await file.text();
        const payload = JSON.parse(text) as Record<string, unknown>;
        await runFormImport(payload, false);
      }
    } catch (err) {
      const message =
        err instanceof SyntaxError
          ? "Invalid JSON file. Use Excel, CSV, PDF, or the sample JSON format."
          : err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not read import file";
      setError(message);
      setImportNotice(null);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (!canSubmitForms || !selectedFormId) return;
    const yesNoCheck = validateYesNoFormFields(fillFields, answers);
    if (!yesNoCheck.ok) {
      setError(yesNoCheck.message);
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const payload = buildFormAnswersPayload(answers, fillFields);
      const linkedPersonnelId = resolveFormSubjectPersonnelId({
        urlPersonnelId: subjectPersonnelId,
        answers,
        fields: fillFields,
        resolvedByFieldId: employeePersonnelByField,
      });
      if (linkedPersonnelId) {
        payload.personnelId = linkedPersonnelId;
      }
      const subjectLink = linkedPersonnelId ? { personnelId: linkedPersonnelId } : {};
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
            ...subjectLink,
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
          ...subjectLink,
        });
        setAnswers({});
        setEmployeePersonnelByField({});
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

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "MIGRATION_IN_PROGRESS"}
      />
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

      {canSignEhsDirector
        ? (() => {
            const pending = submissions.filter(
              (row) => String(row.status ?? "").toUpperCase() === FORM_STATUS_PENDING_SIGNATURE,
            );
            if (pending.length === 0) return null;
            return (
              <div className="alert alert-warning" role="status">
                {pending.length} form{pending.length === 1 ? "" : "s"} waiting for your Safety
                Director signature.{" "}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning ms-1"
                  onClick={() => {
                    setStatus(FORM_STATUS_PENDING_SIGNATURE);
                    setTab("submissions");
                    syncUrl({ tab: "submissions" });
                  }}
                >
                  Review submissions
                </button>
              </div>
            );
          })()
        : null}

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
        tabs={visibleTabs}
        active={tab}
        onChange={(id) => browseTab(id)}
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
          statusOptions={[
            { value: "", label: "All statuses" },
            { value: "SUBMITTED", label: "Submitted" },
            { value: FORM_STATUS_PENDING_SIGNATURE, label: "Needs signature" },
            { value: "DRAFT", label: "Draft" },
            { value: "ACTIVE", label: "Active" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
          chips={[
            ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
            ...(status
              ? [{ id: "status", label: `Status: ${status}`, onRemove: () => setStatus("") }]
              : []),
            ...(typeFilter
              ? [
                  {
                    id: "type",
                    label: `Type: ${typeFilter}`,
                    onRemove: () => {
                      setTypeFilter("");
                      syncUrl({ type: null });
                    },
                  },
                ]
              : []),
            ...(sort !== DEFAULT_FORMS_SORT
              ? [
                  {
                    id: "sort",
                    label: `Sort: ${FORMS_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}`,
                    onRemove: () => {
                      setSort(DEFAULT_FORMS_SORT);
                      syncUrl({ sort: DEFAULT_FORMS_SORT });
                    },
                  },
                ]
              : []),
            ...(selectedFormId
              ? [
                  {
                    id: "form",
                    label: `Form: ${String(selectedForm?.title ?? selectedForm?.name ?? "Selected")}`,
                    onRemove: () => {
                      clearFormFilter();
                      syncUrl({ form: null, submission: null });
                    },
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            clearBrowseFilters();
            syncUrl({
              form: null,
              submission: null,
              type: null,
              sort: DEFAULT_FORMS_SORT,
            });
          }}
          onSubmit={() => undefined}
          extraFields={
            <>
              <div className="col-md-4">
                <label className="form-label" htmlFor="forms-type-filter">
                  Type
                </label>
                <select
                  id="forms-type-filter"
                  className="form-select"
                  value={typeFilter}
                  onChange={(ev) => {
                    const next = ev.target.value;
                    setTypeFilter(next);
                    syncUrl({ type: next || null });
                  }}
                >
                  <option value="">All types</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  <option value="Uncategorized">Uncategorized</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="forms-sort">
                  Sort
                </label>
                <select
                  id="forms-sort"
                  className="form-select"
                  value={sort}
                  onChange={(ev) => {
                    const next = parseFormsSort(ev.target.value);
                    setSort(next);
                    syncUrl({ sort: next });
                  }}
                >
                  {FORMS_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

        {error ? (
          <div
            className="alert alert-danger d-flex flex-wrap align-items-center gap-3"
            role="alert"
          >
            <span className="flex-grow-1">{error}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              onClick={() => void loadAll()}
            >
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
              <FormsEmptyState
                icon="bx-file"
                message="No forms yet. Create one below to start collecting submissions."
              />
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
                      <th scope="col" className="text-end">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {definitionGroups.map((group) => (
                      <Fragment key={group.type || "all"}>
                        {group.type ? (
                          <tr className="table-light">
                            <th
                              scope="rowgroup"
                              colSpan={6}
                              className="small text-uppercase text-muted"
                            >
                              {group.type}
                              <span className="fw-normal ms-2">({group.items.length})</span>
                            </th>
                          </tr>
                        ) : null}
                        {group.items.map((row) => {
                          const id = String(row.id);
                          const fieldCount =
                            typeof row.fieldCount === "number"
                              ? row.fieldCount
                              : extractFormFields(row).length;
                          return (
                            <tr
                              key={id}
                              className={id === selectedFormId ? "table-active" : undefined}
                              role="button"
                              tabIndex={0}
                              onClick={() => selectLibraryForm(id)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  selectLibraryForm(id);
                                }
                              }}
                            >
                              <td>{String(row.title ?? row.name ?? "Untitled form")}</td>
                              <td className="text-muted">{formTypeLabel(row)}</td>
                              <td>{fieldCount}</td>
                              <td>
                                <span
                                  className={`badge ${formStatusBadgeClass(String(row.status ?? "ACTIVE"))}`}
                                >
                                  {String(row.status ?? "ACTIVE")}
                                </span>
                              </td>
                              <td className="text-muted">
                                {row.updatedAt
                                  ? new Date(String(row.updatedAt)).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="text-end">
                                <div className="d-flex flex-wrap justify-content-end gap-1">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openViewModal(id);
                                    }}
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      selectLibraryForm(id);
                                      void previewDefinitionForm(id);
                                    }}
                                  >
                                    Print layout
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      selectLibraryForm(id);
                                      void printBlankDefinitionForm(id);
                                    }}
                                  >
                                    Print blank
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openForm(id, "fill");
                                    }}
                                  >
                                    Fill out
                                  </button>
                                  {canManage ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          void openBuilderModal(id, "edit");
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary"
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          void openBuilderModal(id, "duplicate");
                                        }}
                                      >
                                        Duplicate
                                      </button>
                                    </>
                                  ) : null}
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={deletingForm}
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        void deleteFormTemplate(
                                          id,
                                          String(row.title ?? row.name ?? "Form"),
                                        );
                                      }}
                                    >
                                      Delete
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedForm && tab === "library" ? (
              <div className="card border shadow-none mt-4">
                <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div>
                    <h6 className="card-title mb-0">
                      {String(selectedForm.title ?? selectedForm.name ?? "Form")}
                    </h6>
                    <p className="text-muted small mb-0">
                      View, print, fill out, edit, or duplicate this template.
                    </p>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => openViewModal(String(selectedForm.id))}
                    >
                      View form
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => void previewDefinitionForm()}
                    >
                      Print layout
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => void printBlankDefinitionForm()}
                    >
                      Print blank
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => openForm(String(selectedForm.id), "fill")}
                    >
                      Fill out
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={browseFormSubmissions}
                    >
                      Submissions
                    </button>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => void openBuilderModal(String(selectedForm.id), "edit")}
                        >
                          Edit template
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() =>
                            void openBuilderModal(String(selectedForm.id), "duplicate")
                          }
                        >
                          Duplicate &amp; edit
                        </button>
                      </>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={deletingForm}
                        onClick={() =>
                          void deleteFormTemplate(
                            String(selectedForm.id),
                            String(selectedForm.title ?? selectedForm.name ?? "Form"),
                          )
                        }
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {canManage ? (
              <>
                <div className="card border shadow-none mt-4">
                  <div className="card-header">
                    <h6 className="card-title mb-0">Import forms</h6>
                  </div>
                  <div className="card-body">
                    <p className="text-muted small mb-3">
                      Upload Excel (.xlsx), CSV, or PDF to create a fillable Yes / No / N/A
                      checklist (notes required when answered No). JSON imports are still supported
                      for advanced templates.
                    </p>
                    <div className="row g-2 mb-3">
                      <div className="col-md-6">
                        <label className="form-label small mb-1" htmlFor="import-form-title">
                          Form name (optional for file upload)
                        </label>
                        <input
                          id="import-form-title"
                          className="form-control form-control-sm"
                          value={importFormTitle}
                          onChange={(ev) => setImportFormTitle(ev.target.value)}
                          placeholder="Uses file name or Form name row when blank"
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label small mb-1" htmlFor="import-form-category">
                          Category (optional)
                        </label>
                        <input
                          id="import-form-category"
                          className="form-control form-control-sm"
                          value={importFormCategory}
                          onChange={(ev) => setImportFormCategory(ev.target.value)}
                        />
                      </div>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() =>
                          downloadJsonFile("form-import-sample.json", SAMPLE_FORM_IMPORT_JSON)
                        }
                      >
                        Download sample JSON
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={importing}
                        onClick={() => void runFormImport(SAMPLE_FORM_IMPORT_JSON, true)}
                      >
                        {importing ? "Working…" : "Preview sample"}
                      </button>
                    </div>
                    <div className="form-check mb-3">
                      <input
                        id="import-include-submissions"
                        type="checkbox"
                        className="form-check-input"
                        checked={importIncludeSubmissions}
                        onChange={(ev) => setImportIncludeSubmissions(ev.target.checked)}
                      />
                      <label
                        className="form-check-label small"
                        htmlFor="import-include-submissions"
                      >
                        Also import <code>formSubmissions</code> from the file (historical answers)
                      </label>
                    </div>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <input
                        ref={importFileRef}
                        type="file"
                        accept=".json,.xlsx,.xls,.csv,.pdf,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf"
                        className="form-control form-control-sm"
                        style={{ maxWidth: "20rem" }}
                        disabled={importing}
                        onChange={(ev) => void onImportFileSelected(ev.target.files?.[0] ?? null)}
                        aria-label="Upload form file"
                      />
                      <span className="text-muted small">
                        {importing
                          ? "Importing…"
                          : "Excel: Question column · PDF uses server import"}
                      </span>
                    </div>
                    {importNotice ? (
                      <div className="alert alert-success mt-3 mb-0 py-2 small" role="status">
                        {importNotice}
                      </div>
                    ) : null}
                    {importSummary ? (
                      <ul className="small text-muted mt-2 mb-0">
                        <li>Templates in file: {importSummary.templatesInSource}</li>
                        <li>Submissions in file: {importSummary.submissionsInSource}</li>
                        <li>Templates imported: {importSummary.definitionsUpserted}</li>
                        <li>Submissions imported: {importSummary.submissionsUpserted}</li>
                        {importSummary.submissionsUnlinked > 0 ? (
                          <li>Unlinked submissions: {importSummary.submissionsUnlinked}</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="card border shadow-none mt-4">
                  <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <h6 className="card-title mb-0">Create form</h6>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => void openBuilderModal(null, "create")}
                    >
                      Open form builder
                    </button>
                  </div>
                  <div className="card-body">
                    <p className="text-muted small mb-0">
                      Use the visual form builder to add fill-in-the-blank, Yes/No/N/A, signatures,
                      dates, and more. Advanced users can still import JSON or Excel checklists
                      above.
                    </p>
                  </div>
                </div>
              </>
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
                      : hasDeferredSignatures
                        ? "Complete the EMPLOYEE fields and submit. Supervisor and Safety Director signatures can be added later."
                        : "Complete the fields and submit to save this record."}
                  </p>
                  {subjectPersonnelId || Object.values(employeePersonnelByField).some(Boolean) ? (
                    <p className="text-muted small mb-0 mt-1">
                      This submission will attach to the selected personnel file.
                    </p>
                  ) : null}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={backToSubmissions}
                  >
                    Back to submissions
                  </button>
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
                  renderFillField(
                    field,
                    answers,
                    setAnswers,
                    profileSignature,
                    canSignEhsDirector,
                    editingSubmissionId,
                    canSubmitForms,
                    false,
                    locationOptions,
                    (fieldId, personnelId) => {
                      setEmployeePersonnelByField((prev) => ({
                        ...prev,
                        [fieldId]: personnelId,
                      }));
                    },
                  ),
                )}
              </div>
              {canSubmitForms ? (
                <button type="submit" className="btn btn-primary mt-3" disabled={creating}>
                  {creating
                    ? editingSubmissionId
                      ? "Saving…"
                      : "Submitting…"
                    : editingSubmissionId
                      ? "Save changes"
                      : hasDeferredSignatures
                        ? "Save to EMPLOYEE record"
                        : "Submit form"}
                </button>
              ) : (
                <p className="text-muted mt-3 mb-0">
                  Submitting requires forms, personnel, or fleet manage permission.
                </p>
              )}
            </form>
          ) : (
            <FormsEmptyState
              icon="bx-edit"
              message="Choose a form from the Forms tab to fill it out."
            />
          )
        ) : null}

        {tab === "submissions" ? (
          loading ? (
            <p className="text-muted" role="status">
              Loading submissions…
            </p>
          ) : filteredSubmissions.length === 0 ? (
            <FormsEmptyState
              icon="bx-check-square"
              message={
                selectedFormId || q || status || typeFilter
                  ? "No submissions match the current filters."
                  : "No submissions yet."
              }
            />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th scope="col">Submission</th>
                    <th scope="col">Form</th>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionGroups.map((group) => (
                    <Fragment key={group.type || "all"}>
                      {group.type ? (
                        <tr className="table-light">
                          <th
                            scope="rowgroup"
                            colSpan={5}
                            className="small text-uppercase text-muted"
                          >
                            {group.type}
                            <span className="fw-normal ms-2">({group.items.length})</span>
                          </th>
                        </tr>
                      ) : null}
                      {group.items.map((row) => {
                        const id = String(row.id);
                        const form = definitionsById.get(String(row.formDefinitionId ?? ""));
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
                            <td className="text-muted">{formTypeLabel(form)}</td>
                            <td>
                              <span
                                className={`badge ${formStatusBadgeClass(String(row.status ?? "SUBMITTED"))}`}
                              >
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
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <p className="text-muted small mt-2 mb-0">
                Select a submission to open it for editing.
              </p>
            </div>
          )
        ) : null}
      </ModuleWorkspaceTabs>

      {viewModalForm ? (
        <FormViewModal
          title={String(viewModalForm.title ?? viewModalForm.name ?? "Form")}
          subtitle={formTypeLabel(viewModalForm)}
          onClose={() => setViewModalFormId(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => void previewDefinitionForm(viewModalFormId)}
              >
                Print layout
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => void printBlankDefinitionForm(viewModalFormId)}
              >
                Print blank
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (viewModalFormId) openForm(viewModalFormId, "fill");
                  setViewModalFormId(null);
                }}
              >
                Fill out
              </button>
            </>
          }
        >
          {viewModalFields.map((field) =>
            renderFillField(
              field,
              {},
              () => {},
              profileSignature,
              canSignEhsDirector,
              null,
              false,
              true,
              locationOptions,
            ),
          )}
        </FormViewModal>
      ) : null}

      {builderModal ? (
        <FormBuilderModal
          mode={builderModal.mode}
          title={builderModal.title}
          category={builderModal.category}
          fields={builderModal.fields}
          saving={savingDefinition}
          onChangeTitle={(value) =>
            setBuilderModal((prev) => (prev ? { ...prev, title: value } : prev))
          }
          onChangeCategory={(value) =>
            setBuilderModal((prev) => (prev ? { ...prev, category: value } : prev))
          }
          onChangeFields={(fields) =>
            setBuilderModal((prev) => (prev ? { ...prev, fields } : prev))
          }
          onSave={() => void saveBuilderModal()}
          onCancel={() => setBuilderModal(null)}
        />
      ) : null}
    </section>
  );
}
