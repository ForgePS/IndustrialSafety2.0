"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { useIndustrialFacility } from "@/hooks/use-industrial-facility";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { FilterPanel, type FilterChip } from "@/components/filter-panel";
import { ALL_DEPARTMENTS_ID } from "@/lib/industrial-facility";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { LotoProcedureForm } from "@/components/loto-procedure-form";
import { LotoProcedureDetailSections } from "@/components/loto-procedure-detail-sections";
import { LotoProcedureWorkflowActions } from "@/components/loto-procedure-workflow-actions";
import { ForgePrintButton } from "@/components/forge-print-button";
import { ForgePrintDialog, type ForgePrintDialogBatchItem } from "@/components/forge-print-dialog";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import {
  ensureLotoProcedurePrintQrPayload,
  lotoProcedurePrintFieldValues,
} from "@/lib/module-print-fields";
import {
  LOTO_PROCEDURE_STATUSES,
  canIssueLockout,
  emptyLotoProcedureForm,
  extractProcedureDisplay,
  isOpenLockoutStatus,
  lockoutAuthorizedEmployee,
  lockoutEquipmentName,
  lotoLockoutHref,
  lotoProcedureAreaName,
  lotoProcedureCompletedDate,
  lotoProcedureDepartmentName,
  lotoProcedureEquipmentName,
  lotoProcedureEquipmentType,
  lotoProcedureFormFromDetail,
  lotoProcedureHref,
  lotoProcedurePayloadFromForm,
  lotoStats,
  lotoStatusBadgeClass,
  lotoStatusLabel,
  type LotoProcedureFormState,
  type LotoTab,
} from "@/lib/loto";
import {
  canGenerateQr,
  canPrintQr,
  canViewQrLinks,
  type QrLinkListResponse,
  type QrLinkRow,
} from "@/lib/qr-links-module";
import { composeQrLinkStickerBlob, printQrLinkSticker } from "@/lib/qr-link-sticker";

/** Matches the API limit for one batch print. */
const LOTO_PRINT_BATCH_MAX = 100;

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  total?: number;
};

const PROCEDURE_PAGE_SIZES = [10, 25, 50, 100] as const;
type ProcedurePageSize = (typeof PROCEDURE_PAGE_SIZES)[number];
const DEFAULT_PROCEDURE_PAGE_SIZE: ProcedurePageSize = 25;

const TABS: Array<{ id: LotoTab; label: string }> = [
  { id: "procedures", label: "Procedures" },
  { id: "lockouts", label: "Active lockouts" },
  { id: "reports", label: "Reports" },
];

