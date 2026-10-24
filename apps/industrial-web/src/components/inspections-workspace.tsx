"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { canDeleteInspections } from "@/lib/form-signatory";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import { useOrgLocationLookups } from "@/hooks/use-org-location-lookups";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import {
  canCompleteInspection,
  dedupeInspectionTemplates,
  defaultInspectionTitle,
  FALLBACK_INSPECTION_TEMPLATE,
  groupInspectionItemsBySection,
  importInspectionTemplateFile,
  renameInspectionTemplate,
  inspectionTypeLabel,
  itemsFromTemplate,
  noFindingItems,
  parseInspectionRun,
  statusBadgeClass,
  type InspectionAnswer,
  type InspectionPhoto,
  type InspectionRunItem,
  type InspectionTemplate,
} from "@/lib/inspections-module";
import { compressImageToDataUrl, DEFAULT_MAX_DATA_URL_LENGTH } from "@/lib/compress-image";
import { ForgePrintButton } from "@/components/forge-print-button";
import { inspectionPrintFieldValues } from "@/lib/module-print-fields";

type Department = {
  id: string;
  name: string;
  siteId?: string | null;
  divisionName?: string | null;
  contactPersonnelId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

type PersonnelOption = { id: string; displayName: string };

type InspectionRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  status?: string;
  inspectionType?: string | null;
  templateName?: string | null;
  closeoutUrl?: string | null;
};

const TABS = [
  { id: "list" as const, label: "Inspections" },
  { id: "templates" as const, label: "Templates" },
  { id: "start" as const, label: "Start" },
  { id: "run" as const, label: "Checklist" },
  { id: "report" as const, label: "Report" },
  { id: "open-items" as const, label: "Open items" },
  { id: "contacts" as const, label: "Dept contacts" },
];

function fileToDataUrl(file: File): Promise<InspectionPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read photo"));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve({
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name || "photo.jpg",
        contentType: file.type || "image/jpeg",
        dataUrl,
      });
    };
    reader.readAsDataURL(file);
  });
}

async function compressImageFile(file: File): Promise<InspectionPhoto> {
  const dataUrl = await compressImageToDataUrl(file, DEFAULT_MAX_DATA_URL_LENGTH);
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name.replace(/\.\w+$/, "") + ".jpg",
    contentType: "image/jpeg",
    dataUrl,
  };
}

