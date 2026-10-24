"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { formatApiErrorMessage } from "@/lib/api-error";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { printQrLabel } from "@/lib/label-print";
import { composeQrLinkStickerBlob } from "@/lib/qr-link-sticker";
import {
  canAuditQrLinks,
  canDeactivateQr,
  canGenerateQr,
  canManageQrLinks,
  canPrintQr,
  canReplaceQr,
  canViewQrAnalytics,
  canViewQrLinks,
  defaultQrActionFlags,
  flagsFromActionConfig,
  formatQrTimestamp,
  pickerListPath,
  QR_ACCESS_MODES,
  QR_ACTION_FLAG_OPTIONS,
  QR_LINK_STATUSES,
  QR_TARGET_TYPES,
  qrStatusBadgeClass,
  targetTypeLabel,
  type QrActionFlagKey,
  type QrAnalyticsSummary,
  type QrLinkListResponse,
  type QrLinkRow,
  type QrTargetOption,
} from "@/lib/qr-links-module";

type IssuedQrSession = {
  linkId: string;
  token: string;
  url: string;
  label: string;
  stickerBlob: Blob | null;
  stickerObjectUrl: string | null;
};

const TABS = [
  { id: "registry" as const, label: "Registry" },
  { id: "create" as const, label: "Create" },
  { id: "detail" as const, label: "Detail" },
];

const API_BASE = "/api/v1/qr-links";

function recordLabel(row: QrLinkRow): string {
  return row.name?.trim() || row.label?.trim() || row.displayCode?.trim() || row.id;
}

function pickerLabel(row: Record<string, unknown>, fallback: string): string {
  const candidates = [
    row.equipmentName,
    row.name,
    row.title,
    row.label,
    row.assetNumber,
    row.displayName,
  ];
  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return fallback;
}

