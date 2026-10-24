"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { filterModulePages, ensureActiveModuleTab } from "@/lib/module-page-permissions";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { PersonnelSearchField } from "@/components/personnel-search-field";
import { WorkersCompCarrierCatalog } from "@/components/workers-comp-carrier-catalog";
import { WorkersCompCarrierSelect } from "@/components/workers-comp-carrier-select";
import { WorkersCompRestrictionsForm } from "@/components/workers-comp-restrictions-form";
import { OshaInlinePanel } from "@/components/osha-inline-panel";
import { WorkersCompFormsPanel } from "@/components/workers-comp-forms-panel";
import { isProducersRiceMillTenant } from "@/lib/producers-mvr-policy";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { describeCronExpression, REPORT_SCHEDULE_TIMEZONE } from "@/lib/report-schedule-friendly";
import {
  createSavedReport,
  createSchedule,
  fetchLibraryReports,
  fetchSchedules,
  patchSchedule,
  WC_WEEKLY_STATUS_DEFAULT_CRON,
  WC_WEEKLY_STATUS_REPORT_KEY,
  type ReportScheduleRow,
} from "@/lib/reporting-api";
import { personNameDisplay } from "@/lib/person-name-display";
import {
  accommodationsHasContent,
  EMPTY_WC_ACCOMMODATIONS,
  formatAccommodationsDetailLines,
  type WorkersCompAccommodations,
} from "@/lib/wc-restrictions-accommodations";
import {
  EMPTY_WC_CLAIM,
  EMPTY_WC_SUMMARY,
  EMPTY_WC_WEEKLY_STATUS_SETTINGS,
  WC_API,
  buildWorkersCompNextActions,
  formatWcDueDate,
  WC_NEXT_ACTION_RULES,
  incidentHref,
  normalizeThursdayWeekOf,
  parseWcDetailTab,
  parseWcEmailRecipients,
  parseWcModuleTab,
  personnelFileHref,
  returnToWorkCases,
  sortWorkersCompCasesForList,
  thursdayWeekOf,
  toWorkersCompCase,
  toWorkersCompCases,
  toWorkersCompSummary,
  toWorkersCompWeeklyStatusSettings,
  toWorkersCompWeeklyUpdatesPayload,
  uniqueWorkersFromCases,
  wcCaseStatusOptions,
  wcNormalizeSeverity,
  wcSeverityHelp,
  wcSeverityOptions,
  WC_MODULE_TAB_META,
  WC_MODULE_TABS,
  WC_WORK_STATUS_OPTIONS,
  WC_WORKFLOW_STAGES,
  wcCaseHref,
  wcClaimNumber,
  wcModuleHref,
  wcPriorityBadgeClass,
  wcStatusBadgeClass,
  wcEnumLabel,
  wcSummaryTiles,
  weeklyUpdateStatusBadgeClass,
  weeklyUpdateStatusLabel,
  workersCompPrintFilename,
  type WcDetailTab,
  type WcModuleTab,
  type WorkersCompCarrier,
  type WorkersCompCase,
  type WorkersCompClaimSummary,
  type WorkersCompSummary,
  type WorkersCompWeeklyStatusSettings,
  type WorkersCompWeeklyUpdatesPayload,
} from "@/lib/workers-comp-module";
import {
  INCIDENTS_API,
  incidentPlaceLocation,
  toIncidentRecords,
  type IncidentRecord,
} from "@/lib/incidents-module";

type ListResponse = {
  items?: unknown[];
  summary?: unknown;
};

function incidentSelectLabel(
  incident: Pick<IncidentRecord, "title" | "dateOccurred" | "personAffected">,
): string {
  const title = incident.title.trim();
  if (title) return title;
  const date = (incident.dateOccurred || "").slice(0, 10);
  const person = incident.personAffected.trim();
  return [date, person].filter(Boolean).join(" · ") || "Untitled incident";
}

/**
 * Dedicated Workers' Comp workspace under Incident & Claims.
 */