export function InspectionsWorkspace({ moduleName }: { moduleName: string }) {
  const searchParams = useSearchParams();
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.inspections.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.inspections.manage") || permissions.has("industrial.admin");
  const canDelete = canDeleteInspections({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    permissions: me?.permissions,
  });
  const org = useOrgLocationLookups(me?.tenantId);
  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "INSPECTIONS",
    canView,
  });

  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("list");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "INSPECTIONS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "list",
      ),
    );
  }, [visibleTabs]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([FALLBACK_INSPECTION_TEMPLATE]);
  const [personnel, setPersonnel] = useState<PersonnelOption[]>([]);
  const [openActions, setOpenActions] = useState<Array<Record<string, unknown>>>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [siteId, setSiteId] = useState("");
  const [divisionName, setDivisionName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [templateId, setTemplateId] = useState(FALLBACK_INSPECTION_TEMPLATE.id);
  const [responsiblePersonnelId, setResponsiblePersonnelId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [items, setItems] = useState<InspectionRunItem[]>([]);
  const [notesModalItemId, setNotesModalItemId] = useState<string | null>(null);
  const [notesModalError, setNotesModalError] = useState<string | null>(null);
  const [responsibleTouched, setResponsibleTouched] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [qrTargetType, setQrTargetType] = useState("");
  const [qrTargetId, setQrTargetId] = useState("");
  const [qrLinkId, setQrLinkId] = useState("");
  const [inspectionFrequency, setInspectionFrequency] = useState("");
  const [templateUploadTitle, setTemplateUploadTitle] = useState("");
  const [templateUploadNotice, setTemplateUploadNotice] = useState<string | null>(null);
  const [templateUploadPreview, setTemplateUploadPreview] = useState<InspectionTemplate | null>(
    null,
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  /** Open category headings on the Checklist tab (section name → open). */
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

  const selectedDept = departments.find((d) => d.id === departmentId);
  const selectedTemplate =
    templates.find((t) => t.id === templateId) ?? FALLBACK_INSPECTION_TEMPLATE;
  const checklistSections = useMemo(() => groupInspectionItemsBySection(items), [items]);

  useEffect(() => {
    if (!selectedId || checklistSections.length === 0) {
      setOpenSections(new Set());
      return;
    }
    // Open the first category by default so large templates stay manageable.
    setOpenSections(new Set([checklistSections[0]!.section]));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when inspection changes

  const refreshList = useCallback(async () => {
    const data = await apiGet<{ items?: InspectionRow[] }>("/api/v1/industrial/inspections", {
      query: { page: "1", pageSize: "100" },
    });
    setRows(
      (data.items ?? []).filter((row) => {
        const payload = (row.sourcePayload as Record<string, unknown> | undefined) ?? row;
        return payload.isTemplate !== true && row.inspectionType !== "TEMPLATE";
      }),
    );
  }, []);

  const refreshLookups = useCallback(async () => {
    const [deptData, tplData, peopleData, caData] = await Promise.all([
      apiGet<Department[] | { items?: Department[] }>("/api/v1/industrial/departments"),
      apiGet<InspectionTemplate[]>("/api/v1/industrial/inspection-templates"),
      apiGet<{ items?: Array<Record<string, unknown>> }>("/api/v1/industrial/personnel", {
        query: { page: "1", pageSize: "100", sort: "lastName" },
      }),
      apiGet<{ items?: Array<Record<string, unknown>> }>("/api/v1/industrial/corrective-actions", {
        query: { page: "1", pageSize: "100" },
      }),
    ]);
    const depts = Array.isArray(deptData) ? deptData : (deptData.items ?? []);
    setDepartments(depts);
    const nextTemplates =
      Array.isArray(tplData) && tplData.length
        ? dedupeInspectionTemplates(tplData)
        : [FALLBACK_INSPECTION_TEMPLATE];
    setTemplates(nextTemplates);
    setTemplateId((current) =>
      nextTemplates.some((t) => t.id === current) ? current : (nextTemplates[0]?.id ?? current),
    );
    setPersonnel(
      (peopleData.items ?? [])
        .map((p) => ({
          id: String(p.id ?? ""),
          displayName: String(p.displayName ?? p.name ?? ""),
        }))
        .filter((p) => p.id && p.displayName),
    );
    setOpenActions(
      (caData.items ?? []).filter(
        (row) =>
          String(row.parentEntityType ?? "").toUpperCase() === "INSPECTION" &&
          String(row.status ?? "").toUpperCase() !== "COMPLETED",
      ),
    );
  }, []);

  useEffect(() => {
    if (!awsReady) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await Promise.all([refreshList(), refreshLookups()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load inspections");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [awsReady, refreshList, refreshLookups]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const targetType = searchParams.get("targetType")?.trim().toUpperCase() ?? "";
    const targetId = searchParams.get("targetId")?.trim() ?? "";
    const frequency = searchParams.get("frequency")?.trim().toUpperCase() ?? "";
    const linkId = searchParams.get("qrLinkId")?.trim() ?? "";
    const templateFromUrl = searchParams.get("templateId")?.trim() ?? "";

    if (tabParam === "start") setTab("start");
    if (targetType) setQrTargetType(targetType);
    if (targetId) setQrTargetId(targetId);
    if (linkId) setQrLinkId(linkId);
    if (frequency) setInspectionFrequency(frequency);
    if (templateFromUrl) setTemplateId(templateFromUrl);

    if (targetType && targetId && frequency) {
      const freqLabel =
        frequency === "DAILY"
          ? "Daily inspection"
          : frequency === "WEEKLY"
            ? "Weekly inspection"
            : frequency === "MONTHLY"
              ? "Monthly inspection"
              : "Inspection";
      if (!titleTouched) {
        setTitle(`${freqLabel} — ${targetType}`);
      }
    }
  }, [searchParams, titleTouched]);

  useEffect(() => {
    if (titleTouched) return;
    setTitle(
      defaultInspectionTitle({
        divisionName,
        departmentName: selectedDept?.name || "",
      }),
    );
  }, [divisionName, selectedDept?.name, titleTouched]);

  useEffect(() => {
    if (!departmentId) return;
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept) return;
    if (!responsibleTouched) {
      if (dept.contactPersonnelId) {
        setResponsiblePersonnelId(dept.contactPersonnelId);
        const contactName =
          dept.contactName?.trim() ||
          personnel.find((p) => p.id === dept.contactPersonnelId)?.displayName ||
          "";
        setResponsibleName(contactName);
      } else {
        setResponsiblePersonnelId("");
        setResponsibleName("");
      }
    }
    const preferred = templates.find(
      (t) =>
        t.departmentHint &&
        dept.name &&
        t.departmentHint.toLowerCase().includes(dept.name.toLowerCase()),
    );
    if (preferred) setTemplateId(preferred.id);
  }, [departmentId, departments, templates, personnel, responsibleTouched]);

  const notesModalItem = useMemo(
    () => items.find((item) => item.id === notesModalItemId) ?? null,
    [items, notesModalItemId],
  );

  useEffect(() => {
    if (!notesModalItemId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`notes-modal-${notesModalItemId}`)?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [notesModalItemId]);

  async function openInspection(id: string) {
    setBusy(true);
    setError(null);
    try {
      const row = await apiGet<InspectionRow>(
        `/api/v1/industrial/inspections/${encodeURIComponent(id)}`,
      );
      const run = parseInspectionRun(row as Record<string, unknown>);
      setSelectedId(id);
      setTitle(String(row.title ?? run.templateName ?? ""));
      const sourcePayload =
        (row.sourcePayload as Record<string, unknown> | undefined) ??
        (row.source_payload as Record<string, unknown> | undefined) ??
        {};
      const rawSiteId = row.siteId ?? sourcePayload.siteId;
      const rawDivision = sourcePayload.divisionName ?? row.divisionName;
      setSiteId(typeof rawSiteId === "string" ? rawSiteId : "");
      setDivisionName(typeof rawDivision === "string" ? rawDivision : "");
      setDepartmentId(run.departmentId || "");
      setTemplateId(run.templateId || FALLBACK_INSPECTION_TEMPLATE.id);
      setResponsiblePersonnelId(run.responsiblePersonnelId || "");
      setResponsibleName(run.responsibleName || "");
      setItems(run.items.length ? run.items : itemsFromTemplate(FALLBACK_INSPECTION_TEMPLATE));
      setTitleTouched(true);
      setTab(String(row.status ?? "").toUpperCase() === "COMPLETED" ? "report" : "run");
      const firstNo = run.items.find((i) => i.answer === "NO" && !(i.notes ?? "").trim());
      if (firstNo) setNotesModalItemId(firstNo.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to open inspection");
    } finally {
      setBusy(false);
    }
  }

  async function startInspection(ev: FormEvent) {
    ev.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const deptContactId = selectedDept?.contactPersonnelId || "";
      const deptContactName =
        selectedDept?.contactName?.trim() ||
        personnel.find((p) => p.id === deptContactId)?.displayName ||
        "";
      const resolvedResponsibleId = responsiblePersonnelId || deptContactId || null;
      const resolvedResponsibleName =
        responsibleName ||
        deptContactName ||
        personnel.find((p) => p.id === resolvedResponsibleId)?.displayName ||
        "";
      const created = await apiSend<InspectionRow>("/api/v1/industrial/inspections", "POST", {
        title:
          title.trim() ||
          defaultInspectionTitle({
            divisionName,
            departmentName: selectedDept?.name || "",
          }),
        siteId: siteId || selectedDept?.siteId || null,
        divisionName: divisionName || null,
        departmentId: departmentId || null,
        departmentName: selectedDept?.name || "",
        templateId,
        responsiblePersonnelId: resolvedResponsibleId,
        responsibleName: resolvedResponsibleName,
        targetType: qrTargetType || null,
        targetId: qrTargetId || null,
        qrLinkId: qrLinkId || null,
        inspectionFrequency: inspectionFrequency || null,
        qrScanSource: Boolean(qrLinkId || qrTargetId),
        appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      await refreshList();
      await openInspection(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start inspection");
    } finally {
      setBusy(false);
    }
  }

  async function onTemplateFileSelected(file: File | null) {
    if (!file || !canManage) return;
    const lower = file.name.toLowerCase();
    if (
      !lower.endsWith(".xlsx") &&
      !lower.endsWith(".xls") &&
      !lower.endsWith(".csv") &&
      !lower.endsWith(".pdf")
    ) {
      setError("Upload an Excel (.xlsx), CSV, or PDF checklist.");
      return;
    }
    setBusy(true);
    setError(null);
    setTemplateUploadNotice(null);
    setTemplateUploadPreview(null);
    try {
      const result = await importInspectionTemplateFile(file, {
        ...(templateUploadTitle.trim() ? { title: templateUploadTitle.trim() } : {}),
      });
      setTemplateUploadPreview(result.template);
      setTemplateUploadNotice(
        result.updated
          ? `Updated digital template “${result.template.name}” (${result.itemCount} items).`
          : `Created digital template “${result.template.name}” (${result.itemCount} items).`,
      );
      setTemplateId(result.template.id);
      await refreshLookups();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not import inspection template",
      );
    } finally {
      setBusy(false);
    }
  }

  function beginRenameTemplate(template: InspectionTemplate) {
    if (!canManage || template.source === "builtin") return;
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    setError(null);
  }

  function cancelRenameTemplate() {
    setEditingTemplateId(null);
    setEditingTemplateName("");
  }

  async function saveRenameTemplate(templateId: string) {
    if (!canManage) return;
    const name = editingTemplateName.trim();
    if (!name) {
      setError("Template name is required");
      return;
    }
    setRenamingTemplateId(templateId);
    setError(null);
    try {
      const updated = await renameInspectionTemplate(templateId, name);
      setTemplates((prev) =>
        dedupeInspectionTemplates(
          prev.map((t) => (t.id === templateId ? { ...t, name: updated.name } : t)),
        ),
      );
      setTemplateUploadPreview((prev) =>
        prev?.id === templateId ? { ...prev, name: updated.name } : prev,
      );
      setEditingTemplateId(null);
      setEditingTemplateName("");
      setTemplateUploadNotice(`Renamed template to “${updated.name}”.`);
      await refreshLookups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not rename template");
    } finally {
      setRenamingTemplateId(null);
    }
  }

  async function persistItems(nextItems: InspectionRunItem[]) {
    if (!selectedId || !canManage) return;
    setItems(nextItems);
    try {
      await apiSend(`/api/v1/industrial/inspections/${encodeURIComponent(selectedId)}`, "PATCH", {
        title,
        siteId: siteId || selectedDept?.siteId || null,
        divisionName: divisionName || null,
        departmentId: departmentId || null,
        departmentName: selectedDept?.name || "",
        templateId,
        responsiblePersonnelId: responsiblePersonnelId || null,
        responsibleName,
        items: nextItems,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save checklist");
    }
  }

  function setAnswer(itemId: string, answer: InspectionAnswer) {
    const next = items.map((item) => (item.id === itemId ? { ...item, answer } : item));
    if (answer === "NO") {
      setNotesModalError(null);
      setNotesModalItemId(itemId);
    } else if (notesModalItemId === itemId) {
      setNotesModalItemId(null);
      setNotesModalError(null);
    }
    void persistItems(next);
  }

  function openFindingNotes(itemId: string) {
    setNotesModalError(null);
    setNotesModalItemId(itemId);
  }

  function closeFindingNotes() {
    if (!notesModalItem) {
      setNotesModalItemId(null);
      return;
    }
    if (notesModalItem.answer === "NO" && !(notesModalItem.notes ?? "").trim()) {
      setNotesModalError("Notes are required before you can continue.");
      document.getElementById(`notes-modal-${notesModalItem.id}`)?.focus();
      return;
    }
    setNotesModalError(null);
    setNotesModalItemId(null);
  }

  function cancelNoFinding() {
    if (!notesModalItem) return;
    const itemId = notesModalItem.id;
    setNotesModalError(null);
    setNotesModalItemId(null);
    const next: InspectionRunItem[] = items.map((item) =>
      item.id === itemId ? { ...item, answer: null as InspectionAnswer } : item,
    );
    void persistItems(next);
  }

  function setNotes(itemId: string, notes: string) {
    const next = items.map((item) => (item.id === itemId ? { ...item, notes } : item));
    void persistItems(next);
  }

  async function addPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    const photos: InspectionPhoto[] = [];
    for (const file of Array.from(files)) {
      photos.push(await compressImageFile(file));
    }
    const next = items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            answer: item.answer ?? "NO",
            photos: [...(item.photos ?? []), ...photos],
            notes:
              item.notes || `Photo evidence attached (${photos.map((p) => p.fileName).join(", ")})`,
          }
        : item,
    );
    setNotesModalItemId(itemId);
    await persistItems(next);
  }

  async function deleteInspection(id: string, inspectionTitle: string) {
    if (!canDelete || deletingId) return;
    const confirmed = window.confirm(
      `Delete "${inspectionTitle}"?\n\nThis removes the inspection from the list. The deletion is recorded in the audit log.`,
    );
    if (!confirmed) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/inspections/${encodeURIComponent(id)}/delete`, "POST", {});
      setRows((prev) => prev.filter((row) => row.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setItems([]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete inspection");
    } finally {
      setDeletingId(null);
    }
  }

  async function completeInspection() {
    if (!selectedId || !canManage) return;
    const check = canCompleteInspection(items);
    if (!check.ok) {
      setError(check.reason ?? "Cannot complete");
      const missing = items.find((i) => i.answer === "NO" && !(i.notes ?? "").trim());
      if (missing) {
        setNotesModalError("Notes are required for each No finding.");
        setNotesModalItemId(missing.id);
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const completed = await apiSend<InspectionRow>(
        `/api/v1/industrial/inspections/${encodeURIComponent(selectedId)}/complete`,
        "POST",
        {
          items,
          appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      );
      const run = parseInspectionRun(completed as Record<string, unknown>);
      setItems(run.items);
      await refreshList();
      await refreshLookups();
      setTab("report");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to complete inspection");
    } finally {
      setBusy(false);
    }
  }

  async function completeOpenItem(id: string) {
    if (!canManage) return;
    const notes = window.prompt("Close-out notes");
    if (notes == null) return;
    setBusy(true);
    try {
      await apiSend(
        `/api/v1/industrial/corrective-actions/${encodeURIComponent(id)}/complete`,
        "POST",
        {
          notes,
          completedByName: "Inspector",
        },
      );
      await refreshLookups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to close item");
    } finally {
      setBusy(false);
    }
  }

  async function saveDeptContact(dept: Department, personnelId: string) {
    if (!canManage) return;
    setBusy(true);
    try {
      const person = personnel.find((p) => p.id === personnelId);
      await apiSend(
        `/api/v1/industrial/departments/${encodeURIComponent(dept.id)}/contact`,
        "PATCH",
        {
          contactPersonnelId: personnelId || null,
          contactName: person?.displayName || "",
        },
      );
      await refreshLookups();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save department contact");
    } finally {
      setBusy(false);
    }
  }

  const findings = useMemo(() => noFindingItems(items), [items]);

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view inspections.
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
    <section aria-labelledby="inspections-title" data-walkthrough="safety-inspections">
      <ModuleWorkspaceHeader
        id="inspections-title"
        title={moduleName}
        description="Run department checklists, capture No findings with notes and photos, and close out open items."
        onRefresh={() => void Promise.all([refreshList(), refreshLookups()])}
        refreshing={busy}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Inspections sections"
      >
        {tab === "list" ? (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Recent inspections</h5>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setTab("start")}
                >
                  Start inspection
                </button>
              ) : null}
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Inspection type</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No inspections yet.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const run = parseInspectionRun(row as Record<string, unknown>);
                      return (
                        <tr key={row.id}>
                          <td>{row.title || "—"}</td>
                          <td>
                            {inspectionTypeLabel({
                              inspectionType: row.inspectionType ?? null,
                              templateName: run.templateName || row.templateName || null,
                              sourcePayload: row.sourcePayload,
                            })}
                          </td>
                          <td>
                            <span className={`badge ${statusBadgeClass(String(row.status ?? ""))}`}>
                              {String(row.status ?? "—")}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                              <ForgePrintButton
                                module="INSPECTIONS"
                                recordType="inspection"
                                recordId={row.id}
                                fieldValues={(() => {
                                  const closeout = row.closeoutUrl;
                                  return inspectionPrintFieldValues(
                                    row,
                                    typeof closeout === "string"
                                      ? { closeoutUrl: closeout }
                                      : undefined,
                                  );
                                })()}
                              />
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => void openInspection(row.id)}
                              >
                                Open
                              </button>
                              {canDelete ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={deletingId === row.id}
                                  onClick={() =>
                                    void deleteInspection(row.id, String(row.title ?? "Inspection"))
                                  }
                                >
                                  {deletingId === row.id ? "Deleting…" : "Delete"}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "templates" ? (
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card h-100">
                <div className="card-header">
                  <h5 className="card-title mb-0">Upload template</h5>
                </div>
                <div className="card-body">
                  <p className="text-muted small">
                    Upload an Excel, CSV, or PDF checklist. Forge turns each question into a Yes /
                    No / N/A digital inspection you can run from Start.
                  </p>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="insp-template-title">
                      Template name (optional)
                    </label>
                    <input
                      id="insp-template-title"
                      className="form-control"
                      value={templateUploadTitle}
                      onChange={(ev) => setTemplateUploadTitle(ev.target.value)}
                      placeholder="Defaults to file name / form title"
                      disabled={!canManage || busy}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="insp-template-file">
                      Checklist file
                    </label>
                    <input
                      id="insp-template-file"
                      type="file"
                      className="form-control"
                      accept=".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      disabled={!canManage || busy}
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] ?? null;
                        void onTemplateFileSelected(file);
                        ev.target.value = "";
                      }}
                    />
                    <div className="form-text">
                      Tip: section headings in column A, questions in column B — or use Question /
                      Section headers.
                    </div>
                  </div>
                  {!canManage ? (
                    <p className="text-muted small mb-0">
                      You need manage permission to upload templates.
                    </p>
                  ) : null}
                  {templateUploadNotice ? (
                    <div className="alert alert-success py-2 mb-0" role="status">
                      {templateUploadNotice}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center gap-2">
                  <h5 className="card-title mb-0">Digital templates</h5>
                  {canManage && templateUploadPreview ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setTemplateId(templateUploadPreview.id);
                        setTab("start");
                      }}
                    >
                      Use on Start
                    </button>
                  ) : null}
                </div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Source</th>
                        <th>Items</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {templates.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No templates yet. Upload a checklist to create one.
                          </td>
                        </tr>
                      ) : (
                        templates.map((t) => (
                          <tr key={t.id}>
                            <td>
                              {editingTemplateId === t.id ? (
                                <div className="d-flex flex-wrap gap-2 align-items-center">
                                  <input
                                    className="form-control form-control-sm"
                                    value={editingTemplateName}
                                    onChange={(ev) => setEditingTemplateName(ev.target.value)}
                                    onKeyDown={(ev) => {
                                      if (ev.key === "Enter") {
                                        ev.preventDefault();
                                        void saveRenameTemplate(t.id);
                                      }
                                      if (ev.key === "Escape") cancelRenameTemplate();
                                    }}
                                    disabled={renamingTemplateId === t.id}
                                    autoFocus
                                    aria-label="Template name"
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-primary"
                                    disabled={
                                      renamingTemplateId === t.id || !editingTemplateName.trim()
                                    }
                                    onClick={() => void saveRenameTemplate(t.id)}
                                  >
                                    {renamingTemplateId === t.id ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    disabled={renamingTemplateId === t.id}
                                    onClick={cancelRenameTemplate}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                t.name
                              )}
                            </td>
                            <td className="text-muted text-capitalize">{t.source}</td>
                            <td>{t.items.length}</td>
                            <td className="text-end">
                              {canManage ? (
                                <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                                  {t.source !== "builtin" && editingTemplateId !== t.id ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      disabled={busy || renamingTemplateId != null}
                                      onClick={() => beginRenameTemplate(t)}
                                    >
                                      Rename
                                    </button>
                                  ) : null}
                                  {editingTemplateId !== t.id ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      onClick={() => {
                                        setTemplateId(t.id);
                                        setTab("start");
                                      }}
                                    >
                                      Start with this
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {templateUploadPreview ? (
                  <div className="card-body border-top">
                    <h6 className="mb-2">Preview: {templateUploadPreview.name}</h6>
                    <div className="accordion accordion-flush" id="insp-template-preview">
                      {groupInspectionItemsBySection(templateUploadPreview.items)
                        .slice(0, 8)
                        .map((group, groupIndex) => (
                          <details
                            key={group.section}
                            className="border-bottom py-2"
                            open={groupIndex === 0}
                          >
                            <summary className="fw-bold" style={{ cursor: "pointer" }}>
                              {group.section}{" "}
                              <span className="text-muted fw-normal">({group.items.length})</span>
                            </summary>
                            <ul className="small mb-0 mt-2 ps-3">
                              {group.items.slice(0, 6).map((item) => (
                                <li key={item.id}>{item.label}</li>
                              ))}
                              {group.items.length > 6 ? (
                                <li className="text-muted">…and {group.items.length - 6} more</li>
                              ) : null}
                            </ul>
                          </details>
                        ))}
                    </div>
                    {groupInspectionItemsBySection(templateUploadPreview.items).length > 8 ? (
                      <p className="small text-muted mb-0 mt-2">
                        …and more categories on the Checklist after you start.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "start" ? (
          <form className="card" onSubmit={(ev) => void startInspection(ev)}>
            <div className="card-header">
              <h5 className="card-title mb-0">Start inspection</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <OrgLocationCascade
                  idPrefix="insp"
                  required
                  loading={org.loading}
                  sites={org.sites}
                  departments={
                    departments.length > 0
                      ? departments.map((d) => ({
                          id: d.id,
                          label: d.name,
                          siteId: d.siteId ?? null,
                          divisionName: d.divisionName ?? null,
                        }))
                      : org.departments
                  }
                  divisionEntries={org.divisionEntries}
                  value={{
                    siteId,
                    siteName: org.sites.find((s) => s.id === siteId)?.label ?? "",
                    divisionName,
                    departmentId,
                    departmentName: selectedDept?.name ?? "",
                  }}
                  onChange={(next) => {
                    setSiteId(next.siteId);
                    setDivisionName(next.divisionName);
                    setDepartmentId(next.departmentId);
                    setTitleTouched(false);
                    setResponsibleTouched(false);
                  }}
                />
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-template">
                    Template
                  </label>
                  <select
                    id="insp-template"
                    className="form-select"
                    value={templateId}
                    onChange={(ev) => setTemplateId(ev.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-title">
                    Inspection name
                  </label>
                  <input
                    id="insp-title"
                    className="form-control"
                    value={title}
                    onChange={(ev) => {
                      setTitleTouched(true);
                      setTitle(ev.target.value);
                    }}
                  />
                  <div className="form-text">Defaults to yy-mm-dd Division, Department.</div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="insp-resp">
                    Responsible party
                  </label>
                  <select
                    id="insp-resp"
                    className="form-select"
                    value={responsiblePersonnelId}
                    onChange={(ev) => {
                      setResponsibleTouched(true);
                      setResponsiblePersonnelId(ev.target.value);
                      const person = personnel.find((p) => p.id === ev.target.value);
                      setResponsibleName(person?.displayName || "");
                    }}
                  >
                    <option value="">
                      {selectedDept?.contactPersonnelId
                        ? "Select contact"
                        : "No department contact set"}
                    </option>
                    {personnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                        {selectedDept?.contactPersonnelId === p.id ? " (department contact)" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="form-text">
                    Defaults to the department contact. Set contacts under the Department contacts
                    tab.
                  </div>
                </div>
              </div>
              <button type="submit" className="btn btn-primary mt-3" disabled={!canManage || busy}>
                Start checklist
              </button>
            </div>
          </form>
        ) : null}

        {tab === "run" ? (
          <div>
            {!selectedId ? (
              <p className="text-muted mb-0">Open or start an inspection to run the checklist.</p>
            ) : (
              <>
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                  <div>
                    <h5 className="mb-0">{title}</h5>
                    <small className="text-muted">
                      {selectedDept?.name || "No department"} · {selectedTemplate.name} ·{" "}
                      {responsibleName || "No responsible party"}
                    </small>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {checklistSections.length > 1 ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() =>
                            setOpenSections(new Set(checklistSections.map((g) => g.section)))
                          }
                        >
                          Expand all
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setOpenSections(new Set())}
                        >
                          Collapse all
                        </button>
                      </>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void completeInspection()}
                      >
                        Complete inspection
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="accordion" id="inspection-checklist-categories">
                  {checklistSections.map((group, groupIndex) => {
                    const sectionId = `insp-section-${groupIndex}`;
                    const open = openSections.has(group.section);
                    const answered = group.items.filter((i) => i.answer != null).length;
                    const nos = group.items.filter((i) => i.answer === "NO").length;
                    return (
                      <div className="accordion-item" key={group.section}>
                        <h2 className="accordion-header" id={`${sectionId}-heading`}>
                          <button
                            type="button"
                            className={`accordion-button${open ? "" : " collapsed"} fw-bold`}
                            aria-expanded={open}
                            aria-controls={sectionId}
                            onClick={() => {
                              setOpenSections((prev) => {
                                const next = new Set(prev);
                                if (next.has(group.section)) next.delete(group.section);
                                else next.add(group.section);
                                return next;
                              });
                            }}
                          >
                            <span className="me-auto">{group.section}</span>
                            <span className="badge bg-label-secondary ms-2 me-2">
                              {answered}/{group.items.length}
                            </span>
                            {nos > 0 ? (
                              <span className="badge bg-label-danger me-2">{nos} No</span>
                            ) : null}
                          </button>
                        </h2>
                        <div
                          id={sectionId}
                          className={`accordion-collapse collapse${open ? " show" : ""}`}
                          aria-labelledby={`${sectionId}-heading`}
                        >
                          <div className="accordion-body d-flex flex-column gap-2">
                            {group.items.map((item) => {
                              const notesMissing =
                                item.answer === "NO" && !(item.notes ?? "").trim();
                              return (
                                <div className="card" key={item.id}>
                                  <div className="card-body py-3">
                                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                                      <div
                                        className="fw-medium flex-grow-1 pe-lg-3"
                                        style={{ minWidth: 0 }}
                                      >
                                        {item.label}
                                        {item.answer === "NO" ? (
                                          <div className="mt-2">
                                            {notesMissing ? (
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-danger"
                                                disabled={!canManage}
                                                onClick={() => openFindingNotes(item.id)}
                                              >
                                                Add required notes
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                className="btn btn-link btn-sm text-start p-0"
                                                disabled={!canManage}
                                                onClick={() => openFindingNotes(item.id)}
                                              >
                                                <span className="text-danger fw-semibold">No</span>
                                                <span className="text-muted">
                                                  {" "}
                                                  — {(item.notes ?? "").slice(0, 120)}
                                                  {(item.notes ?? "").length > 120 ? "…" : ""}
                                                </span>
                                              </button>
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div
                                        className="btn-group flex-shrink-0 ms-auto"
                                        role="group"
                                        aria-label={`Answer ${item.label}`}
                                      >
                                        {(["YES", "NO", "NA"] as const).map((answer) => (
                                          <button
                                            key={answer}
                                            type="button"
                                            className={`btn btn-sm ${
                                              item.answer === answer
                                                ? answer === "NO"
                                                  ? "btn-danger"
                                                  : answer === "YES"
                                                    ? "btn-success"
                                                    : "btn-secondary"
                                                : "btn-outline-secondary"
                                            }`}
                                            disabled={!canManage}
                                            onClick={() => setAnswer(item.id, answer)}
                                          >
                                            {answer === "YES"
                                              ? "Yes"
                                              : answer === "NO"
                                                ? "No"
                                                : "N/A"}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === "report" ? (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">No findings report</h5>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => window.print()}
              >
                Print
              </button>
            </div>
            <div className="card-body">
              {!selectedId ? (
                <p className="text-muted mb-0">Open a completed inspection to view the report.</p>
              ) : findings.length === 0 ? (
                <p className="text-muted mb-0">No “No” answers on this inspection.</p>
              ) : (
                <div className="d-flex flex-column gap-4">
                  {findings.map((item) => (
                    <div key={item.id} className="border-bottom pb-3">
                      <h6 className="mb-1">{item.label}</h6>
                      <p className="mb-2">{item.notes || "—"}</p>
                      {(item.photos ?? []).length > 0 ? (
                        <div className="d-flex flex-wrap gap-2 mb-2">
                          {(item.photos ?? []).map((photo) => (
                            <img
                              key={photo.id}
                              src={photo.dataUrl}
                              alt={photo.fileName}
                              className="rounded border"
                              style={{ maxWidth: 220 }}
                            />
                          ))}
                        </div>
                      ) : null}
                      {item.closeoutUrl ? (
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => void navigator.clipboard.writeText(item.closeoutUrl!)}
                          >
                            Copy close-out link
                          </button>
                          <Link
                            className="btn btn-sm btn-outline-secondary"
                            href={item.closeoutUrl}
                          >
                            Open close-out
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "open-items" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Open corrective actions from inspections</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {openActions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted">
                        No open inspection findings.
                      </td>
                    </tr>
                  ) : (
                    openActions.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.title ?? "—")}</td>
                        <td>{String(row.ownerName ?? "—")}</td>
                        <td>
                          <span className="badge bg-label-warning">
                            {String(row.status ?? "OPEN")}
                          </span>
                        </td>
                        <td className="text-end">
                          {canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => void completeOpenItem(String(row.id))}
                            >
                              Close out
                            </button>
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

        {tab === "contacts" ? (
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Department contacts</h5>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Division</th>
                    <th>Current contact</th>
                    <th>Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id}>
                      <td>{dept.name}</td>
                      <td>{dept.divisionName || "—"}</td>
                      <td>{dept.contactName || "—"}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          defaultValue={dept.contactPersonnelId || ""}
                          disabled={!canManage}
                          onChange={(ev) => void saveDeptContact(dept, ev.target.value)}
                        >
                          <option value="">Select personnel</option>
                          {personnel.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </ModuleWorkspaceTabs>

      {notesModalItem && canManage ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="insp-finding-notes-title"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => {
            // Keep open until notes are filled (or Cancel clears the No).
            if ((notesModalItem.notes ?? "").trim()) closeFindingNotes();
            else setNotesModalError("Notes are required for a No finding.");
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") {
              if ((notesModalItem.notes ?? "").trim()) closeFindingNotes();
              else setNotesModalError("Notes are required for a No finding.");
            }
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered modal-lg"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <div className="min-w-0">
                  <h5 className="modal-title mb-0" id="insp-finding-notes-title">
                    Finding notes required
                  </h5>
                  <p className="text-muted small mb-0 text-truncate">{notesModalItem.label}</p>
                </div>
              </div>
              <div className="modal-body">
                <p className="small text-danger mb-3">
                  Selecting <strong>No</strong> requires notes before you continue. Add a photo when
                  possible.
                </p>
                {notesModalError ? (
                  <div className="alert alert-danger py-2" role="alert">
                    {notesModalError}
                  </div>
                ) : null}
                <label className="form-label" htmlFor={`notes-modal-${notesModalItem.id}`}>
                  Notes <span className="text-danger">*</span>
                </label>
                <textarea
                  id={`notes-modal-${notesModalItem.id}`}
                  className={`form-control mb-3${notesModalError ? " is-invalid" : ""}`}
                  rows={4}
                  required
                  value={notesModalItem.notes ?? ""}
                  onChange={(ev) => {
                    setNotesModalError(null);
                    setNotes(notesModalItem.id, ev.target.value);
                  }}
                  placeholder="Describe the issue and what was observed…"
                />
                <div className="d-flex flex-wrap gap-2 mb-3">
                  <label className="btn btn-outline-primary mb-0">
                    <i className="bx bx-camera me-1" aria-hidden="true" />
                    Take photo
                    <input
                      type="file"
                      className="d-none"
                      accept="image/*"
                      capture="environment"
                      onChange={(ev) => {
                        void addPhotos(notesModalItem.id, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </label>
                  <label className="btn btn-outline-secondary mb-0">
                    <i className="bx bx-image-add me-1" aria-hidden="true" />
                    Upload photo
                    <input
                      type="file"
                      className="d-none"
                      accept="image/*"
                      multiple
                      onChange={(ev) => {
                        void addPhotos(notesModalItem.id, ev.target.files);
                        ev.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {(notesModalItem.photos ?? []).length > 0 ? (
                  <div className="d-flex flex-wrap gap-2">
                    {(notesModalItem.photos ?? []).map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.dataUrl}
                        alt={photo.fileName}
                        className="rounded border"
                        style={{ width: 112, height: 112, objectFit: "cover" }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted small mb-0">No photos attached yet.</p>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={cancelNoFinding}
                >
                  Cancel (clear No)
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!(notesModalItem.notes ?? "").trim()}
                  onClick={closeFindingNotes}
                >
                  Save notes
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