export function QrLinksWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const canView = canViewQrLinks(permissions);
  const canManage = canManageQrLinks(permissions);
  const canAudit = canAuditQrLinks(permissions);
  const canGenerate = canGenerateQr(permissions);
  const canPrint = canPrintQr(permissions);
  const canReplace = canReplaceQr(permissions);
  const canDeactivate = canDeactivateQr(permissions);
  const canAnalytics = canViewQrAnalytics(permissions);

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "QR_LINKS",
    canView,
  });
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("registry");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "QR_LINKS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "registry",
      ),
    );
  }, [visibleTabs]);
  const [items, setItems] = useState<QrLinkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState<QrAnalyticsSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QrLinkRow | null>(null);
  const [scanEvents, setScanEvents] = useState<Array<Record<string, unknown>>>([]);
  const [auditEvents, setAuditEvents] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");

  const [targetOptions, setTargetOptions] = useState<QrTargetOption[]>([]);
  const [linkedOptions, setLinkedOptions] = useState<{
    loto: QrTargetOption[];
    jsa: QrTargetOption[];
    document: QrTargetOption[];
    training: QrTargetOption[];
    chemical: QrTargetOption[];
  }>({ loto: [], jsa: [], document: [], training: [], chemical: [] });
  const [createForm, setCreateForm] = useState<{
    name: string;
    description: string;
    accessMode: string;
    targetType: string;
    targetId: string;
    issueToken: boolean;
    actionFlags: Record<QrActionFlagKey, boolean>;
    lotoProcedureId: string;
    jsaId: string;
    documentId: string;
    trainingAssignmentId: string;
    chemicalSafetyId: string;
  }>({
    name: "",
    description: "",
    accessMode: QR_ACCESS_MODES[1].value,
    targetType: QR_TARGET_TYPES[0].value,
    targetId: "",
    issueToken: true,
    actionFlags: defaultQrActionFlags(),
    lotoProcedureId: "",
    jsaId: "",
    documentId: "",
    trainingAssignmentId: "",
    chemicalSafetyId: "",
  });
  const [detailFlags, setDetailFlags] =
    useState<Record<QrActionFlagKey, boolean>>(defaultQrActionFlags());
  const [detailLinks, setDetailLinks] = useState({
    lotoProcedureId: "",
    jsaId: "",
    documentId: "",
    trainingAssignmentId: "",
    chemicalSafetyId: "",
  });

  const [issued, setIssued] = useState<IssuedQrSession | null>(null);

  const clearIssued = useCallback(() => {
    setIssued((prev) => {
      if (prev?.stickerObjectUrl) URL.revokeObjectURL(prev.stickerObjectUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (issued?.stickerObjectUrl) URL.revokeObjectURL(issued.stickerObjectUrl);
    };
  }, [issued?.stickerObjectUrl]);

  const loadList = useCallback(async () => {
    if (!awsReady) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<QrLinkListResponse>(API_BASE, {
        query: {
          q: q.trim() || undefined,
          status: statusFilter || undefined,
          targetType: targetTypeFilter || undefined,
          page: "1",
          pageSize: "50",
        },
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? data.items?.length ?? 0);
      if (canAnalytics) {
        try {
          const summary = await apiGet<QrAnalyticsSummary>(`${API_BASE}/analytics/summary`, {
            query: { rangeDays: "90" },
          });
          setAnalytics(summary);
        } catch {
          setAnalytics(null);
        }
      }
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to load QR links"));
      setItems([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, [awsReady, q, statusFilter, targetTypeFilter, canAnalytics]);

  const loadDetail = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const row = await apiGet<QrLinkRow>(`${API_BASE}/${encodeURIComponent(id)}`);
        setDetail(row);
        setSelectedId(id);
        setDetailFlags(flagsFromActionConfig(row.actionConfig));
        const cfg = row.actionConfig ?? {};
        setDetailLinks({
          lotoProcedureId: String(cfg.lotoProcedureId ?? ""),
          jsaId: String(cfg.jsaId ?? ""),
          documentId: String(cfg.documentId ?? ""),
          trainingAssignmentId: String(cfg.trainingAssignmentId ?? ""),
          chemicalSafetyId: String(cfg.chemicalSafetyId ?? ""),
        });
        const [scans, audits] = await Promise.all([
          apiGet<{ items: Array<Record<string, unknown>> }>(
            `${API_BASE}/${encodeURIComponent(id)}/scan-events`,
            { query: { page: "1", pageSize: "25" } },
          ),
          canAudit
            ? apiGet<{ items: Array<Record<string, unknown>> }>(
                `${API_BASE}/${encodeURIComponent(id)}/audit-events`,
                { query: { page: "1", pageSize: "25" } },
              )
            : Promise.resolve({ items: [] }),
        ]);
        setScanEvents(scans.items ?? []);
        setAuditEvents(audits.items ?? []);
      } catch (e) {
        setError(formatApiErrorMessage(e, "Unable to load QR link detail"));
        setDetail(null);
      } finally {
        setBusy(false);
      }
    },
    [canAudit],
  );

  useEffect(() => {
    if (!awsReady) return;
    void loadList();
  }, [awsReady, loadList]);

  const targetPicker =
    QR_TARGET_TYPES.find((t) => t.value === createForm.targetType)?.picker ?? "none";

  useEffect(() => {
    if (!awsReady || tab !== "create") return;
    const path = pickerListPath(targetPicker);
    if (!path) {
      setTargetOptions([]);
      return;
    }
    void (async () => {
      try {
        const data = await apiGet<{ items: Array<Record<string, unknown>> }>(path, {
          query: { page: "1", pageSize: "100" },
        });
        setTargetOptions(
          (data.items ?? []).map((row) => ({
            id: String(row.id ?? ""),
            label: pickerLabel(row, String(row.id ?? "Record")),
          })),
        );
      } catch {
        setTargetOptions([]);
      }
    })();
  }, [awsReady, tab, targetPicker]);

  useEffect(() => {
    if (!awsReady || (tab !== "create" && tab !== "detail")) return;
    void (async () => {
      const loadPicker = async (picker: "loto" | "jsa" | "document" | "training" | "chemical") => {
        const path = pickerListPath(picker);
        if (!path) return [] as QrTargetOption[];
        try {
          const data = await apiGet<{ items: Array<Record<string, unknown>> }>(path, {
            query: { page: "1", pageSize: "100" },
          });
          return (data.items ?? []).map((row) => ({
            id: String(row.id ?? ""),
            label: pickerLabel(row, String(row.id ?? "Record")),
          }));
        } catch {
          return [];
        }
      };
      const [loto, jsa, document, training, chemical] = await Promise.all([
        loadPicker("loto"),
        loadPicker("jsa"),
        loadPicker("document"),
        loadPicker("training"),
        loadPicker("chemical"),
      ]);
      setLinkedOptions({ loto, jsa, document, training, chemical });
    })();
  }, [awsReady, tab]);

  function buildActionConfig(
    flags: Record<QrActionFlagKey, boolean>,
    links: {
      lotoProcedureId: string;
      jsaId: string;
      documentId: string;
      trainingAssignmentId: string;
      chemicalSafetyId: string;
    },
  ): Record<string, unknown> {
    return {
      ...flags,
      ...(links.lotoProcedureId ? { lotoProcedureId: links.lotoProcedureId } : {}),
      ...(links.jsaId ? { jsaId: links.jsaId } : {}),
      ...(links.documentId ? { documentId: links.documentId } : {}),
      ...(links.trainingAssignmentId ? { trainingAssignmentId: links.trainingAssignmentId } : {}),
      ...(links.chemicalSafetyId ? { chemicalSafetyId: links.chemicalSafetyId } : {}),
    };
  }

  async function applyIssuedQr(linkId: string, label: string, payload: QrLinkRow) {
    const token = String(payload.publicToken ?? payload.token ?? "").trim();
    const url = String(payload.url ?? "").trim();
    if (!token || !url) return;
    clearIssued();
    let stickerBlob: Blob | null = null;
    try {
      const image = await apiSend<{ dataBase64: string }>(
        `${API_BASE}/${encodeURIComponent(linkId)}/qr-image`,
        "POST",
        { token, appBaseUrl: window.location.origin },
      );
      stickerBlob = await composeQrLinkStickerBlob(
        image.dataBase64,
        label,
        payload.displayCode ?? undefined,
      );
    } catch {
      stickerBlob = null;
    }
    const stickerObjectUrl = stickerBlob ? URL.createObjectURL(stickerBlob) : null;
    setIssued({ linkId, token, url, label, stickerBlob, stickerObjectUrl });
    setNotice("QR token issued. Download or print the sticker before leaving this page.");
  }

  async function createLink(event: FormEvent) {
    event.preventDefault();
    if (!canManage && !canGenerate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const actionConfig = buildActionConfig(createForm.actionFlags, {
        lotoProcedureId: createForm.lotoProcedureId,
        jsaId: createForm.jsaId,
        documentId: createForm.documentId,
        trainingAssignmentId: createForm.trainingAssignmentId,
        chemicalSafetyId: createForm.chemicalSafetyId,
      });
      const isLotoProcedure = createForm.targetType === "LOTO_PROCEDURE";
      const isFleetVehicle = createForm.targetType === "VEHICLE";
      const accessMode =
        isLotoProcedure || isFleetVehicle ? "PUBLIC_ACTION" : createForm.accessMode;
      const created = await apiSend<QrLinkRow>(API_BASE, "POST", {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        accessMode,
        qrType: accessMode,
        targetType: createForm.targetType,
        targetId: createForm.targetId || undefined,
        target: {
          targetType: createForm.targetType,
          targetId: createForm.targetId || undefined,
          resolutionMode: "LATEST_PUBLISHED",
        },
        actionConfig: isLotoProcedure
          ? {
              ...actionConfig,
              viewLoto: true,
              reportIssue: true,
              ...(createForm.targetId ? { lotoProcedureId: createForm.targetId } : {}),
            }
          : isFleetVehicle
            ? { ...actionConfig, reportIssue: true }
            : actionConfig,
        isPublic: isLotoProcedure || isFleetVehicle ? true : createForm.issueToken,
        issueToken: isLotoProcedure || isFleetVehicle ? true : createForm.issueToken,
        appBaseUrl: window.location.origin,
      });
      setCreateForm({
        name: "",
        description: "",
        accessMode: QR_ACCESS_MODES[1].value,
        targetType: QR_TARGET_TYPES[0].value,
        targetId: "",
        issueToken: true,
        actionFlags: defaultQrActionFlags(),
        lotoProcedureId: "",
        jsaId: "",
        documentId: "",
        trainingAssignmentId: "",
        chemicalSafetyId: "",
      });
      if (created.publicToken || created.token) {
        await applyIssuedQr(created.id, recordLabel(created), created);
      } else {
        setNotice("QR link created.");
      }
      await loadList();
      setTab("registry");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to create QR link"));
    } finally {
      setBusy(false);
    }
  }

  async function saveDetailConfig() {
    if (!detail || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const actionConfig = buildActionConfig(detailFlags, detailLinks);
      const updated = await apiSend<QrLinkRow>(
        `${API_BASE}/${encodeURIComponent(detail.id)}`,
        "PATCH",
        { actionConfig },
      );
      setDetail(updated);
      setNotice("Scan actions updated.");
      await loadDetail(detail.id);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to update scan actions"));
    } finally {
      setBusy(false);
    }
  }

  async function issueTokenFor(link: QrLinkRow) {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiSend<QrLinkRow>(
        `${API_BASE}/${encodeURIComponent(link.id)}/issue-token`,
        "POST",
        {
          appBaseUrl: window.location.origin,
        },
      );
      await applyIssuedQr(link.id, recordLabel(link), res);
      if (selectedId === link.id) await loadDetail(link.id);
      await loadList();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to issue QR token"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeTokenFor(link: QrLinkRow) {
    if (!canGenerate) return;
    if (!window.confirm(`Revoke the public token for "${recordLabel(link)}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`${API_BASE}/${encodeURIComponent(link.id)}/revoke-token`, "POST", {});
      if (issued?.linkId === link.id) clearIssued();
      setNotice("QR token revoked.");
      if (selectedId === link.id) await loadDetail(link.id);
      await loadList();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to revoke token"));
    } finally {
      setBusy(false);
    }
  }

  async function replaceLink(link: QrLinkRow) {
    if (!canReplace) return;
    if (
      !window.confirm(
        `Replace "${recordLabel(link)}" with a new QR code? The old label will be marked REPLACED.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<{
        replacement: QrLinkRow;
        token?: string;
        url?: string;
      }>(`${API_BASE}/${encodeURIComponent(link.id)}/replace`, "POST", {
        appBaseUrl: window.location.origin,
      });
      const replacement = res.replacement;
      if (replacement && (res.token || replacement.publicToken)) {
        const issuedRow: QrLinkRow = {
          ...replacement,
          ...(res.token ? { publicToken: res.token, token: res.token } : {}),
          ...(res.url ? { url: res.url } : {}),
        };
        await applyIssuedQr(replacement.id, recordLabel(replacement), issuedRow);
      }
      setNotice("QR link replaced.");
      await loadList();
      if (replacement?.id) {
        setTab("detail");
        await loadDetail(replacement.id);
      }
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to replace QR link"));
    } finally {
      setBusy(false);
    }
  }

  async function deactivateLink(link: QrLinkRow) {
    if (!canDeactivate) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`${API_BASE}/${encodeURIComponent(link.id)}/deactivate`, "POST", {});
      setNotice("QR link deactivated.");
      if (selectedId === link.id) await loadDetail(link.id);
      await loadList();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to deactivate QR link"));
    } finally {
      setBusy(false);
    }
  }

  async function reactivateLink(link: QrLinkRow) {
    if (!canDeactivate) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`${API_BASE}/${encodeURIComponent(link.id)}/reactivate`, "POST", {});
      setNotice("QR link reactivated.");
      if (selectedId === link.id) await loadDetail(link.id);
      await loadList();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to reactivate QR link"));
    } finally {
      setBusy(false);
    }
  }

  function openDetail(id: string) {
    setTab("detail");
    void loadDetail(id);
  }

  if (!canView) {
    return <ModuleUnavailable moduleName={moduleName} status="permission" />;
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
    <section aria-labelledby="qr-links-title" data-walkthrough="qr-scan">
      <ModuleWorkspaceHeader
        id="qr-links-title"
        eyebrow="System Tools"
        title={moduleName}
        description="Create and manage physical QR labels that route employees to equipment, inspections, and safety workflows."
        onRefresh={() => {
          void loadList();
          if (selectedId) void loadDetail(selectedId);
        }}
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

      {issued ? (
        <div className="card border shadow-none mb-4">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div>
                <h6 className="mb-1">Issued QR — {issued.label}</h6>
                <p className="small text-muted mb-2">
                  Save the sticker now. The full token is only shown in this session.
                </p>
                <div className="small">
                  Scan URL:{" "}
                  <a href={issued.url} target="_blank" rel="noreferrer">
                    {issued.url}
                  </a>
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {issued.stickerObjectUrl ? (
                  <>
                    <a
                      className="btn btn-sm btn-primary"
                      href={issued.stickerObjectUrl}
                      download={`qr-${issued.linkId}.png`}
                    >
                      Download PNG
                    </a>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() =>
                        void printQrLabel({
                          stickerObjectUrl: issued.stickerObjectUrl ?? "",
                          label: issued.label,
                          stickerBlob: issued.stickerBlob,
                        })
                      }
                      disabled={!canPrint}
                    >
                      Print preview
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={clearIssued}
                >
                  Dismiss
                </button>
              </div>
            </div>
            {issued.stickerObjectUrl ? (
              <div className="mt-3 text-center">
                <img
                  src={issued.stickerObjectUrl}
                  alt={`QR sticker for ${issued.label}`}
                  className="border rounded"
                  style={{ maxWidth: "320px", height: "auto" }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={(id) => {
          setTab(id);
          if (id === "detail" && selectedId && !detail) void loadDetail(selectedId);
        }}
        ariaLabel="QR management sections"
        tabPanelLabel={visibleTabs.find((t) => t.id === tab)?.label ?? "QR management"}
      >
        {tab === "registry" ? (
          <div>
            {analytics ? (
              <div className="row g-3 mb-4">
                {[
                  { label: "Active QR codes", value: analytics.activeQrCodes },
                  { label: "Scans today", value: analytics.scansToday },
                  { label: "Inspections started", value: analytics.inspectionsStarted },
                  { label: "Issues reported", value: analytics.issuesReported },
                  {
                    label: "Corrective actions",
                    value: analytics.correctiveActionsCreated,
                  },
                  { label: "Training opened", value: analytics.trainingOpened },
                ].map((card) => (
                  <div className="col-6 col-md-4 col-xl-2" key={card.label}>
                    <div className="card border shadow-none h-100">
                      <div className="card-body py-3">
                        <div className="text-muted small">{card.label}</div>
                        <div className="fs-4 fw-semibold mb-0">{card.value}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <FilterPanel
              searchId="qr-link-search"
              searchValue={q}
              onSearchChange={setQ}
              searchPlaceholder="Name or display code"
              statusId="qr-link-status"
              statusValue={statusFilter}
              onStatusChange={setStatusFilter}
              statusOptions={[
                { value: "", label: "All statuses" },
                ...QR_LINK_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
              chips={[
                ...(q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []),
                ...(statusFilter
                  ? [
                      {
                        id: "status",
                        label: `Status: ${statusFilter}`,
                        onRemove: () => setStatusFilter(""),
                      },
                    ]
                  : []),
                ...(targetTypeFilter
                  ? [
                      {
                        id: "target",
                        label: `Target: ${targetTypeLabel(targetTypeFilter)}`,
                        onRemove: () => setTargetTypeFilter(""),
                      },
                    ]
                  : []),
              ]}
              onClearAll={() => {
                setQ("");
                setStatusFilter("");
                setTargetTypeFilter("");
                void loadList();
              }}
              onSubmit={() => void loadList()}
              extraFields={
                <div className="col-md-4">
                  <label className="form-label" htmlFor="qr-target-type-filter">
                    Target type
                  </label>
                  <select
                    id="qr-target-type-filter"
                    className="form-select form-select-sm"
                    value={targetTypeFilter}
                    onChange={(e) => setTargetTypeFilter(e.target.value)}
                  >
                    <option value="">All targets</option>
                    {QR_TARGET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              }
            />
            <div className="card border shadow-none">
              <div className="card-header d-flex justify-content-between align-items-center">
                <span className="text-muted small">
                  {total} QR link{total === 1 ? "" : "s"}
                </span>
                {canManage || canGenerate ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setTab("create")}
                  >
                    New QR link
                  </button>
                ) : null}
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Target</th>
                      <th>Scans</th>
                      <th>Token</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-muted text-center py-4">
                          {busy ? "Loading…" : "No QR links match your filters."}
                        </td>
                      </tr>
                    ) : (
                      items.map((link) => (
                        <tr key={link.id}>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link btn-sm p-0 align-baseline"
                              onClick={() => openDetail(link.id)}
                            >
                              {recordLabel(link)}
                            </button>
                          </td>
                          <td>{link.displayCode ?? "—"}</td>
                          <td>
                            <span className="d-block">{targetTypeLabel(link.targetType)}</span>
                            <span className="small text-muted">{link.targetId ?? "—"}</span>
                          </td>
                          <td>{link.scanCount ?? 0}</td>
                          <td>{link.publicTokenHint ?? "—"}</td>
                          <td>
                            <span className={`badge ${qrStatusBadgeClass(link.status)}`}>
                              {link.status}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex flex-wrap gap-1">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => openDetail(link.id)}
                              >
                                Detail
                              </button>
                              {canGenerate && link.status === "ACTIVE" && !link.publicTokenHint ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => void issueTokenFor(link)}
                                >
                                  Generate
                                </button>
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
          </div>
        ) : null}

        {tab === "create" && (canManage || canGenerate) ? (
          <div className="card border shadow-none">
            <div className="card-header">
              <h6 className="card-title mb-0">Create QR link</h6>
            </div>
            <div className="card-body">
              <form className="row g-3" onSubmit={(event) => void createLink(event)}>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-name">
                    Name
                  </label>
                  <input
                    id="qr-create-name"
                    className="form-control form-control-sm"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-access">
                    Access mode
                  </label>
                  <select
                    id="qr-create-access"
                    className="form-select form-select-sm"
                    value={createForm.accessMode}
                    onChange={(e) => setCreateForm((f) => ({ ...f, accessMode: e.target.value }))}
                  >
                    {QR_ACCESS_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="qr-create-description">
                    Description
                  </label>
                  <textarea
                    id="qr-create-description"
                    className="form-control form-control-sm"
                    rows={2}
                    value={createForm.description}
                    onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-target-type">
                    Assign to
                  </label>
                  <select
                    id="qr-create-target-type"
                    className="form-select form-select-sm"
                    value={createForm.targetType}
                    onChange={(e) => {
                      const targetType = e.target.value;
                      setCreateForm((f) => ({
                        ...f,
                        targetType,
                        targetId: "",
                        ...(targetType === "LOTO_PROCEDURE" || targetType === "VEHICLE"
                          ? { accessMode: "PUBLIC_ACTION", issueToken: true }
                          : {}),
                      }));
                    }}
                  >
                    {QR_TARGET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {createForm.targetType === "LOTO_PROCEDURE" ? (
                    <div className="form-text">
                      LOTO procedure stickers are public (view procedure + report a problem, no
                      login).
                    </div>
                  ) : null}
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-target-id">
                    Target record
                  </label>
                  {targetPicker === "none" ? (
                    <input
                      id="qr-create-target-id"
                      className="form-control form-control-sm"
                      placeholder="Optional target UUID"
                      value={createForm.targetId}
                      onChange={(e) => setCreateForm((f) => ({ ...f, targetId: e.target.value }))}
                    />
                  ) : (
                    <select
                      id="qr-create-target-id"
                      className="form-select form-select-sm"
                      value={createForm.targetId}
                      onChange={(e) => setCreateForm((f) => ({ ...f, targetId: e.target.value }))}
                    >
                      <option value="">Select record (optional)</option>
                      {targetOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="col-12">
                  <div className="form-label">Scan actions</div>
                  <div className="row g-2">
                    {QR_ACTION_FLAG_OPTIONS.map((opt) => (
                      <div className="col-md-4" key={opt.key}>
                        <div className="form-check">
                          <input
                            id={`qr-create-flag-${opt.key}`}
                            className="form-check-input"
                            type="checkbox"
                            checked={createForm.actionFlags[opt.key]}
                            onChange={(e) =>
                              setCreateForm((f) => ({
                                ...f,
                                actionFlags: { ...f.actionFlags, [opt.key]: e.target.checked },
                              }))
                            }
                          />
                          <label className="form-check-label" htmlFor={`qr-create-flag-${opt.key}`}>
                            {opt.label}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-loto">
                    Linked LOTO
                  </label>
                  <select
                    id="qr-create-loto"
                    className="form-select form-select-sm"
                    value={createForm.lotoProcedureId}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, lotoProcedureId: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {linkedOptions.loto.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="qr-create-jsa">
                    Linked JSA
                  </label>
                  <select
                    id="qr-create-jsa"
                    className="form-select form-select-sm"
                    value={createForm.jsaId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, jsaId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {linkedOptions.jsa.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="qr-create-doc">
                    Linked document
                  </label>
                  <select
                    id="qr-create-doc"
                    className="form-select form-select-sm"
                    value={createForm.documentId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, documentId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {linkedOptions.document.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="qr-create-training">
                    Required training
                  </label>
                  <select
                    id="qr-create-training"
                    className="form-select form-select-sm"
                    value={createForm.trainingAssignmentId}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, trainingAssignmentId: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {linkedOptions.training.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="qr-create-sds">
                    SDS / chemical
                  </label>
                  <select
                    id="qr-create-sds"
                    className="form-select form-select-sm"
                    value={createForm.chemicalSafetyId}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, chemicalSafetyId: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {linkedOptions.chemical.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12">
                  <div className="form-check">
                    <input
                      id="qr-create-issue"
                      className="form-check-input"
                      type="checkbox"
                      checked={createForm.issueToken}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, issueToken: e.target.checked }))
                      }
                    />
                    <label className="form-check-label" htmlFor="qr-create-issue">
                      Issue scannable token immediately
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                    Create QR link
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {tab === "detail" ? (
          <div className="card border shadow-none">
            <div className="card-body">
              {!selectedId || !detail ? (
                <p className="text-muted mb-0">
                  Select a QR link from the registry to view details.
                </p>
              ) : (
                <>
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                    <div>
                      <h5 className="mb-1">{recordLabel(detail)}</h5>
                      <p className="text-muted small mb-0">
                        {detail.displayCode ? `Code ${detail.displayCode}` : "No display code"}
                        {detail.description ? ` · ${detail.description}` : ""}
                      </p>
                    </div>
                    <span className={`badge ${qrStatusBadgeClass(detail.status)}`}>
                      {detail.status}
                    </span>
                  </div>
                  <dl className="row small mb-4">
                    <dt className="col-sm-3">Target</dt>
                    <dd className="col-sm-9">
                      {targetTypeLabel(detail.targetType)}
                      {detail.targetId ? ` · ${detail.targetId}` : ""}
                    </dd>
                    <dt className="col-sm-3">Access</dt>
                    <dd className="col-sm-9">{detail.accessMode ?? detail.qrType ?? "—"}</dd>
                    <dt className="col-sm-3">Scans</dt>
                    <dd className="col-sm-9">
                      {detail.scanCount ?? 0}
                      {detail.lastScannedAt
                        ? ` · last ${formatQrTimestamp(detail.lastScannedAt)}`
                        : ""}
                    </dd>
                    <dt className="col-sm-3">Token hint</dt>
                    <dd className="col-sm-9">{detail.publicTokenHint ?? "Not issued"}</dd>
                    <dt className="col-sm-3">Activated</dt>
                    <dd className="col-sm-9">{formatQrTimestamp(detail.activatedAt)}</dd>
                  </dl>
                  {canManage || canGenerate || canReplace || canDeactivate ? (
                    <div className="d-flex flex-wrap gap-2 mb-4">
                      {canGenerate && detail.status === "ACTIVE" && !detail.publicTokenHint ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => void issueTokenFor(detail)}
                        >
                          Generate QR
                        </button>
                      ) : null}
                      {canGenerate && detail.publicTokenHint ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busy}
                          onClick={() => void revokeTokenFor(detail)}
                        >
                          Revoke token
                        </button>
                      ) : null}
                      {canReplace && detail.status === "ACTIVE" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning"
                          disabled={busy}
                          onClick={() => void replaceLink(detail)}
                        >
                          Replace label
                        </button>
                      ) : null}
                      {canDeactivate && detail.status === "ACTIVE" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={busy}
                          onClick={() => void deactivateLink(detail)}
                        >
                          Deactivate
                        </button>
                      ) : null}
                      {canDeactivate && detail.status === "INACTIVE" ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          disabled={busy}
                          onClick={() => void reactivateLink(detail)}
                        >
                          Reactivate
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {canManage ? (
                    <div className="border rounded p-3 mb-4">
                      <h6 className="mb-3">QR &amp; mobile access</h6>
                      <div className="row g-2 mb-3">
                        {QR_ACTION_FLAG_OPTIONS.map((opt) => (
                          <div className="col-md-4" key={opt.key}>
                            <div className="form-check">
                              <input
                                id={`qr-detail-flag-${opt.key}`}
                                className="form-check-input"
                                type="checkbox"
                                checked={detailFlags[opt.key]}
                                onChange={(e) =>
                                  setDetailFlags((f) => ({ ...f, [opt.key]: e.target.checked }))
                                }
                              />
                              <label
                                className="form-check-label"
                                htmlFor={`qr-detail-flag-${opt.key}`}
                              >
                                {opt.label}
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="row g-3 mb-3">
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="qr-detail-loto">
                            Linked LOTO
                          </label>
                          <select
                            id="qr-detail-loto"
                            className="form-select form-select-sm"
                            value={detailLinks.lotoProcedureId}
                            onChange={(e) =>
                              setDetailLinks((l) => ({ ...l, lotoProcedureId: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            {linkedOptions.loto.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="qr-detail-jsa">
                            Linked JSA
                          </label>
                          <select
                            id="qr-detail-jsa"
                            className="form-select form-select-sm"
                            value={detailLinks.jsaId}
                            onChange={(e) =>
                              setDetailLinks((l) => ({ ...l, jsaId: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            {linkedOptions.jsa.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="qr-detail-doc">
                            Document
                          </label>
                          <select
                            id="qr-detail-doc"
                            className="form-select form-select-sm"
                            value={detailLinks.documentId}
                            onChange={(e) =>
                              setDetailLinks((l) => ({ ...l, documentId: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            {linkedOptions.document.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="qr-detail-training">
                            Training
                          </label>
                          <select
                            id="qr-detail-training"
                            className="form-select form-select-sm"
                            value={detailLinks.trainingAssignmentId}
                            onChange={(e) =>
                              setDetailLinks((l) => ({
                                ...l,
                                trainingAssignmentId: e.target.value,
                              }))
                            }
                          >
                            <option value="">None</option>
                            {linkedOptions.training.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="qr-detail-sds">
                            SDS / chemical
                          </label>
                          <select
                            id="qr-detail-sds"
                            className="form-select form-select-sm"
                            value={detailLinks.chemicalSafetyId}
                            onChange={(e) =>
                              setDetailLinks((l) => ({ ...l, chemicalSafetyId: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            {linkedOptions.chemical.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={() => void saveDetailConfig()}
                      >
                        Save scan actions
                      </button>
                    </div>
                  ) : null}
                  <h6 className="mb-2">Recent scans</h6>
                  {scanEvents.length === 0 ? (
                    <p className="text-muted small">No scan events recorded yet.</p>
                  ) : (
                    <ul className="list-unstyled small mb-4">
                      {scanEvents.map((event) => (
                        <li key={String(event.id)} className="mb-1">
                          {formatQrTimestamp(String(event.scannedAt ?? ""))} ·{" "}
                          {String(event.action ?? "SCAN")} · {String(event.result ?? "OK")}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canAudit ? (
                    <>
                      <h6 className="mb-2">Audit trail</h6>
                      {auditEvents.length === 0 ? (
                        <p className="text-muted small">No admin audit events.</p>
                      ) : (
                        <ul className="list-unstyled small">
                          {auditEvents.map((event) => (
                            <li key={String(event.id)} className="mb-1">
                              {formatQrTimestamp(String(event.eventAt ?? ""))} ·{" "}
                              {String(event.eventType ?? "EVENT")}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </ModuleWorkspaceTabs>
    </section>
  );
}
