"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { FilterPanel } from "@/components/filter-panel";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";

type ListResponse = { items: Array<Record<string, unknown>>; page: number; pageSize: number };
type Bootstrap = {
  industrialEnabled: boolean;
  modules: Array<{ code: string; awsEnabled: boolean; migrationStatus: string }>;
};

export function EquipmentWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.equipment.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.equipment.manage") || permissions.has("industrial.admin");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [sites, setSites] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    equipmentName: "",
    externalEquipmentId: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    siteId: "",
    locationDetail: "",
  });

  const modEntry = bootstrap?.modules.find((m) => m.code === "EQUIPMENT");
  const awsReady =
    Boolean(bootstrap?.industrialEnabled) && Boolean(modEntry?.awsEnabled) && canView;

  useEffect(() => {
    void apiGet<Bootstrap>("/api/v1/industrial/bootstrap")
      .then(setBootstrap)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Bootstrap failed"));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [equip, siteList] = await Promise.all([
        apiGet<ListResponse>("/api/v1/industrial/equipment", {
          query: { q: q || undefined, page: "1", pageSize: "25" },
        }),
        apiGet<ListResponse>("/api/v1/industrial/sites", {
          query: { page: "1", pageSize: "100" },
        }),
      ]);
      setItems(equip.items ?? []);
      setSites(siteList.items ?? []);
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
        locationDetail: form.locationDetail || null,
      });
      setForm({
        equipmentName: "",
        externalEquipmentId: "",
        manufacturer: "",
        model: "",
        serialNumber: "",
        siteId: "",
        locationDetail: "",
      });
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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Archive failed");
    }
  }

  if (!awsReady && bootstrap) {
    return (
      <ModuleUnavailable
        moduleName={moduleName}
        status={modEntry?.migrationStatus ?? "LEGACY_FIREBASE"}
      />
    );
  }

  return (
    <section aria-labelledby="equipment-title" className="equipment-workspace">
      <ModuleWorkspaceHeader
        id="equipment-title"
        eyebrow="Operations"
        title={moduleName}
        description="Site / area hierarchy, equipment identity, and LOTO association indicators."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <FilterPanel
        searchId="equipment-search"
        searchValue={q}
        onSearchChange={setQ}
        searchPlaceholder="Name, tag, serial…"
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
            <h6 className="card-title mb-0">Create equipment</h6>
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
                    External ID
                  </label>
                  <input
                    id="equip-external-id"
                    className="form-control form-control-sm"
                    value={form.externalEquipmentId}
                    onChange={(ev) => setForm((f) => ({ ...f, externalEquipmentId: ev.target.value }))}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="equip-site">
                    Site
                  </label>
                  <select
                    id="equip-site"
                    className="form-select form-select-sm"
                    value={form.siteId}
                    onChange={(ev) => setForm((f) => ({ ...f, siteId: ev.target.value }))}
                  >
                    <option value="">—</option>
                    {sites.map((s) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {String(s.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
                  <label className="form-label" htmlFor="equip-location">
                    Location detail
                  </label>
                  <input
                    id="equip-location"
                    className="form-control form-control-sm"
                    value={form.locationDetail}
                    onChange={(ev) => setForm((f) => ({ ...f, locationDetail: ev.target.value }))}
                  />
                </div>
                <div className="col-12">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                    {creating ? "Saving…" : "Create equipment"}
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
            <p className="text-muted mb-0">No equipment records.</p>
          </div>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="card border shadow-none">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">ID</th>
                  <th scope="col">Status</th>
                  {canManage ? <th scope="col" className="text-end">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)}>
                    <td>{String(item.equipmentName)}</td>
                    <td className="text-muted">
                      {String(item.externalEquipmentId || item.assetTag || "no ID")}
                    </td>
                    <td>
                      <span className="badge bg-label-secondary">{String(item.status)}</span>
                    </td>
                    {canManage ? (
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning"
                          onClick={() => void archive(String(item.id))}
                        >
                          Archive
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
