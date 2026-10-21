"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { OperationsListShell } from "@/components/operations-list-shell";
import {
  FieldPrintDialog,
  type FieldPrintDialogBatchItem,
} from "@/components/field-print-label";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import {
  ensureEquipmentPrintQrPayload,
  equipmentPrintFieldValues,
} from "@/lib/equipment-print";
import { operationsApi } from "@/lib/operations-api";
import {
  equipmentDisplayName,
  filterEquipmentByLocation,
  type EquipmentListItem,
} from "@/lib/operations";

const MAX_BATCH = 200;

export function EquipmentBrowser() {
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { moduleEnabled } = useFieldPermissions();
  const { me, hasAnyPermission } = useAuth();
  const canPrint = hasAnyPermission(["industrial.printer.print", "industrial.admin"]);
  const canQrView = Boolean(
    me?.permissions?.includes("industrial.qr.view") ||
      me?.permissions?.includes("industrial.qr.generate") ||
      me?.permissions?.includes("industrial.admin"),
  );
  const canQrGenerate = Boolean(
    me?.permissions?.includes("industrial.qr.generate") ||
      me?.permissions?.includes("industrial.admin"),
  );

  const [rows, setRows] = useState<EquipmentListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<FieldPrintDialogBatchItem[] | null>(null);
  const locationId = org?.selection.locationId ?? "";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (locationId) params.siteId = locationId;
      const list = await operationsApi.listEquipment(params);
      setRows(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load equipment");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!moduleEnabled("EQUIPMENT")) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [moduleEnabled, refresh]);

  const visible = useMemo(() => {
    const scoped = filterEquipmentByLocation(rows, locationId);
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((row) =>
      `${equipmentDisplayName(row)} ${row.equipmentNumber ?? ""} ${row.equipmentType ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, locationId, query]);

  function clearSelection() {
    setSelectedIds([]);
    setSelectMode(false);
    setBatchError(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, MAX_BATCH),
    );
  }

  function toggleSelectAllVisible() {
    const ids = visible.map((r) => r.id).filter(Boolean);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
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
  }

  async function onBatchPrint() {
    if (!canPrint || selectedIds.length < 1) return;
    setBatchBusy(true);
    setBatchError(null);
    try {
      const selected = selectedIds
        .map((id) => visible.find((r) => r.id === id) ?? rows.find((r) => r.id === id))
        .filter((row): row is EquipmentListItem => Boolean(row?.id));
      if (selected.length === 0) {
        throw new Error("Selected equipment is no longer on this list. Clear and reselect.");
      }
      const batch: FieldPrintDialogBatchItem[] = [];
      for (const item of selected.slice(0, MAX_BATCH)) {
        const asRecord = item as unknown as Record<string, unknown>;
        const name = equipmentDisplayName(item);
        const qr = await ensureEquipmentPrintQrPayload(asRecord, {
          canView: canQrView,
          canGenerate: canQrGenerate,
        });
        batch.push({
          recordId: item.id,
          title: name,
          fieldValues: {
            ...equipmentPrintFieldValues(asRecord),
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
            : "Could not prepare labels for print.",
      );
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <>
      <OperationsListShell
        title="Equipment"
        body="Browse equipment for your Location, or scan a QR for the fastest entry."
        loading={loading}
        error={error}
        emptyTitle="No equipment"
        emptyMessage="No equipment matches this Location. Try Scan or clear Location filters."
        onRetry={() => void refresh()}
        moduleDisabled={!moduleEnabled("EQUIPMENT")}
        footer={
          <button type="button" className="ff-scan-hero" onClick={() => router.push("/scan/")}>
            SCAN QR CODE
          </button>
        }
      >
        {visible.length > 0 || query ? (
          <>
            <label className="ff-field">
              <span className="ff-label">Search</span>
              <input
                className="ff-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or number"
                aria-label="Search equipment"
              />
            </label>

            {canPrint && visible.length > 0 ? (
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
                      {visible.every((r) => selectedIds.includes(r.id))
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

            <div className="ff-task-list" style={{ marginTop: 12 }}>
              {visible.map((row) => {
                const selected = selectedIds.includes(row.id);
                return (
                  <div
                    key={row.id}
                    className={`ff-task-card ff-task-card--row${selected ? " is-selected" : ""}`}
                  >
                    {selectMode ? (
                      <label className="ff-select-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={`Select ${equipmentDisplayName(row)}`}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className="ff-task-card-body ff-task-card-body--btn"
                      onClick={() => {
                        if (selectMode) {
                          toggleSelected(row.id);
                          return;
                        }
                        router.push(`/equipment/${encodeURIComponent(row.id)}/`);
                      }}
                    >
                      <span className="ff-task-kind">{row.equipmentType || "Equipment"}</span>
                      <span className="ff-task-title">{equipmentDisplayName(row)}</span>
                      <span className="ff-meta">
                        {[row.equipmentNumber, row.status].filter(Boolean).join(" · ") || "Ready"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </OperationsListShell>

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
            onClick={() => void onBatchPrint()}
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
        module="EQUIPMENT"
        recordType="equipment"
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