const LOTO_REPORTS = [
  {
    key: "loto.procedures_inventory",
    name: "LOTO Procedure Inventory",
    description: "All procedures with status, location, department, area, and equipment.",
  },
  {
    key: "loto.procedures_by_status",
    name: "LOTO Procedures by Status",
    description: "Procedure counts grouped by status.",
  },
  {
    key: "loto.procedures_by_location",
    name: "LOTO Procedures by Location",
    description: "Procedure volume by site and department.",
  },
  {
    key: "loto.procedure_review_due",
    name: "LOTO Review Due",
    description: "In-review procedures and review-due aging.",
  },
  {
    key: "loto.open_lockouts",
    name: "Open Lockouts",
    description: "Issued and verified lockouts still open.",
  },
  {
    key: "loto.lockout_history",
    name: "Lockout History",
    description: "Lockouts by date, employee, equipment, and procedure.",
  },
  {
    key: "loto.energy_type_coverage",
    name: "LOTO Energy Type Coverage",
    description: "Energy types across procedures.",
  },
] as const;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function LotoWorkspace({ moduleName }: { moduleName: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const {
    query: scopeQuery,
    departmentId: scopeDepartmentId,
    departmentName: scopeDepartmentName,
    setDepartmentId: setScopeDepartmentId,
  } = useIndustrialFacility();
  const permissions = new Set(me?.permissions ?? []);
  const canView = permissions.has("industrial.loto.view") || permissions.has("industrial.admin");
  const canEdit =
    permissions.has("industrial.loto.edit") ||
    permissions.has("industrial.loto.manage") ||
    permissions.has("industrial.loto.create") ||
    permissions.has("industrial.admin");
  const canApprove =
    permissions.has("industrial.loto.approve") ||
    permissions.has("industrial.loto.manage") ||
    permissions.has("industrial.admin");
  const canPrint =
    permissions.has("industrial.loto.print") ||
    permissions.has("industrial.loto.view") ||
    permissions.has("industrial.admin");
  const canPrintLabel =
    permissions.has("industrial.printer.print") || permissions.has("industrial.admin");
  // Select procedures to print their pages or labels together.
  const canSelectProcedures = canPrint || canPrintLabel;
  const canQrView = canViewQrLinks(permissions);
  const canQrGenerate = canGenerateQr(permissions);
  const canQrPrint = canPrintQr(permissions);

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "LOCKOUT_TAGOUT",
    canView,
  });
  const [tab, setTab] = useState<LotoTab>("procedures");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "LOCKOUT_TAGOUT",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "procedures",
      ),
    );
  }, [visibleTabs]);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [lockouts, setLockouts] = useState<Array<Record<string, unknown>>>([]);
  const [equipment, setEquipment] = useState<Array<Record<string, unknown>>>([]);
  const [sites, setSites] = useState<Array<Record<string, unknown>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, unknown>>>([]);
  const [personnel, setPersonnel] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [procedurePage, setProcedurePage] = useState(1);
  const [procedurePageSize, setProcedurePageSize] = useState<ProcedurePageSize>(
    DEFAULT_PROCEDURE_PAGE_SIZE,
  );
  const [procedureTotal, setProcedureTotal] = useState(0);
  const [activeProcedureTotal, setActiveProcedureTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<LotoProcedureFormState>(emptyLotoProcedureForm);
  const [editForm, setEditForm] = useState<LotoProcedureFormState>(emptyLotoProcedureForm);
  const [sortKey, setSortKey] = useState<"equipment" | "department" | "area">("equipment");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [organizeBy, setOrganizeBy] = useState<"all" | "department" | "area">("all");
  const [areaFilter, setAreaFilter] = useState("");
  const [authorizedEmployee, setAuthorizedEmployee] = useState("");
  const [affectedEmployees, setAffectedEmployees] = useState("");
  const [lockTagId, setLockTagId] = useState("");
  const [tryStartRequired, setTryStartRequired] = useState(true);
  const [zeroEnergy, setZeroEnergy] = useState(false);
  const [tryStartDone, setTryStartDone] = useState(false);
  const [restorationDone, setRestorationDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState<{
    procedureId: string;
    title: string;
    stickerUrl: string | null;
    stickerBlob: Blob | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([]);
  const [selectedProcedureCache, setSelectedProcedureCache] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [batchPrintItems, setBatchPrintItems] = useState<ForgePrintDialogBatchItem[] | null>(null);
  const [batchPrintBusy, setBatchPrintBusy] = useState(false);
  const [batchPrintError, setBatchPrintError] = useState<string | null>(null);

  const loadList = useCallback(
    async (nextProcedurePage: number) => {
      setLoading(true);
      setError(null);
      try {
        const [loto, activeLoto, equip, siteRows, deptRows, people, records] = await Promise.all([
          apiGet<ListResponse>("/api/v1/industrial/loto", {
            query: {
              q: q || undefined,
              status: statusFilter || undefined,
              page: String(nextProcedurePage),
              pageSize: String(procedurePageSize),
              ...scopeQuery,
            },
          }),
          // Header KPI: total ACTIVE across all pages (not just the current list page).
          statusFilter.toUpperCase() === "ACTIVE"
            ? Promise.resolve(null)
            : apiGet<ListResponse>("/api/v1/industrial/loto", {
                query: {
                  q: q || undefined,
                  status: "ACTIVE",
                  page: "1",
                  pageSize: "1",
                  ...scopeQuery,
                },
              }).catch(() => ({ items: [] as Array<Record<string, unknown>>, total: 0 })),
          apiGet<ListResponse>("/api/v1/industrial/equipment", {
            query: { page: "1", pageSize: "500" },
          }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 500 })),
          apiGet<ListResponse>("/api/v1/industrial/sites", {
            query: { page: "1", pageSize: "500" },
          }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 500 })),
          apiGet<Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> }>(
            "/api/v1/industrial/departments",
          ).catch(() => [] as Array<Record<string, unknown>>),
          apiGet<ListResponse>("/api/v1/industrial/personnel", {
            query: { page: "1", pageSize: "100" },
          }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 100 })),
          apiGet<ListResponse>("/api/v1/industrial/loto-records", {
            query: { page: "1", pageSize: "50" },
          }).catch(() => ({ items: [] as Array<Record<string, unknown>>, page: 1, pageSize: 50 })),
        ]);
        setItems(loto.items ?? []);
        setProcedurePage(loto.page ?? nextProcedurePage);
        const nextProcedureTotal = loto.total ?? loto.items?.length ?? 0;
        setProcedureTotal(nextProcedureTotal);
        setActiveProcedureTotal(
          statusFilter.toUpperCase() === "ACTIVE" ? nextProcedureTotal : (activeLoto?.total ?? 0),
        );
        setEquipment(equip.items ?? []);
        setSites(siteRows.items ?? []);
        setDepartments(Array.isArray(deptRows) ? deptRows : (deptRows.items ?? []));
        setPersonnel(people.items ?? []);
        setLockouts(records.items ?? []);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load LOTO");
      } finally {
        setLoading(false);
      }
    },
    [q, statusFilter, procedurePageSize, scopeQuery],
  );

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void loadList(1);
  }, [awsReady, q, statusFilter, procedurePageSize, scopeQuery, loadList]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setPrintHtml(null);
    setZeroEnergy(false);
    setTryStartDone(false);
    setRestorationDone(false);
    try {
      const data = await apiGet<Record<string, unknown>>(`/api/v1/industrial/loto/${id}`);
      setDetail(data);
      const nested = Array.isArray(data.lockouts)
        ? (data.lockouts as Array<Record<string, unknown>>)
        : [];
      if (nested.length > 0) {
        setLockouts((current) => {
          const others = current.filter((row) => str(row.procedureId) !== id);
          return [...nested, ...others];
        });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load procedure");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError(null);
    setBusy(true);
    try {
      const payload = { ...lotoProcedurePayloadFromForm(createForm), status: "DRAFT" };
      const created = await apiSend<Record<string, unknown>>(
        "/api/v1/industrial/loto",
        "POST",
        payload,
      );
      const procedure = (created.procedure as Record<string, unknown> | undefined) ?? created;
      setCreateForm(emptyLotoProcedureForm());
      setShowCreate(false);
      setNotice("Draft procedure created.");
      await loadList(1);
      if (str(procedure.id)) await openDetail(str(procedure.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onStartEdit(id: string) {
    if (!canEdit || !id) return;
    setError(null);
    setShowCreate(false);
    setEditingId(id);
    setBusy(true);
    try {
      const data = await apiGet<Record<string, unknown>>(
        `/api/v1/industrial/loto/${encodeURIComponent(id)}`,
      );
      const next = lotoProcedureFormFromDetail(data);
      // Migrated rows often keep Firebase site ids — resolve to catalog by name.
      if (next.siteName && (!next.siteId || !sites.some((site) => str(site.id) === next.siteId))) {
        const match = sites.find(
          (site) =>
            str(site.name).toLowerCase() === next.siteName.toLowerCase() ||
            str(site.title).toLowerCase() === next.siteName.toLowerCase(),
        );
        if (match) {
          next.siteId = str(match.id);
          next.siteName = str(match.name || match.title) || next.siteName;
        }
      }
      setEditForm(next);
      setSelectedId(id);
      setDetail(data);
    } catch (err) {
      setEditingId(null);
      setError(err instanceof ApiError ? err.message : "Failed to load procedure for editing");
    } finally {
      setBusy(false);
    }
  }

  function onCancelEdit() {
    setEditingId(null);
    setEditForm(emptyLotoProcedureForm());
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !editingId) return;
    setError(null);
    setBusy(true);
    try {
      const savedId = editingId;
      const updated = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/loto/${encodeURIComponent(savedId)}`,
        "PATCH",
        lotoProcedurePayloadFromForm(editForm),
      );
      setNotice("Procedure saved.");
      setEditingId(null);
      setEditForm(emptyLotoProcedureForm());
      setDetail(updated);
      setSelectedId(savedId);
      await loadList(procedurePage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(path: string, body: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${selectedId}/${path}`, "POST", body);
      await openDetail(selectedId);
      await loadList(procedurePage);
      setNotice("Procedure updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function issueLockout(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${selectedId}/issue`, "POST", {
        authorizedEmployee,
        affectedEmployees,
        lockTagId,
        tryStartRequired,
      });
      setAuthorizedEmployee("");
      setAffectedEmployees("");
      setLockTagId("");
      setNotice("Lockout issued. Complete zero-energy verification before work begins.");
      await openDetail(selectedId);
      await loadList(procedurePage);
      setTab("lockouts");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not issue lockout");
    } finally {
      setBusy(false);
    }
  }

  async function lockoutAction(id: string, action: "verify" | "close") {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/v1/industrial/loto-records/${id}/${action}`, "POST", {
        zeroEnergyConfirmed: action === "verify" ? zeroEnergy : undefined,
        tryStartCompleted: action === "verify" ? tryStartDone : undefined,
        restorationComplete: action === "close" ? restorationDone : undefined,
      });
      setNotice(action === "verify" ? "Zero-energy verification recorded." : "Lockout closed out.");
      await loadList(procedurePage);
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lockout update failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadPrint() {
    if (!selectedId || !canPrint) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<{ html: string }>(
        `/api/v1/industrial/loto/${selectedId}/printable`,
      );
      const html = typeof data?.html === "string" ? data.html : "";
      if (!html.trim()) throw new Error("Printable HTML was empty for this procedure.");
      setPrintHtml(html);
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) {
        setError(blocked);
      } else {
        setNotice("Print dialog opened. Use Print / Save as PDF if it did not appear.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Printable failed");
    } finally {
      setBusy(false);
    }
  }

  function closeQrModal() {
    setQrModal((prev) => {
      if (prev?.stickerUrl) URL.revokeObjectURL(prev.stickerUrl);
      return null;
    });
  }

  async function ensureLotoQrSticker(item: Record<string, unknown>): Promise<{
    stickerUrl: string;
    stickerBlob: Blob;
    label: string;
  }> {
    const id = str(item.id);
    const equipmentLabel = lotoProcedureEquipmentName(item);
    const label =
      equipmentLabel && equipmentLabel !== "—"
        ? equipmentLabel
        : str(item.procedureNumber) || str(item.title) || "LOTO procedure";

    let link: QrLinkRow | undefined;
    if (canQrView) {
      const listed = await apiGet<QrLinkListResponse>("/api/v1/qr-links", {
        query: { targetType: "LOTO_PROCEDURE", page: "1", pageSize: "100" },
      });
      link = (listed.items ?? []).find(
        (row) => row.targetId === id && row.targetType === "LOTO_PROCEDURE",
      );
    }

    if (!link) {
      if (!canQrGenerate) {
        throw new Error("No QR code for this procedure, and you cannot create one.");
      }
      link = await apiSend<QrLinkRow>("/api/v1/qr-links", "POST", {
        name: `${label} LOTO QR`,
        targetType: "LOTO_PROCEDURE",
        targetId: id,
        accessMode: "PUBLIC_ACTION",
        issueToken: true,
        isPublic: true,
        appBaseUrl: window.location.origin,
        actionConfig: {
          viewLoto: true,
          reportIssue: true,
          lotoProcedureId: id,
        },
      });
    } else {
      const mode = String(link.accessMode ?? link.qrType ?? "").toUpperCase();
      const needsPublicUpgrade = canQrGenerate && !mode.startsWith("PUBLIC_");
      if (needsPublicUpgrade) {
        link = await apiSend<QrLinkRow>(
          `/api/v1/qr-links/${encodeURIComponent(link.id)}`,
          "PATCH",
          {
            accessMode: "PUBLIC_ACTION",
            qrType: "PUBLIC_ACTION",
            actionConfig: {
              viewLoto: true,
              reportIssue: true,
              lotoProcedureId: id,
            },
          },
        );
      }
      if (!link.publicToken && !link.token && canQrGenerate) {
        link = await apiSend<QrLinkRow>(
          `/api/v1/qr-links/${encodeURIComponent(link.id)}/issue-token`,
          "POST",
          { appBaseUrl: window.location.origin },
        );
      }
    }

    const token = String(link.publicToken ?? link.token ?? "").trim();
    if (!token) {
      throw new Error("QR link exists but has no public token yet.");
    }

    const image = await apiSend<{ dataBase64: string }>(
      `/api/v1/qr-links/${encodeURIComponent(link.id)}/qr-image`,
      "POST",
      { token, appBaseUrl: window.location.origin },
    );
    // LOTO print stickers: equipment name only above the QR (no procedure/description text).
    const stickerBlob = await composeQrLinkStickerBlob(image.dataBase64, label);
    return {
      stickerBlob,
      stickerUrl: URL.createObjectURL(stickerBlob),
      label,
    };
  }

  async function onOpenQr(item: Record<string, unknown>) {
    const id = str(item.id);
    if (!id) return;
    const equipmentLabel = lotoProcedureEquipmentName(item);
    const title =
      equipmentLabel && equipmentLabel !== "—"
        ? equipmentLabel
        : str(item.procedureNumber) || "LOTO procedure";

    void openDetail(id);

    if (!canQrView && !canQrGenerate) {
      return;
    }

    setActionBusyId(id);
    setError(null);
    setQrModal((prev) => {
      if (prev?.stickerUrl) URL.revokeObjectURL(prev.stickerUrl);
      return {
        procedureId: id,
        title,
        stickerUrl: null,
        stickerBlob: null,
        loading: true,
        error: null,
      };
    });

    try {
      const sticker = await ensureLotoQrSticker(item);
      setQrModal({
        procedureId: id,
        title: sticker.label,
        stickerUrl: sticker.stickerUrl,
        stickerBlob: sticker.stickerBlob,
        loading: false,
        error: null,
      });
    } catch (err) {
      setQrModal({
        procedureId: id,
        title,
        stickerUrl: null,
        stickerBlob: null,
        loading: false,
        error:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to prepare LOTO QR",
      });
    } finally {
      setActionBusyId(null);
    }
  }

  async function onPrintProcedure(item: Record<string, unknown>) {
    const id = str(item.id);
    if (!id || !canPrint) return;
    setActionBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<{ html?: string } | string>(
        `/api/v1/industrial/loto/${id}/printable`,
      );
      const html =
        typeof data === "string" ? data : typeof data?.html === "string" ? data.html : "";
      if (!html.trim() || /^https?:\/\//i.test(html.trim()) || /^blob:/i.test(html.trim())) {
        throw new Error("Printable HTML was empty or invalid for this procedure.");
      }
      setPrintHtml(html);
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) {
        setError(blocked);
      } else {
        setNotice("Print dialog opened for this LOTO procedure.");
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to print LOTO procedure",
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function onDeleteProcedure(item: Record<string, unknown>) {
    if (!canEdit) return;
    const id = str(item.id);
    if (!id) return;
    const label =
      str(item.procedureNumber) ||
      lotoProcedureEquipmentName(item) ||
      str(item.title) ||
      "this procedure";
    if (!window.confirm(`Delete LOTO procedure "${label}"? This archives the record.`)) {
      return;
    }
    setActionBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await apiSend(`/api/v1/industrial/loto/${encodeURIComponent(id)}/archive`, "POST", {});
      setNotice(`Archived ${label}.`);
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        setPrintHtml(null);
      }
      if (qrModal?.procedureId === id) closeQrModal();
      await loadList(procedurePage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete LOTO procedure");
    } finally {
      setActionBusyId(null);
    }
  }

  async function onPrintQrFromModal() {
    if (!qrModal?.stickerUrl || !canQrPrint) return;
    const blocked = await printQrLinkSticker(
      qrModal.stickerUrl,
      `${qrModal.title} LOTO QR`,
      qrModal.stickerBlob,
    );
    if (blocked) setError(blocked);
  }

  const stats = useMemo(() => {
    const base = lotoStats(items, lockouts);
    return {
      ...base,
      procedures: procedureTotal || base.procedures,
      active: activeProcedureTotal,
    };
  }, [items, lockouts, procedureTotal, activeProcedureTotal]);
  const areaOptions = useMemo(
    () =>
      [
        ...new Set(
          items.map((row) => lotoProcedureAreaName(row)).filter((name) => name && name !== "—"),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const locationOptions = useMemo(() => {
    const values: string[] = [];
    for (const row of items) {
      const steps = Array.isArray(row.steps) ? row.steps : [];
      for (const step of steps) {
        const rec = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
        const loc = str(rec.isolationLocationText || rec.locationDescription);
        if (loc) values.push(loc);
      }
    }
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const descriptionOptions = useMemo(() => {
    const values: string[] = [];
    for (const row of items) {
      const steps = Array.isArray(row.steps) ? row.steps : [];
      for (const step of steps) {
        const rec = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
        const code = str(rec.descriptionCode || rec.code);
        if (code) values.push(code);
      }
    }
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const sortedItems = useMemo(() => {
    const filtered = items.filter((row) => {
      if (areaFilter && lotoProcedureAreaName(row) !== areaFilter) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left =
        sortKey === "department"
          ? lotoProcedureDepartmentName(a)
          : sortKey === "area"
            ? lotoProcedureAreaName(a)
            : lotoProcedureEquipmentName(a);
      const right =
        sortKey === "department"
          ? lotoProcedureDepartmentName(b)
          : sortKey === "area"
            ? lotoProcedureAreaName(b)
            : lotoProcedureEquipmentName(b);
      return left.localeCompare(right) * dir;
    });
  }, [items, areaFilter, sortKey, sortDir]);
  const pageProcedureIds = useMemo(
    () => sortedItems.map((row) => str(row.id)).filter(Boolean),
    [sortedItems],
  );
  const allPageSelected =
    pageProcedureIds.length > 0 &&
    pageProcedureIds.every((id) => selectedProcedureIds.includes(id));
  const somePageSelected = pageProcedureIds.some((id) => selectedProcedureIds.includes(id));
  const focusForm = Boolean(canEdit && (showCreate || editingId));
  const procedurePageCount = Math.max(1, Math.ceil(procedureTotal / procedurePageSize));
  const procedureRangeFrom = procedureTotal === 0 ? 0 : (procedurePage - 1) * procedurePageSize + 1;
  const procedureRangeTo = Math.min(procedurePage * procedurePageSize, procedureTotal);
  const procedure = (detail?.procedure as Record<string, unknown> | undefined) ?? detail;
  const procedureDisplay = detail ? extractProcedureDisplay(detail) : null;
  const openLockouts = lockouts.filter((row) => isOpenLockoutStatus(row.status));
  const personName = (row: Record<string, unknown>) =>
    [str(row.firstName), str(row.lastName)].filter(Boolean).join(" ") ||
    str(row.displayName) ||
    str(row.preferredName) ||
    "Employee";
  const dueDateLabel = (row: Record<string, unknown>) => {
    const raw = str(row.dueDate);
    if (!raw) return "";
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString();
  };
  function toggleSort(next: "equipment" | "department" | "area") {
    if (sortKey === next) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(next);
    setSortDir("asc");
  }

  function toggleProcedureSelected(item: Record<string, unknown>, checked: boolean) {
    const id = str(item.id);
    if (!id) return;
    setSelectedProcedureIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );
    setSelectedProcedureCache((prev) => {
      if (!checked) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: item };
    });
  }

  function toggleSelectAllPage(checked: boolean) {
    if (checked) {
      setSelectedProcedureIds((prev) => {
        const next = new Set(prev);
        for (const id of pageProcedureIds) next.add(id);
        return [...next];
      });
      setSelectedProcedureCache((prev) => {
        const next = { ...prev };
        for (const item of sortedItems) {
          const id = str(item.id);
          if (id) next[id] = item;
        }
        return next;
      });
      return;
    }
    const pageSet = new Set(pageProcedureIds);
    setSelectedProcedureIds((prev) => prev.filter((id) => !pageSet.has(id)));
    setSelectedProcedureCache((prev) => {
      const next = { ...prev };
      for (const id of pageProcedureIds) delete next[id];
      return next;
    });
  }

  function clearProcedureSelection() {
    setSelectedProcedureIds([]);
    setSelectedProcedureCache({});
  }

  async function onBatchPrintProcedures() {
    if (!canPrint || selectedProcedureIds.length < 1) return;
    if (selectedProcedureIds.length > LOTO_PRINT_BATCH_MAX) {
      setBatchPrintError(`Select up to ${LOTO_PRINT_BATCH_MAX} procedures to print at once.`);
      return;
    }
    setBatchPrintBusy(true);
    setBatchPrintError(null);
    setNotice(null);
    try {
      const data = await apiSend<{ html?: string } | string>(
        "/api/v1/industrial/loto/printable-batch",
        "POST",
        { ids: selectedProcedureIds },
      );
      const html =
        typeof data === "string" ? data : typeof data?.html === "string" ? data.html : "";
      if (!html.trim()) throw new Error("Printable pages were empty for these procedures.");
      const blocked = openPrintableHtmlPopup(html, true);
      if (blocked) {
        setBatchPrintError(blocked);
      } else {
        setNotice(
          selectedProcedureIds.length === 1
            ? "Print dialog opened for this LOTO procedure."
            : `Print dialog opened for ${selectedProcedureIds.length} LOTO procedures.`,
        );
      }
    } catch (err) {
      setBatchPrintError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not prepare procedures for print",
      );
    } finally {
      setBatchPrintBusy(false);
    }
  }

  async function onBatchPrintLabels() {
    if (!canPrintLabel || selectedProcedureIds.length < 1) return;
    setBatchPrintBusy(true);
    setBatchPrintError(null);
    try {
      const selected = selectedProcedureIds
        .map((id) => selectedProcedureCache[id] ?? items.find((row) => str(row.id) === id))
        .filter((row): row is Record<string, unknown> => Boolean(row?.id));
      if (selected.length === 0) {
        throw new Error("Selected procedures are no longer on this list. Clear and reselect.");
      }
      const batch: ForgePrintDialogBatchItem[] = [];
      for (const item of selected.slice(0, 200)) {
        const id = str(item.id);
        const equipmentName = lotoProcedureEquipmentName(item);
        const qr = await ensureLotoProcedurePrintQrPayload(item, {
          canView: canQrView,
          canGenerate: canQrGenerate,
        });
        batch.push({
          recordId: id,
          title: equipmentName !== "—" ? equipmentName : str(item.procedureNumber) || "LOTO",
          fieldValues: {
            ...lotoProcedurePrintFieldValues(item, equipmentName),
            ...qr,
          },
        });
      }
      setBatchPrintItems(batch);
    } catch (err) {
      setBatchPrintError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not prepare batch labels for print",
      );
    } finally {
      setBatchPrintBusy(false);
    }
  }

  function sortHeaderLabel(key: "equipment" | "department" | "area", label: string) {
    if (sortKey !== key) return label;
    return `${label} ${sortDir === "asc" ? "↑" : "↓"}`;
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  return (
    <section aria-labelledby="loto-title" data-walkthrough="loto-overview">
      <ModuleWorkspaceHeader
        id="loto-title"
        eyebrow="High-risk work"
        title={moduleName}
        description="Write energy-control procedures, isolate and verify zero energy, then issue and close lockouts."
        onRefresh={() => void loadList(procedurePage)}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}

      {!focusForm ? (
        <div className="row g-3 mb-4">
          {[
            { label: "Procedures", value: stats.procedures, icon: "bx-file", tone: "primary" },
            { label: "Drafts", value: stats.drafts, icon: "bx-edit", tone: "secondary" },
            { label: "In review", value: stats.reviews, icon: "bx-time-five", tone: "warning" },
            {
              label: "Active procedures",
              value: stats.active,
              icon: "bx-check-shield",
              tone: "success",
            },
            {
              label: "Open lockouts",
              value: stats.openLockouts,
              icon: "bx-lock-alt",
              tone: "danger",
            },
          ].map((card) => (
            <div className="col-6 col-md" key={card.label}>
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex align-items-center gap-3">
                    <div className="avatar">
                      <span className={`avatar-initial rounded bg-label-${card.tone}`}>
                        <i className={`bx ${card.icon}`} />
                      </span>
                    </div>
                    <div>
                      <small className="text-muted">{card.label}</small>
                      <h4 className="mb-0">{card.value}</h4>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!focusForm ? (
        <ModuleWorkspaceTabs
          tabs={visibleTabs}
          active={tab}
          onChange={setTab}
          ariaLabel="LOTO sections"
        />
      ) : null}

      {tab === "procedures" ? (
        <>
          {!focusForm ? (
            <div className="d-flex flex-wrap justify-content-end gap-2 mb-3">
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingId(null);
                    setShowCreate(true);
                  }}
                >
                  <i className="bx bx-plus me-1" />
                  New procedure
                </button>
              ) : null}
            </div>
          ) : null}

          {canEdit && showCreate ? (
            <LotoProcedureForm
              mode="create"
              form={createForm}
              setForm={setCreateForm}
              equipment={equipment}
              sites={sites}
              departments={departments}
              areaOptions={areaOptions}
              locationOptions={locationOptions}
              descriptionOptions={descriptionOptions}
              busy={busy}
              onSubmit={(e) => void onCreate(e)}
              onCancel={() => setShowCreate(false)}
            />
          ) : null}

          {canEdit && editingId ? (
            <LotoProcedureForm
              mode="edit"
              form={editForm}
              setForm={setEditForm}
              equipment={equipment}
              sites={sites}
              departments={departments}
              areaOptions={areaOptions}
              locationOptions={locationOptions}
              descriptionOptions={descriptionOptions}
              busy={busy}
              onSubmit={(e) => void onSaveEdit(e)}
              onCancel={onCancelEdit}
            />
          ) : null}

          {!focusForm ? (
            <>
              <div
                className="d-flex flex-wrap gap-2 align-items-center mb-3"
                role="tablist"
                aria-label="Organize procedures"
              >
                <span className="text-muted small me-1">Organize:</span>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "department" as const, label: "Department A–Z" },
                    { id: "area" as const, label: "Area A–Z" },
                  ] as const
                ).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={organizeBy === entry.id}
                    className={`btn btn-sm ${organizeBy === entry.id ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => {
                      setOrganizeBy(entry.id);
                      if (entry.id === "all") {
                        setAreaFilter("");
                        setSortKey("equipment");
                        setSortDir("asc");
                        return;
                      }
                      if (entry.id === "department") {
                        setAreaFilter("");
                        setSortKey("department");
                        setSortDir("asc");
                        return;
                      }
                      setSortKey("area");
                      setSortDir("asc");
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {organizeBy === "area" && areaOptions.length > 0 ? (
                <div className="d-flex flex-wrap gap-2 mb-3" aria-label="Filter by area">
                  <button
                    type="button"
                    className={`btn btn-sm ${areaFilter === "" ? "btn-secondary" : "btn-outline-secondary"}`}
                    onClick={() => setAreaFilter("")}
                  >
                    All areas
                  </button>
                  {areaOptions.map((area) => (
                    <button
                      key={area}
                      type="button"
                      className={`btn btn-sm ${areaFilter === area ? "btn-secondary" : "btn-outline-secondary"}`}
                      onClick={() => setAreaFilter(area)}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              ) : null}

              <FilterPanel
                searchId="loto-search"
                searchValue={q}
                onSearchChange={setQ}
                searchPlaceholder="Equipment name or title"
                statusId="loto-status"
                statusValue={statusFilter}
                onStatusChange={setStatusFilter}
                statusOptions={[
                  { value: "", label: "All statuses" },
                  ...LOTO_PROCEDURE_STATUSES.map((status) => ({
                    value: status,
                    label: lotoStatusLabel(status),
                  })),
                ]}
                chips={
                  [
                    ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
                    ...(statusFilter
                      ? [
                          {
                            id: "status",
                            label: lotoStatusLabel(statusFilter),
                            onRemove: () => setStatusFilter(""),
                          },
                        ]
                      : []),
                    ...(scopeDepartmentId !== ALL_DEPARTMENTS_ID && scopeDepartmentName
                      ? [
                          {
                            id: "department",
                            label: `Department: ${scopeDepartmentName}`,
                            onRemove: () => setScopeDepartmentId(ALL_DEPARTMENTS_ID),
                          },
                        ]
                      : []),
                    ...(areaFilter
                      ? [
                          {
                            id: "area",
                            label: `Area: ${areaFilter}`,
                            onRemove: () => setAreaFilter(""),
                          },
                        ]
                      : []),
                  ] as FilterChip[]
                }
                onClearAll={() => {
                  setQ("");
                  setStatusFilter("");
                  setScopeDepartmentId(ALL_DEPARTMENTS_ID);
                  setAreaFilter("");
                }}
                onSubmit={() => void loadList(1)}
              />

              {batchPrintError ? (
                <div className="alert alert-danger" role="alert">
                  {batchPrintError}
                </div>
              ) : null}

              {canSelectProcedures && selectedProcedureIds.length > 0 ? (
                <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                  <span className="small text-muted">{selectedProcedureIds.length} selected</span>
                  {canPrint ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={batchPrintBusy || selectedProcedureIds.length < 1}
                      onClick={() => void onBatchPrintProcedures()}
                    >
                      {batchPrintBusy
                        ? "Preparing…"
                        : selectedProcedureIds.length === 1
                          ? "Print Procedure"
                          : `Print ${selectedProcedureIds.length} Procedures`}
                    </button>
                  ) : null}
                  {canPrintLabel ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={batchPrintBusy || selectedProcedureIds.length < 1}
                      onClick={() => void onBatchPrintLabels()}
                    >
                      {batchPrintBusy
                        ? "Preparing…"
                        : selectedProcedureIds.length === 1
                          ? "Print Label"
                          : `Print ${selectedProcedureIds.length} Labels`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={batchPrintBusy}
                    onClick={clearProcedureSelection}
                  >
                    Clear selection
                  </button>
                </div>
              ) : null}

              <div className="card mb-4">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        {canSelectProcedures ? (
                          <th scope="col" style={{ width: 42 }}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={allPageSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = somePageSelected && !allPageSelected;
                              }}
                              disabled={pageProcedureIds.length === 0 || loading}
                              onChange={(ev) => toggleSelectAllPage(ev.target.checked)}
                              aria-label="Select all procedures on this page"
                            />
                          </th>
                        ) : null}
                        <th>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-decoration-none"
                            onClick={() => toggleSort("equipment")}
                          >
                            {sortHeaderLabel("equipment", "Equipment")}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-decoration-none"
                            onClick={() => toggleSort("department")}
                          >
                            {sortHeaderLabel("department", "Department")}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-decoration-none"
                            onClick={() => toggleSort("area")}
                          >
                            {sortHeaderLabel("area", "Area")}
                          </button>
                        </th>
                        <th>Status</th>
                        <th>Rev</th>
                        <th>Completed</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={canSelectProcedures ? 8 : 7} className="text-muted">
                            Loading procedures…
                          </td>
                        </tr>
                      ) : sortedItems.length === 0 ? (
                        <tr>
                          <td colSpan={canSelectProcedures ? 8 : 7} className="text-muted">
                            No LOTO procedures yet.
                          </td>
                        </tr>
                      ) : (
                        sortedItems.map((item) => {
                          const id = str(item.id);
                          const rowBusy = actionBusyId === id;
                          return (
                            <tr key={id} className={selectedId === id ? "table-active" : undefined}>
                              {canSelectProcedures ? (
                                <td>
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={selectedProcedureIds.includes(id)}
                                    disabled={!id}
                                    onChange={(ev) =>
                                      toggleProcedureSelected(item, ev.target.checked)
                                    }
                                    aria-label={`Select ${lotoProcedureEquipmentName(item)}`}
                                  />
                                </td>
                              ) : null}
                              <td>
                                <div className="fw-medium">{lotoProcedureEquipmentName(item)}</div>
                                {lotoProcedureEquipmentType(item) ? (
                                  <small className="text-muted">
                                    {lotoProcedureEquipmentType(item)}
                                  </small>
                                ) : null}
                              </td>
                              <td>{lotoProcedureDepartmentName(item)}</td>
                              <td>{lotoProcedureAreaName(item)}</td>
                              <td>
                                <span className={`badge ${lotoStatusBadgeClass(str(item.status))}`}>
                                  {lotoStatusLabel(str(item.status))}
                                </span>
                              </td>
                              <td>{str(item.revision) || "1"}</td>
                              <td>{lotoProcedureCompletedDate(item) || "—"}</td>
                              <td className="text-end">
                                <div className="d-inline-flex flex-column align-items-stretch gap-1">
                                  <div className="d-flex flex-wrap gap-1 justify-content-end">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary"
                                      disabled={rowBusy || !id}
                                      onClick={() => void onOpenQr(item)}
                                    >
                                      Open / QR
                                    </button>
                                    {canPrint ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={rowBusy || !id}
                                        onClick={() => void onPrintProcedure(item)}
                                      >
                                        Print
                                      </button>
                                    ) : null}
                                    <ForgePrintButton
                                      module="LOCKOUT_TAGOUT"
                                      recordType="loto_procedure"
                                      recordId={id}
                                      disabled={rowBusy || !id}
                                      fieldValues={lotoProcedurePrintFieldValues(
                                        item,
                                        lotoProcedureEquipmentName(item),
                                      )}
                                      onPrepare={async () =>
                                        ensureLotoProcedurePrintQrPayload(item, {
                                          canView: canQrView,
                                          canGenerate: canQrGenerate,
                                        })
                                      }
                                    />
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        disabled={rowBusy || !id}
                                        onClick={() => void onStartEdit(id)}
                                      >
                                        Edit
                                      </button>
                                    ) : null}
                                  </div>
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-link text-danger p-0 align-self-end"
                                      disabled={rowBusy || !id}
                                      onClick={() => void onDeleteProcedure(item)}
                                    >
                                      Delete
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
                <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <span className="text-muted small">
                    {procedureTotal === 0
                      ? "No procedures"
                      : `Showing ${procedureRangeFrom} to ${procedureRangeTo} of ${procedureTotal} procedures`}
                    {areaFilter ? ` · ${sortedItems.length} on this page match area filter` : ""}
                  </span>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <label className="small text-muted mb-0">
                      Show
                      <select
                        className="form-select form-select-sm d-inline-block w-auto mx-1"
                        value={procedurePageSize}
                        disabled={loading}
                        aria-label="Procedures per page"
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if ((PROCEDURE_PAGE_SIZES as readonly number[]).includes(next)) {
                            setProcedurePageSize(next as ProcedurePageSize);
                          }
                        }}
                      >
                        {PROCEDURE_PAGE_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      per page
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={procedurePage <= 1 || loading}
                      onClick={() => void loadList(procedurePage - 1)}
                    >
                      Previous
                    </button>
                    <span className="align-self-center small text-muted">
                      Page {procedurePage} of {procedurePageCount}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={procedurePage >= procedurePageCount || loading}
                      onClick={() => void loadList(procedurePage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {qrModal ? (
            // Modal backdrop: click outside / Escape to dismiss.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              className="modal fade show d-block"
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="loto-qr-modal-title"
              style={{ background: "rgba(0,0,0,0.45)" }}
              onClick={closeQrModal}
              onKeyDown={(ev) => {
                if (ev.key === "Escape") closeQrModal();
              }}
            >
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
              <div
                className="modal-dialog modal-dialog-centered"
                role="document"
                onClick={(ev) => ev.stopPropagation()}
              >
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title" id="loto-qr-modal-title">
                      Open / QR — {qrModal.title}
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      aria-label="Close"
                      onClick={closeQrModal}
                    />
                  </div>
                  <div className="modal-body text-center">
                    {qrModal.loading ? (
                      <p className="text-muted mb-0">Preparing QR sticker…</p>
                    ) : null}
                    {qrModal.error ? (
                      <div className="alert alert-warning mb-3" role="alert">
                        {qrModal.error}
                      </div>
                    ) : null}
                    {qrModal.stickerUrl ? (
                      <img
                        src={qrModal.stickerUrl}
                        alt={`QR for ${qrModal.title}`}
                        className="img-fluid mb-3"
                        style={{
                          maxWidth: "100%",
                          width: "auto",
                          height: "auto",
                          objectFit: "contain",
                        }}
                      />
                    ) : null}
                    {!qrModal.loading && !qrModal.stickerUrl && !qrModal.error ? (
                      <p className="text-muted mb-0">QR sticker unavailable.</p>
                    ) : null}
                  </div>
                  <div className="modal-footer justify-content-between flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closeQrModal}
                    >
                      Close
                    </button>
                    <div className="d-flex flex-wrap gap-2">
                      {qrModal.stickerUrl && canQrPrint ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => void onPrintQrFromModal()}
                        >
                          Print QR
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          const id = qrModal.procedureId;
                          closeQrModal();
                          if (id) router.push(lotoProcedureHref(id));
                        }}
                      >
                        Open procedure
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!focusForm && procedure && selectedId ? (
            <article className="card mb-4">
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <h6 className="card-title mb-1">
                    {str(procedure.procedureNumber || detail?.procedureNumber)} —{" "}
                    {str(procedure.title || detail?.title)}
                  </h6>
                  <span
                    className={`badge ${lotoStatusBadgeClass(str(procedure.status || detail?.status))}`}
                  >
                    {lotoStatusLabel(str(procedure.status || detail?.status))}
                  </span>
                </div>
                <LotoProcedureWorkflowActions
                  status={str(procedure?.status || detail?.status)}
                  busy={busy}
                  canEdit={canEdit}
                  canApprove={canApprove}
                  onEdit={() => void onStartEdit(selectedId)}
                  onSubmitForReview={() => void transition("submit-review")}
                  onActivate={() => void transition("activate")}
                  onApprove={() => void transition("approve")}
                  onRequestChanges={(notes) =>
                    void transition("request-changes", { reviewReturnNotes: notes })
                  }
                  extras={
                    <>
                      {canPrint ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => void loadPrint()}
                        >
                          Print
                        </button>
                      ) : null}
                      {procedure || detail ? (
                        <ForgePrintButton
                          module="LOCKOUT_TAGOUT"
                          recordType="loto_procedure"
                          recordId={String(
                            (procedure as { id?: string } | null)?.id ?? detail?.id ?? "",
                          )}
                          className="btn btn-sm btn-outline-primary"
                          fieldValues={lotoProcedurePrintFieldValues(
                            ((procedure as Record<string, unknown> | null) ?? detail) as Record<
                              string,
                              unknown
                            >,
                            lotoProcedureEquipmentName(
                              ((procedure as Record<string, unknown> | null) ?? detail) as Record<
                                string,
                                unknown
                              >,
                            ),
                          )}
                          onPrepare={async () =>
                            ensureLotoProcedurePrintQrPayload(
                              ((procedure as Record<string, unknown> | null) ?? detail) as Record<
                                string,
                                unknown
                              >,
                              {
                                canView: canQrView,
                                canGenerate: canQrGenerate,
                              },
                            )
                          }
                        />
                      ) : null}
                    </>
                  }
                />
              </div>
              <div className="card-body">
                {procedureDisplay ? (
                  <LotoProcedureDetailSections display={procedureDisplay} />
                ) : null}

                {canEdit && canIssueLockout(str(procedure?.status || detail?.status)) ? (
                  <form className="border rounded p-3 mb-3" onSubmit={(e) => void issueLockout(e)}>
                    <h6 className="mb-3">Issue lockout</h6>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-authorized">
                          Authorized employee
                        </label>
                        <input
                          id="loto-authorized"
                          className="form-control"
                          list="loto-personnel"
                          required
                          value={authorizedEmployee}
                          onChange={(ev) => setAuthorizedEmployee(ev.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-affected">
                          Affected employees
                        </label>
                        <input
                          id="loto-affected"
                          className="form-control"
                          value={affectedEmployees}
                          onChange={(ev) => setAffectedEmployees(ev.target.value)}
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="loto-lock-tag">
                          Lock / tag ID
                        </label>
                        <input
                          id="loto-lock-tag"
                          className="form-control"
                          value={lockTagId}
                          onChange={(ev) => setLockTagId(ev.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <div className="form-check">
                          <input
                            id="loto-try-start"
                            className="form-check-input"
                            type="checkbox"
                            checked={tryStartRequired}
                            onChange={(ev) => setTryStartRequired(ev.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="loto-try-start">
                            Try-start / zero-energy test required before work
                          </label>
                        </div>
                      </div>
                    </div>
                    <datalist id="loto-personnel">
                      {personnel.map((person) => (
                        <option key={str(person.id)} value={personName(person)} />
                      ))}
                    </datalist>
                    <button type="submit" className="btn btn-danger mt-3" disabled={busy}>
                      Issue lockout
                    </button>
                  </form>
                ) : null}

                {printHtml ? (
                  <div className="mb-3">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                      <h6 className="mb-0">Printable preview</h6>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          const blocked = openPrintableHtmlPopup(printHtml, true);
                          if (blocked) setError(blocked);
                        }}
                      >
                        Print / Save as PDF
                      </button>
                    </div>
                    <iframe
                      title="LOTO printable"
                      srcDoc={printHtml}
                      className="w-100 border rounded"
                      style={{ minHeight: 980, background: "#d8dbe0" }}
                    />
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}
        </>
      ) : null}

      {tab === "lockouts" ? (
        <div className="card">
          <div className="card-header">
            <h6 className="card-title mb-0">Issued lockouts</h6>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Lockout</th>
                  <th>Authorized</th>
                  <th>Affected</th>
                  <th>Lock / tag</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Verify / close</th>
                </tr>
              </thead>
              <tbody>
                {openLockouts.length === 0 && lockouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted">
                      No lockouts issued yet. Approve a procedure, then issue a lockout.
                    </td>
                  </tr>
                ) : (
                  (openLockouts.length > 0 ? openLockouts : lockouts).map((row) => (
                    <tr key={str(row.id)}>
                      <td>
                        <a
                          href={lotoLockoutHref(str(row.id))}
                          className="fw-medium text-body"
                          onClick={(ev) => {
                            ev.preventDefault();
                            router.push(lotoLockoutHref(str(row.id)));
                          }}
                        >
                          {str(row.title) || str(row.procedureNumber) || "Lockout"}
                        </a>
                        <div>
                          <small className="text-muted">
                            {lockoutEquipmentName(row) || str(row.equipmentName) || "—"}
                          </small>
                        </div>
                      </td>
                      <td>
                        {lockoutAuthorizedEmployee(row) || str(row.authorizedEmployee) || "—"}
                      </td>
                      <td>{str(row.affectedEmployees) || "—"}</td>
                      <td>{str(row.lockTagId) || "—"}</td>
                      <td>{dueDateLabel(row) || "—"}</td>
                      <td>
                        <span className={`badge ${lotoStatusBadgeClass(str(row.status))}`}>
                          {lotoStatusLabel(str(row.status))}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-2 align-items-center">
                          {str(row.status).toUpperCase() === "ISSUED" && canEdit ? (
                            <>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`zero-${str(row.id)}`}
                                  checked={zeroEnergy}
                                  onChange={(ev) => setZeroEnergy(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`zero-${str(row.id)}`}>
                                  Zero energy
                                </label>
                              </div>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`try-${str(row.id)}`}
                                  checked={tryStartDone}
                                  onChange={(ev) => setTryStartDone(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`try-${str(row.id)}`}>
                                  Try-start
                                </label>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-warning"
                                disabled={busy || !zeroEnergy}
                                onClick={() => void lockoutAction(str(row.id), "verify")}
                              >
                                Verify
                              </button>
                            </>
                          ) : null}
                          {(str(row.status).toUpperCase() === "ISSUED" ||
                            str(row.status).toUpperCase() === "VERIFIED") &&
                          canEdit ? (
                            <>
                              <div className="form-check mb-0">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`rest-${str(row.id)}`}
                                  checked={restorationDone}
                                  onChange={(ev) => setRestorationDone(ev.target.checked)}
                                />
                                <label className="form-check-label" htmlFor={`rest-${str(row.id)}`}>
                                  Restored
                                </label>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={busy || !restorationDone}
                                onClick={() => void lockoutAction(str(row.id), "close")}
                              >
                                Close out
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "reports" ? (
        <div className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-start mb-3">
              <div>
                <h6 className="mb-1">LOTO reports</h6>
                <p className="text-muted small mb-0">
                  Run and export from the shared Reporting Center. Save a report there to schedule
                  recurring digests.
                </p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link className="btn btn-sm btn-primary" href="/reporting/library/?q=loto">
                  Open library
                </Link>
                <Link
                  className="btn btn-sm btn-outline-primary"
                  href="/reporting/builder/?source=loto.procedures_inventory"
                >
                  Custom builder
                </Link>
              </div>
            </div>
            <div className="list-group list-group-flush">
              {LOTO_REPORTS.map((report) => (
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
            <p className="text-muted small mt-3 mb-0">
              Schedule recurring delivery from{" "}
              <Link href="/reporting/scheduled/">Reporting → Scheduled</Link>.
            </p>
          </div>
        </div>
      ) : null}

      <ForgePrintDialog
        open={batchPrintItems != null && batchPrintItems.length > 0}
        onClose={() => {
          const wasBatch = (batchPrintItems?.length ?? 0) > 1;
          setBatchPrintItems(null);
          if (wasBatch) clearProcedureSelection();
        }}
        module="LOCKOUT_TAGOUT"
        recordType="loto_procedure"
        {...(batchPrintItems?.length === 1 && batchPrintItems[0]?.recordId
          ? { recordId: batchPrintItems[0].recordId }
          : {})}
        defaultTitle={
          batchPrintItems && batchPrintItems.length > 1
            ? `Print ${batchPrintItems.length} labels`
            : "Print label"
        }
        fieldValues={batchPrintItems?.[0]?.fieldValues ?? {}}
        {...(batchPrintItems && batchPrintItems.length > 1 ? { items: batchPrintItems } : {})}
      />
    </section>
  );
}
