"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiGet, apiGetResult, apiSend, useAuth } from "@forge/web-kit";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { FilterPanel } from "@/components/filter-panel";
import { IncidentCreateForm } from "@/components/incident-create-form";
import { IncidentReportPanel } from "@/components/incident-report-panel";
import { IncidentsBodyMapPanel } from "@/components/incidents-body-map-panel";
import { IncidentsEvaluationPanel } from "@/components/incidents-evaluation-panel";
import { IncidentsRcaPanel } from "@/components/incidents-rca-panel";
import { IncidentsWorkflowPanel } from "@/components/incidents-workflow-panel";
import { WorkersCompInlinePanel } from "@/components/workers-comp-inline-panel";
import { OshaInlinePanel } from "@/components/osha-inline-panel";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { useBodyRegions } from "@/hooks/use-body-regions";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import {
  buildForm301Pdf,
  fetchForm301Template,
  openForm301PdfForPrint,
} from "@/lib/osha-form-301-pdf";
import { incidentOshaForm301Api, OSHA_API, toOshaCase } from "@/lib/osha-module";
import {
  bodyLocationSummaryLabel,
} from "@/lib/incident-body-map";
import {
  canDeleteIncidents,
  type SignatoryRoleRef,
} from "@/lib/form-signatory";
import {
  buildIncidentCreatePayload,
  buildIncidentUpdatePayload,
  EMPTY_INCIDENT_SUMMARY,
  INCIDENTS_API,
  INCIDENT_WORKSPACE_TABS,
  filterAndGroupIncidents,
  countUndatedIncidents,
  incidentNeedsOccurrenceDate,
  incidentPrintFilename,
  incidentSummaryTiles,
  incidentTabDescription,
  incidentTabLabel,
  incidentWorkspaceHref,
  isIncidentCategoryTab,
  isIncidentProcessTab,
  parseIncidentListSort,
  parseIncidentTab,
  parseIncidentWorkspaceTab,
  statusBadgeClass,
  toIncidentRecord,
  toIncidentRecords,
  toIncidentSummary,
  type EvaluationChecklist,
  type IncidentCategory,
  type IncidentCreateFormState,
  type IncidentLifecycleData,
  type IncidentListSort,
  type IncidentRecord,
  type IncidentSummary,
  type IncidentWorkspaceTab,
  type IncidentYearGroup,
  type RootCauseAnalysis,
  incidentPlaceLocation,
} from "@/lib/incidents-module";
import { WC_API, wcCaseHref } from "@/lib/workers-comp-module";

type ListResponse = { items?: unknown[] };

const FETCH_SIZE = 100;
const MAX_PAGES = 20;

/**
 * Incidents module — Sneat-themed summary tiles, record-type tabs, and process
 * tabs (workflow / evaluation checklist / root cause analysis).
 */
