"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, getApiBaseUrl, useAuth } from "@forge/web-kit";
import {
  FieldPrintDialog,
  type FieldPrintDialogBatchItem,
} from "@/components/field-print-label";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { fieldLotoApi } from "@/lib/loto-api";
import {
  ensureLotoProcedurePrintQrPayload,
  lotoProcedurePrintFieldValues,
} from "@/lib/loto-print";
import { canAuthorFieldLoto, canExecuteFieldLoto, canViewFieldLoto, fieldAuthOpts } from "@/lib/field-permissions";
import {
  extractLockoutSnapshot,
  filterAndSortLotoProcedures,
  isOpenLockoutStatus,
  lockoutAuthorizedEmployee,
  lockoutEquipmentName,
  lotoProcedureAreaName,
  lotoProcedureDepartmentName,
  lotoProcedureDivisionName,
  lotoProcedureEquipmentName,
  lotoProcedureNumber,
  lotoProcedureSiteName,
  lotoStatusLabel,
} from "@/lib/loto";

type Tab = "open" | "procedures" | "history";

const MAX_BATCH = 200;

function LotoListInner() {
  const router = useRouter();
  const search = useSearchParams();
  const equipmentId = (search.get("equipmentId") ?? "").trim();
  const org = useFieldOrgOptional();
  const { me, hasAnyPermission } = useAuth();
  const permissions = me?.permissions ?? [];
  const authOpts = fieldAuthOpts(me);
  const canView = canViewFieldLoto(permissions, authOpts);
  const canExecute = canExecuteFieldLoto(permissions, authOpts);
  const canAuthor = canAuthorFieldLoto(permissions, authOpts);
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canQrView = Boolean(
    me?.permissions?.includes("industrial.qr.view") ||
      me?.permissions?.includes("industrial.qr.generate") ||
      me?.permissions?.includes("industrial.admin"),
  );
  const canQrGenerate = Boolean(
    me?.permissions?.includes("industrial.qr.generate") ||
      me?.permissions?.includes("industrial.admin") ||
      canAuthor,
  );
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || "development";
  const apiHost = (() => {
    try {
      return new URL(getApiBaseUrl()).host;
    } catch {
      return getApiBaseUrl();
    }
  })();
  const tenantName =
    me?.tenants?.find((t) => t.tenantId === me.tenantId)?.displayName ||
    me?.tenantId ||
    "";

  const locationId = org?.selection.locationId ?? "";
  const departmentId = org?.selection.departmentId ?? "";
  const selectedLocationName =
    org?.locations.find((loc) => loc.id === locationId)?.name?.trim() ?? "";
  const selectedDepartmentName =
    org?.departments.find((dept) => dept.id === departmentId)?.name?.trim() ?? "";

  const [tab, setTab] = useState<Tab>("procedures");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [procedures, setProcedures] = useState<Array<Record<string, unknown>>>([]);
  const [lockouts, setLockouts] = useState<Array<Record<string, unknown>>>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCache, setSelectedCache] = useState<Record<string, Record<string, unknown>>>({});
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<FieldPrintDialogBatchItem[] | null>(null);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const listQuery: {
        q?: string;
        status?: string;
        equipmentId?: string;
        siteId?: string;
        siteName?: string;
        departmentId?: string;
        departmentName?: string;
        page: number;
        pageSize: number;
      } = {
        page: 1,
        pageSize: 250,
      };
      if (q.trim()) listQuery.q = q.trim();
      if (statusFilter.trim()) listQuery.status = statusFilter.trim();
      if (equipmentId) listQuery.equipmentId = equipmentId;
      if (locationId) {
        // Prefer name match; only send siteId when we also have a label so the API
        // can OR against payload site names (many procedures have null site FK).
        if (selectedLocationName) listQuery.siteName = selectedLocationName;
        listQuery.siteId = locationId;
      }
      if (departmentId) {
        listQuery.departmentId = departmentId;
        if (selectedDepartmentName) listQuery.departmentName = selectedDepartmentName;
      }
      const [procSettled, lockSettled] = await Promise.allSettled([
        fieldLotoApi.listProcedures(listQuery),
        fieldLotoApi.listLockouts({ page: 1, pageSize: 100 }),
      ]);
      const problems: string[] = [];
      if (procSettled.status === "fulfilled") {
        setProcedures(procSettled.value.items ?? []);
      } else {
        setProcedures([]);
        problems.push(
          procSettled.reason instanceof Error
            ? procSettled.reason.message
            : "Unable to load LOTO procedures.",
        );
      }
      if (lockSettled.status === "fulfilled") {
        setLockouts(lockSettled.value.items ?? []);
      } else {
        setLockouts([]);
        problems.push(
          lockSettled.reason instanceof Error
            ? lockSettled.reason.message
            : "Unable to load lockout events.",
        );
      }
      setError(problems[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load LOTO procedures.");
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    q,
    statusFilter,
    equipmentId,
    locationId,
    departmentId,
    selectedLocationName,
    selectedDepartmentName,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleProcedures = useMemo(
    () =>
      filterAndSortLotoProcedures(procedures, {
        locationId,
        locationName: selectedLocationName,
        departmentId,
      }),
    [procedures, locationId, selectedLocationName, departmentId],
  );

  const openLockouts = useMemo(
    () => lockouts.filter((row) => isOpenLockoutStatus(row.status)),
    [lockouts],
  );
  const closedLockouts = useMemo(
    () => lockouts.filter((row) => !isOpenLockoutStatus(row.status)),
    [lockouts],
  );

  function openLockout(row: Record<string, unknown>) {
    const snapshot = extractLockoutSnapshot(row);
    const id = snapshot?.id ?? String(row.id ?? "");
    const procedureId = snapshot?.procedureId || String(row.procedureId ?? "").trim();
    router.push(
      procedureId
        ? `/loto/${encodeURIComponent(procedureId)}/?lockoutId=${encodeURIComponent(id)}`
        : "/more/loto/",
    );
  }

  async function archiveProcedure(id: string, label: string) {
    if (!canAuthor || !id) return;
    const ok = window.confirm(
      `Archive procedure "${label}"? It will no longer appear in the active list.`,
    );
    if (!ok) return;
    setBusyId(id);
    setError(null);
    try {
      await fieldLotoApi.archiveProcedure(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive procedure.");
    } finally {
      setBusyId(null);
    }
  }

  function clearSelection() {
    setSelectedIds([]);
    setSelectedCache({});
    setSelectMode(false);
    setBatchError(null);
  }

  function toggleSelected(row: Record<string, unknown>) {
    const id = String(row.id ?? "");
    if (!id) return;
    setSelectedIds((prev) => {
      const removing = prev.includes(id);
      setSelectedCache((cache) => {
        if (removing) {
          const next = { ...cache };
          delete next[id];
          return next;
        }
        return { ...cache, [id]: row };
      });
      if (removing) return prev.filter((x) => x !== id);
      return [...prev, id].slice(0, MAX_BATCH);
    });
  }

  function toggleSelectAllVisible() {
    const ids = visibleProcedures
      .map((row) => String(row.id ?? ""))
      .filter(Boolean);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      const pageSet = new Set(ids);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
      setSelectedCache((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (next.size >= MAX_BATCH) break;
        next.add(id);
      }
      return [...next];
    });
    setSelectedCache((prev) => {
      const next = { ...prev };
      for (const row of visibleProcedures) {
        const id = String(row.id ?? "");
        if (!id || !ids.includes(id)) continue;
        next[id] = row;
      }
      return next;
    });
  }

  async function onBatchPrintLabels() {
    if (!canPrint || selectedIds.length < 1) return;
    setBatchBusy(true);
    setBatchError(null);
    try {
      const selected = selectedIds
        .map(
          (id) =>
            selectedCache[id] ??
            visibleProcedures.find((row) => String(row.id ?? "") === id) ??
            procedures.find((row) => String(row.id ?? "") === id),
        )
        .filter((row): row is Record<string, unknown> => Boolean(row?.id));
      if (selected.length === 0) {
        throw new Error("Selected procedures are no longer on this list. Clear and reselect.");
      }
      const batch: FieldPrintDialogBatchItem[] = [];
      for (const item of selected.slice(0, MAX_BATCH)) {
        const id = String(item.id);
        const equipmentName = lotoProcedureEquipmentName(item);
        const qr = await ensureLotoProcedurePrintQrPayload(item, {
          canView: canQrView || canView,
          canGenerate: canQrGenerate,
        });
        batch.push({
          recordId: id,
          title: equipmentName !== "—" ? equipmentName : String(item.procedureNumber ?? "LOTO"),
          fieldValues: {
            ...lotoProcedurePrintFieldValues(item, equipmentName),
            ...qr,
          },
        });
      }
      setBatchItems(batch);
    } catch (err) {
      setBatchError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not prepare batch labels for print.",
      );
    } finally {
      setBatchBusy(false);
    }
  }

  if (!canView) {
    return (
      <>
        <h1 className="ff-page-title">LOTO</h1>
        <p className="ff-page-body">You do not have permission to view lockout procedures.</p>
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">LOTO</h1>
      <p className="ff-page-body">
        Walk isolation, issue the lockout, verify zero energy, then restore and close.
      </p>

      <OrgContextBar compact locationEmptyLabel="All Locations" />

      {canAuthor ? (
        <div className="ff-action-grid ff-section">
          {canExecute ? (
            <button type="button" className="ff-btn" onClick={() => router.push("/more/loto/new/?start=1")}>
              Start lockout
            </button>
          ) : null}
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => router.push("/more/loto/new/")}
          >
            Add Procedure
          </button>
        </div>
      ) : null}

      {equipmentId ? <p className="ff-meta">Filtered to linked equipment.</p> : null}

      <form
        className="ff-section"
        onSubmit={(ev) => {
          ev.preventDefault();
          void load();
        }}
      >
        <div className="ff-field">
          <label htmlFor="loto-search">Search</label>
          <input
            id="loto-search"
            className="ff-input"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Procedure title or number"
          />
        </div>
        <div className="ff-field">
          <label htmlFor="loto-status">Status</label>
          <select
            id="loto-status"
            className="ff-input"
            value={statusFilter}
            onChange={(ev) => setStatusFilter(ev.target.value)}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">In review</option>
            <option value="NEEDS_CORRECTION">Needs correction</option>
            <option value="ACTIVE">Active</option>
            <option value="APPROVED">Approved</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button type="submit" className="ff-btn ff-btn-secondary" disabled={loading}>
          Search
        </button>
      </form>

      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="ff-tabs" role="tablist" aria-label="LOTO views">
        <button
          type="button"
          className={`ff-tab${tab === "open" ? " ff-tab-active" : ""}`}
          onClick={() => {
            clearSelection();
            setTab("open");
          }}
        >
          Open {openLockouts.length > 0 ? `(${openLockouts.length})` : ""}
        </button>
        <button
          type="button"
          className={`ff-tab${tab === "procedures" ? " ff-tab-active" : ""}`}
          onClick={() => setTab("procedures")}
        >
          Procedures
        </button>
        <button
          type="button"
          className={`ff-tab${tab === "history" ? " ff-tab-active" : ""}`}
          onClick={() => {
            clearSelection();
            setTab("history");
          }}
        >
          History
        </button>
      </div>

      {tab === "open" ? (
        <section className="ff-section" aria-label="Open lockouts">
          {loading ? <p className="ff-page-body">Loading…</p> : null}
          {!loading && openLockouts.length === 0 ? (
            <div className="ff-task-list">
              <div className="ff-placeholder-card ff-card-message">
                <strong>No open lockouts</strong>
                <p>Issue a procedure or start a new lockout.</p>
              </div>
            </div>
          ) : null}
          <div className="ff-stack-list">
            {openLockouts.map((row) => {
              const id = String(row.id ?? "");
              return (
                <button key={id} type="button" className="ff-stack-item" onClick={() => openLockout(row)}>
                  <strong>{lockoutEquipmentName(row)}</strong>
                  <span className="ff-meta">
                    {lotoStatusLabel(row.status)}
                    {lockoutAuthorizedEmployee(row) ? ` · ${lockoutAuthorizedEmployee(row)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "procedures" ? (
        <section className="ff-section" aria-label="Procedures">
          {loading ? <p className="ff-page-body">Loading…</p> : null}
          {!loading && visibleProcedures.length === 0 ? (
            <div className="ff-task-list">
              <div className="ff-placeholder-card ff-card-message">
                <strong>No procedures</strong>
                <p>
                  {locationId || departmentId
                    ? "No procedures match this Location / Department. Try All Locations or add a procedure."
                    : "Create a procedure here, then issue it as a lockout event."}
                </p>
                <p className="ff-meta" style={{ marginTop: "0.5rem" }}>
                  {appEnv} · {apiHost}
                  {tenantName ? ` · ${tenantName}` : ""}
                </p>
                {appEnv === "production" && tenantName.toLowerCase().includes("forge platform") ? (
                  <p className="ff-meta" style={{ marginTop: "0.35rem" }}>
                    You are on Platform home. Switch to{" "}
                    <strong>Producers Rice Mill</strong> under More → Switch company to see
                    procedures.
                  </p>
                ) : null}
                {appEnv !== "production" ? (
                  <p className="ff-meta" style={{ marginTop: "0.35rem" }}>
                    Production procedures are on{" "}
                    <a href="https://d2qv0f0hojgvqo.cloudfront.net/more/loto/" className="ff-link">
                      Field production
                    </a>
                    .
                  </p>
                ) : null}
                {canAuthor ? (
                  <div className="ff-action-grid" style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className="ff-btn"
                      onClick={() => router.push("/more/loto/new/")}
                    >
                      Add Procedure
                    </button>
                    {canExecute ? (
                      <button
                        type="button"
                        className="ff-btn ff-btn-secondary"
                        onClick={() => router.push("/more/loto/new/?start=1")}
                      >
                        Start lockout
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {canPrint && visibleProcedures.length > 0 ? (
            <div className="ff-select-toolbar">
              {!selectMode ? (
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  onClick={() => setSelectMode(true)}
                >
                  Select to print
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    onClick={() => toggleSelectAllVisible()}
                  >
                    {visibleProcedures.every((row) =>
                      selectedIds.includes(String(row.id ?? "")),
                    )
                      ? "Clear page"
                      : "Select page"}
                  </button>
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    onClick={() => clearSelection()}
                  >
                    Done
                  </button>
                </>
              )}
            </div>
          ) : null}

          {batchError ? (
            <p className="ff-error" role="alert">
              {batchError}
            </p>
          ) : null}

          <div className="ff-stack-list">
            {visibleProcedures.map((row) => {
              const id = String(row.id ?? "");
              const title = lotoProcedureEquipmentName(row);
              const selected = selectedIds.includes(id);
              return (
                <div
                  key={id}
                  className={`ff-stack-item ff-stack-item--row${selected ? " is-selected" : ""}`}
                >
                  {selectMode ? (
                    <label className="ff-select-check">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(row)}
                        aria-label={`Select ${title}`}
                      />
                    </label>
                  ) : null}
                  <div className="ff-stack-item__content">
                    <button
                      type="button"
                      className="ff-stack-item-main"
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: 0,
                        padding: 0,
                        color: "inherit",
                      }}
                      onClick={() => {
                        if (selectMode) {
                          toggleSelected(row);
                          return;
                        }
                        router.push(`/loto/${encodeURIComponent(id)}/`);
                      }}
                    >
                      <strong>{title}</strong>
                      <span className="ff-meta">
                        {[
                          lotoProcedureNumber(row),
                          lotoStatusLabel(row.status),
                          lotoProcedureSiteName(row) !== "—" ? lotoProcedureSiteName(row) : "",
                          lotoProcedureDivisionName(row) !== "—"
                            ? lotoProcedureDivisionName(row)
                            : "",
                          lotoProcedureDepartmentName(row) !== "—"
                            ? lotoProcedureDepartmentName(row)
                            : "",
                          lotoProcedureAreaName(row) !== "—" ? lotoProcedureAreaName(row) : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                    {canAuthor && !selectMode ? (
                      <div className="ff-action-grid" style={{ marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          className="ff-btn ff-btn-secondary"
                          disabled={busyId === id}
                          onClick={() =>
                            router.push(`/more/loto/new/?id=${encodeURIComponent(id)}`)
                          }
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ff-btn ff-btn-secondary"
                          disabled={busyId === id}
                          onClick={() => void archiveProcedure(id, title)}
                        >
                          {busyId === id ? "Archiving…" : "Archive"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="ff-section" aria-label="Lockout history">
          {loading ? <p className="ff-page-body">Loading…</p> : null}
          {!loading && closedLockouts.length === 0 ? (
            <div className="ff-task-list">
              <div className="ff-placeholder-card ff-card-message">
                <strong>No closed lockouts</strong>
                <p>Completed lockouts will show here after close-out.</p>
              </div>
            </div>
          ) : null}
          <div className="ff-stack-list">
            {closedLockouts.map((row) => {
              const id = String(row.id ?? "");
              return (
                <button key={id} type="button" className="ff-stack-item" onClick={() => openLockout(row)}>
                  <strong>{lockoutEquipmentName(row)}</strong>
                  <span className="ff-meta">
                    {lotoStatusLabel(row.status)}
                    {lockoutAuthorizedEmployee(row) ? ` · ${lockoutAuthorizedEmployee(row)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="ff-action-grid ff-section">
        <button type="button" className="ff-btn" onClick={() => router.push("/scan/")}>
          SCAN QR CODE
        </button>
        <button type="button" className="ff-btn ff-btn-secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {selectMode && selectedIds.length > 0 ? (
        <div className="ff-bulk-bar" role="region" aria-label="Bulk print">
          <span className="ff-bulk-bar__count">
            {selectedIds.length} selected
            {selectedIds.length >= MAX_BATCH ? ` (max ${MAX_BATCH})` : ""}
          </span>
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            disabled={batchBusy || selectedIds.length < 1}
            onClick={() => void onBatchPrintLabels()}
          >
            {batchBusy
              ? "Preparing…"
              : selectedIds.length === 1
                ? "Print Label"
                : `Print ${selectedIds.length} Labels`}
          </button>
        </div>
      ) : null}

      <FieldPrintDialog
        open={batchItems != null && batchItems.length > 0}
        onClose={() => {
          setBatchItems(null);
          clearSelection();
        }}
        module="LOTO"
        recordType="loto_procedure"
        {...(batchItems?.length === 1 && batchItems[0]?.recordId
          ? { recordId: batchItems[0].recordId }
          : {})}
        dialogTitle={
          batchItems && batchItems.length > 1
            ? `Print ${batchItems.length} labels`
            : "Print label"
        }
        fieldValues={batchItems?.[0]?.fieldValues ?? {}}
        {...(batchItems?.[0]?.title ? { title: batchItems[0].title } : {})}
        {...(batchItems && batchItems.length > 1 ? { items: batchItems } : {})}
      />
    </>
  );
}

export default function LotoPage() {
  return (
    <Suspense fallback={<p className="ff-page-body">Loading…</p>}>
      <LotoListInner />
    </Suspense>
  );
}
