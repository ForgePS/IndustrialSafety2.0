"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, useAuth } from "@forge/web-kit";
import { AdminEmptyState } from "@/components/admin-action-dropdown";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { canManageDropdowns } from "@/lib/platform-admin";
import {
  addOrgCatalogEntry,
  archiveOrgCatalogEntry,
  FIXED_INDUSTRIAL_PICKLISTS,
  loadAllOrgCatalogs,
  ORG_CATALOG_DEFINITIONS,
  renameOrgCatalogEntry,
  type OrgCatalogKind,
  type OrgCatalogState,
} from "@/lib/industrial-dropdown-catalogs";

const TABS = [
  { id: "org", label: "Company catalogs" },
  { id: "fixed", label: "Module picklists" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DropdownsWorkspace() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canManageDropdowns(me);

  const [tab, setTab] = useState<TabId>("org");
  const [catalogs, setCatalogs] = useState<OrgCatalogState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<OrgCatalogKind | null>(null);
  const [expandedKind, setExpandedKind] = useState<OrgCatalogKind | null>(null);
  const [newName, setNewName] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newDivisionName, setNewDivisionName] = useState("");
  const [newDepartmentId, setNewDepartmentId] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSiteId, setEditSiteId] = useState("");
  const [editDivisionName, setEditDivisionName] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");

  const definitionByKind = useMemo(
    () => new Map(ORG_CATALOG_DEFINITIONS.map((row) => [row.kind, row])),
    [],
  );

  const sites = useMemo(() => catalogs.find((row) => row.kind === "sites")?.rows ?? [], [catalogs]);
  const departments = useMemo(
    () => catalogs.find((row) => row.kind === "departments")?.rows ?? [],
    [catalogs],
  );
  const divisions = useMemo(
    () => catalogs.find((row) => row.kind === "divisions")?.rows ?? [],
    [catalogs],
  );
  const divisionsForNewSite = useMemo(
    () => (!newSiteId ? [] : divisions.filter((row) => !row.siteId || row.siteId === newSiteId)),
    [divisions, newSiteId],
  );
  const divisionsForEditSite = useMemo(
    () => (!editSiteId ? [] : divisions.filter((row) => !row.siteId || row.siteId === editSiteId)),
    [divisions, editSiteId],
  );

  const load = useCallback(async () => {
    if (!tenantId || !canAccess) return;
    setLoading(true);
    setError(null);
    try {
      setCatalogs(await loadAllOrgCatalogs(tenantId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dropdown catalogs");
      setCatalogs([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, canAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  function rowKey(kind: OrgCatalogKind, id: string): string {
    return `${kind}:${id}`;
  }

  function beginEdit(
    kind: OrgCatalogKind,
    id: string,
    label: string,
    siteId?: string | null,
    divisionName?: string | null,
    departmentId?: string | null,
  ) {
    setEditingKey(rowKey(kind, id));
    setEditName(label);
    setEditSiteId(siteId ?? "");
    setEditDivisionName(divisionName ?? "");
    setEditDepartmentId(departmentId ?? "");
    setError(null);
    setNotice(null);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditName("");
    setEditSiteId("");
    setEditDivisionName("");
    setEditDepartmentId("");
  }

  async function onAddEntry(event: FormEvent, kind: OrgCatalogKind) {
    event.preventDefault();
    if (!tenantId) return;
    if ((kind === "departments" || kind === "divisions") && !newSiteId) {
      setError("Select a site/location for this entry.");
      return;
    }
    setBusyKind(kind);
    setError(null);
    setNotice(null);
    try {
      const extras: { siteId?: string; departmentId?: string; divisionName?: string } = {};
      if (newSiteId) extras.siteId = newSiteId;
      if (newDepartmentId) extras.departmentId = newDepartmentId;
      if (kind === "departments" && newDivisionName) extras.divisionName = newDivisionName;
      await addOrgCatalogEntry(tenantId, kind, newName, extras);
      setNewName("");
      setNewSiteId("");
      setNewDivisionName("");
      setNewDepartmentId("");
      setNotice(`Added to ${definitionByKind.get(kind)?.label ?? kind}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add entry");
    } finally {
      setBusyKind(null);
    }
  }

  async function onSaveEdit(kind: OrgCatalogKind, id: string) {
    if (!tenantId) return;
    if ((kind === "departments" || kind === "divisions") && !editSiteId) {
      setError("Select a site/location for this entry.");
      return;
    }
    setBusyKind(kind);
    setError(null);
    setNotice(null);
    try {
      const extras =
        kind === "departments"
          ? { siteId: editSiteId || null, divisionName: editDivisionName || null }
          : kind === "divisions"
            ? { siteId: editSiteId || null }
            : kind === "positions"
              ? { departmentId: editDepartmentId || null }
              : undefined;
      await renameOrgCatalogEntry(tenantId, kind, id, editName, extras);
      setNotice(`Updated ${definitionByKind.get(kind)?.label ?? kind}`);
      cancelEdit();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update entry");
    } finally {
      setBusyKind(null);
    }
  }

  async function onArchive(kind: OrgCatalogKind, id: string, label: string) {
    if (!tenantId) return;
    const action = kind === "divisions" ? "Remove" : "Archive";
    if (
      !window.confirm(
        `${action} "${label}"? Existing records keep their current value; it will no longer appear in new forms.`,
      )
    ) {
      return;
    }
    setBusyKind(kind);
    setError(null);
    setNotice(null);
    try {
      await archiveOrgCatalogEntry(tenantId, kind, id);
      if (editingKey === rowKey(kind, id)) cancelEdit();
      setNotice(`${action === "Remove" ? "Removed" : "Archived"} ${label}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action.toLowerCase()} entry`);
    } finally {
      setBusyKind(null);
    }
  }

  if (authLoading) {
    return <p className="text-muted mb-0">Loading dropdown catalogs…</p>;
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">Dropdown lists</h4>
        <p className="mb-0">
          Admin access is required to manage company catalogs and dropdown lists.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="dropdowns-title">
      <ModuleWorkspaceHeader
        id="dropdowns-title"
        eyebrow="Platform admin"
        title="Dropdown lists"
        description="Add, rename, and archive the company catalogs used across Industrial forms. Departments and divisions are linked to a site/location so forms can cascade correctly."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <div className="alert alert-secondary mb-4" role="note">
        Company catalogs power Add Person, incidents, LOTO, and other modules. Link each department
        and division to a site so dropdowns only show values for that location. Archiving hides a
        value from new forms without changing records that already use it.
      </div>

      {error ? (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success d-flex align-items-center gap-2 mb-4" role="status">
          <span className="flex-grow-1">{notice}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          />
        </div>
      ) : null}

      <ModuleWorkspaceTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Dropdown sections">
        {tab === "org" ? (
          <>
            {loading ? <p className="text-muted">Loading company catalogs…</p> : null}
            <div className="d-flex flex-column gap-3">
              {ORG_CATALOG_DEFINITIONS.map((definition) => {
                const rows = catalogs.find((row) => row.kind === definition.kind)?.rows ?? [];
                const open = expandedKind === definition.kind;
                const busy = busyKind === definition.kind;
                return (
                  <div className="card" key={definition.kind}>
                    <button
                      type="button"
                      className="card-header d-flex flex-wrap align-items-center gap-2 w-100 text-start border-0 bg-transparent"
                      onClick={() =>
                        setExpandedKind((current) =>
                          current === definition.kind ? null : definition.kind,
                        )
                      }
                      aria-expanded={open}
                      aria-controls={`org-catalog-${definition.kind}`}
                      id={`org-catalog-${definition.kind}-trigger`}
                    >
                      <span className="btn btn-sm btn-text p-0 me-1" aria-hidden="true">
                        <i className={`bx ${open ? "bx-chevron-down" : "bx-chevron-right"}`} />
                      </span>
                      <div className="me-auto">
                        <h6 className="mb-0">{definition.label}</h6>
                        <small className="text-muted">{definition.usedIn}</small>
                      </div>
                      <span className="badge bg-label-primary">{rows.length} values</span>
                    </button>
                    {open ? (
                      <div
                        className="card-body"
                        id={`org-catalog-${definition.kind}`}
                        role="region"
                        aria-labelledby={`org-catalog-${definition.kind}-trigger`}
                      >
                        <p className="text-muted small">{definition.description}</p>
                        {rows.length === 0 ? (
                          <AdminEmptyState
                            title={`No ${definition.label.toLowerCase()} yet`}
                            description="Add the first value below — it will appear in forms immediately."
                          />
                        ) : (
                          <div className="table-responsive mb-3">
                            <table className="table table-sm table-hover mb-0 align-middle">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>
                                    {definition.kind === "departments" ||
                                    definition.kind === "divisions"
                                      ? "Site / location"
                                      : definition.kind === "positions"
                                        ? "Department / site"
                                        : "Details"}
                                  </th>
                                  <th className="text-end">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const key = rowKey(definition.kind, row.id);
                                  const editing = editingKey === key;
                                  const siteLinked =
                                    definition.kind === "departments" ||
                                    definition.kind === "divisions";
                                  return (
                                    <tr key={key}>
                                      <td style={{ minWidth: "12rem" }}>
                                        {editing ? (
                                          <input
                                            className="form-control form-control-sm"
                                            value={editName}
                                            onChange={(event) => setEditName(event.target.value)}
                                            aria-label={`Rename ${row.label}`}
                                          />
                                        ) : (
                                          row.label
                                        )}
                                      </td>
                                      <td
                                        className="text-muted small"
                                        style={{ minWidth: "10rem" }}
                                      >
                                        {editing && siteLinked ? (
                                          <div className="d-flex flex-column gap-1">
                                            <select
                                              className="form-select form-select-sm"
                                              value={editSiteId}
                                              onChange={(event) => {
                                                setEditSiteId(event.target.value);
                                                setEditDivisionName("");
                                              }}
                                              aria-label={`Site for ${row.label}`}
                                              required
                                            >
                                              <option value="">Select site</option>
                                              {sites.map((site) => (
                                                <option key={site.id} value={site.id}>
                                                  {site.label}
                                                </option>
                                              ))}
                                            </select>
                                            {definition.kind === "departments" ? (
                                              <select
                                                className="form-select form-select-sm"
                                                value={editDivisionName}
                                                disabled={!editSiteId}
                                                onChange={(event) =>
                                                  setEditDivisionName(event.target.value)
                                                }
                                                aria-label={`Division for ${row.label}`}
                                              >
                                                <option value="">
                                                  {!editSiteId
                                                    ? "Select location first"
                                                    : "Select division"}
                                                </option>
                                                {divisionsForEditSite.map((division) => (
                                                  <option key={division.id} value={division.label}>
                                                    {division.label}
                                                  </option>
                                                ))}
                                                {editDivisionName &&
                                                !divisionsForEditSite.some(
                                                  (d) => d.label === editDivisionName,
                                                ) ? (
                                                  <option value={editDivisionName}>
                                                    {editDivisionName}
                                                  </option>
                                                ) : null}
                                              </select>
                                            ) : null}
                                          </div>
                                        ) : editing && definition.kind === "positions" ? (
                                          <select
                                            className="form-select form-select-sm"
                                            value={editDepartmentId}
                                            onChange={(event) =>
                                              setEditDepartmentId(event.target.value)
                                            }
                                            aria-label={`Department for ${row.label}`}
                                          >
                                            <option value="">Any department</option>
                                            {departments.map((dept) => (
                                              <option key={dept.id} value={dept.id}>
                                                {dept.meta
                                                  ? `${dept.label} · ${dept.meta}`
                                                  : dept.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          (row.meta ?? "—")
                                        )}
                                      </td>
                                      <td className="text-end text-nowrap">
                                        {editing ? (
                                          <div className="d-inline-flex gap-1">
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-primary"
                                              disabled={
                                                busy ||
                                                !editName.trim() ||
                                                (siteLinked && !editSiteId)
                                              }
                                              onClick={() =>
                                                void onSaveEdit(definition.kind, row.id)
                                              }
                                            >
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-outline-secondary"
                                              disabled={busy}
                                              onClick={cancelEdit}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="d-inline-flex gap-1">
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-outline-primary"
                                              disabled={busy}
                                              onClick={() =>
                                                beginEdit(
                                                  definition.kind,
                                                  row.id,
                                                  row.label,
                                                  row.siteId,
                                                  row.divisionName,
                                                  row.departmentId,
                                                )
                                              }
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-outline-danger"
                                              disabled={busy}
                                              onClick={() =>
                                                void onArchive(definition.kind, row.id, row.label)
                                              }
                                            >
                                              {definition.kind === "divisions"
                                                ? "Remove"
                                                : "Archive"}
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <form
                          className="border rounded p-3 bg-light"
                          onSubmit={(event) => void onAddEntry(event, definition.kind)}
                        >
                          <h6 className="small text-uppercase text-muted mb-3">Add value</h6>
                          <div className="row g-2 align-items-end">
                            <div className="col-md-4">
                              <label
                                className="form-label small mb-1"
                                htmlFor={`add-${definition.kind}`}
                              >
                                Name
                              </label>
                              <input
                                id={`add-${definition.kind}`}
                                className="form-control form-control-sm"
                                required
                                value={newName}
                                onChange={(event) => setNewName(event.target.value)}
                                placeholder={`New ${definition.label.toLowerCase().replace(/s$/, "")}`}
                              />
                            </div>
                            {definition.kind === "departments" ||
                            definition.kind === "divisions" ? (
                              <div className="col-md-4">
                                <label
                                  className="form-label small mb-1"
                                  htmlFor={`add-${definition.kind}-site`}
                                >
                                  Site / location
                                </label>
                                <select
                                  id={`add-${definition.kind}-site`}
                                  className="form-select form-select-sm"
                                  value={newSiteId}
                                  required
                                  onChange={(event) => {
                                    setNewSiteId(event.target.value);
                                    setNewDivisionName("");
                                  }}
                                >
                                  <option value="">Select site</option>
                                  {sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                      {site.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            {definition.kind === "departments" ? (
                              <div className="col-md-4">
                                <label
                                  className="form-label small mb-1"
                                  htmlFor="add-department-division"
                                >
                                  Division
                                </label>
                                <select
                                  id="add-department-division"
                                  className="form-select form-select-sm"
                                  value={newDivisionName}
                                  disabled={!newSiteId}
                                  onChange={(event) => setNewDivisionName(event.target.value)}
                                >
                                  <option value="">
                                    {!newSiteId ? "Select location first" : "Select division"}
                                  </option>
                                  {divisionsForNewSite.map((division) => (
                                    <option key={division.id} value={division.label}>
                                      {division.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            {definition.kind === "positions" && departments.length > 0 ? (
                              <div className="col-md-4">
                                <label className="form-label small mb-1" htmlFor="add-pos-dept">
                                  Department (optional)
                                </label>
                                <select
                                  id="add-pos-dept"
                                  className="form-select form-select-sm"
                                  value={newDepartmentId}
                                  onChange={(event) => setNewDepartmentId(event.target.value)}
                                >
                                  <option value="">Any department</option>
                                  {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>
                                      {dept.meta ? `${dept.label} · ${dept.meta}` : dept.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            <div className="col-md-auto">
                              <button
                                type="submit"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                              >
                                {busy ? "Adding…" : "Add"}
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="d-flex flex-column gap-3">
            <p className="text-muted small mb-0">
              These picklists are built into Industrial modules and shown here for reference. Manage
              company-specific values on the Company catalogs tab.
            </p>
            {FIXED_INDUSTRIAL_PICKLISTS.map((picklist) => (
              <div className="card" key={picklist.key}>
                <div className="card-header">
                  <h6 className="mb-0">{picklist.label}</h6>
                  <small className="text-muted">{picklist.description}</small>
                </div>
                <div className="card-body">
                  <div className="d-flex flex-wrap gap-2">
                    {picklist.options.map((option) => (
                      <span key={option.value} className="badge bg-label-secondary">
                        {option.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ModuleWorkspaceTabs>
    </section>
  );
}
