"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ForgePrintButton } from "@/components/forge-print-button";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { OrgLocationCascade } from "@/components/org-location-cascade";
import {
  canManageQrLinks,
  canViewQrLinks,
  type QrLinkListResponse,
  type QrLinkRow,
} from "@/lib/qr-links-module";
import {
  ensureEquipmentPrintQrPayload,
  equipmentPrintFieldValues,
} from "@/lib/module-print-fields";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";
import { useOrgLocationLookups } from "@/hooks/use-org-location-lookups";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };

function textOf(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function equipmentAssetTag(item: Record<string, unknown>): string {
  return textOf(item.assetTag || item.equipmentNumber || item.externalEquipmentId);
}

/** Org location (site), not free-text area. */
function equipmentSiteLocation(
  item: Record<string, unknown>,
  siteNameById?: Map<string, string>,
): string {
  const fromId =
    item.siteId && siteNameById ? siteNameById.get(String(item.siteId)) ?? "" : "";
  return textOf(fromId || item.siteName || item.locationName);
}

function equipmentDivision(item: Record<string, unknown>): string {
  return textOf(item.divisionName || item.division || item.site);
}

function equipmentDepartment(item: Record<string, unknown>): string {
  return textOf(item.departmentName || item.department);
}

/** Plant-floor area (formerly "Location detail"). */
function equipmentArea(item: Record<string, unknown>): string {
  return textOf(item.areaName || item.locationDetail);
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  const text = textOf(value);
  return (
    <div className="col-md-4">
      <div className="text-muted small">{label}</div>
      <div>{text || "—"}</div>
    </div>
  );
}

const EMPTY_FORM = {
  equipmentName: "",
  externalEquipmentId: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  siteId: "",
  siteName: "",
  divisionName: "",
  departmentId: "",
  departmentName: "",
  areaName: "",
};

export function EquipmentWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.equipment.view") ||
    permissions.has("industrial.access") ||
    permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.equipment.manage") || permissions.has("industrial.admin");
  const canViewQr = canViewQrLinks(permissions);
  const canManageQr = canManageQrLinks(permissions);

  const { modEntry, explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "EQUIPMENT",
    canView,
  });
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qrLinksForAsset, setQrLinksForAsset] = useState<QrLinkRow[]>([]);
  const [qrBusy, setQrBusy] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const org = useOrgLocationLookups(me?.tenantId);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const equip = await apiGet<ListResponse>("/api/v1/industrial/equipment", {
        query: { q: q || undefined, page: "1", pageSize: "100" },
      });
      setItems(equip.items ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load equipment");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!awsReady) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awsReady]);

  async function loadQrForEquipment(equipmentId: string) {
    if (!canViewQr) {
      setQrLinksForAsset([]);
      return;
    }
    setQrBusy(true);
    try {
      const data = await apiGet<QrLinkListResponse>("/api/v1/qr-links", {
        query: {
          targetType: "EQUIPMENT",
          page: "1",
          pageSize: "50",
        },
      });
      setQrLinksForAsset(
        (data.items ?? []).filter(
          (row) =>
            row.targetId === equipmentId &&
            (row.targetType === "EQUIPMENT" ||
              row.targetType === "MACHINE" ||
              row.targetType === "TOOL"),
        ),
      );
    } catch {
      setQrLinksForAsset([]);
    } finally {
      setQrBusy(false);
    }
  }

  function selectEquipment(id: string) {
    setSelectedId(id);
    if (canViewQr) void loadQrForEquipment(id);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    setError(null);
    try {
      await apiSend("/api/v1/industrial/equipment", "POST", {
        equipmentName: form.equipmentName,
        externalEquipmentId: form.externalEquipmentId || null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        serialNumber: form.serialNumber || null,
        siteId: form.siteId || null,
        siteName: form.siteName || null,
        divisionName: form.divisionName || null,
        departmentId: form.departmentId || null,
        departmentName: form.departmentName || null,
        areaName: form.areaName || null,
        locationDetail: form.areaName || null,
      });
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function archive(id: string) {
    if (!canManage) return;
    try {
      await apiSend(`/api/v1/industrial/equipment/${id}/archive`, "POST", {});
      if (selectedId === id) {
        setSelectedId(null);
        setQrLinksForAsset([]);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Archive failed");
    }
  }

  async function createQrForSelected() {
    if (!selectedId || !canManageQr) return;
    const equipment = items.find((row) => String(row.id) === selectedId);
    if (!equipment) return;
    setQrBusy(true);
    setError(null);
    try {
      await apiSend("/api/v1/qr-links", "POST", {
        name: String(equipment.equipmentName ?? equipment.name ?? "Equipment QR"),
        targetType: "EQUIPMENT",
        targetId: selectedId,
        accessMode: "EMPLOYEE_NUMBER",
        issueToken: true,
        isPublic: true,
        appBaseUrl: window.location.origin,
        actionConfig: {
          reportIssue: true,
          dailyInspection: true,
          weeklyInspection: true,
          monthlyInspection: true,
          equipmentHistory: true,
          viewLoto: true,
          viewJsa: true,
          viewDocuments: true,
          viewTraining: true,
        },
      });
      await loadQrForEquipment(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create QR for equipment");
    } finally {
      setQrBusy(false);
    }
  }

  if (explicitlyDisabled) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  const selected = items.find((row) => String(row.id) === selectedId) ?? null;
  const siteNameById = new Map(org.sites.map((s) => [s.id, s.label]));

  return (
    <section
      aria-labelledby="equipment-title"
      className="equipment-workspace"
      data-walkthrough="equipment-overview"
    >
      <ModuleWorkspaceHeader
        id="equipment-title"
        eyebrow="Equipment & Operations"
        title={moduleName}
        description="Asset identity, location, and QR access for plant-floor work."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <FilterPanel
        searchId="equipment-search"
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Name, tag, area…"
        chips={q ? [{ id: "q", label: `Search: ${q}`, onRemove: () => setQ("") }] : []}
        onClearAll={() => {
          setQ("");
          void load();
        }}
        onSubmit={() => void load()}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}

      {canManage ? (
        <div className="card border shadow-none mb-4">
          <div className="card-header">
            <h6 className="card-title mb-0">New asset</h6>
          </div>
          <div className="card-body">
            <form onSubmit={(e) => void onCreate(e)}>
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-name">
                    Name *
                  </label>
                  <input
                    id="equip-name"
                    className="form-control form-control-sm"
                    required
                    value={form.equipmentName}
                    onChange={(ev) => setForm((f) => ({ ...f, equipmentName: ev.target.value }))}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-external-id">
                    Asset tag / External ID
                  </label>
                  <input
                    id="equip-external-id"
                    className="form-control form-control-sm"
                    value={form.externalEquipmentId}
                    onChange={(ev) =>
                      setForm((f) => ({ ...f, externalEquipmentId: ev.target.value }))
                    }
                  />
                </div>
                <OrgLocationCascade
                  idPrefix="equip"
                  required
                  loading={org.loading}
                  sites={org.sites}
                  departments={org.departments}
                  divisionEntries={org.divisionEntries}
                  value={{
                    siteId: form.siteId,
                    siteName: form.siteName,
                    divisionName: form.divisionName,
                    departmentId: form.departmentId,
                    departmentName: form.departmentName,
                  }}
                  onChange={(next) =>
                    setForm((f) => ({
                      ...f,
                      siteId: next.siteId,
                      siteName: next.siteName,
                      divisionName: next.divisionName,
                      departmentId: next.departmentId,
                      departmentName: next.departmentName,
                    }))
                  }
                />
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-manufacturer">
                    Manufacturer
                  </label>
                  <input
                    id="equip-manufacturer"
                    className="form-control form-control-sm"
                    value={form.manufacturer}
                    onChange={(ev) => setForm((f) => ({ ...f, manufacturer: ev.target.value }))}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-model">
                    Model
                  </label>
                  <input
                    id="equip-model"
                    className="form-control form-control-sm"
                    value={form.model}
                    onChange={(ev) => setForm((f) => ({ ...f, model: ev.target.value }))}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-serial">
                    Serial
                  </label>
                  <input
                    id="equip-serial"
                    className="form-control form-control-sm"
                    value={form.serialNumber}
                    onChange={(ev) => setForm((f) => ({ ...f, serialNumber: ev.target.value }))}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="equip-area">
                    Area
                  </label>
                  <input
                    id="equip-area"
                    className="form-control form-control-sm"
                    value={form.areaName}
                    onChange={(ev) => setForm((f) => ({ ...f, areaName: ev.target.value }))}
                    placeholder="e.g. Mill - Top Floor"
                  />
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                    {creating ? "Saving…" : "Create asset"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status" aria-live="polite">
          Loading…
        </p>
      ) : null}
      {!loading && items.length === 0 ? (
        <div className="card border shadow-none">
          <div className="card-body">
            <p className="text-muted mb-0">No asset records yet.</p>
          </div>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="card border shadow-none mb-4">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Asset tag</th>
                  <th scope="col">Location</th>
                  <th scope="col">Division</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-end">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const id = String(item.id);
                  const name = textOf(item.equipmentName || item.name) || "—";
                  return (
                    <tr
                      key={id}
                      className={selectedId === id ? "table-active" : undefined}
                      style={{ cursor: "pointer" }}
                      onClick={() => selectEquipment(id)}
                    >
                      <td>{name}</td>
                      <td className="text-muted">{equipmentAssetTag(item) || "—"}</td>
                      <td className="text-muted">
                        {equipmentSiteLocation(item, siteNameById) || "—"}
                      </td>
                      <td className="text-muted">{equipmentDivision(item) || "—"}</td>
                      <td className="text-muted">{equipmentDepartment(item) || "—"}</td>
                      <td>
                        <span className="badge bg-label-secondary">{String(item.status)}</span>
                      </td>
                      <td className="text-end" onClick={(ev) => ev.stopPropagation()}>
                        <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => selectEquipment(id)}
                          >
                            Details
                          </button>
                          <ForgePrintButton
                            module="EQUIPMENT"
                            recordType="equipment"
                            recordId={id}
                            fieldValues={equipmentPrintFieldValues(item)}
                            onPrepare={async () =>
                              ensureEquipmentPrintQrPayload(item, {
                                canView: canViewQr,
                                canGenerate: canManageQr,
                              })
                            }
                          />
                          {canManage ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              onClick={() => void archive(id)}
                            >
                              Archive
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {selected ? (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="equip-detail-title"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => {
            setSelectedId(null);
            setQrLinksForAsset([]);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") {
              setSelectedId(null);
              setQrLinksForAsset([]);
            }
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
            role="document"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <div className="min-w-0">
                  <h5 className="modal-title mb-0" id="equip-detail-title">
                    {textOf(selected.equipmentName || selected.name) || "Equipment details"}
                  </h5>
                  <p className="text-muted small mb-0 text-truncate">
                    {equipmentAssetTag(selected) || "No asset tag"}
                    {equipmentArea(selected) ? ` · ${equipmentArea(selected)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => {
                    setSelectedId(null);
                    setQrLinksForAsset([]);
                  }}
                />
              </div>
              <div className="modal-body">
                <div className="row g-3 mb-4">
                  <DetailField label="Asset tag" value={equipmentAssetTag(selected)} />
                  <DetailField
                    label="Type"
                    value={selected.equipmentType || selected.category}
                  />
                  <DetailField label="Status" value={selected.status} />
                  <DetailField
                    label="Location"
                    value={equipmentSiteLocation(selected, siteNameById)}
                  />
                  <DetailField label="Division" value={equipmentDivision(selected)} />
                  <DetailField label="Department" value={equipmentDepartment(selected)} />
                  <DetailField label="Area" value={equipmentArea(selected)} />
                  <DetailField label="Manufacturer" value={selected.manufacturer} />
                  <DetailField label="Model" value={selected.model} />
                  <DetailField label="Serial number" value={selected.serialNumber} />
                  <DetailField label="Condition" value={selected.condition} />
                  <DetailField label="Owner" value={selected.ownerName} />
                  <DetailField label="External ID" value={selected.externalEquipmentId} />
                  <div className="col-12">
                    <div className="text-muted small">Notes</div>
                    <div>{textOf(selected.notes) || "—"}</div>
                  </div>
                </div>

                {canViewQr ? (
                  <div className="border-top pt-3">
                    <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
                      <h6 className="mb-0">QR &amp; mobile access</h6>
                      {canManageQr ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={qrBusy}
                          onClick={() => void createQrForSelected()}
                        >
                          Generate QR
                        </button>
                      ) : null}
                    </div>
                    {qrBusy ? <p className="text-muted small mb-0">Loading QR links…</p> : null}
                    {!qrBusy && qrLinksForAsset.length === 0 ? (
                      <p className="text-muted small mb-0">
                        No QR codes assigned yet. Generate one to enable plant-floor scanning.
                      </p>
                    ) : null}
                    {!qrBusy && qrLinksForAsset.length > 0 ? (
                      <ul className="list-unstyled mb-0">
                        {qrLinksForAsset.map((link) => (
                          <li
                            key={link.id}
                            className="mb-2 d-flex justify-content-between gap-2"
                          >
                            <div>
                              <div className="fw-semibold">{link.name}</div>
                              <div className="small text-muted">
                                {link.displayCode ?? "No code"} · {link.status} · scans{" "}
                                {link.scanCount ?? 0}
                              </div>
                            </div>
                            <a
                              className="btn btn-sm btn-outline-secondary"
                              href="/modules/qr-links"
                            >
                              Manage
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="modal-footer">
                <ForgePrintButton
                  module="EQUIPMENT"
                  recordType="equipment"
                  recordId={String(selected.id)}
                  fieldValues={equipmentPrintFieldValues(selected)}
                  onPrepare={async () =>
                    ensureEquipmentPrintQrPayload(selected, {
                      canView: canViewQr,
                      canGenerate: canManageQr,
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setSelectedId(null);
                    setQrLinksForAsset([]);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

