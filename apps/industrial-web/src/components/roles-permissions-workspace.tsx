"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiGetResult, apiSend, toIfMatch, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import {
  assignablePermissionCodes,
  canAccessRolesAndPermissions,
  canAssignRoles,
  DEFAULT_ROLES_PAGE_SIZE,
  filterPermissionDirectory,
  formatPermissionDate,
  paginateRows,
  permissionDisplayName,
  roleChipTone,
  roleCodeFromName,
  ROLES_PAGE_SIZES,
  toPermissionDirectory,
  toTenantRoles,
  type CatalogPermission,
  type PermissionDirectoryRow,
  type TenantRole,
} from "@/lib/roles-permissions";

const TABS = [
  { id: "roles", label: "Roles" },
  { id: "permissions", label: "Permissions" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function roleIfMatch(etag: string | undefined, recordVersion: number | undefined): string {
  return etag ?? toIfMatch(recordVersion ?? 1);
}

export function RolesPermissionsWorkspace() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canAccessRolesAndPermissions(me);
  const canAssign = canAssignRoles(me);

  const [tab, setTab] = useState<TabId>("roles");
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [catalog, setCatalog] = useState<CatalogPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(DEFAULT_ROLES_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAddRole, setShowAddRole] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  const [editingRole, setEditingRole] = useState<TenantRole | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);

  const [showAddPermission, setShowAddPermission] = useState(false);
  const [addPermCode, setAddPermCode] = useState("");
  const [addPermRoles, setAddPermRoles] = useState<string[]>([]);
  const [editingPermission, setEditingPermission] = useState<PermissionDirectoryRow | null>(null);
  const [editPermRoleIds, setEditPermRoleIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!tenantId || !canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const [roleRows, permissionRows] = await Promise.all([
        apiGet<unknown[]>(`/api/v1/tenants/${tenantId}/roles`),
        apiGet<CatalogPermission[]>(`/api/v1/tenants/${tenantId}/permissions`).catch(() => []),
      ]);
      let directory = toTenantRoles(roleRows);
      const listOmitsPermissions = roleRows.some(
        (row) =>
          typeof row !== "object" ||
          row === null ||
          !Array.isArray((row as { permissions?: unknown }).permissions),
      );
      if (listOmitsPermissions && directory.length > 0 && directory.length <= 40) {
        const details = await Promise.all(
          directory.map(async (role) => {
            try {
              const detail = await apiGet<TenantRole>(
                `/api/v1/tenants/${tenantId}/roles/${role.id}`,
              );
              return detail;
            } catch {
              return role;
            }
          }),
        );
        const byId = new Map(details.map((role) => [role.id, role]));
        directory = directory.map((role) => {
          const detail = byId.get(role.id);
          if (!detail) return role;
          return {
            ...role,
            ...detail,
            permissions: detail.permissions ?? role.permissions ?? [],
          };
        });
      }
      setRoles(directory);
      setCatalog(Array.isArray(permissionRows) ? permissionRows : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roles and permissions");
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, canAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, tab]);

  const assignable = useMemo(() => assignablePermissionCodes(catalog, me), [catalog, me]);
  const permissionRows = useMemo(
    () => toPermissionDirectory(roles, catalog),
    [roles, catalog],
  );
  const filteredPermissions = useMemo(
    () => filterPermissionDirectory(permissionRows, query),
    [permissionRows, query],
  );
  const paged = useMemo(
    () => paginateRows(filteredPermissions, page, pageSize),
    [filteredPermissions, page, pageSize],
  );
  const unassignedCatalog = useMemo(() => {
    const used = new Set(permissionRows.filter((row) => row.assignedRoles.length > 0).map((row) => row.code));
    return assignable.filter((row) => !used.has(row.code));
  }, [assignable, permissionRows]);

  async function saveRolePermissions(role: TenantRole, permissionCodes: string[]) {
    const fresh = await apiGetResult<TenantRole>(`/api/v1/tenants/${tenantId}/roles/${role.id}`);
    await apiSend(
      `/api/v1/tenants/${tenantId}/roles/${role.id}/permissions`,
      "PUT",
      { permissionCodes },
      { ifMatch: roleIfMatch(fresh.etag, fresh.data.recordVersion) },
    );
  }

  async function onCreateRole(event: FormEvent) {
    event.preventDefault();
    if (!canAssign) return;
    setBusyId("role");
    setError(null);
    try {
      await apiSend(
        `/api/v1/tenants/${tenantId}/roles`,
        "POST",
        {
          code: roleCodeFromName(roleName),
          name: roleName.trim(),
          description: roleDescription.trim() || undefined,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      setRoleName("");
      setRoleDescription("");
      setShowAddRole(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create role");
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveRolePerms(event: FormEvent) {
    event.preventDefault();
    if (!editingRole || !canAssign) return;
    setBusyId(editingRole.id);
    setError(null);
    try {
      await saveRolePermissions(editingRole, editPerms);
      setEditingRole(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role permissions");
    } finally {
      setBusyId(null);
    }
  }

  async function applyPermissionToRoles(code: string, roleIds: string[]) {
    const selected = new Set(roleIds);
    for (const role of roles) {
      if (role.isSystemManaged) continue;
      const current = new Set((role.permissions ?? []).map((perm) => perm.code));
      const shouldHave = selected.has(role.id);
      if (shouldHave === current.has(code)) continue;
      if (shouldHave) current.add(code);
      else current.delete(code);
      await saveRolePermissions(role, [...current]);
    }
  }

  async function onAddPermission(event: FormEvent) {
    event.preventDefault();
    if (!canAssign || addPermCode === "") return;
    setBusyId("permission");
    setError(null);
    try {
      await applyPermissionToRoles(addPermCode, addPermRoles);
      setShowAddPermission(false);
      setAddPermCode("");
      setAddPermRoles([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign permission");
    } finally {
      setBusyId(null);
    }
  }

  async function onSavePermissionRoles(event: FormEvent) {
    event.preventDefault();
    if (!editingPermission || !canAssign) return;
    setBusyId(editingPermission.code);
    setError(null);
    try {
      await applyPermissionToRoles(editingPermission.code, editPermRoleIds);
      setEditingPermission(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update permission assignments");
    } finally {
      setBusyId(null);
    }
  }

  async function deactivateRole(role: TenantRole) {
    if (!canAssign || role.isSystemManaged) return;
    setBusyId(role.id);
    setError(null);
    try {
      const fresh = await apiGetResult<TenantRole>(`/api/v1/tenants/${tenantId}/roles/${role.id}`);
      await apiSend(
        `/api/v1/tenants/${tenantId}/roles/${role.id}`,
        "PATCH",
        { status: role.status === "INACTIVE" ? "ACTIVE" : "INACTIVE" },
        { ifMatch: roleIfMatch(fresh.etag, fresh.data.recordVersion) },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <p className="text-muted mb-0" role="status">
        Loading roles and permissions…
      </p>
    );
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">Roles and permissions</h4>
        <p className="mb-0">
          This section is limited to Admin, Super Admin, and Creator.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="roles-perms-title">
      <ModuleWorkspaceHeader
        id="roles-perms-title"
        eyebrow="Settings"
        title="Roles and permissions"
        description="Tenant roles and the platform permissions they grant. System-managed roles stay read-only."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error ? (
        <div className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4" role="alert">
          <span className="flex-grow-1">{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Roles and permissions"
        tabPanelLabel={tab === "roles" ? "Roles" : "Permissions"}
      >
        {tab === "roles" ? (
          <>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <p className="text-muted small mb-0">{roles.length} roles on this tenant</p>
              {canAssign ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowAddRole(true)}>
                  <i className="bx bx-plus me-1" />
                  Add Role
                </button>
              ) : null}
            </div>

            {showAddRole && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onCreateRole(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Add role</h6>
                  <button type="button" className="btn-close" onClick={() => setShowAddRole(false)} />
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="role-name">
                      Name
                    </label>
                    <input
                      id="role-name"
                      required
                      className="form-control"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                    />
                    <div className="form-text">Code: {roleCodeFromName(roleName) || "—"}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="role-desc">
                      Description
                    </label>
                    <input
                      id="role-desc"
                      className="form-control"
                      value={roleDescription}
                      onChange={(e) => setRoleDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowAddRole(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busyId === "role"}>
                    Create role
                  </button>
                </div>
              </form>
            ) : null}

            {editingRole && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onSaveRolePerms(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Permissions for {editingRole.name}</h6>
                  <button type="button" className="btn-close" onClick={() => setEditingRole(null)} />
                </div>
                <div className="card-body">
                  {editingRole.isSystemManaged ? (
                    <p className="text-muted mb-0">System-managed roles cannot be modified.</p>
                  ) : (
                    <select
                      className="form-select"
                      multiple
                      value={editPerms}
                      onChange={(e) =>
                        setEditPerms(Array.from(e.target.selectedOptions).map((option) => option.value))
                      }
                      size={Math.min(12, Math.max(6, assignable.length))}
                    >
                      {assignable.map((perm) => (
                        <option key={perm.code} value={perm.code}>
                          {permissionDisplayName(perm)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditingRole(null)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={Boolean(editingRole.isSystemManaged) || busyId === editingRole.id}
                  >
                    Save permissions
                  </button>
                </div>
              </form>
            ) : null}

            {loading ? (
              <p className="text-muted">Loading roles…</p>
            ) : (
              <div className="row g-3">
                {roles.map((role) => (
                  <div className="col-md-6 col-xl-4" key={role.id}>
                    <div className="card h-100">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <h6 className="mb-1">{role.name}</h6>
                            <span className={`badge bg-label-${roleChipTone(role.code, role.name)}`}>
                              {role.code}
                            </span>
                          </div>
                          <span className={`badge ${role.status === "INACTIVE" ? "bg-label-secondary" : "bg-label-success"}`}>
                            {role.status ?? "ACTIVE"}
                          </span>
                        </div>
                        <p className="text-muted small mt-3 mb-0">
                          {(role.permissions ?? []).length} permissions
                          {role.isSystemManaged ? " · system" : ""}
                        </p>
                      </div>
                      {canAssign ? (
                        <div className="card-footer d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busyId === role.id}
                            onClick={() => {
                              setEditingRole(role);
                              setEditPerms((role.permissions ?? []).map((perm) => perm.code));
                            }}
                          >
                            <i className="bx bx-edit-alt me-1" />
                            Edit
                          </button>
                          {role.isSystemManaged ? null : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-warning"
                              disabled={busyId === role.id}
                              onClick={() => void deactivateRole(role)}
                            >
                              {role.status === "INACTIVE" ? "Activate" : "Deactivate"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {showAddPermission && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onAddPermission(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Add permission</h6>
                  <button type="button" className="btn-close" onClick={() => setShowAddPermission(false)} />
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="add-perm">
                      Permission
                    </label>
                    <select
                      id="add-perm"
                      required
                      className="form-select"
                      value={addPermCode}
                      onChange={(e) => setAddPermCode(e.target.value)}
                    >
                      <option value="">Select a permission</option>
                      {unassignedCatalog.map((perm) => (
                        <option key={perm.code} value={perm.code}>
                          {permissionDisplayName(perm)}
                        </option>
                      ))}
                    </select>
                    <div className="form-text">
                      Catalog permissions only — new platform codes are created by Creator.
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="add-perm-roles">
                      Assigned to
                    </label>
                    <select
                      id="add-perm-roles"
                      className="form-select"
                      multiple
                      value={addPermRoles}
                      onChange={(e) =>
                        setAddPermRoles(Array.from(e.target.selectedOptions).map((option) => option.value))
                      }
                      size={Math.min(8, Math.max(3, roles.length))}
                    >
                      {roles
                        .filter((role) => !role.isSystemManaged)
                        .map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowAddPermission(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busyId === "permission"}>
                    Assign permission
                  </button>
                </div>
              </form>
            ) : null}

            {editingPermission && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onSavePermissionRoles(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Edit {editingPermission.name}</h6>
                  <button type="button" className="btn-close" onClick={() => setEditingPermission(null)} />
                </div>
                <div className="card-body">
                  <p className="text-muted small">{editingPermission.code}</p>
                  <select
                    className="form-select"
                    multiple
                    value={editPermRoleIds}
                    onChange={(e) =>
                      setEditPermRoleIds(Array.from(e.target.selectedOptions).map((option) => option.value))
                    }
                    size={Math.min(8, Math.max(3, roles.length))}
                  >
                    {roles
                      .filter((role) => !role.isSystemManaged)
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEditingPermission(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busyId === editingPermission.code}
                  >
                    Save assignment
                  </button>
                </div>
              </form>
            ) : null}

            <div className="card">
              <div className="card-header d-flex flex-wrap align-items-center gap-2">
                <label className="small text-muted mb-0 me-auto">
                  Show
                  <select
                    className="form-select form-select-sm d-inline-block w-auto mx-1"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {ROLES_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: "16rem" }}
                  placeholder="Search Permission"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {canAssign ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowAddPermission(true)}
                  >
                    <i className="bx bx-plus me-1" />
                    Add Permission
                  </button>
                ) : null}
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Assigned to</th>
                      <th>Created date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          Loading permissions…
                        </td>
                      </tr>
                    ) : paged.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          No permissions assigned on this tenant yet.
                        </td>
                      </tr>
                    ) : (
                      paged.items.map((row) => (
                        <tr key={row.code}>
                          <td>
                            <div className="fw-medium">{row.name}</div>
                            <small className="text-muted">{row.code}</small>
                          </td>
                          <td>
                            {row.assignedRoles.length === 0 ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <div className="d-flex flex-wrap gap-1">
                                {row.assignedRoles.map((role) => (
                                  <span key={role.id} className={`badge bg-label-${role.tone}`}>
                                    {role.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td>{formatPermissionDate(row.createdAt)}</td>
                          <td>
                            {canAssign ? (
                              <button
                                type="button"
                                className="btn btn-icon btn-sm btn-outline-secondary"
                                title="Edit assignment"
                                disabled={busyId === row.code}
                                onClick={() => {
                                  setEditingPermission(row);
                                  setEditPermRoleIds(row.assignedRoles.map((role) => role.id));
                                }}
                              >
                                <i className="bx bx-edit-alt" />
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span className="text-muted small">
                  Showing {paged.from} to {paged.to} of {filteredPermissions.length} entries
                </span>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={paged.page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Prev
                  </button>
                  <span className="badge bg-label-primary">{paged.page}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={paged.page >= paged.pageCount}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </ModuleWorkspaceTabs>
    </section>
  );
}

export function RolesPermissionsSettingsCard() {
  const { me } = useAuth();
  if (!canAccessRolesAndPermissions(me)) return null;
  return (
    <div className="col-12 col-sm-6 col-md-4">
      <div className="card h-100">
        <div className="card-body">
          <h2 className="h6">Roles and permissions</h2>
          <p className="small text-muted">See which roles grant each permission and adjust assignments.</p>
          <Link href="/settings/roles/" className="btn btn-sm btn-primary">
            Open roles
          </Link>
        </div>
      </div>
    </div>
  );
}