export function WorkersCompWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.workers_comp.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.workers_comp.manage") || permissions.has("industrial.admin");
  const canAdminCarriers = permissions.has("industrial.admin");
  // Producers paper forms (injury guidelines, HIPAA authorization); the API enforces this too.
  const activeTenant =
    me?.tenants?.find((tenant) => tenant.tenantId === me.tenantId) ?? me?.tenants?.[0];
  const hasProducersForms = isProducersRiceMillTenant(
    activeTenant?.slug,
    activeTenant?.displayName,
  );
  const canViewOsha =
    permissions.has("industrial.osha.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManageOsha =
    permissions.has("industrial.osha.manage") || permissions.has("industrial.admin");
  const canMedicalView =
    permissions.has("industrial.workers_comp.medical.view") ||
    permissions.has("industrial.workers_comp.medical.manage") ||
    permissions.has("industrial.admin");
  const canMedicalManage =
    permissions.has("industrial.workers_comp.medical.manage") ||
    permissions.has("industrial.admin");

  const selectedId = searchParams.get("id") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const viewParam = searchParams.get("view");
  const view: WcModuleTab = selectedId && !viewParam ? "cases" : parseWcModuleTab(viewParam);
  const [detailTab, setDetailTab] = useState<WcDetailTab>(() =>
    parseWcDetailTab(searchParams.get("tab")),
  );
  const [cases, setCases] = useState<WorkersCompCase[]>([]);
  const [summary, setSummary] = useState<WorkersCompSummary>(EMPTY_WC_SUMMARY);
  const [detail, setDetail] = useState<WorkersCompCase | null>(null);
  const [carriers, setCarriers] = useState<WorkersCompCarrier[]>([]);
  const [incidentOptions, setIncidentOptions] = useState<IncidentRecord[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [form, setForm] = useState({
    workerName: "",
    personnelId: "",
    dateOfBirth: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    gender: "",
    incidentId: "",
    caseNumber: "",
    status: "ACTIVE",
    severity: "moderate",
    workflowStage: "INTAKE",
    locationText: "",
    notes: "",
    daysAway: "",
    restrictedDays: "",
    claim: { ...EMPTY_WC_CLAIM } as WorkersCompClaimSummary,
  });
  const [workStatusForm, setWorkStatusForm] = useState({
    status: "RESTRICTED",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [restrictionForm, setRestrictionForm] = useState<{
    startDate: string;
    endDate: string;
    status: string;
    accommodations: WorkersCompAccommodations;
  }>({
    startDate: "",
    endDate: "",
    status: "ACTIVE",
    accommodations: { ...EMPTY_WC_ACCOMMODATIONS },
  });
  const [medicalForm, setMedicalForm] = useState({
    appointmentDate: "",
    provider: "",
    providerSpecialty: "",
    diagnosis: "",
    treatment: "",
    medication: "",
    notes: "",
  });
  const [noteEdit, setNoteEdit] = useState<{
    kind: "medical";
    id: string;
    notes: string;
  } | null>(null);
  const [editingMedicalId, setEditingMedicalId] = useState<string | null>(null);
  const [weeklySettings, setWeeklySettings] = useState<WorkersCompWeeklyStatusSettings>(
    EMPTY_WC_WEEKLY_STATUS_SETTINGS,
  );
  const [weeklyEmailDraft, setWeeklyEmailDraft] = useState("");
  const [showOverdueHelp, setShowOverdueHelp] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyPreviewLoading, setWeeklyPreviewLoading] = useState(false);
  const [weeklyPreview, setWeeklyPreview] = useState<{
    subject: string;
    htmlBody: string;
    generatedAt: string;
  } | null>(null);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<ReportScheduleRow | null>(null);
  const weeklyRecipients = weeklySchedule
    ? (weeklySchedule.recipients ?? []).map((r) => r.email).filter((email) => email.includes("@"))
    : weeklySettings.recipients;
  const [embeddedOshaCaseId, setEmbeddedOshaCaseId] = useState<string | null>(null);
  const [weeklyWeekOf, setWeeklyWeekOf] = useState(() => thursdayWeekOf());
  const [weeklyUpdates, setWeeklyUpdates] = useState<WorkersCompWeeklyUpdatesPayload>(() =>
    toWorkersCompWeeklyUpdatesPayload(null),
  );
  const [weeklyNotesDraft, setWeeklyNotesDraft] = useState<Record<string, string>>({});
  const [weeklySavingId, setWeeklySavingId] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const navigate = useCallback(
    (next: WcModuleTab, extras: Record<string, string> = {}) => {
      router.push(wcModuleHref(next, extras));
    },
    [router],
  );

  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: WC_MODULE_TABS,
        moduleCode: "WORKERS_COMP",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );

  useEffect(() => {
    const next = ensureActiveModuleTab(
      view,
      visibleTabs.map((t) => t.id),
      "dashboard",
    );
    if (next !== view) navigate(next);
  }, [view, visibleTabs, navigate]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "500" });
      if (view === "cases" && statusFilter) params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const data = await apiGet<ListResponse>(`${WC_API}?${params.toString()}`);
      setCases(sortWorkersCompCasesForList(toWorkersCompCases(data.items)));
      setSummary(toWorkersCompSummary(data.summary));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load workers' comp cases");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, view]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      const data = await apiGet<unknown>(`${WC_API}/${encodeURIComponent(id)}`);
      setDetail(toWorkersCompCase(data));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load case");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAdminCarriers && detailTab === "carrier" && selectedId) {
      navigate("cases", { id: selectedId, tab: "overview" });
    }
  }, [canAdminCarriers, detailTab, selectedId, navigate]);

  const loadCarriers = useCallback(async () => {
    try {
      const data = await apiGet<{ items?: WorkersCompCarrier[] }>(`${WC_API}/carriers`);
      setCarriers(Array.isArray(data.items) ? data.items : []);
    } catch {
      setCarriers([]);
    }
  }, []);

  const loadWeeklySettings = useCallback(async () => {
    try {
      const data = await apiGet<unknown>(`${WC_API}/settings`);
      setWeeklySettings(toWorkersCompWeeklyStatusSettings(data));
    } catch {
      setWeeklySettings(EMPTY_WC_WEEKLY_STATUS_SETTINGS);
    }
    try {
      const schedules = await fetchSchedules();
      setWeeklySchedule(
        schedules.items.find((s) => s.sourceKey === WC_WEEKLY_STATUS_REPORT_KEY) ?? null,
      );
    } catch {
      setWeeklySchedule(null);
    }
  }, []);

  const loadWeeklyUpdates = useCallback(async (weekOf: string) => {
    setWeeklyLoading(true);
    try {
      const params = new URLSearchParams({ weekOf: normalizeThursdayWeekOf(weekOf) });
      const data = await apiGet<unknown>(`${WC_API}/weekly-updates?${params.toString()}`);
      const payload = toWorkersCompWeeklyUpdatesPayload(data);
      setWeeklyUpdates(payload);
      setWeeklyWeekOf(payload.weekOf);
      const drafts: Record<string, string> = {};
      for (const item of payload.items) {
        drafts[item.caseId] = item.notes;
      }
      setWeeklyNotesDraft(drafts);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load weekly updates");
      setWeeklyUpdates(toWorkersCompWeeklyUpdatesPayload(null));
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  const saveWeeklyUpdate = useCallback(
    async (caseId: string) => {
      const notes = (weeklyNotesDraft[caseId] ?? "").trim();
      if (!notes) {
        setError("Status notes are required for each open case");
        return;
      }
      setWeeklySavingId(caseId);
      setError(null);
      try {
        await apiSend(`${WC_API}/${encodeURIComponent(caseId)}/weekly-updates`, "PUT", {
          weekOf: weeklyWeekOf,
          notes,
        });
        await loadWeeklyUpdates(weeklyWeekOf);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to save weekly update");
      } finally {
        setWeeklySavingId(null);
      }
    },
    [weeklyNotesDraft, weeklyWeekOf, loadWeeklyUpdates],
  );

  const loadIncidentOptions = useCallback(async () => {
    if (!canManage) return;
    try {
      const items: unknown[] = [];
      let page = 1;
      while (page <= 20) {
        const res = await apiGet<ListResponse>(
          `${INCIDENTS_API}?${new URLSearchParams({
            page: String(page),
            pageSize: "100",
          }).toString()}`,
        );
        const batch = res.items ?? [];
        items.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      const records = toIncidentRecords(items).sort((a, b) =>
        (b.dateOccurred || b.createdAt).localeCompare(a.dateOccurred || a.createdAt),
      );
      setIncidentOptions(records);
    } catch {
      setIncidentOptions([]);
    }
  }, [canManage]);

  useEffect(() => {
    if (canView) void loadList();
  }, [canView, loadList]);

  useEffect(() => {
    if (canManage && (showCreate || Boolean(selectedId))) void loadIncidentOptions();
  }, [canManage, showCreate, selectedId, loadIncidentOptions]);

  useEffect(() => {
    if (canView && selectedId) void loadDetail(selectedId);
    else setDetail(null);
    setNoteEdit(null);
  }, [canView, selectedId, loadDetail]);

  useEffect(() => {
    setDetailTab(parseWcDetailTab(searchParams.get("tab")));
    setNoteEdit(null);
  }, [searchParams]);

  useEffect(() => {
    if (canView) void loadCarriers();
  }, [canView, loadCarriers]);

  useEffect(() => {
    if (canView && view === "settings") void loadWeeklySettings();
  }, [canView, loadWeeklySettings, view]);

  useEffect(() => {
    if (canView && (view === "weekly-updates" || view === "dashboard")) {
      void loadWeeklyUpdates(weeklyWeekOf);
    }
  }, [canView, view, weeklyWeekOf, loadWeeklyUpdates]);

  const tiles = useMemo(() => wcSummaryTiles(summary), [summary]);
  const nextActions = useMemo(() => buildWorkersCompNextActions(cases), [cases]);
  const overdueActionCount = useMemo(
    () => nextActions.filter((action) => action.overdue).length,
    [nextActions],
  );
  const employees = useMemo(() => uniqueWorkersFromCases(cases), [cases]);
  const rtwCases = useMemo(() => returnToWorkCases(cases), [cases]);
  const activeTabMeta = WC_MODULE_TAB_META[view];
  const costTotals = useMemo(() => {
    let daysAway = 0;
    let restrictedDays = 0;
    for (const c of cases) {
      if (c.status.toUpperCase() === "CLOSED" || c.status.toUpperCase() === "ARCHIVED") continue;
      daysAway += c.daysAway ?? 0;
      restrictedDays += c.restrictedDays ?? 0;
    }
    return { daysAway, restrictedDays, openClaims: summary.open };
  }, [cases, summary.open]);

  function openCase(id: string, nextTab: WcDetailTab = "overview") {
    setEmbeddedOshaCaseId(null);
    navigate("cases", { id, tab: nextTab });
  }

  async function persistOverviewCase(): Promise<WorkersCompCase | null> {
    if (!canManage || !detail) return null;
    const updated = await apiSend<WorkersCompCase>(
      `${WC_API}/${encodeURIComponent(detail.id)}`,
      "PATCH",
      {
        status: detail.status,
        severity: detail.severity,
        workflowStage: detail.workflowStage,
        personnelId: detail.personnelId,
        workerName: detail.workerName,
        dateOfBirth: detail.dateOfBirth || undefined,
        street: detail.street || undefined,
        city: detail.city || undefined,
        state: detail.state || undefined,
        zip: detail.zip || undefined,
        gender: detail.gender || undefined,
        incidentId: detail.incidentId,
        caseNumber: detail.caseNumber,
        daysAway: detail.daysAway,
        restrictedDays: detail.restrictedDays,
        claimSummary: {
          ...detail.claimSummary,
          claimNumber: detail.caseNumber || detail.claimSummary.claimNumber,
        },
        notes: detail.notes,
        locationText: detail.locationText,
        oshaRecordable: detail.oshaRecordable,
        oshaPrivacyCase: detail.oshaPrivacyCase,
        oshaJobTitle: detail.oshaJobTitle,
        oshaIllnessCategory: detail.oshaIllnessCategory,
        oshaCaseOutcome: detail.oshaCaseOutcome,
      },
    );
    const mapped = toWorkersCompCase(updated) ?? detail;
    setDetail(mapped);
    await loadList();
    return mapped;
  }

  async function onSaveOverview(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !detail) return;
    setSaving(true);
    setError(null);
    try {
      await persistOverviewCase();
      setEmbeddedOshaCaseId(null);
      navigate("cases");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save case");
    } finally {
      setSaving(false);
    }
  }

  async function continueToOshaReport() {
    if (!canManage || !detail) return;
    if (!detail.incidentId) {
      setError("Link an injury incident on this case before continuing to OSHA.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextDetail = detail.oshaRecordable ? detail : { ...detail, oshaRecordable: true };
      if (!detail.oshaRecordable) setDetail(nextDetail);
      // Persist with recordable forced on (state update may not have flushed).
      const updated = await apiSend<WorkersCompCase>(
        `${WC_API}/${encodeURIComponent(detail.id)}`,
        "PATCH",
        {
          status: nextDetail.status,
          severity: nextDetail.severity,
          workflowStage: nextDetail.workflowStage,
          personnelId: nextDetail.personnelId,
          workerName: nextDetail.workerName,
          dateOfBirth: nextDetail.dateOfBirth || undefined,
          street: nextDetail.street || undefined,
          city: nextDetail.city || undefined,
          state: nextDetail.state || undefined,
          zip: nextDetail.zip || undefined,
          gender: nextDetail.gender || undefined,
          incidentId: nextDetail.incidentId,
          caseNumber: nextDetail.caseNumber,
          daysAway: nextDetail.daysAway,
          restrictedDays: nextDetail.restrictedDays,
          claimSummary: {
            ...nextDetail.claimSummary,
            claimNumber: nextDetail.caseNumber || nextDetail.claimSummary.claimNumber,
          },
          notes: nextDetail.notes,
          locationText: nextDetail.locationText,
          oshaRecordable: true,
          oshaPrivacyCase: nextDetail.oshaPrivacyCase,
          oshaJobTitle: nextDetail.oshaJobTitle,
          oshaIllnessCategory: nextDetail.oshaIllnessCategory,
          oshaCaseOutcome: nextDetail.oshaCaseOutcome,
        },
      );
      const mapped = toWorkersCompCase(updated) ?? nextDetail;
      setDetail(mapped);
      await loadList();
      const oshaId = mapped.oshaCaseId?.trim();
      if (!oshaId) {
        setError(
          "Case saved, but an OSHA Form 300 entry was not created. Confirm a linked injury incident and try again.",
        );
        return;
      }
      if (!canViewOsha) {
        setError("OSHA case was created, but you do not have permission to view OSHA cases.");
        return;
      }
      setEmbeddedOshaCaseId(oshaId);
      window.setTimeout(() => {
        document.getElementById("osha-inline-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save case and open OSHA");
    } finally {
      setSaving(false);
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiSend<WorkersCompCase>(WC_API, "POST", {
        workerName: form.workerName,
        personnelId: form.personnelId || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        street: form.street || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip: form.zip || undefined,
        gender: form.gender || undefined,
        incidentId: form.incidentId || undefined,
        ...(form.caseNumber.trim() ? { caseNumber: form.caseNumber.trim() } : {}),
        status: form.status,
        severity: form.severity,
        workflowStage: form.workflowStage,
        locationText: form.locationText,
        notes: form.notes,
        daysAway: form.daysAway === "" ? undefined : Number(form.daysAway),
        restrictedDays: form.restrictedDays === "" ? undefined : Number(form.restrictedDays),
        claimSummary: {
          ...form.claim,
          claimNumber: form.caseNumber.trim() || form.claim.claimNumber || "",
        },
      });
      setShowCreate(false);
      setForm({
        workerName: "",
        personnelId: "",
        dateOfBirth: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        gender: "",
        incidentId: "",
        caseNumber: "",
        status: "ACTIVE",
        severity: "moderate",
        workflowStage: "INTAKE",
        locationText: "",
        notes: "",
        daysAway: "",
        restrictedDays: "",
        claim: { ...EMPTY_WC_CLAIM },
      });
      await loadList();
      if (created?.id) openCase(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create case");
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!canManage || !detail) return;
    setSaving(true);
    try {
      await apiSend(`${WC_API}/${encodeURIComponent(detail.id)}/archive`, "POST", {});
      setEmbeddedOshaCaseId(null);
      navigate("cases");
      await loadList();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to archive case");
    } finally {
      setSaving(false);
    }
  }

  async function loadWorkersCompPrintableHtml(caseId: string): Promise<string | null> {
    setError(null);
    try {
      const data = await apiGet<{ html: string; title?: string }>(
        `${WC_API}/${encodeURIComponent(caseId)}/printable`,
      );
      return typeof data.html === "string" ? data.html : null;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load printable claim");
      return null;
    }
  }

  async function printWorkersCompCase(record: WorkersCompCase) {
    setPrinting(true);
    try {
      const html = await loadWorkersCompPrintableHtml(record.id);
      if (!html) return;
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) setError(blocked);
    } finally {
      setPrinting(false);
    }
  }

  async function downloadWorkersCompPrintable(record: WorkersCompCase) {
    setPrinting(true);
    try {
      const html = await loadWorkersCompPrintableHtml(record.id);
      if (!html) return;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = workersCompPrintFilename(record);
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setPrinting(false);
    }
  }

  function resetMedicalForm() {
    setMedicalForm({
      appointmentDate: "",
      provider: "",
      providerSpecialty: "",
      diagnosis: "",
      treatment: "",
      medication: "",
      notes: "",
    });
    setRestrictionForm({
      startDate: "",
      endDate: "",
      status: "ACTIVE",
      accommodations: { ...EMPTY_WC_ACCOMMODATIONS },
    });
    setWorkStatusForm({ status: "RESTRICTED", startDate: "", endDate: "", notes: "" });
    setEditingMedicalId(null);
    setNoteEdit(null);
  }

  function beginEditMedical(encounter: NonNullable<WorkersCompCase["medical"]>[number]) {
    setEditingMedicalId(encounter.id);
    setNoteEdit(null);
    setMedicalForm({
      appointmentDate: encounter.appointmentDate ?? "",
      provider: encounter.provider ?? "",
      providerSpecialty: encounter.providerSpecialty ?? "",
      diagnosis: encounter.diagnosis ?? "",
      treatment: encounter.treatment ?? "",
      medication: encounter.medication ?? "",
      notes: encounter.notes ?? "",
    });
    setRestrictionForm({
      startDate: encounter.workStatus?.startDate ?? encounter.appointmentDate ?? "",
      endDate: encounter.workStatus?.endDate ?? "",
      status: "ACTIVE",
      accommodations: encounter.accommodations
        ? { ...encounter.accommodations }
        : { ...EMPTY_WC_ACCOMMODATIONS },
    });
    setWorkStatusForm({
      status: encounter.workStatus?.status || "RESTRICTED",
      startDate: encounter.workStatus?.startDate ?? encounter.appointmentDate ?? "",
      endDate: encounter.workStatus?.endDate ?? "",
      notes: encounter.workStatus?.notes ?? "",
    });
  }

  async function saveMedical(event: FormEvent) {
    event.preventDefault();
    if (!canMedicalManage || !detail) return;
    setSaving(true);
    setError(null);
    try {
      const visitStart =
        medicalForm.appointmentDate || restrictionForm.startDate || workStatusForm.startDate || "";
      const visitEnd = restrictionForm.endDate || workStatusForm.endDate || "";
      const payload = {
        ...medicalForm,
        appointmentDate: visitStart || medicalForm.appointmentDate,
        startDate: visitStart || undefined,
        endDate: visitEnd || undefined,
        ...(accommodationsHasContent(restrictionForm.accommodations)
          ? { accommodations: restrictionForm.accommodations }
          : { accommodations: EMPTY_WC_ACCOMMODATIONS }),
        workStatus: {
          status: workStatusForm.status || "RESTRICTED",
          startDate: visitStart || undefined,
          endDate: visitEnd || undefined,
          notes: workStatusForm.notes || undefined,
        },
      };
      if (editingMedicalId) {
        await apiSend(
          `${WC_API}/${encodeURIComponent(detail.id)}/medical/${encodeURIComponent(editingMedicalId)}`,
          "PATCH",
          payload,
        );
      } else {
        await apiSend(`${WC_API}/${encodeURIComponent(detail.id)}/medical`, "POST", payload);
      }
      resetMedicalForm();
      await loadDetail(detail.id);
      await loadList();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : editingMedicalId
            ? "Failed to save medical encounter"
            : "Failed to add medical encounter",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMedicalNotes() {
    if (!detail || noteEdit?.kind !== "medical") return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(
        `${WC_API}/${encodeURIComponent(detail.id)}/medical/${encodeURIComponent(noteEdit.id)}`,
        "PATCH",
        {
          notes: noteEdit.notes,
        },
      );
      setNoteEdit(null);
      await loadDetail(detail.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update medical notes");
    } finally {
      setSaving(false);
    }
  }

  async function addWeeklyRecipient(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const parsed = parseWcEmailRecipients(weeklyEmailDraft);
    if (parsed.length === 0) {
      setError("Enter one or more valid email addresses");
      return;
    }
    const recipients = [...weeklyRecipients];
    for (const email of parsed) {
      if (!recipients.includes(email)) recipients.push(email);
    }
    const addedCount = recipients.length - weeklyRecipients.length;
    if (addedCount === 0) {
      setWeeklyEmailDraft("");
      setWeeklyMessage("Those emails are already on the list");
      return;
    }
    setWeeklyBusy(true);
    setWeeklyMessage(null);
    setError(null);
    try {
      await saveWeeklyRecipients(recipients);
      setWeeklyEmailDraft("");
      setWeeklyMessage(
        addedCount === 1 ? `Added ${parsed[0]}` : `Added ${addedCount} emails to the list`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to add email");
    } finally {
      setWeeklyBusy(false);
    }
  }

  /** Recipients live on the Reporting schedule once it exists; before that, on WC settings. */
  async function saveWeeklyRecipients(next: string[]) {
    if (weeklySchedule) {
      const markers = (weeklySchedule.recipients ?? []).filter((r) => !r.email.includes("@"));
      await patchSchedule(weeklySchedule.id, {
        recipients: [
          ...next.map((email) => ({ email })),
          ...markers.map((r) => ({ email: r.email })),
        ],
      });
      await loadWeeklySettings();
      return;
    }
    const data = await apiSend<unknown>(`${WC_API}/settings`, "PATCH", { recipients: next });
    setWeeklySettings(toWorkersCompWeeklyStatusSettings(data));
  }

  async function setWeeklyEnabled(enabled: boolean) {
    if (!canManage) return;
    setWeeklyBusy(true);
    setWeeklyMessage(null);
    setError(null);
    try {
      if (weeklySchedule) {
        await patchSchedule(weeklySchedule.id, { enabled });
      } else if (enabled) {
        if (weeklyRecipients.length === 0) {
          setError("Add at least one recipient before turning on the weekly email");
          return;
        }
        const library = await fetchLibraryReports();
        const existing = library.items.find(
          (r) => r.origin === "saved" && r.id && r.sourceKey === WC_WEEKLY_STATUS_REPORT_KEY,
        );
        const definitionId =
          existing?.id ??
          (
            await createSavedReport({
              name: "Workers' Comp Weekly Status",
              sourceKey: WC_WEEKLY_STATUS_REPORT_KEY,
              payloadJson: {},
            })
          ).id;
        await createSchedule({
          reportDefinitionId: definitionId,
          name: "Workers' Comp Weekly Status",
          cronExpression: WC_WEEKLY_STATUS_DEFAULT_CRON,
          timezone: REPORT_SCHEDULE_TIMEZONE,
          format: "pdf",
          recipients: weeklyRecipients.map((email) => ({ email })),
          enabled: true,
        });
      }
      await loadWeeklySettings();
      setWeeklyMessage(enabled ? "Weekly status email turned on" : "Weekly status email paused");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update weekly status email");
    } finally {
      setWeeklyBusy(false);
    }
  }

  async function removeWeeklyRecipient(email: string) {
    if (!canManage) return;
    setWeeklyBusy(true);
    setWeeklyMessage(null);
    setError(null);
    try {
      await saveWeeklyRecipients(weeklyRecipients.filter((r) => r !== email));
      setWeeklyMessage(`Removed ${email}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to remove email");
    } finally {
      setWeeklyBusy(false);
    }
  }

  async function previewWeeklyStatus() {
    setWeeklyPreviewLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ subject?: string; htmlBody?: string }>(
        `${WC_API}/weekly-status/preview`,
      );
      setWeeklyPreview({
        subject: data.subject ?? "Workers' Comp weekly status",
        htmlBody: data.htmlBody ?? "",
        generatedAt: new Date().toLocaleString(),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load weekly status preview");
    } finally {
      setWeeklyPreviewLoading(false);
    }
  }

  async function sendWeeklyStatusNow() {
    if (!canManage) return;
    setWeeklyBusy(true);
    setWeeklyMessage(null);
    setError(null);
    try {
      const data = await apiSend<{
        openCount?: number;
        acceptedCount?: number;
        recipientCount?: number;
        settings?: unknown;
        subject?: string;
        results?: Array<{ to?: string; accepted?: boolean; detail?: string }>;
      }>(`${WC_API}/weekly-status/send`, "POST", { recipients: weeklyRecipients });
      if (data.settings) {
        setWeeklySettings(toWorkersCompWeeklyStatusSettings(data.settings));
      } else {
        await loadWeeklySettings();
      }
      const accepted = data.acceptedCount ?? 0;
      const recipients = data.recipientCount ?? 0;
      if (accepted <= 0) {
        const detail =
          data.results?.map((r) => r.detail).find((d) => typeof d === "string" && d.trim()) ??
          "Email provider did not accept any messages";
        setError(`Failed to send weekly status email: ${detail}`);
        return;
      }
      setWeeklyMessage(
        `Sent to ${accepted} of ${recipients} recipients · ${data.openCount ?? 0} open cases`,
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to send weekly status email",
      );
    } finally {
      setWeeklyBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view workers&apos; compensation cases.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="wc-title"
      className="workers-comp-workspace"
      data-walkthrough="workers-comp-overview"
    >
      <ModuleWorkspaceHeader
        id="wc-title"
        eyebrow="Incident & Claims"
        title={moduleName}
        description={activeTabMeta.description}
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={view}
        onChange={(next) => navigate(next)}
        ariaLabel="Workers' compensation sections"
        tabPanelLabel={activeTabMeta.label}
      >
        {(view === "cases" && (selectedId || canManage)) || view === "osha" ? (
          <div className="d-flex flex-wrap justify-content-end gap-2 mb-3">
            {view === "cases" && selectedId ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => navigate("cases")}
              >
                Back to list
              </button>
            ) : null}
            {view === "cases" && canManage && !selectedId ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setShowCreate((v) => !v)}
              >
                {showCreate ? "Cancel" : "New case"}
              </button>
            ) : null}
            {view === "osha" ? (
              <Link className="btn btn-sm btn-outline-primary" href="/modules/osha/">
                Open OSHA module
              </Link>
            ) : null}
          </div>
        ) : null}

        {view === "dashboard" ? (
          <>
            <div className="d-flex flex-wrap gap-4 mb-4 pb-3 border-bottom">
              {tiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  className="btn btn-link text-decoration-none text-body p-0 text-start"
                  onClick={() =>
                    navigate(
                      "cases",
                      tile.id === "open"
                        ? { status: "ACTIVE" }
                        : tile.id === "closed"
                          ? { status: "CLOSED" }
                          : tile.id === "restricted" || tile.id === "lostTime"
                            ? { status: "ACTIVE" }
                            : {},
                    )
                  }
                >
                  <div className="text-muted text-uppercase small mb-1">{tile.label}</div>
                  <div className="fs-3 fw-semibold lh-1">{tile.value}</div>
                </button>
              ))}
              <button
                type="button"
                className="btn btn-link text-decoration-none text-body p-0 text-start"
                onClick={() => navigate("weekly-updates")}
              >
                <div className="text-muted text-uppercase small mb-1">Weekly updates remaining</div>
                <div
                  className={`fs-3 fw-semibold lh-1 ${
                    weeklyUpdates.summary.remaining > 0 ? "text-warning" : ""
                  }`}
                >
                  {weeklyUpdates.summary.remaining}
                </div>
              </button>
            </div>

            <div className="card border shadow-none wc-next-actions">
              <div className="card-header bg-transparent border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 px-3">
                <h6 className="mb-0 text-uppercase fw-semibold">Next actions</h6>
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <span className="text-muted small">
                    {nextActions.length} case{nextActions.length === 1 ? "" : "s"} needing follow-up
                    {overdueActionCount > 0 ? (
                      <>
                        {" · "}
                        <span className="text-danger fw-semibold">
                          {overdueActionCount} overdue
                        </span>
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none"
                    aria-expanded={showOverdueHelp}
                    aria-controls="wc-overdue-help"
                    onClick={() => setShowOverdueHelp((open) => !open)}
                  >
                    <i className="bx bx-info-circle me-1" aria-hidden />
                    How is overdue calculated?
                  </button>
                </div>
              </div>
              {showOverdueHelp ? (
                <div id="wc-overdue-help" className="border-bottom bg-lighter px-3 py-2 small">
                  <p className="mb-2">
                    An action is flagged <span className="badge bg-label-danger">OVERDUE</span> when
                    today is past its due date. Due dates are counted from the case&apos;s report
                    date (injury report, or when the case was created). The flag clears once the
                    case no longer matches the rule, for example after a claim number is added or
                    the case moves out of Intake.
                  </p>
                  <ul className="mb-0 ps-3">
                    {WC_NEXT_ACTION_RULES.map((rule) => (
                      <li key={rule.title}>
                        <span className="fw-semibold">{rule.title}:</span> {rule.rule}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {loading ? (
                <div className="card-body text-muted py-3">Loading…</div>
              ) : nextActions.length === 0 ? (
                <div className="card-body text-muted py-3">No open follow-ups right now.</div>
              ) : (
                <div className="list-group list-group-flush">
                  {nextActions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="list-group-item list-group-item-action wc-next-actions__item"
                      onClick={() => openCase(action.caseId)}
                    >
                      <div className="wc-next-actions__grid">
                        <div className="wc-next-actions__title min-w-0">
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className="fw-semibold text-truncate">{action.title}</span>
                            <span className={`badge ${wcPriorityBadgeClass(action.priority)}`}>
                              {action.priority}
                            </span>
                            {action.overdue ? (
                              <span
                                className="badge bg-label-danger"
                                title={`Due ${formatWcDueDate(action.dueDate)}`}
                              >
                                OVERDUE
                                {action.daysOverdue > 0
                                  ? ` · ${action.daysOverdue} day${action.daysOverdue === 1 ? "" : "s"}`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-muted small text-wrap mt-1">{action.reason}</div>
                        </div>
                        <div className="wc-next-actions__meta">
                          <div className="wc-next-actions__label">Claim #</div>
                          <div className="text-truncate">{action.claimNumber}</div>
                        </div>
                        <div className="wc-next-actions__meta">
                          <div className="wc-next-actions__label">EMPLOYEE</div>
                          <div className="text-truncate">{action.employee}</div>
                        </div>
                        <div className="wc-next-actions__meta">
                          <div className="wc-next-actions__label">Due date</div>
                          <div className={action.overdue ? "text-danger fw-semibold" : ""}>
                            {formatWcDueDate(action.dueDate)}
                          </div>
                        </div>
                        <i
                          className="bx bx-chevron-right fs-4 text-muted wc-next-actions__chevron"
                          aria-hidden
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {view === "weekly-updates" ? (
          <div className="card border shadow-none">
            <div className="card-header bg-transparent border-bottom py-3 px-3">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <h6 className="mb-1">Status notes due every Thursday</h6>
                  <p className="text-muted small mb-0">
                    Update notes for all open workers&apos; compensation cases for the week of{" "}
                    <strong>{formatWcDueDate(weeklyWeekOf)}</strong>.
                  </p>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <label className="small text-muted mb-0" htmlFor="wc-weekly-week">
                    Week of (Thursday)
                  </label>
                  <input
                    id="wc-weekly-week"
                    type="date"
                    className="form-control form-control-sm"
                    style={{ width: "10.5rem" }}
                    value={weeklyWeekOf}
                    onChange={(ev) => setWeeklyWeekOf(normalizeThursdayWeekOf(ev.target.value))}
                  />
                </div>
              </div>
              <div className="d-flex flex-wrap gap-3 mt-3">
                <span className="badge bg-label-success">
                  Complete {weeklyUpdates.summary.complete}
                </span>
                <span className="badge bg-label-warning">Due {weeklyUpdates.summary.due}</span>
                <span className="badge bg-label-danger">
                  Overdue {weeklyUpdates.summary.overdue}
                </span>
                <span className="text-muted small align-self-center">
                  {weeklyUpdates.summary.remaining} remaining of {weeklyUpdates.summary.total} open
                  cases
                </span>
              </div>
              <p className="text-muted small mb-0 mt-2">
                <i className="bx bx-info-circle me-1" aria-hidden />
                <strong>Due</strong> means the Thursday for this week hasn&apos;t arrived yet.{" "}
                <strong>Overdue</strong> means it is Thursday or later and no status note has been
                saved for that week. Saving a note marks the case Complete.
              </p>
            </div>
            {weeklyLoading ? (
              <div className="card-body text-muted">Loading open cases…</div>
            ) : weeklyUpdates.items.length === 0 ? (
              <div className="card-body text-muted">No open cases require weekly updates.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead>
                    <tr>
                      <th scope="col">Worker</th>
                      <th scope="col">Claim #</th>
                      <th scope="col">Status</th>
                      <th scope="col">Update</th>
                      <th scope="col" style={{ minWidth: "18rem" }}>
                        Status notes
                      </th>
                      <th scope="col" className="text-end">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyUpdates.items.map((item) => (
                      <tr key={item.caseId}>
                        <td>
                          <Link href={wcCaseHref(item.caseId)} className="fw-semibold">
                            {personNameDisplay(item.workerName)}
                          </Link>
                        </td>
                        <td>{item.claimNumber}</td>
                        <td>
                          <span className={`badge ${wcStatusBadgeClass(item.caseStatus)}`}>
                            {wcEnumLabel(item.caseStatus)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${weeklyUpdateStatusBadgeClass(item.status)}`}>
                            {weeklyUpdateStatusLabel(item.status)}
                          </span>
                          {item.priorWeekOf && item.priorNotes ? (
                            <div
                              className="text-muted small mt-1 text-truncate"
                              style={{ maxWidth: "12rem" }}
                            >
                              Prior ({formatWcDueDate(item.priorWeekOf)}): {item.priorNotes}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <textarea
                            className="form-control form-control-sm"
                            rows={2}
                            value={weeklyNotesDraft[item.caseId] ?? ""}
                            disabled={!canManage || weeklySavingId === item.caseId}
                            placeholder="Enter this week’s status notes"
                            onChange={(ev) =>
                              setWeeklyNotesDraft((prev) => ({
                                ...prev,
                                [item.caseId]: ev.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="text-end">
                          {canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={
                                weeklySavingId === item.caseId ||
                                !(weeklyNotesDraft[item.caseId] ?? "").trim()
                              }
                              onClick={() => void saveWeeklyUpdate(item.caseId)}
                            >
                              {weeklySavingId === item.caseId ? "Saving…" : "Save"}
                            </button>
                          ) : (
                            <span className="text-muted small">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {view === "cases" && !selectedId ? (
          <>
            {showCreate && canManage ? (
              <div className="card mb-4">
                <div className="card-header">
                  <h6 className="card-title mb-0">Create workers&apos; comp case</h6>
                </div>
                <div className="card-body">
                  <form className="row g-3" onSubmit={onCreate}>
                    <div className="col-md-6">
                      <PersonnelSearchField
                        id="wc-field-worker"
                        label="Worker"
                        required
                        hint="Search Employee Profiles by last name or EMPLOYEE #. Visitors can be typed as free text."
                        personnelId={form.personnelId}
                        displayName={form.workerName}
                        allowUnlinkedText
                        onLinkedChange={(selection) =>
                          setForm((f) => {
                            if (!selection) {
                              return {
                                ...f,
                                personnelId: "",
                                workerName: "",
                                dateOfBirth: "",
                                street: "",
                                city: "",
                                state: "",
                                zip: "",
                                gender: "",
                              };
                            }
                            return {
                              ...f,
                              personnelId: selection.personnelId,
                              workerName: selection.displayName,
                              dateOfBirth: selection.dateOfBirth || f.dateOfBirth,
                              street: selection.street || f.street,
                              city: selection.city || f.city,
                              state: selection.state || f.state,
                              zip: selection.zip || f.zip,
                              gender: selection.gender || f.gender,
                            };
                          })
                        }
                        onUnlinkedTextChange={(value) =>
                          setForm((f) => ({ ...f, personnelId: "", workerName: value }))
                        }
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-dob">
                        Date of birth
                      </label>
                      <input
                        id="wc-field-dob"
                        type="date"
                        className="form-control"
                        value={form.dateOfBirth}
                        onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                      />
                      <p className="text-muted small mb-0 mt-1">
                        Filled from the employee profile when linked.
                      </p>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="wc-field-street">
                        Street
                      </label>
                      <input
                        id="wc-field-street"
                        className="form-control"
                        value={form.street}
                        onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-city">
                        City
                      </label>
                      <input
                        id="wc-field-city"
                        className="form-control"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-1">
                      <label className="form-label" htmlFor="wc-field-state">
                        State
                      </label>
                      <input
                        id="wc-field-state"
                        className="form-control"
                        value={form.state}
                        onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label" htmlFor="wc-field-zip">
                        ZIP
                      </label>
                      <input
                        id="wc-field-zip"
                        className="form-control"
                        value={form.zip}
                        onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-sex">
                        Sex
                      </label>
                      <select
                        id="wc-field-sex"
                        className="form-select"
                        value={form.gender}
                        onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                      >
                        <option value="">—</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-3">
                        Linked incident (optional)
                      </label>
                      <select
                        id="wc-field-3"
                        className="form-select"
                        value={form.incidentId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          const selected = incidentOptions.find((row) => row.id === nextId);
                          setForm((f) => ({
                            ...f,
                            incidentId: nextId,
                            ...(selected && !f.workerName.trim()
                              ? {
                                  workerName: selected.personAffected || f.workerName,
                                  personnelId: selected.personnelId || f.personnelId,
                                }
                              : {}),
                            ...(selected && !f.locationText.trim()
                              ? { locationText: incidentPlaceLocation(selected) || f.locationText }
                              : {}),
                            ...(selected && !f.claim.dateOfInjury
                              ? {
                                  claim: {
                                    ...f.claim,
                                    dateOfInjury: (selected.dateOccurred || "").slice(0, 10),
                                  },
                                }
                              : {}),
                          }));
                        }}
                      >
                        <option value="">— Select incident report —</option>
                        {incidentOptions.map((incident) => (
                          <option key={incident.id} value={incident.id}>
                            {incidentSelectLabel(incident)}
                          </option>
                        ))}
                      </select>
                      <p className="text-muted small mb-0 mt-1">
                        Shows the same title as the Incidents report.
                      </p>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-4">
                        Status
                      </label>
                      <select
                        id="wc-field-4"
                        className="form-select"
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        {wcCaseStatusOptions(form.status).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="wc-field-5">
                        Workflow
                      </label>
                      <select
                        id="wc-field-5"
                        className="form-select"
                        value={form.workflowStage}
                        onChange={(e) => setForm((f) => ({ ...f, workflowStage: e.target.value }))}
                      >
                        {WC_WORKFLOW_STAGES.map((s) => (
                          <option key={s} value={s}>
                            {wcEnumLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="wc-field-6">
                        Claim #
                      </label>
                      <input
                        id="wc-field-6"
                        className="form-control"
                        value={form.caseNumber}
                        onChange={(e) => setForm((f) => ({ ...f, caseNumber: e.target.value }))}
                        placeholder="Leave blank until assigned by insurance"
                      />
                      <p className="text-muted small mb-0 mt-1">
                        Enter manually once the insurance company issues the claim number.
                      </p>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="wc-field-7">
                        Date of injury
                      </label>
                      <input
                        id="wc-field-7"
                        type="date"
                        className="form-control"
                        value={form.claim.dateOfInjury}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            claim: { ...f.claim, dateOfInjury: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="wc-field-8">
                        Carrier
                      </label>
                      <WorkersCompCarrierSelect
                        id="wc-field-8"
                        carriers={carriers}
                        carrierId={form.claim.carrierId}
                        carrierName={form.claim.carrierName}
                        onChange={(next) =>
                          setForm((f) => ({
                            ...f,
                            claim: {
                              ...f.claim,
                              carrierId: next.carrierId,
                              carrierName: next.carrierName,
                            },
                          }))
                        }
                      />
                      {canAdminCarriers ? (
                        <p className="form-text mb-0">
                          Manage the carrier list under Claims and Carriers (admin only).
                        </p>
                      ) : carriers.length === 0 ? (
                        <p className="form-text mb-0 text-muted">
                          Ask an Industrial admin to add carriers to the catalog.
                        </p>
                      ) : null}
                    </div>
                    <div className="col-12">
                      <label className="form-label" htmlFor="wc-field-9">
                        Location / notes
                      </label>
                      <textarea
                        id="wc-field-9"
                        className="form-control"
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </div>
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary" disabled={saving}>
                        {saving ? "Creating…" : "Create case"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            <div className="card border shadow-none">
              <div className="card-header bg-transparent border-bottom d-flex flex-wrap gap-2 align-items-center justify-content-between py-3">
                <div className="d-flex flex-wrap gap-2 ms-auto">
                  <input
                    className="form-control form-control-sm"
                    style={{ minWidth: 180 }}
                    placeholder="Search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Search cases"
                  />
                  <select
                    className="form-select form-select-sm"
                    value={statusFilter}
                    onChange={(e) =>
                      navigate("cases", e.target.value ? { status: e.target.value } : {})
                    }
                    aria-label="Filter by status"
                  >
                    <option value="">All statuses</option>
                    {wcCaseStatusOptions(statusFilter).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-muted small px-3 mb-0">
                Open cases are listed first, then closed and archived by date (newest first).
              </p>
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Claim #</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-muted">
                          Loading…
                        </td>
                      </tr>
                    ) : cases.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-muted">
                          No workers&apos; comp cases yet.
                        </td>
                      </tr>
                    ) : (
                      cases.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link href={wcCaseHref(c.id)}>
                              {personNameDisplay(c.workerName, "—")}
                            </Link>
                            {c.personnelId ? (
                              <>
                                {" "}
                                <Link
                                  href={personnelFileHref(c.personnelId)}
                                  className="small text-muted"
                                >
                                  Profile
                                </Link>
                              </>
                            ) : null}
                          </td>
                          <td>{wcClaimNumber(c)}</td>
                          <td>
                            <span className={`badge ${wcStatusBadgeClass(c.status)}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>{c.updatedAt.slice(0, 10)}</td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => openCase(c.id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {view === "cases" && selectedId ? (
          detailLoading || !detail ? (
            <p className="text-muted" role="status">
              {detailLoading ? "Loading case…" : "Case not found."}
            </p>
          ) : (
            <>
              <div className="card mb-3">
                <div className="card-body d-flex flex-wrap justify-content-between gap-3">
                  <div>
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                      <h5 className="mb-0">{wcClaimNumber(detail)}</h5>
                      <span className={`badge ${wcStatusBadgeClass(detail.status)}`}>
                        {detail.status}
                      </span>
                    </div>
                    <p className="text-muted mb-0">
                      {detail.personnelId ? (
                        <Link href={personnelFileHref(detail.personnelId)}>
                          {personNameDisplay(detail.workerName, "Linked personnel")}
                        </Link>
                      ) : (
                        personNameDisplay(detail.workerName, "No personnel linked")
                      )}
                      {detail.incidentId ? (
                        <>
                          {" · "}
                          <Link href={incidentHref(detail.incidentId)}>
                            {(() => {
                              const linked = incidentOptions.find(
                                (row) => row.id === detail.incidentId,
                              );
                              return linked ? incidentSelectLabel(linked) : "Linked incident";
                            })()}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="d-flex flex-wrap gap-2 align-items-start">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => void printWorkersCompCase(detail)}
                      disabled={printing}
                    >
                      {printing ? "Preparing…" : "Print claim"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => void downloadWorkersCompPrintable(detail)}
                      disabled={printing}
                    >
                      Download HTML
                    </button>
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => void onArchive()}
                        disabled={saving}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="card-footer bg-transparent">
                  <ul className="nav nav-pills flex-wrap gap-1">
                    {(
                      [
                        ["overview", "Overview / claim"],
                        ["medical", "Medical"],
                      ] as Array<[WcDetailTab, string]>
                    )
                      .concat(hasProducersForms ? [["forms", "Forms"]] : [])
                      .concat(canAdminCarriers ? [["carrier", "Carriers"]] : [])
                      .map(([id, label]) => (
                        <li className="nav-item" key={id}>
                          <button
                            type="button"
                            className={`nav-link ${detailTab === id ? "active" : ""}`}
                            onClick={() => openCase(detail.id, id)}
                          >
                            {label}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {detailTab === "overview" ? (
                <>
                  <div className="card">
                    <div className="card-body">
                      <form id="wc-overview-form" className="row g-3" onSubmit={onSaveOverview}>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-10">
                            Status
                          </label>
                          <select
                            id="wc-field-10"
                            className="form-select"
                            value={detail.status}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, status: e.target.value })}
                          >
                            {wcCaseStatusOptions(detail.status).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-11">
                            Workflow stage
                          </label>
                          <select
                            id="wc-field-11"
                            className="form-select"
                            value={detail.workflowStage || "INTAKE"}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({ ...detail, workflowStage: e.target.value })
                            }
                          >
                            {WC_WORKFLOW_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {wcEnumLabel(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-12">
                            Severity
                          </label>
                          <select
                            id="wc-field-12"
                            className="form-select"
                            value={wcNormalizeSeverity(detail.severity)}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, severity: e.target.value })}
                          >
                            {!wcNormalizeSeverity(detail.severity) ? (
                              <option value="">Select severity</option>
                            ) : null}
                            {wcSeverityOptions(detail.severity).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {wcSeverityHelp(detail.severity) ? (
                            <div className="form-text">{wcSeverityHelp(detail.severity)}</div>
                          ) : null}
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-13">
                            Claim #
                          </label>
                          <input
                            id="wc-field-13"
                            className="form-control"
                            value={detail.caseNumber}
                            disabled={!canManage}
                            placeholder="Enter when received from insurance"
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                caseNumber: e.target.value,
                                claimSummary: {
                                  ...detail.claimSummary,
                                  claimNumber: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-14">
                            Carrier
                          </label>
                          <WorkersCompCarrierSelect
                            id="wc-field-14"
                            carriers={carriers}
                            carrierId={detail.claimSummary.carrierId}
                            carrierName={detail.claimSummary.carrierName}
                            disabled={!canManage}
                            onChange={(next) =>
                              setDetail({
                                ...detail,
                                claimSummary: {
                                  ...detail.claimSummary,
                                  carrierId: next.carrierId,
                                  carrierName: next.carrierName,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-15">
                            Adjuster
                          </label>
                          <input
                            id="wc-field-15"
                            className="form-control"
                            value={detail.claimSummary.adjuster}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                claimSummary: { ...detail.claimSummary, adjuster: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-16">
                            Date of injury
                          </label>
                          <input
                            id="wc-field-16"
                            type="date"
                            className="form-control"
                            value={detail.claimSummary.dateOfInjury}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                claimSummary: {
                                  ...detail.claimSummary,
                                  dateOfInjury: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-17">
                            Days away
                          </label>
                          <input
                            id="wc-field-17"
                            type="number"
                            className="form-control"
                            value={detail.daysAway ?? ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                daysAway: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="wc-field-18">
                            Restricted days
                          </label>
                          <input
                            id="wc-field-18"
                            type="number"
                            className="form-control"
                            value={detail.restrictedDays ?? ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                restrictedDays:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="col-md-6">
                          <PersonnelSearchField
                            id="wc-field-19"
                            label="Linked employee"
                            hint="Search Employee Profiles. Clears free-text worker name when unlinked."
                            disabled={!canManage}
                            personnelId={detail.personnelId ?? ""}
                            displayName={detail.workerName}
                            allowUnlinkedText
                            onLinkedChange={(selection) => {
                              if (!selection) {
                                setDetail({
                                  ...detail,
                                  personnelId: null,
                                  workerName: "",
                                  dateOfBirth: "",
                                  street: "",
                                  city: "",
                                  state: "",
                                  zip: "",
                                  gender: "",
                                });
                                return;
                              }
                              setDetail({
                                ...detail,
                                personnelId: selection.personnelId,
                                workerName: selection.displayName,
                                dateOfBirth: selection.dateOfBirth || detail.dateOfBirth,
                                street: selection.street || detail.street,
                                city: selection.city || detail.city,
                                state: selection.state || detail.state,
                                zip: selection.zip || detail.zip,
                                gender: selection.gender || detail.gender,
                              });
                            }}
                            onUnlinkedTextChange={(value) =>
                              setDetail({
                                ...detail,
                                personnelId: null,
                                workerName: value,
                              })
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label" htmlFor="wc-field-dob-detail">
                            Date of birth
                          </label>
                          <input
                            id="wc-field-dob-detail"
                            type="date"
                            className="form-control"
                            value={detail.dateOfBirth || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, dateOfBirth: e.target.value })}
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="wc-field-street-detail">
                            Street
                          </label>
                          <input
                            id="wc-field-street-detail"
                            className="form-control"
                            value={detail.street || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, street: e.target.value })}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label" htmlFor="wc-field-city-detail">
                            City
                          </label>
                          <input
                            id="wc-field-city-detail"
                            className="form-control"
                            value={detail.city || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, city: e.target.value })}
                          />
                        </div>
                        <div className="col-md-1">
                          <label className="form-label" htmlFor="wc-field-state-detail">
                            State
                          </label>
                          <input
                            id="wc-field-state-detail"
                            className="form-control"
                            value={detail.state || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, state: e.target.value })}
                          />
                        </div>
                        <div className="col-md-2">
                          <label className="form-label" htmlFor="wc-field-zip-detail">
                            ZIP
                          </label>
                          <input
                            id="wc-field-zip-detail"
                            className="form-control"
                            value={detail.zip || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, zip: e.target.value })}
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label" htmlFor="wc-field-sex-detail">
                            Sex
                          </label>
                          <select
                            id="wc-field-sex-detail"
                            className="form-select"
                            value={detail.gender || ""}
                            disabled={!canManage}
                            onChange={(e) => setDetail({ ...detail, gender: e.target.value })}
                          >
                            <option value="">—</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                          </select>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label" htmlFor="wc-field-20">
                            Linked incident
                          </label>
                          <select
                            id="wc-field-20"
                            className="form-select"
                            value={detail.incidentId ?? ""}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({ ...detail, incidentId: e.target.value || null })
                            }
                          >
                            <option value="">— None —</option>
                            {incidentOptions.map((incident) => (
                              <option key={incident.id} value={incident.id}>
                                {incidentSelectLabel(incident)}
                              </option>
                            ))}
                            {detail.incidentId &&
                            !incidentOptions.some((row) => row.id === detail.incidentId) ? (
                              <option value={detail.incidentId}>
                                Linked incident ({detail.incidentId.slice(0, 8)}…)
                              </option>
                            ) : null}
                          </select>
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="wc-field-21">
                            Body parts / claim notes
                          </label>
                          <textarea
                            id="wc-field-21"
                            className="form-control"
                            rows={2}
                            value={detail.claimSummary.bodyParts || detail.claimSummary.notes}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDetail({
                                ...detail,
                                claimSummary: {
                                  ...detail.claimSummary,
                                  bodyParts: e.target.value,
                                  notes: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-12">
                          <div className="border rounded p-3 bg-body-tertiary">
                            <div className="form-check mb-2">
                              <input
                                id="wc-osha-recordable"
                                className="form-check-input"
                                type="checkbox"
                                checked={detail.oshaRecordable}
                                disabled={!canManage}
                                onChange={(e) =>
                                  setDetail({
                                    ...detail,
                                    oshaRecordable: e.target.checked,
                                    oshaPrivacyCase: e.target.checked
                                      ? detail.oshaPrivacyCase
                                      : false,
                                  })
                                }
                              />
                              <label className="form-check-label" htmlFor="wc-osha-recordable">
                                OSHA recordable — autofill Form 300 from this case
                              </label>
                            </div>
                            {detail.oshaRecordable ? (
                              <div className="row g-3">
                                <div className="col-md-4">
                                  <div className="form-check mt-4">
                                    <input
                                      id="wc-osha-privacy"
                                      className="form-check-input"
                                      type="checkbox"
                                      checked={detail.oshaPrivacyCase}
                                      disabled={!canManage}
                                      onChange={(e) =>
                                        setDetail({
                                          ...detail,
                                          oshaPrivacyCase: e.target.checked,
                                        })
                                      }
                                    />
                                    <label className="form-check-label" htmlFor="wc-osha-privacy">
                                      Privacy case
                                    </label>
                                  </div>
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label" htmlFor="wc-osha-job">
                                    Job title (Form 300 col C)
                                  </label>
                                  <input
                                    id="wc-osha-job"
                                    className="form-control"
                                    value={detail.oshaJobTitle}
                                    disabled={!canManage}
                                    onChange={(e) =>
                                      setDetail({ ...detail, oshaJobTitle: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="col-md-4">
                                  <label className="form-label" htmlFor="wc-osha-illness">
                                    Classification (M)
                                  </label>
                                  <select
                                    id="wc-osha-illness"
                                    className="form-select"
                                    value={detail.oshaIllnessCategory || "1"}
                                    disabled={!canManage}
                                    onChange={(e) =>
                                      setDetail({
                                        ...detail,
                                        oshaIllnessCategory: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="1">(1) Injury</option>
                                    <option value="2">(2) Skin disorder</option>
                                    <option value="3">(3) Respiratory condition</option>
                                    <option value="4">(4) Poisoning</option>
                                    <option value="5">(5) Hearing loss</option>
                                    <option value="6">(6) All other illnesses</option>
                                  </select>
                                </div>
                                <div className="col-12">
                                  <p className="small text-muted mb-0">
                                    Outcome (G–J) is derived from days away / restricted days, then
                                    severity (Lost Time, Restricted). Minor (first aid) cases are
                                    not recordable. Requires a linked injury incident.{" "}
                                    {detail.oshaCaseId ? (
                                      <Link href="/modules/osha/">Open linked OSHA case</Link>
                                    ) : (
                                      "Continue creates or updates the OSHA Form 300 entry."
                                    )}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                  {canManage ? (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button
                        type="submit"
                        form="wc-overview-form"
                        className="btn btn-primary"
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save & Close"}
                      </button>
                      {detail.oshaRecordable ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={saving}
                          onClick={() => void continueToOshaReport()}
                        >
                          {saving ? "Saving…" : "Continue to OSHA report"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {embeddedOshaCaseId && detailTab === "overview" && canViewOsha ? (
                <OshaInlinePanel
                  caseId={embeddedOshaCaseId}
                  canManage={canManageOsha}
                  lockedWorkersCompClaim={wcClaimNumber(detail)}
                  onClose={() => setEmbeddedOshaCaseId(null)}
                />
              ) : null}

              {detailTab === "medical" ? (
                <div className="card">
                  <div className="card-body">
                    {!canMedicalView && !detail.medicalAllowed ? (
                      <p className="text-muted mb-0">
                        {detail.medicalDeniedReason ||
                          "Medical details require industrial.workers_comp.medical.view."}
                      </p>
                    ) : (
                      <>
                        {canMedicalManage ? (
                          <form className="row g-2 mb-4" onSubmit={saveMedical}>
                            <div className="col-md-3">
                              <input
                                type="date"
                                className="form-control"
                                value={medicalForm.appointmentDate}
                                onChange={(e) => {
                                  const appointmentDate = e.target.value;
                                  setMedicalForm((f) => ({ ...f, appointmentDate }));
                                  setWorkStatusForm((f) => ({
                                    ...f,
                                    startDate: appointmentDate || f.startDate,
                                  }));
                                  setRestrictionForm((f) => ({
                                    ...f,
                                    startDate: appointmentDate || f.startDate,
                                  }));
                                }}
                              />
                            </div>
                            <div className="col-md-3">
                              <input
                                className="form-control"
                                placeholder="Provider"
                                value={medicalForm.provider}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({ ...f, provider: e.target.value }))
                                }
                              />
                            </div>
                            <div className="col-md-3">
                              <input
                                className="form-control"
                                placeholder="Specialty"
                                value={medicalForm.providerSpecialty}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({
                                    ...f,
                                    providerSpecialty: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="col-md-3">
                              <input
                                className="form-control"
                                placeholder="Diagnosis"
                                value={medicalForm.diagnosis}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({ ...f, diagnosis: e.target.value }))
                                }
                              />
                            </div>
                            <div className="col-md-4">
                              <input
                                className="form-control"
                                placeholder="Treatment"
                                value={medicalForm.treatment}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({ ...f, treatment: e.target.value }))
                                }
                              />
                            </div>
                            <div className="col-md-4">
                              <input
                                className="form-control"
                                placeholder="Medication"
                                value={medicalForm.medication}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({ ...f, medication: e.target.value }))
                                }
                              />
                            </div>
                            <div className="col-md-12">
                              <input
                                className="form-control"
                                placeholder="Notes"
                                value={medicalForm.notes}
                                onChange={(e) =>
                                  setMedicalForm((f) => ({ ...f, notes: e.target.value }))
                                }
                              />
                            </div>

                            <div className="col-12 mt-2">
                              <div className="border rounded p-3 bg-body-tertiary">
                                <h6 className="mb-1">Work status</h6>
                                <p className="small text-muted mb-3">
                                  Recorded with this doctor visit / encounter.
                                </p>
                                <div className="row g-2 align-items-end">
                                  <div className="col-md-3">
                                    <label
                                      className="form-label small text-muted mb-1"
                                      htmlFor="wc-med-ws"
                                    >
                                      Status
                                    </label>
                                    <select
                                      id="wc-med-ws"
                                      className="form-select"
                                      value={workStatusForm.status}
                                      disabled={saving}
                                      onChange={(e) =>
                                        setWorkStatusForm((f) => ({ ...f, status: e.target.value }))
                                      }
                                    >
                                      {WC_WORK_STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                          {wcEnumLabel(s)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="col-md-2">
                                    <label
                                      className="form-label small text-muted mb-1"
                                      htmlFor="wc-med-ws-start"
                                    >
                                      Start
                                    </label>
                                    <input
                                      id="wc-med-ws-start"
                                      type="date"
                                      className="form-control"
                                      value={
                                        workStatusForm.startDate || medicalForm.appointmentDate
                                      }
                                      disabled={saving}
                                      onChange={(e) => {
                                        const startDate = e.target.value;
                                        setWorkStatusForm((f) => ({ ...f, startDate }));
                                        setRestrictionForm((f) => ({ ...f, startDate }));
                                        if (!medicalForm.appointmentDate) {
                                          setMedicalForm((f) => ({
                                            ...f,
                                            appointmentDate: startDate,
                                          }));
                                        }
                                      }}
                                    />
                                  </div>
                                  <div className="col-md-2">
                                    <label
                                      className="form-label small text-muted mb-1"
                                      htmlFor="wc-med-ws-end"
                                    >
                                      End
                                    </label>
                                    <input
                                      id="wc-med-ws-end"
                                      type="date"
                                      className="form-control"
                                      value={workStatusForm.endDate}
                                      disabled={saving}
                                      onChange={(e) => {
                                        const endDate = e.target.value;
                                        setWorkStatusForm((f) => ({ ...f, endDate }));
                                        setRestrictionForm((f) => ({ ...f, endDate }));
                                      }}
                                    />
                                  </div>
                                  <div className="col-md-5">
                                    <label
                                      className="form-label small text-muted mb-1"
                                      htmlFor="wc-med-ws-notes"
                                    >
                                      Work status notes
                                    </label>
                                    <input
                                      id="wc-med-ws-notes"
                                      className="form-control"
                                      placeholder="Notes"
                                      value={workStatusForm.notes}
                                      disabled={saving}
                                      onChange={(e) =>
                                        setWorkStatusForm((f) => ({ ...f, notes: e.target.value }))
                                      }
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="col-12">
                              <div className="border rounded p-3">
                                <h6 className="mb-1">Restrictions / Work Accommodations</h6>
                                <p className="small text-muted mb-3">
                                  Part A, B &amp; C for this visit. Saved with the encounter.
                                </p>
                                <WorkersCompRestrictionsForm
                                  namePrefix="wc-med"
                                  value={restrictionForm.accommodations}
                                  disabled={saving}
                                  onChange={(accommodations) =>
                                    setRestrictionForm((f) => ({ ...f, accommodations }))
                                  }
                                />
                              </div>
                            </div>

                            <div className="col-12 d-flex flex-wrap gap-2 align-items-center">
                              <button type="submit" className="btn btn-primary" disabled={saving}>
                                {saving ? "Saving…" : editingMedicalId ? "Save changes" : "Save"}
                              </button>
                              {editingMedicalId ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  disabled={saving}
                                  onClick={() => resetMedicalForm()}
                                >
                                  Cancel edit
                                </button>
                              ) : null}
                              <span className="small text-muted">
                                {editingMedicalId
                                  ? "Updates this encounter, including work status and restrictions."
                                  : "Saves clinical notes, work status, and restrictions for this visit."}
                              </span>
                            </div>
                          </form>
                        ) : null}
                        <div className="d-flex flex-column gap-3 mt-4">
                          <h6 className="mb-0">Encounter history</h6>
                          {(detail.medical ?? []).length === 0 ? (
                            <p className="text-muted mb-0">No medical encounters yet.</p>
                          ) : (
                            (detail.medical ?? []).map((m) => {
                              const restrictionLines = m.accommodations
                                ? formatAccommodationsDetailLines(m.accommodations)
                                : [];
                              return (
                                <div className="card border" key={m.id}>
                                  <div className="card-body">
                                    <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                                      <div>
                                        <div className="fw-semibold">
                                          {m.appointmentDate || "Date not recorded"}
                                          {m.provider ? ` · ${m.provider}` : ""}
                                        </div>
                                        {m.providerSpecialty ? (
                                          <div className="small text-muted">
                                            {m.providerSpecialty}
                                          </div>
                                        ) : null}
                                      </div>
                                      {canMedicalManage ? (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          disabled={saving}
                                          onClick={() => beginEditMedical(m)}
                                        >
                                          {editingMedicalId === m.id ? "Editing…" : "Edit"}
                                        </button>
                                      ) : m.canEditNotes &&
                                        !(noteEdit?.kind === "medical" && noteEdit.id === m.id) ? (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          disabled={saving}
                                          onClick={() =>
                                            setNoteEdit({
                                              kind: "medical",
                                              id: m.id,
                                              notes: m.notes ?? "",
                                            })
                                          }
                                        >
                                          Edit notes
                                        </button>
                                      ) : null}
                                    </div>
                                    <div className="row g-2 small mb-2">
                                      <div className="col-md-3">
                                        <span className="text-muted">Diagnosis:</span>{" "}
                                        {m.diagnosis || "—"}
                                      </div>
                                      <div className="col-md-3">
                                        <span className="text-muted">Treatment:</span>{" "}
                                        {m.treatment || "—"}
                                      </div>
                                      <div className="col-md-3">
                                        <span className="text-muted">Medication:</span>{" "}
                                        {m.medication || "—"}
                                      </div>
                                      <div className="col-md-3">
                                        <span className="text-muted">Notes:</span>{" "}
                                        {noteEdit?.kind === "medical" && noteEdit.id === m.id
                                          ? null
                                          : m.notes || "—"}
                                      </div>
                                    </div>
                                    {noteEdit?.kind === "medical" && noteEdit.id === m.id ? (
                                      <div className="d-flex flex-column gap-2 mb-3">
                                        <textarea
                                          className="form-control form-control-sm"
                                          rows={3}
                                          value={noteEdit.notes}
                                          onChange={(e) =>
                                            setNoteEdit({ ...noteEdit, notes: e.target.value })
                                          }
                                          // eslint-disable-next-line jsx-a11y/no-autofocus -- inline note editor opened by the user's click; focus must move into the field
                                          autoFocus
                                        />
                                        <div className="d-flex gap-1">
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-primary"
                                            disabled={saving}
                                            onClick={() => void saveMedicalNotes()}
                                          >
                                            Save
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-outline-secondary"
                                            disabled={saving}
                                            onClick={() => setNoteEdit(null)}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}

                                    {m.workStatus ? (
                                      <div className="border-top pt-2 mt-2">
                                        <div className="fw-semibold small mb-1">Work status</div>
                                        <div className="small">
                                          {wcEnumLabel(m.workStatus.status)}
                                          {" · "}
                                          {m.workStatus.startDate || "—"} →{" "}
                                          {m.workStatus.endDate || "open"}
                                          {m.workStatus.notes ? ` · ${m.workStatus.notes}` : ""}
                                        </div>
                                      </div>
                                    ) : null}

                                    {restrictionLines.length > 0 ? (
                                      <div className="border-top pt-2 mt-2">
                                        <div className="fw-semibold small mb-1">
                                          Restrictions / Work Accommodations
                                        </div>
                                        <ul className="small mb-0 ps-3">
                                          {restrictionLines.map((line) => (
                                            <li key={line}>{line}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {detailTab === "forms" && hasProducersForms ? (
                <WorkersCompFormsPanel
                  caseId={detail.id}
                  caseLabel={[wcClaimNumber(detail), personNameDisplay(detail.workerName, "")]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ) : null}

              {detailTab === "carrier" && canAdminCarriers ? (
                <div className="card">
                  <div className="card-body">
                    <p className="text-muted small">
                      Admin-only carrier catalog. These names appear in the Carrier dropdown on
                      claims. Deactivated carriers stay in history but are hidden from new picks;
                      Remove archives them from the catalog.
                    </p>
                    <WorkersCompCarrierCatalog
                      carriers={carriers}
                      canManage={canAdminCarriers}
                      busy={saving}
                      onChanged={loadCarriers}
                      onError={setError}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )
        ) : null}

        {view === "employees" ? (
          <div className="card">
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Open cases</th>
                    <th>Total cases</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No employees linked to workers&apos; compensation cases yet.
                      </td>
                    </tr>
                  ) : (
                    employees.map((e) => (
                      <tr key={e.key}>
                        <td>
                          {e.personnelId ? (
                            <Link href={personnelFileHref(e.personnelId)}>
                              {personNameDisplay(e.name, "—")}
                            </Link>
                          ) : (
                            personNameDisplay(e.name, "—")
                          )}
                        </td>
                        <td>{e.openCases}</td>
                        <td>{e.totalCases}</td>
                        <td className="text-end">
                          {e.personnelId ? (
                            <Link
                              className="btn btn-sm btn-outline-primary"
                              href={personnelFileHref(e.personnelId)}
                            >
                              Personnel file
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === "return-to-work" ? (
          <div className="card">
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>EMPLOYEE</th>
                    <th>Claim #</th>
                    <th>Status</th>
                    <th>Workflow</th>
                    <th>Restricted days</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rtwCases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted">
                        No return-to-work cases in the queue.
                      </td>
                    </tr>
                  ) : (
                    rtwCases.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={wcCaseHref(c.id)}>
                            {personNameDisplay(c.workerName, "—")}
                          </Link>
                        </td>
                        <td>{wcClaimNumber(c)}</td>
                        <td>
                          <span className={`badge ${wcStatusBadgeClass(c.status)}`}>
                            {wcEnumLabel(c.status)}
                          </span>
                        </td>
                        <td>{wcEnumLabel(c.workflowStage) || "—"}</td>
                        <td>{c.restrictedDays ?? "—"}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => openCase(c.id, "overview")}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === "medical" ? (
          <div className="card">
            <div className="card-body">
              <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
                <p className="text-muted mb-0">
                  Open a case to log doctor visits with clinical notes, work status, and
                  restrictions. Active cases needing follow-up are listed below.
                </p>
                <input
                  className="form-control form-control-sm"
                  style={{ minWidth: 180, maxWidth: 280 }}
                  placeholder="Search cases"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search medical cases"
                />
              </div>
              <div className="table-responsive">
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>EMPLOYEE</th>
                      <th>Claim #</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cases.filter((c) => c.status !== "CLOSED" && c.status !== "ARCHIVED")
                      .length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          No active cases.
                        </td>
                      </tr>
                    ) : (
                      cases
                        .filter((c) => c.status !== "CLOSED" && c.status !== "ARCHIVED")
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <Link href={wcCaseHref(c.id)}>
                                {personNameDisplay(c.workerName, "—")}
                              </Link>
                            </td>
                            <td>{wcClaimNumber(c)}</td>
                            <td>
                              <span className={`badge ${wcStatusBadgeClass(c.status)}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="text-end">
                              <div className="d-flex flex-wrap gap-1 justify-content-end">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => openCase(c.id, "medical")}
                                >
                                  Medical
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {view === "claims" ? (
          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="card-title mb-0">Carriers</h6>
                </div>
                <div className="card-body">
                  {canAdminCarriers ? (
                    <p className="text-muted small">
                      Admin-only catalog used by the Carrier dropdown on claims. Deactivate hides a
                      carrier from new selections; Remove archives it.
                    </p>
                  ) : null}
                  <WorkersCompCarrierCatalog
                    carriers={carriers}
                    canManage={canAdminCarriers}
                    busy={saving}
                    compact
                    onChanged={loadCarriers}
                    onError={setError}
                  />
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="card-title mb-0">Claim numbers</h6>
                </div>
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead>
                      <tr>
                        <th>EMPLOYEE</th>
                        <th>Claim #</th>
                        <th>Carrier</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {cases.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No claims yet.
                          </td>
                        </tr>
                      ) : (
                        cases.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <Link href={wcCaseHref(c.id)}>
                                {personNameDisplay(c.workerName, "—")}
                              </Link>
                            </td>
                            <td>{wcClaimNumber(c)}</td>
                            <td>{c.claimSummary.carrierName || "—"}</td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => openCase(c.id)}
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {view === "costs" ? (
          <div className="row g-3">
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <div className="text-muted small text-uppercase">Open claims</div>
                  <div className="display-6 fw-semibold mb-0">{costTotals.openClaims}</div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <div className="text-muted small text-uppercase">Days away (open)</div>
                  <div className="display-6 fw-semibold mb-0">{costTotals.daysAway}</div>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <div className="text-muted small text-uppercase">Restricted days (open)</div>
                  <div className="display-6 fw-semibold mb-0">{costTotals.restrictedDays}</div>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="alert alert-secondary mb-0" role="status">
                Dollar reserves and indemnity tracking will land in a later pass. Days away and
                restricted days are live from case records today.
              </div>
            </div>
          </div>
        ) : null}

        {view === "osha" ? (
          <div className="card">
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                <div>
                  <h6 className="mb-1">OSHA recordable workers&apos; comp cases</h6>
                  <p className="text-muted small mb-0">
                    Mark a case recordable on Overview to autofill Form 300. Print the official OSHA
                    log from the OSHA module.
                  </p>
                </div>
                <Link className="btn btn-sm btn-primary" href="/modules/osha/">
                  Print Form 300
                </Link>
              </div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Claim #</th>
                      <th>Injury date</th>
                      <th>Days away</th>
                      <th>Restricted</th>
                      <th>OSHA</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {cases.filter((c) => c.oshaRecordable).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-muted">
                          No workers&apos; compensation cases are marked OSHA recordable yet. Open a
                          case and check &quot;OSHA recordable&quot; on Overview.
                        </td>
                      </tr>
                    ) : (
                      cases
                        .filter((c) => c.oshaRecordable)
                        .map((c) => (
                          <tr key={c.id}>
                            <td>
                              <Link href={wcCaseHref(c.id)}>
                                {personNameDisplay(c.workerName, "—")}
                              </Link>
                            </td>
                            <td>{wcClaimNumber(c)}</td>
                            <td>{c.claimSummary.dateOfInjury || "—"}</td>
                            <td>{c.daysAway ?? "—"}</td>
                            <td>{c.restrictedDays ?? "—"}</td>
                            <td>
                              <span className="badge text-bg-danger">
                                {c.oshaPrivacyCase ? "Privacy case" : "Recordable"}
                              </span>
                            </td>
                            <td className="text-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => openCase(c.id)}
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {view === "documents" || view === "reports" ? (
          <div className="card">
            <div className="card-body">
              {view === "documents" ? (
                <p className="text-muted mb-0">
                  Document vault for claim packets and medical releases is not wired yet.
                </p>
              ) : (
                <>
                  <div className="d-flex flex-wrap gap-2 justify-content-between align-items-start mb-3">
                    <div>
                      <h6 className="mb-1">Workers&apos; Comp reports</h6>
                      <p className="text-muted small mb-0">
                        Run and export from the shared Reporting Center. Medical encounters require
                        medical view permission. You can also schedule digests from Reporting after
                        saving a report.
                      </p>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <Link className="btn btn-sm btn-primary" href="/reporting/library/?q=workers">
                        Open library
                      </Link>
                      <Link
                        className="btn btn-sm btn-outline-primary"
                        href="/reporting/builder/?source=workers_comp.open_cases"
                      >
                        Custom builder
                      </Link>
                    </div>
                  </div>
                  <div className="list-group list-group-flush">
                    {[
                      {
                        key: WC_WEEKLY_STATUS_REPORT_KEY,
                        name: "Workers' Comp Weekly Status",
                        description:
                          "The weekly status email digest; schedule or edit it in Reports.",
                      },
                      {
                        key: "workers_comp.open_cases",
                        name: "Open Workers' Comp Cases",
                        description: "Open and active cases with claim and duty status.",
                      },
                      {
                        key: "workers_comp.by_status",
                        name: "Workers' Comp by Status",
                        description: "Case counts grouped by status.",
                      },
                      {
                        key: "workers_comp.lost_time",
                        name: "Lost-Time Cases",
                        description: "Cases with days away or lost-time status.",
                      },
                      {
                        key: "workers_comp.restricted_duty",
                        name: "Restricted Duty Cases",
                        description: "Restricted-duty cases and active restrictions.",
                      },
                      {
                        key: "workers_comp.work_status_history",
                        name: "Work Status History",
                        description: "Work-status periods joined to cases.",
                      },
                      {
                        key: "workers_comp.claims_summary",
                        name: "Claims Summary",
                        description: "Carrier, adjuster, body parts, and DOI.",
                      },
                      {
                        key: "workers_comp.medical_encounters",
                        name: "Medical Encounters",
                        description: "Encounter clinical detail (medical permission required).",
                      },
                    ].map((report) => (
                      <div
                        key={report.key}
                        className="list-group-item px-0 d-flex flex-wrap gap-2 justify-content-between align-items-center"
                      >
                        <div>
                          <div className="fw-semibold">{report.name}</div>
                          <div className="small text-muted">{report.description}</div>
                        </div>
                        <div className="d-flex flex-wrap gap-1">
                          <Link
                            className="btn btn-sm btn-outline-primary"
                            href={`/reporting/library/?q=${encodeURIComponent(report.key)}`}
                          >
                            Open
                          </Link>
                          <Link
                            className="btn btn-sm btn-outline-secondary"
                            href={`/reporting/builder/?source=${encodeURIComponent(report.key)}`}
                          >
                            Build
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {view === "settings" ? (
          <div className="row g-3">
            <div className="col-lg-8">
              <div className="card h-100">
                <div className="card-header">
                  <h6 className="card-title mb-0">Weekly status email</h6>
                </div>
                <div className="card-body">
                  <p className="text-muted small">
                    Build a recipient list — add as many emails as you need. The digest covers open
                    workers&apos; compensation cases (worker, status, injury date, claim, carrier,
                    location, days away / restricted, and that week&apos;s Thursday update). Turn on
                    the weekly email to send it automatically (Fridays 7:00 AM Central by default),
                    or send it now at any time. The schedule lives in Reports → Scheduled, where you
                    can change the day, time, or recipients.
                  </p>
                  <div className="form-check form-switch mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="wc-weekly-enabled"
                      checked={weeklySchedule?.enabled ?? false}
                      disabled={!canManage || weeklyBusy}
                      onChange={(e) => void setWeeklyEnabled(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="wc-weekly-enabled">
                      Enable weekly status email
                      <span className="text-muted fw-normal">
                        {weeklySchedule
                          ? weeklySchedule.enabled
                            ? ` — ${describeCronExpression(weeklySchedule.cronExpression, weeklySchedule.timezone)}`
                            : " — paused"
                          : " — off"}
                      </span>
                    </label>
                  </div>
                  <p className="small mb-3">
                    {weeklySchedule ? (
                      <Link
                        href={`/reporting/scheduled/?edit=${encodeURIComponent(weeklySchedule.id)}`}
                      >
                        Edit schedule in Reports
                      </Link>
                    ) : (
                      <Link href={`/reporting/scheduled/?report=${WC_WEEKLY_STATUS_REPORT_KEY}`}>
                        Schedule it in Reports
                      </Link>
                    )}
                  </p>

                  <h6 className="mb-2">
                    Recipients
                    {weeklyRecipients.length > 0 ? (
                      <span className="text-muted fw-normal"> ({weeklyRecipients.length})</span>
                    ) : null}
                  </h6>
                  {weeklyRecipients.length === 0 ? (
                    <p className="text-muted small">
                      No emails yet. Add recipients below before sending.
                    </p>
                  ) : (
                    <ul className="list-group mb-3">
                      {weeklyRecipients.map((email) => (
                        <li
                          key={email}
                          className="list-group-item d-flex justify-content-between align-items-center"
                        >
                          <span>{email}</span>
                          {canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={weeklyBusy}
                              onClick={() => void removeWeeklyRecipient(email)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {canManage ? (
                    <form
                      className="row g-2 align-items-end"
                      onSubmit={(e) => void addWeeklyRecipient(e)}
                    >
                      <div className="col-12">
                        <label className="form-label" htmlFor="wc-weekly-email">
                          Add emails
                        </label>
                        <textarea
                          id="wc-weekly-email"
                          className="form-control"
                          rows={3}
                          value={weeklyEmailDraft}
                          onChange={(e) => setWeeklyEmailDraft(e.target.value)}
                          placeholder={"safety@example.com\nhr@example.com, manager@example.com"}
                          disabled={weeklyBusy}
                          required
                        />
                        <div className="form-text">
                          One per line, or separate with commas. Add several times if needed, then
                          send.
                        </div>
                      </div>
                      <div className="col-md-4">
                        <button
                          type="submit"
                          className="btn btn-outline-primary w-100"
                          disabled={weeklyBusy || !weeklyEmailDraft.trim()}
                        >
                          Add to list
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {weeklySettings.lastSentAt ? (
                    <p className="text-muted small mt-3 mb-0">
                      Last sent {weeklySettings.lastSentAt.slice(0, 16).replace("T", " ")} UTC
                    </p>
                  ) : (
                    <p className="text-muted small mt-3 mb-0">No status email has been sent yet.</p>
                  )}

                  {weeklyMessage ? (
                    <div className="alert alert-success mt-3 mb-0 py-2" role="status">
                      {weeklyMessage}
                    </div>
                  ) : null}
                </div>
                <div className="card-footer d-flex flex-wrap gap-2">
                  {canManage ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={weeklyBusy || weeklyRecipients.length === 0}
                      onClick={() => void sendWeeklyStatusNow()}
                    >
                      {weeklyBusy ? "Sending…" : "Send to all recipients"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={weeklyPreviewLoading}
                    onClick={() => void previewWeeklyStatus()}
                  >
                    {weeklyPreviewLoading ? "Loading preview…" : "Preview"}
                  </button>
                </div>
                {weeklyPreview ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click-to-close, same as the other Forge modals; keyboard users close with the Close/Cancel button */}
                    <div
                      className="modal d-block"
                      tabIndex={-1}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="wc-weekly-preview-title"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) setWeeklyPreview(null);
                      }}
                    >
                      <div className="modal-dialog modal-xl modal-dialog-scrollable">
                        <div className="modal-content">
                          <div className="modal-header">
                            <div>
                              <h5 className="modal-title" id="wc-weekly-preview-title">
                                Weekly status preview
                              </h5>
                              <div className="small text-muted">
                                Subject: {weeklyPreview.subject} · As of {weeklyPreview.generatedAt}{" "}
                                · Not sent
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-close"
                              aria-label="Close"
                              onClick={() => setWeeklyPreview(null)}
                            />
                          </div>
                          <div className="modal-body p-0">
                            <iframe
                              title="Weekly status email preview"
                              srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;margin:16px">${weeklyPreview.htmlBody}</body></html>`}
                              sandbox=""
                              style={{ width: "100%", height: "70vh", border: 0 }}
                            />
                          </div>
                          <div className="modal-footer">
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              disabled={weeklyPreviewLoading}
                              onClick={() => void previewWeeklyStatus()}
                            >
                              {weeklyPreviewLoading ? "Refreshing…" : "Refresh"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => setWeeklyPreview(null)}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="modal-backdrop show" />
                  </>
                ) : null}
              </div>
            </div>
            <div className="col-lg-4">
              <div className="card h-100">
                <div className="card-body text-muted small">
                  <p className="mb-2">
                    <strong>What recipients get</strong>
                  </p>
                  <ul className="mb-0 ps-3">
                    <li>Count of open cases</li>
                    <li>Worker name</li>
                    <li>Status</li>
                    <li>Severity and OSHA classification</li>
                    <li>Injury date, body parts, incident summary</li>
                    <li>Location and days away / restricted</li>
                    <li>Weekly notes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