export function IncidentsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const { query: facilityQuery } = useIndustrialFacility();
  const searchParams = useSearchParams();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.incidents.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.incidents.manage") || permissions.has("industrial.admin");
  const canManageWc =
    permissions.has("industrial.workers_comp.manage") || permissions.has("industrial.admin");
  const canManageOsha =
    permissions.has("industrial.osha.manage") || permissions.has("industrial.admin");
  const canViewOsha =
    canManageOsha ||
    permissions.has("industrial.osha.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const [roleList, setRoleList] = useState<SignatoryRoleRef[]>([]);
  const canDelete = canDeleteIncidents({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    roles: roleList,
  });
  const tenantId = me?.tenantId ?? "";
  const tenantName =
    me?.tenants?.find((t) => t.tenantId === me?.tenantId)?.displayName ?? "Your organization";
  const defaultReporter = "";
  const { regions } = useBodyRegions();

  const [tab, setTab] = useState<IncidentWorkspaceTab>(() =>
    parseIncidentWorkspaceTab(searchParams.get("tab")),
  );
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: INCIDENT_WORKSPACE_TABS,
        moduleCode: "INCIDENTS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  const [summary, setSummary] = useState<IncidentSummary>(EMPTY_INCIDENT_SUMMARY);
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<IncidentRecord | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<IncidentListSort>("newest");
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingOsha301, setPrintingOsha301] = useState(false);
  const [embeddedWcCaseId, setEmbeddedWcCaseId] = useState<string | null>(null);
  const [embeddedOshaCaseId, setEmbeddedOshaCaseId] = useState<string | null>(null);
  const selectedIncidentId = searchParams.get("incident") ?? null;

  useEffect(() => {
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
  }, [tenantId]);

  useEffect(() => {
    setTab(parseIncidentWorkspaceTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    const incidentId = selectedIncidentId;
    if (!incidentId) {
      setSelectedReport(null);
      return;
    }
    const fromList = records.find((row) => row.id === incidentId) ?? null;
    if (fromList) {
      setSelectedReport(fromList);
      return;
    }
    if (loading) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<unknown>(
          `/api/v1/industrial/incidents/${encodeURIComponent(incidentId)}`,
        );
        if (cancelled) return;
        setSelectedReport(toIncidentRecord(data));
      } catch {
        if (!cancelled) setSelectedReport(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIncidentId, records, loading]);

  useEffect(() => {
    if (!selectedIncidentId || loading) return;
    // Prefer scrolling to the WC/OSHA continuation panels when those are open.
    if (embeddedWcCaseId || embeddedOshaCaseId) return;
    const row = document.getElementById(`incident-report-${selectedIncidentId}`);
    row?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedIncidentId, loading, selectedReport, embeddedWcCaseId, embeddedOshaCaseId]);

  const isCategoryTab = isIncidentCategoryTab(tab);
  const isProcessTab = isIncidentProcessTab(tab);

  const recordsCategory = useMemo((): IncidentCategory | undefined => {
    if (isIncidentCategoryTab(tab)) return tab;
    if (tab === "body-map") return "injuries";
    return undefined;
  }, [tab]);

  const loadSummary = useCallback(async () => {
    const data = await apiGet<unknown>("/api/v1/industrial/incidents/summary");
    setSummary(toIncidentSummary(data));
  }, []);

  const loadRecords = useCallback(async (category?: IncidentCategory) => {
    const all: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await apiGetResult<ListResponse>("/api/v1/industrial/incidents", {
        query: {
          ...(category ? { category } : {}),
          page: String(page),
          pageSize: String(FETCH_SIZE),
          ...facilityQuery,
        },
      });
      const items = Array.isArray(result.data.items) ? result.data.items : [];
      all.push(...items);
      if (items.length < FETCH_SIZE) break;
    }
    setRecords(toIncidentRecords(all));
  }, [facilityQuery]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadRecords(recordsCategory)]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load incidents");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadSummary, recordsCategory]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    void reload();
  }, [canView, reload]);

  const tiles = useMemo(() => incidentSummaryTiles(summary), [summary]);

  const yearGroups = useMemo(
    () => (isCategoryTab ? filterAndGroupIncidents(records, listSearch, listSort) : []),
    [isCategoryTab, listSearch, listSort, records],
  );

  const filteredCount = useMemo(
    () => yearGroups.reduce((sum, group) => sum + group.items.length, 0),
    [yearGroups],
  );

  const undatedCount = useMemo(() => countUndatedIncidents(yearGroups), [yearGroups]);

  function undatedIncidentNotice(record: IncidentRecord) {
    if (!incidentNeedsOccurrenceDate(record)) return null;
    return (
      <div className="small text-warning mt-1">
        <i className="bx bx-error-circle me-1" aria-hidden />
        Needs an occurrence date
      </div>
    );
  }

  function incidentUrlExtras(incidentId: string | null): { incident?: string; region?: string } {
    const extras: { incident?: string; region?: string } = {};
    if (incidentId) extras.incident = incidentId;
    const region = searchParams.get("region");
    if (tab === "body-map" && region) extras.region = region;
    return extras;
  }

  function syncIncidentUrl(incidentId: string | null, nextTab: IncidentWorkspaceTab = tab) {
    router.replace(incidentWorkspaceHref(nextTab, incidentUrlExtras(incidentId)), { scroll: false });
  }

  function openIncidentReport(record: IncidentRecord) {
    setSelectedReport(record);
    syncIncidentUrl(record.id);
  }

  function closeIncidentReport() {
    setEditingReport(false);
    setFormError(null);
    setEmbeddedWcCaseId(null);
    setEmbeddedOshaCaseId(null);
    syncIncidentUrl(null);
  }

  function switchTab(next: IncidentWorkspaceTab) {
    setTab(next);
    setShowForm(false);
    setEditingReport(false);
    setFormError(null);
    setEmbeddedWcCaseId(null);
    setEmbeddedOshaCaseId(null);
    setListSearch("");
    router.replace(incidentWorkspaceHref(next), { scroll: false });
  }

  useEffect(() => {
    const next = ensureActiveModuleTab(
      tab,
      visibleTabs.map((t) => t.id),
      "injuries",
    );
    if (next !== tab) switchTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when visibility changes
  }, [visibleTabs, tab]);

  function renderYearGroupedRows(
    groups: IncidentYearGroup[],
    colSpan: number,
    renderCells: (record: IncidentRecord) => ReactNode,
  ) {
    return groups.map((group) => (
      <Fragment key={group.year ?? "unknown"}>
        <tr className="table-light">
          <th scope="rowgroup" colSpan={colSpan} className="small text-uppercase text-muted">
            {group.label}
            <span className="fw-normal ms-2">({group.items.length})</span>
          </th>
        </tr>
        {group.items.map((record) => (
          <tr
            key={record.id}
            id={`incident-row-${record.id}`}
            className={`cursor-pointer${selectedIncidentId === record.id ? " table-active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() =>
              selectedIncidentId === record.id
                ? closeIncidentReport()
                : openIncidentReport(record)
            }
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                if (selectedIncidentId === record.id) closeIncidentReport();
                else openIncidentReport(record);
              }
            }}
            aria-pressed={selectedIncidentId === record.id}
            title="Open incident report"
          >
            {renderCells(record)}
          </tr>
        ))}
      </Fragment>
    ));
  }

  function onTileClick(tileTab: IncidentWorkspaceTab | undefined) {
    if (tileTab) switchTab(tileTab);
  }

  async function patchIncident(
    incidentId: string,
    body: {
      lifecycle?: IncidentLifecycleData;
      evaluationChecklist?: EvaluationChecklist;
      rootCauseAnalysis?: RootCauseAnalysis;
      bodyLocations?: string[];
    },
  ) {
    await apiSend(`/api/v1/industrial/incidents/${incidentId}`, "PATCH", body);
    await Promise.all([loadSummary(), loadRecords(recordsCategory)]);
  }

  async function deleteIncident(record: IncidentRecord) {
    if (!canDelete) return;
    const confirmed = window.confirm(
      `Delete "${record.title}"?\n\nThis archives the incident and removes it from the list.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiSend(
        `${INCIDENTS_API}/${encodeURIComponent(record.id)}/archive`,
        "POST",
        {},
      );
      setEditingReport(false);
      setFormError(null);
      syncIncidentUrl(null);
      setSelectedReport(null);
      await Promise.all([loadSummary(), loadRecords(recordsCategory)]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete incident");
    } finally {
      setDeleting(false);
    }
  }

  async function loadIncidentPrintableHtml(record: IncidentRecord): Promise<string | null> {
    setError(null);
    try {
      const data = await apiGet<{ html: string; title?: string }>(
        `${INCIDENTS_API}/${encodeURIComponent(record.id)}/printable`,
      );
      return typeof data.html === "string" ? data.html : null;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load printable incident");
      return null;
    }
  }

  async function printIncident(record: IncidentRecord) {
    setPrinting(true);
    try {
      const html = await loadIncidentPrintableHtml(record);
      if (!html) return;
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) setError(blocked);
    } finally {
      setPrinting(false);
    }
  }

  async function downloadIncidentPdf(record: IncidentRecord) {
    setPrinting(true);
    try {
      const html = await loadIncidentPrintableHtml(record);
      if (!html) return;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = incidentPrintFilename(record);
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setPrinting(false);
    }
  }

  async function printOshaForm301(record: IncidentRecord) {
    setPrintingOsha301(true);
    setError(null);
    try {
      const data = await apiGet<{
        case?: Record<string, unknown>;
        oshaCaseId?: string | null;
      }>(incidentOshaForm301Api(record.id));
      const caseRow = toOshaCase(data.case ?? {});
      if (!caseRow.employeeName && !caseRow.injuryDate && !caseRow.description) {
        throw new Error("Could not seed Form 301 from this incident.");
      }
      const template = await fetchForm301Template();
      const pdfBytes = await buildForm301Pdf(template, caseRow);
      const label = caseRow.caseNumber || record.id.slice(0, 8);
      const warn = openForm301PdfForPrint(pdfBytes, `osha-form-301-${label}.pdf`);
      if (warn) setError(warn);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to print OSHA Form 301");
    } finally {
      setPrintingOsha301(false);
    }
  }

  function applyIncidentAttachments(incidentId: string, attachments: IncidentRecord["attachments"]) {
    setRecords((prev) =>
      prev.map((row) => (row.id === incidentId ? { ...row, attachments } : row)),
    );
  }

  async function ensureWorkersCompCase(record: IncidentRecord): Promise<string | null> {
    const existingCaseId = record.workersCompCaseId.trim();
    if (existingCaseId) return existingCaseId;

    const workerName = record.personAffected || record.reportedBy || record.title;
    const created = await apiSend<{ id?: string }>(WC_API, "POST", {
      incidentId: record.id,
      workerName,
      ...(record.personnelId ? { personnelId: record.personnelId } : {}),
      ...(record.dateOfBirth ? { dateOfBirth: record.dateOfBirth } : {}),
      status: "OPEN",
      severity: record.severity || "moderate",
      workflowStage: "INTAKE",
      locationText: incidentPlaceLocation(record),
      notes: record.description || "",
      claimSummary: {
        dateOfInjury: (record.dateOccurred || record.createdAt || "").slice(0, 10),
        bodyParts: bodyLocationSummaryLabel(record.bodyLocations, regions) || "",
      },
    });
    if (!created?.id) return null;
    const caseId = created.id;
    setRecords((prev) =>
      prev.map((row) =>
        row.id === record.id
          ? { ...row, workersCompCaseId: caseId, workersCompRelevant: true }
          : row,
      ),
    );
    setSelectedReport((prev) =>
      prev && prev.id === record.id
        ? { ...prev, workersCompCaseId: caseId, workersCompRelevant: true }
        : prev,
    );
    return caseId;
  }

  async function openWorkersCompCase(record: IncidentRecord) {
    if (!canManageWc) return;
    setSaving(true);
    setError(null);
    try {
      const caseId = await ensureWorkersCompCase(record);
      if (caseId) router.push(wcCaseHref(caseId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to open workers' comp case");
    } finally {
      setSaving(false);
    }
  }

  async function ensureOshaCase(record: IncidentRecord): Promise<string | null> {
    const existingCaseId = record.oshaCaseId.trim();
    if (existingCaseId) return existingCaseId;

    const created = await apiSend<{ id?: string }>(OSHA_API, "POST", {
      incidentId: record.id,
      title: record.title || record.personAffected || "OSHA case",
      recordabilityStatus: "PENDING",
    });
    if (!created?.id) return null;
    const caseId = created.id;
    setRecords((prev) =>
      prev.map((row) => (row.id === record.id ? { ...row, oshaCaseId: caseId } : row)),
    );
    setSelectedReport((prev) =>
      prev && prev.id === record.id ? { ...prev, oshaCaseId: caseId } : prev,
    );
    return caseId;
  }

  async function openOshaCase(record: IncidentRecord) {
    if (!canViewOsha) return;
    if (!record.oshaCaseId.trim() && !canManageOsha) {
      setError("You do not have permission to create an OSHA case for this incident.");
      return;
    }
    setSaving(true);
    setError(null);
    setEmbeddedWcCaseId(null);
    try {
      const caseId = await ensureOshaCase(record);
      if (!caseId) {
        setError("OSHA case could not be opened for this incident.");
        return;
      }
      setEmbeddedOshaCaseId(caseId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to open OSHA case");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!showForm && !editingReport) return;
    const el = document.getElementById("incident-create-form");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showForm, editingReport, tab]);

  useEffect(() => {
    if (!embeddedWcCaseId) return;
    const el = document.getElementById("workers-comp-inline-panel");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [embeddedWcCaseId]);

  useEffect(() => {
    if (!embeddedOshaCaseId) return;
    const el = document.getElementById("osha-inline-panel");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [embeddedOshaCaseId]);

  async function submitNewReport(
    form: IncidentCreateFormState,
    locations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) {
    if (!canManage || !isCategoryTab) return;
    const extras: {
      siteLabel?: string;
      departmentLabel?: string;
      companyName?: string;
    } = { companyName: tenantName };
    if (labels.siteLabel) extras.siteLabel = labels.siteLabel;
    if (labels.departmentLabel) extras.departmentLabel = labels.departmentLabel;
    const payload = buildIncidentCreatePayload(form, tab, locations, extras);
    if (!payload.title) {
      setFormError("Enter a report title or person affected.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiSend<unknown>("/api/v1/industrial/incidents", "POST", payload);
      setShowForm(false);
      setEmbeddedWcCaseId(null);
      setEmbeddedOshaCaseId(null);
      await reload();
      const record = toIncidentRecord(created);
      if (record) openIncidentReport(record);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to create incident");
    } finally {
      setSaving(false);
    }
  }

  async function submitEditReport(
    form: IncidentCreateFormState,
    locations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) {
    if (!canManage || !selectedReport) return;
    const category = parseIncidentTab(selectedReport.category) || tab;
    if (!isIncidentCategoryTab(category)) return;
    const extras: {
      siteLabel?: string;
      departmentLabel?: string;
      companyName?: string;
    } = { companyName: tenantName };
    if (labels.siteLabel) extras.siteLabel = labels.siteLabel;
    if (labels.departmentLabel) extras.departmentLabel = labels.departmentLabel;
    const payload = buildIncidentUpdatePayload(form, category, locations, extras);
    if (!payload.title) {
      setFormError("Enter a report title or person affected.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const updated = await apiSend<unknown>(
        `${INCIDENTS_API}/${encodeURIComponent(selectedReport.id)}`,
        "PATCH",
        payload,
      );
      setEditingReport(false);
      setEmbeddedWcCaseId(null);
      setEmbeddedOshaCaseId(null);
      await reload();
      const record = toIncidentRecord(updated);
      if (record) openIncidentReport(record);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to update incident");
    } finally {
      setSaving(false);
    }
  }

  /** Save incident, refresh analytics/list, create/link WC case, open WC panel below. */
  async function continueToWorkersComp(
    form: IncidentCreateFormState,
    locations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) {
    if (!canManage || !canManageWc || !isCategoryTab) return;
    const extras: {
      siteLabel?: string;
      departmentLabel?: string;
      companyName?: string;
    } = { companyName: tenantName };
    if (labels.siteLabel) extras.siteLabel = labels.siteLabel;
    if (labels.departmentLabel) extras.departmentLabel = labels.departmentLabel;

    setSaving(true);
    setFormError(null);
    setError(null);
    try {
      let record: IncidentRecord | null = null;
      if (editingReport && selectedReport) {
        const category = parseIncidentTab(selectedReport.category) || tab;
        if (!isIncidentCategoryTab(category)) return;
        const payload = buildIncidentUpdatePayload(form, category, locations, extras);
        if (!payload.title) {
          setFormError("Enter a report title or person affected.");
          return;
        }
        const updated = await apiSend<unknown>(
          `${INCIDENTS_API}/${encodeURIComponent(selectedReport.id)}`,
          "PATCH",
          payload,
        );
        record = toIncidentRecord(updated);
      } else {
        const payload = buildIncidentCreatePayload(form, tab, locations, extras);
        if (!payload.title) {
          setFormError("Enter a report title or person affected.");
          return;
        }
        const created = await apiSend<unknown>("/api/v1/industrial/incidents", "POST", payload);
        record = toIncidentRecord(created);
      }
      if (!record) {
        setFormError("Incident saved but could not be loaded.");
        return;
      }

      await reload();
      // Close create/edit so the WC panel is the next step — reopening edit
      // made Continue feel stuck on the same long form.
      setShowForm(false);
      setEditingReport(false);
      setEmbeddedOshaCaseId(null);
      openIncidentReport(record);
      setSelectedReport(record);

      const caseId = await ensureWorkersCompCase({
        ...record,
        workersCompRelevant: true,
      });
      if (!caseId) {
        setFormError("Incident saved, but workers' comp case could not be opened.");
        return;
      }
      setEmbeddedWcCaseId(caseId);
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : "Failed to save incident and open workers' comp",
      );
    } finally {
      setSaving(false);
    }
  }

  /** Save incident and open OSHA Form 300/301 below — no WC claim required. */
  async function continueToOsha(
    form: IncidentCreateFormState,
    locations: string[],
    labels: { siteLabel?: string; departmentLabel?: string },
  ) {
    if (!canManage || !canManageOsha || !isCategoryTab) return;
    const extras: {
      siteLabel?: string;
      departmentLabel?: string;
      companyName?: string;
    } = { companyName: tenantName };
    if (labels.siteLabel) extras.siteLabel = labels.siteLabel;
    if (labels.departmentLabel) extras.departmentLabel = labels.departmentLabel;

    setSaving(true);
    setFormError(null);
    setError(null);
    setEmbeddedWcCaseId(null);
    try {
      let record: IncidentRecord | null = null;
      if (editingReport && selectedReport) {
        const category = parseIncidentTab(selectedReport.category) || tab;
        if (!isIncidentCategoryTab(category)) return;
        const payload = buildIncidentUpdatePayload(form, category, locations, extras);
        if (!payload.title) {
          setFormError("Enter a report title or person affected.");
          return;
        }
        const updated = await apiSend<unknown>(
          `${INCIDENTS_API}/${encodeURIComponent(selectedReport.id)}`,
          "PATCH",
          payload,
        );
        record = toIncidentRecord(updated);
      } else {
        const payload = buildIncidentCreatePayload(form, tab, locations, extras);
        if (!payload.title) {
          setFormError("Enter a report title or person affected.");
          return;
        }
        const created = await apiSend<unknown>("/api/v1/industrial/incidents", "POST", payload);
        record = toIncidentRecord(created);
      }
      if (!record) {
        setFormError("Incident saved but could not be loaded.");
        return;
      }

      await reload();
      // Close create/edit so the OSHA panel is the next step — reopening edit
      // made Continue feel stuck on the same long form.
      setShowForm(false);
      setEditingReport(false);
      setEmbeddedWcCaseId(null);
      openIncidentReport(record);
      setSelectedReport(record);

      const caseId = await ensureOshaCase(record);
      if (!caseId) {
        setFormError("Incident saved, but OSHA case could not be opened.");
        return;
      }
      setEmbeddedOshaCaseId(caseId);
    } catch (e) {
      setFormError(
        e instanceof ApiError ? e.message : "Failed to save incident and open OSHA",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">{moduleName}</h4>
        <p className="mb-0">You do not have permission to view incidents.</p>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="incidents-title"
      className="incidents-workspace"
      data-walkthrough="safety-incidents"
    >
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-uppercase text-primary fw-semibold small mb-1">Incident & Claims</p>
          <h4 className="mb-1" id="incidents-title">
            {moduleName}
          </h4>
          <p className="text-muted mb-0">
            Injury, near miss, medical refusal, property damage, and automotive reporting — plus
            workflow, evaluation, and root cause analysis.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={() => void reload()}
          disabled={loading}
        >
          <i className="bx bx-refresh me-1" />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="row row-cols-2 row-cols-sm-3 row-cols-lg-5 row-cols-xl-9 g-3 mb-4">
        {tiles.map((tile) => (
          <div className="col" key={tile.id}>
            <button
              type="button"
              className={`card h-100 w-100 text-start${tile.tab === tab ? " border border-primary" : ""}`}
              onClick={() => onTileClick(tile.tab)}
              disabled={!tile.tab}
              aria-pressed={tile.tab === tab}
            >
              <div className="card-body p-3">
                <div className="avatar avatar-sm mb-2">
                  <span className={`avatar-initial rounded bg-label-${tile.tone}`}>
                    <i className={`bx ${tile.icon}`} />
                  </span>
                </div>
                <span className="d-block text-muted small">{tile.label}</span>
                <h5 className="mb-0">{tile.value}</h5>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="nav-align-top">
        <ul className="nav nav-tabs flex-wrap" role="tablist">
          {visibleTabs.map((item) => (
            <li className="nav-item" key={item.id}>
              <button
                type="button"
                role="tab"
                className={`nav-link${tab === item.id ? " active" : ""}`}
                aria-selected={tab === item.id}
                onClick={() => switchTab(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="tab-content">
          <div className="tab-pane fade show active" role="tabpanel" aria-label={incidentTabLabel(tab)}>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
              <div className="min-w-0">
                <h5 className="mb-1">{incidentTabLabel(tab)}</h5>
                <p className="text-muted small mb-0">{incidentTabDescription(tab)}</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {selectedReport ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={printing}
                      onClick={() => void printIncident(selectedReport)}
                    >
                      <i className="bx bx-printer me-1" />
                      {printing ? "Preparing…" : "Print"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={printingOsha301}
                      onClick={() => void printOshaForm301(selectedReport)}
                      title="Print the official OSHA Form 301 seeded from this incident"
                    >
                      <i className="bx bx-file me-1" />
                      {printingOsha301 ? "Preparing 301…" : "Print OSHA 301"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={printing}
                      onClick={() => void downloadIncidentPdf(selectedReport)}
                      title="Download a printable report you can Save as PDF"
                    >
                      <i className="bx bx-download me-1" />
                      Download PDF
                    </button>
                  </>
                ) : isProcessTab ? (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => window.print()}
                  >
                    <i className="bx bx-printer me-1" />
                    Print
                  </button>
                ) : null}
                {isCategoryTab && canManage ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setEditingReport(false);
                      setEmbeddedWcCaseId(null);
                      setEmbeddedOshaCaseId(null);
                      setFormError(null);
                      setShowForm((open) => !open);
                    }}
                  >
                    <i className="bx bx-plus me-1" />
                    New incident
                  </button>
                ) : null}
              </div>
            </div>

            {isCategoryTab ? (
              <FilterPanel
                searchId="incidents-search"
                searchValue={listSearch}
                onSearchChange={setListSearch}
                searchPlaceholder="Search title, person, location, status…"
                chips={
                  listSearch.trim()
                    ? [
                        {
                          id: "q",
                          label: `Search: ${listSearch.trim()}`,
                          onRemove: () => setListSearch(""),
                        },
                      ]
                    : []
                }
                onClearAll={() => setListSearch("")}
                onSubmit={() => undefined}
                extraFields={
                  <div className="col-md-4">
                    <label className="form-label" htmlFor="incidents-sort">
                      Sort
                    </label>
                    <select
                      id="incidents-sort"
                      className="form-select form-select-sm"
                      value={listSort}
                      onChange={(e) => setListSort(parseIncidentListSort(e.target.value))}
                    >
                      <option value="newest">Newest to oldest</option>
                      <option value="oldest">Oldest to newest</option>
                    </select>
                  </div>
                }
              />
            ) : null}

            {error ? (
              <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3" role="alert">
                <span className="flex-grow-1">{error}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => void reload()}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {isCategoryTab && !showForm ? (
              <div className="card border shadow-none mb-4 incidents-workspace__forms-hint">
                <div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                  <div className="min-w-0">
                    <h6 className="mb-1">Linked PDF forms</h6>
                    <p className="text-muted small mb-0">
                      Optional: attach a PDF form template from the Forms module.
                    </p>
                  </div>
                  <Link className="btn btn-sm btn-outline-secondary" href="/modules/forms/">
                    <i className="bx bx-file me-1" />
                    Manage PDF forms
                  </Link>
                </div>
              </div>
            ) : null}

            {showForm && canManage && isCategoryTab ? (
              <IncidentCreateForm
                category={tab}
                tenantId={tenantId}
                tenantName={tenantName}
                defaultReporter={defaultReporter}
                saving={saving}
                error={formError}
                canContinueToWorkersComp={canManageWc}
                canContinueToOsha={canManageOsha}
                onCancel={() => {
                  setShowForm(false);
                  setFormError(null);
                  setEmbeddedWcCaseId(null);
                  setEmbeddedOshaCaseId(null);
                }}
                onSubmit={submitNewReport}
                onContinueToWorkersComp={continueToWorkersComp}
                onContinueToOsha={continueToOsha}
              />
            ) : null}

            {editingReport && canManage && selectedReport && isCategoryTab ? (
              <IncidentCreateForm
                mode="edit"
                category={parseIncidentTab(selectedReport.category) || tab}
                initialIncident={selectedReport}
                tenantId={tenantId}
                tenantName={tenantName}
                defaultReporter={defaultReporter}
                saving={saving}
                error={formError}
                canContinueToWorkersComp={canManageWc}
                canContinueToOsha={canManageOsha}
                onCancel={() => {
                  setEditingReport(false);
                  setFormError(null);
                  setEmbeddedWcCaseId(null);
                  setEmbeddedOshaCaseId(null);
                }}
                onSubmit={submitEditReport}
                onContinueToWorkersComp={continueToWorkersComp}
                onContinueToOsha={continueToOsha}
              />
            ) : null}

            {embeddedWcCaseId && selectedReport ? (
              <WorkersCompInlinePanel
                caseId={embeddedWcCaseId}
                lockedIncidentId={selectedReport.id}
                lockedIncidentTitle={selectedReport.title}
                canManage={canManageWc}
                onClose={() => setEmbeddedWcCaseId(null)}
              />
            ) : null}

            {embeddedOshaCaseId && selectedReport ? (
              <OshaInlinePanel
                caseId={embeddedOshaCaseId}
                canManage={canManageOsha}
                lockedIncidentTitle={selectedReport.title}
                onClose={() => setEmbeddedOshaCaseId(null)}
                onSaved={(mapped) => {
                  const caseId = mapped.id;
                  if (!caseId) return;
                  setRecords((prev) =>
                    prev.map((row) =>
                      row.id === selectedReport.id ? { ...row, oshaCaseId: caseId } : row,
                    ),
                  );
                  setSelectedReport((prev) =>
                    prev && prev.id === selectedReport.id
                      ? { ...prev, oshaCaseId: caseId }
                      : prev,
                  );
                }}
              />
            ) : null}

            {loading ? (
              <p className="text-muted mb-0" role="status">
                Loading {incidentTabLabel(tab).toLowerCase()}…
              </p>
            ) : isProcessTab ? (
              <>
                {selectedReport && tab === "body-map" ? (
                  <IncidentReportPanel
                    incident={selectedReport}
                    onClose={closeIncidentReport}
                    canManage={canManage}
                    onEdit={() => {
                      setShowForm(false);
                      setEditingReport(true);
                      setFormError(null);
                    }}
                    canDelete={canDelete}
                    deleting={deleting}
                    onDelete={() => void deleteIncident(selectedReport)}
                    canManageWc={canManageWc}
                    openingWc={saving}
                    onOpenWorkersComp={() => void openWorkersCompCase(selectedReport)}
                    canManageOsha={
                      canManageOsha ||
                      (canViewOsha && Boolean(selectedReport.oshaCaseId.trim()))
                    }
                    openingOsha={saving}
                    onOpenOsha={() => void openOshaCase(selectedReport)}
                    printing={printing}
                    onPrint={() => void printIncident(selectedReport)}
                    printingOsha301={printingOsha301}
                    onPrintOsha301={() => void printOshaForm301(selectedReport)}
                    onDownloadPdf={() => void downloadIncidentPdf(selectedReport)}
                    onAttachmentsChange={(attachments) =>
                      applyIncidentAttachments(selectedReport.id, attachments)
                    }
                  />
                ) : null}
                {tab === "incident-workflow" ? (
                <IncidentsWorkflowPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, lifecycle) => patchIncident(incidentId, { lifecycle })}
                />
              ) : tab === "evaluation-checklist" ? (
                <IncidentsEvaluationPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, checklist) =>
                    patchIncident(incidentId, { evaluationChecklist: checklist })
                  }
                />
              ) : tab === "body-map" ? (
                <IncidentsBodyMapPanel
                  incidents={records}
                  initialRegionId={searchParams.get("region")}
                  selectedId={selectedIncidentId}
                  onSelectedIdChange={(id) => {
                    if (!id) {
                      closeIncidentReport();
                      return;
                    }
                    const record = records.find((row) => row.id === id);
                    if (record) openIncidentReport(record);
                    else syncIncidentUrl(id);
                  }}
                  canManage={canManage}
                  onSaveLocations={(incidentId, locations) =>
                    patchIncident(incidentId, { bodyLocations: locations })
                  }
                />
              ) : (
                <IncidentsRcaPanel
                  incidents={records}
                  canManage={canManage}
                  onSave={(incidentId, rca) => patchIncident(incidentId, { rootCauseAnalysis: rca })}
                />
              )}
              </>
            ) : (
              <>
                {selectedReport && !editingReport ? (
                  <IncidentReportPanel
                    incident={selectedReport}
                    onClose={closeIncidentReport}
                    canManage={canManage}
                    onEdit={() => {
                      setShowForm(false);
                      setEditingReport(true);
                      setFormError(null);
                    }}
                    canDelete={canDelete}
                    deleting={deleting}
                    onDelete={() => void deleteIncident(selectedReport)}
                    canManageWc={canManageWc}
                    openingWc={saving}
                    onOpenWorkersComp={() => void openWorkersCompCase(selectedReport)}
                    canManageOsha={
                      canManageOsha ||
                      (canViewOsha && Boolean(selectedReport.oshaCaseId.trim()))
                    }
                    openingOsha={saving}
                    onOpenOsha={() => void openOshaCase(selectedReport)}
                    printing={printing}
                    onPrint={() => void printIncident(selectedReport)}
                    printingOsha301={printingOsha301}
                    onPrintOsha301={() => void printOshaForm301(selectedReport)}
                    onDownloadPdf={() => void downloadIncidentPdf(selectedReport)}
                    onAttachmentsChange={(attachments) =>
                      applyIncidentAttachments(selectedReport.id, attachments)
                    }
                  />
                ) : null}
                {tab === "injuries" ? (
                  <>
                    {records.length === 0 ? (
                      <div className="text-center py-5 card border shadow-none mb-4">
                        <div className="card-body">
                          <div className="avatar avatar-lg mx-auto mb-3">
                            <span className="avatar-initial rounded-circle bg-label-secondary">
                              <i className="bx bx-clipboard" />
                            </span>
                          </div>
                          <p className="text-muted mb-0">No injuries recorded yet.</p>
                        </div>
                      </div>
                    ) : filteredCount === 0 ? (
                      <div className="text-center py-5 card border shadow-none mb-4">
                        <div className="card-body">
                          <p className="text-muted mb-0">No injuries match your search.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-muted small mb-2">
                          {filteredCount} record{filteredCount === 1 ? "" : "s"}
                          {listSearch.trim() && filteredCount !== records.length
                            ? ` (of ${records.length})`
                            : ""}
                          {yearGroups.length > 1 ? ` · ${yearGroups.length} years` : ""}
                        </p>
                        {undatedCount > 0 ? (
                          <div className="alert alert-warning py-2 small" role="status">
                            {undatedCount === 1
                              ? "1 incident is missing an occurrence date."
                              : `${undatedCount} incidents are missing an occurrence date.`}{" "}
                            Edit those reports and set <strong>Date occurred</strong> so they sort
                            and group correctly.
                          </div>
                        ) : null}
                        <div className="table-responsive text-nowrap card border shadow-none mb-4">
                          <table className="table table-hover mb-0">
                            <thead>
                              <tr>
                                <th scope="col">Title</th>
                                <th scope="col">Status</th>
                                <th scope="col">Severity</th>
                                <th scope="col">Body</th>
                                <th scope="col">Location</th>
                                <th scope="col">Claims / OSHA</th>
                              </tr>
                            </thead>
                            <tbody className="table-border-bottom-0">
                              {renderYearGroupedRows(yearGroups, 6, (record) => (
                                <>
                                  <td>
                                    <Link
                                      href={incidentWorkspaceHref(tab, { incident: record.id })}
                                      className="fw-semibold d-block text-decoration-none text-body"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        openIncidentReport(record);
                                      }}
                                    >
                                      {record.title}
                                    </Link>
                                    {record.description ? (
                                      <span className="text-muted small d-block">
                                        {record.description}
                                      </span>
                                    ) : null}
                                    {undatedIncidentNotice(record)}
                                  </td>
                                  <td>
                                    <span className={`badge ${statusBadgeClass(record.status)}`}>
                                      {record.status}
                                    </span>
                                  </td>
                                  <td className="text-muted">{record.severity || "—"}</td>
                                  <td className="text-muted small">
                                    {bodyLocationSummaryLabel(record.bodyLocations, regions) || "—"}
                                  </td>
                                  <td className="text-muted">{record.location || "—"}</td>
                                  <td>
                                    <div className="d-flex flex-wrap gap-1">
                                      {canManageWc ? (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          disabled={saving}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            void openWorkersCompCase(record);
                                          }}
                                        >
                                          {record.workersCompCaseId.trim()
                                            ? "View WC"
                                            : "Open WC"}
                                        </button>
                                      ) : null}
                                      {canManageOsha ||
                                      (canViewOsha && record.oshaCaseId.trim()) ? (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary"
                                          disabled={saving}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            openIncidentReport(record);
                                            void openOshaCase(record);
                                          }}
                                        >
                                          {record.oshaCaseId.trim() ? "View OSHA" : "Enter OSHA"}
                                        </button>
                                      ) : null}
                                      {!canManageWc &&
                                      !(canManageOsha || (canViewOsha && record.oshaCaseId.trim())) ? (
                                        <span className="text-muted">—</span>
                                      ) : null}
                                    </div>
                                  </td>
                                </>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    <IncidentsBodyMapPanel
                      compact
                      incidents={records}
                      title="Injury body map"
                      mapHref="/modules/incidents/?tab=body-map"
                      selectedId={selectedIncidentId}
                      onSelectedIdChange={(id) => {
                        if (!id) {
                          closeIncidentReport();
                          return;
                        }
                        const record = records.find((row) => row.id === id);
                        if (record) openIncidentReport(record);
                        else syncIncidentUrl(id);
                      }}
                      canManage={canManage}
                      onSaveLocations={(incidentId, locations) =>
                        patchIncident(incidentId, { bodyLocations: locations })
                      }
                    />
                  </>
                ) : records.length === 0 ? (
                  <div className="text-center py-5">
                    <div className="avatar avatar-lg mx-auto mb-3">
                      <span className="avatar-initial rounded-circle bg-label-secondary">
                        <i className="bx bx-clipboard" />
                      </span>
                    </div>
                    <p className="text-muted mb-0">
                      No {incidentTabLabel(tab).toLowerCase()} recorded yet.
                    </p>
                  </div>
                ) : filteredCount === 0 ? (
                  <div className="text-center py-5">
                    <p className="text-muted mb-0">
                      No {incidentTabLabel(tab).toLowerCase()} match your search.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-muted small mb-2">
                      {filteredCount} record{filteredCount === 1 ? "" : "s"}
                      {listSearch.trim() && filteredCount !== records.length
                        ? ` (of ${records.length})`
                        : ""}
                      {yearGroups.length > 1 ? ` · ${yearGroups.length} years` : ""}
                    </p>
                    {undatedCount > 0 ? (
                      <div className="alert alert-warning py-2 small" role="status">
                        {undatedCount === 1
                          ? "1 incident is missing an occurrence date."
                          : `${undatedCount} incidents are missing an occurrence date.`}{" "}
                        Edit those reports and set <strong>Date occurred</strong> so they sort and
                        group correctly.
                      </div>
                    ) : null}
                    <div className="table-responsive text-nowrap">
                      <table className="table table-hover mb-0">
                        <thead>
                          <tr>
                            <th scope="col">Title</th>
                            <th scope="col">Status</th>
                            <th scope="col">Severity</th>
                            <th scope="col">Location</th>
                          </tr>
                        </thead>
                        <tbody className="table-border-bottom-0">
                          {renderYearGroupedRows(yearGroups, 4, (record) => (
                            <>
                              <td>
                                <Link
                                  href={incidentWorkspaceHref(tab, { incident: record.id })}
                                  className="fw-semibold d-block text-decoration-none text-body"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    openIncidentReport(record);
                                  }}
                                >
                                  {record.title}
                                </Link>
                                {record.description ? (
                                  <span className="text-muted small d-block">
                                    {record.description}
                                  </span>
                                ) : null}
                                {undatedIncidentNotice(record)}
                              </td>
                              <td>
                                <span className={`badge ${statusBadgeClass(record.status)}`}>
                                  {record.status}
                                </span>
                              </td>
                              <td className="text-muted">{record.severity || "—"}</td>
                              <td className="text-muted">{record.location || "—"}</td>
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
