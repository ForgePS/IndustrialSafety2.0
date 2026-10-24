"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  apiGet,
  apiGetResult,
  apiSend,
  apiSendResult,
  permissionCodesFromRolePermissions,
  toIfMatch,
  useAuth,
} from "@forge/web-kit";
import { AdminSectionCard } from "@/components/admin-action-dropdown";
import { AdminSearchMultiSelect } from "@/components/admin-search-multi-select";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { adminLabelToneClass } from "@/lib/admin-ui";
import {
  assignablePermissionCodes,
  canAccessRolesAndPermissions,
  canAssignRoles,
  DEFAULT_ROLES_PAGE_SIZE,
  filterPermissionDirectory,
  formatPermissionDate,
  industrialModulesWithRoleAccess,
  mergePermissionCodesWithModules,
  moduleCodesFromPermissionCodes,
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
import { industrialModuleRoleAccess, isIndustrialModulePagePermission } from "@forge/contracts";
import {
  catalogsForSelectedModules,
  enabledPageIdsFromPermissionCodes,
  filterModulePages,
  mergePermissionCodesWithModulePages,
} from "@/lib/module-page-permissions";

const TABS = [
  { id: "roles", label: "Roles" },
  { id: "permissions", label: "Permissions" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function roleIfMatch(etag: string | undefined, recordVersion: number | undefined): string {
  return etag ?? toIfMatch(recordVersion ?? 1);
}

export function RolesPermissionsWorkspace() {
  const router = useRouter();
  const { me, loading: authLoading, startRolePreview, rolePreview } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canAccessRolesAndPermissions(me);
  const canAssign = canAssignRoles(me);
  const canViewAsRole = Boolean(me?.isPlatformAdmin) && !rolePreview;

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
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleDescription, setEditRoleDescription] = useState("");
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editPerms, setEditPerms] = useState<string[]>([]);

  const [showAddPermission, setShowAddPermission] = useState(false);
  const [addPermCodes, setAddPermCodes] = useState<string[]>([]);
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
  const catalogCodes = useMemo(() => new Set(assignable.map((row) => row.code)), [assignable]);
  const moduleOptions = useMemo(() => {
    return industrialModulesWithRoleAccess().filter((mod) => {
      const access = industrialModuleRoleAccess(mod.code);
      return (access?.defaultGrantPermissions ?? []).some((code) => catalogCodes.has(code));
    });
  }, [catalogCodes]);
  const permissionRows = useMemo(() => toPermissionDirectory(roles, catalog), [roles, catalog]);
  const filteredPermissions = useMemo(
    () => filterPermissionDirectory(permissionRows, query),
    [permissionRows, query],
  );
  const paged = useMemo(
    () => paginateRows(filteredPermissions, page, pageSize),
    [filteredPermissions, page, pageSize],
  );
  const unassignedCatalog = useMemo(() => {
    const used = new Set(
      permissionRows.filter((row) => row.assignedRoles.length > 0).map((row) => row.code),
    );
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

  function openRoleEditor(role: TenantRole) {
    setEditingRole(role);
    setEditRoleName(role.name);
    setEditRoleDescription(role.description ?? "");
    const codes = (role.permissions ?? []).map((perm) => perm.code);
    setEditPerms(codes);
    setEditModules(moduleCodesFromPermissionCodes(codes));
  }

  function closeRoleEditor() {
    setEditingRole(null);
    setEditRoleName("");
    setEditRoleDescription("");
    setEditModules([]);
    setEditPerms([]);
  }

  function onEditModulesChange(nextModules: string[]) {
    setEditModules(nextModules);
    setEditPerms(
      mergePermissionCodesWithModules({
        currentPermissionCodes: editPerms,
        selectedModuleCodes: nextModules,
        catalogPermissionCodes: catalogCodes,
      }),
    );
  }

  function onEditModulePagesChange(moduleCode: string, enabledPageIds: string[]) {
    setEditPerms(
      mergePermissionCodesWithModulePages({
        currentPermissionCodes: editPerms,
        moduleCode,
        enabledPageIds,
        catalogPermissionCodes: catalogCodes,
      }),
    );
  }

  function onEditPermsChange(nextPerms: string[]) {
    setEditPerms(nextPerms);
    setEditModules(moduleCodesFromPermissionCodes(nextPerms));
  }

  const editPageCatalogs = useMemo(() => catalogsForSelectedModules(editModules), [editModules]);

  const assignableWithoutPages = useMemo(
    () => assignable.filter((perm) => !isIndustrialModulePagePermission(perm.code)),
    [assignable],
  );

  async function onSaveRole(event: FormEvent) {
    event.preventDefault();
    if (!editingRole || !canAssign) return;
    setBusyId(editingRole.id);
    setError(null);
    try {
      const fresh = await apiGetResult<TenantRole>(
        `/api/v1/tenants/${tenantId}/roles/${editingRole.id}`,
      );
      let ifMatch = roleIfMatch(fresh.etag, fresh.data.recordVersion);

      if (!editingRole.isSystemManaged) {
        const nextName = editRoleName.trim();
        const nextDescription = editRoleDescription.trim();
        const nameChanged = nextName !== editingRole.name;
        const descriptionChanged = nextDescription !== (editingRole.description ?? "");
        if (nameChanged || descriptionChanged) {
          if (!nextName) {
            throw new Error("Role name is required");
          }
          const updated = await apiSendResult<TenantRole>(
            `/api/v1/tenants/${tenantId}/roles/${editingRole.id}`,
            "PATCH",
            {
              name: nextName,
              description: nextDescription === "" ? null : nextDescription,
            },
            { ifMatch },
          );
          ifMatch = roleIfMatch(updated.etag, updated.data.recordVersion);
        }

        await apiSend(
          `/api/v1/tenants/${tenantId}/roles/${editingRole.id}/permissions`,
          "PUT",
          { permissionCodes: editPerms },
          { ifMatch },
        );
      }

      closeRoleEditor();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
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

  async function applyPermissionsToRoles(codes: string[], roleIds: string[]) {
    for (const code of codes) {
      await applyPermissionToRoles(code, roleIds);
    }
  }

  async function onAddPermission(event: FormEvent) {
    event.preventDefault();
    if (!canAssign || addPermCodes.length === 0) return;
    setBusyId("permission");
    setError(null);
    try {
      await applyPermissionsToRoles(addPermCodes, addPermRoles);
      setShowAddPermission(false);
      setAddPermCodes([]);
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

  async function onViewAsRole(role: TenantRole) {
    if (!canViewAsRole || !tenantId) return;
    setBusyId(`view-${role.id}`);
    setError(null);
    try {
      let detail = role;
      if (!(role.permissions && role.permissions.length > 0)) {
        detail = await apiGet<TenantRole>(`/api/v1/tenants/${tenantId}/roles/${role.id}`);
      }
      const permissionCodes = permissionCodesFromRolePermissions(detail.permissions);
      startRolePreview({
        tenantId,
        roleId: role.id,
        roleCode: role.code,
        roleName: role.name,
        permissionCodes,
        startedAt: new Date().toISOString(),
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start role preview");
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
        <p className="mb-0">This section is limited to Admin, Super Admin, and Creator.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="roles-perms-title">
      <ModuleWorkspaceHeader
        id="roles-perms-title"
        eyebrow="Platform admin"
        title="Roles & permissions"
        description="Create roles, choose which modules each role can access, and refine permissions for Admins and Creators."
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {canViewAsRole ? (
        <div className="alert alert-info mb-4" role="status">
          <strong>View as role</strong> applies that role&apos;s permissions to navigation and
          screens for this browser tab. API authorization still uses your Creator session — use Exit
          in the header when finished.
        </div>
      ) : null}
      {error ? (
        <div
          className="alert alert-danger d-flex flex-wrap align-items-center gap-3 mb-4"
          role="alert"
        >
          <span className="flex-grow-1">{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => void load()}
          >
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
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setShowAddRole(true)}
                >
                  <i className="bx bx-plus me-1" />
                  Add Role
                </button>
              ) : null}
            </div>

            {showAddRole && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onCreateRole(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Add role</h6>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowAddRole(false)}
                  />
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
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowAddRole(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busyId === "role"}>
                    Create role
                  </button>
                </div>
              </form>
            ) : null}

            {editingRole && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onSaveRole(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Edit role</h6>
                  <button type="button" className="btn-close" onClick={closeRoleEditor} />
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="edit-role-name">
                      Display name
                    </label>
                    <input
                      id="edit-role-name"
                      required
                      className="form-control"
                      value={editRoleName}
                      disabled={editingRole.isSystemManaged}
                      onChange={(event) => setEditRoleName(event.target.value)}
                    />
                    <div className="form-text font-monospace">{editingRole.code}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" htmlFor="edit-role-desc">
                      Description
                    </label>
                    <input
                      id="edit-role-desc"
                      className="form-control"
                      value={editRoleDescription}
                      disabled={editingRole.isSystemManaged}
                      onChange={(event) => setEditRoleDescription(event.target.value)}
                      placeholder="What this role is for"
                    />
                  </div>
                  <div className="col-12">
                    {editingRole.isSystemManaged ? (
                      <p className="text-muted mb-0">
                        System-managed roles cannot be renamed or have permissions changed.
                      </p>
                    ) : (
                      <>
                        <AdminSearchMultiSelect
                          id="edit-role-modules"
                          label="Modules"
                          value={editModules}
                          onChange={onEditModulesChange}
                          options={moduleOptions.map((mod) => ({
                            value: mod.code,
                            label: mod.name,
                            hint: mod.group,
                          }))}
                          placeholder="Search modules…"
                          emptyMessage="No module permissions are available in the catalog yet."
                        />
                        <div className="form-text mb-3">
                          Choose which Industrial modules this role can open. Each module grants
                          view access; refine pages below, then manage and specialty permissions.
                        </div>
                        {editPageCatalogs.length > 0 ? (
                          <div className="mb-3">
                            <div className="fw-semibold mb-1">Pages</div>
                            <p className="form-text mt-0 mb-2">
                              Choose which pages this role can open inside each module.
                            </p>
                            <div className="d-flex flex-column gap-3">
                              {editPageCatalogs.map((modCatalog) => {
                                const enabledIds = new Set(
                                  enabledPageIdsFromPermissionCodes(
                                    modCatalog.moduleCode,
                                    editPerms,
                                  ),
                                );
                                const moduleName =
                                  moduleOptions.find((mod) => mod.code === modCatalog.moduleCode)
                                    ?.name ?? modCatalog.moduleCode;
                                return (
                                  <div key={modCatalog.moduleCode} className="border rounded p-3">
                                    <div className="fw-semibold mb-2">{moduleName}</div>
                                    <div className="row g-2">
                                      {modCatalog.pages.map((page) => {
                                        const inputId = `role-page-${modCatalog.moduleCode}-${page.id}`;
                                        const checked = enabledIds.has(page.id);
                                        return (
                                          <div
                                            key={page.id}
                                            className="col-md-6 col-xl-4 d-flex align-items-center gap-2"
                                          >
                                            <div className="form-check form-switch m-0">
                                              <input
                                                id={inputId}
                                                className="form-check-input"
                                                type="checkbox"
                                                role="switch"
                                                checked={checked}
                                                onChange={() => {
                                                  const next = checked
                                                    ? [...enabledIds].filter((id) => id !== page.id)
                                                    : [...enabledIds, page.id];
                                                  onEditModulePagesChange(
                                                    modCatalog.moduleCode,
                                                    next,
                                                  );
                                                }}
                                              />
                                              <label className="form-check-label" htmlFor={inputId}>
                                                {page.label}
                                              </label>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <AdminSearchMultiSelect
                          id="edit-role-permissions"
                          label="Permissions"
                          value={editPerms.filter(
                            (code) => !isIndustrialModulePagePermission(code),
                          )}
                          onChange={(next) => {
                            const pages = editPerms.filter((code) =>
                              isIndustrialModulePagePermission(code),
                            );
                            onEditPermsChange([...new Set([...next, ...pages])]);
                          }}
                          options={assignableWithoutPages.map((perm) => ({
                            value: perm.code,
                            label: permissionDisplayName(perm),
                            hint: perm.code,
                          }))}
                          placeholder="Search permissions…"
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeRoleEditor}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={Boolean(editingRole.isSystemManaged) || busyId === editingRole.id}
                  >
                    Save role
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
                            <span
                              className={`badge ${adminLabelToneClass(roleChipTone(role.code, role.name))}`}
                            >
                              {role.code}
                            </span>
                          </div>
                          <span
                            className={`badge ${role.status === "INACTIVE" ? "bg-label-secondary" : "bg-label-success"}`}
                          >
                            {role.status ?? "ACTIVE"}
                          </span>
                        </div>
                        <p className="text-muted small mt-3 mb-0">
                          {role.description?.trim() || "No description yet."}
                        </p>
                        <p className="text-muted small mb-0">
                          {
                            moduleCodesFromPermissionCodes(
                              (role.permissions ?? []).map((perm) => perm.code),
                            ).length
                          }{" "}
                          modules · {(role.permissions ?? []).length} permissions
                          {role.isSystemManaged ? " · system" : ""}
                        </p>
                      </div>
                      {canAssign || canViewAsRole ? (
                        <div className="card-footer d-flex flex-wrap gap-2">
                          {canViewAsRole ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={busyId === `view-${role.id}` || role.status === "INACTIVE"}
                              onClick={() => void onViewAsRole(role)}
                              title={
                                role.status === "INACTIVE"
                                  ? "Activate this role before previewing"
                                  : "Preview navigation and screens as this role"
                              }
                            >
                              <i className="bx bx-show me-1" />
                              View as role
                            </button>
                          ) : null}
                          {canAssign ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                disabled={busyId === role.id}
                                onClick={() => openRoleEditor(role)}
                              >
                                <i className="bx bx-edit-alt me-1" />
                                Edit role
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
                            </>
                          ) : null}
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
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowAddPermission(false);
                      setAddPermCodes([]);
                      setAddPermRoles([]);
                    }}
                  />
                </div>
                <div className="card-body row g-3">
                  <div className="col-md-6">
                    <AdminSearchMultiSelect
                      id="add-perm"
                      label="Permissions"
                      value={addPermCodes}
                      onChange={setAddPermCodes}
                      options={unassignedCatalog.map((perm) => ({
                        value: perm.code,
                        label: permissionDisplayName(perm),
                        hint: perm.code,
                      }))}
                      placeholder="Search permissions…"
                      emptyMessage="No unassigned catalog permissions left."
                    />
                    <div className="form-text">
                      Catalog permissions only — new platform codes are created by Creator.
                    </div>
                  </div>
                  <div className="col-md-6">
                    <AdminSearchMultiSelect
                      id="add-perm-roles"
                      label="Assigned to"
                      value={addPermRoles}
                      onChange={setAddPermRoles}
                      options={roles
                        .filter((role) => !role.isSystemManaged)
                        .map((role) => ({
                          value: role.id,
                          label: role.name,
                          hint: role.code,
                        }))}
                      placeholder="Search roles…"
                    />
                  </div>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      setShowAddPermission(false);
                      setAddPermCodes([]);
                      setAddPermRoles([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busyId === "permission" || addPermCodes.length === 0}
                  >
                    {addPermCodes.length > 1 ? "Assign permissions" : "Assign permission"}
                  </button>
                </div>
              </form>
            ) : null}

            {editingPermission && canAssign ? (
              <form className="card mb-4" onSubmit={(event) => void onSavePermissionRoles(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Edit {editingPermission.name}</h6>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setEditingPermission(null)}
                  />
                </div>
                <div className="card-body">
                  <p className="text-muted small">{editingPermission.code}</p>
                  <AdminSearchMultiSelect
                    label="Roles with this permission"
                    value={editPermRoleIds}
                    onChange={setEditPermRoleIds}
                    options={roles
                      .filter((role) => !role.isSystemManaged)
                      .map((role) => ({
                        value: role.id,
                        label: role.name,
                        hint: role.code,
                      }))}
                    placeholder="Search roles…"
                  />
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
                                  <span
                                    key={role.id}
                                    className={`badge ${adminLabelToneClass(role.tone)}`}
                                  >
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
    <AdminSectionCard
      title="Roles & permissions"
      description="Control who can view and manage each part of the platform."
      icon="bx-shield-quarter"
      tone="success"
      href="/settings/roles/"
      actionLabel="Manage roles"
    />
  );
}
