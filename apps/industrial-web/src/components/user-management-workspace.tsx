"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminActionDropdown, AdminSectionCard } from "@/components/admin-action-dropdown";
import { AdminSearchMultiSelect, AdminToneIcon } from "@/components/admin-search-multi-select";
import {
  ApiError,
  apiGet,
  apiGetResult,
  apiSend,
  requestCognitoPasswordReset,
  toIfMatch,
  useAuth,
} from "@forge/web-kit";
import { InvitationsPanel } from "@/components/invitations-panel";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { canReadInvitations } from "@/lib/platform-admin";
import {
  canAccessUserManagement,
  canInviteUsers,
  canManageUserManagement,
  canSendPasswordReset,
  DEFAULT_USER_PAGE_SIZE,
  directoryUsersCsv,
  filterDirectoryUsers,
  paginateDirectoryUsers,
  preferredInviteRole,
  toDirectoryUsers,
  USER_MANAGEMENT_PAGE_SIZES,
  userManagementStats,
  type DirectoryUser,
  type TenantRoleOption,
} from "@/lib/user-management";
import { industrialModulesWithRoleAccess } from "@/lib/roles-permissions";
import { INDUSTRIAL_PRODUCT_CODE } from "@forge/contracts";

type MembershipAccessPayload = {
  products?: Array<{ code?: string | null; status?: string | null }>;
  modules?: Array<{ code?: string | null; status?: string | null }>;
};

type UserProfilePayload = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
  recordVersion?: number;
};

type EditProfileForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  phone: string;
  email: string;
  username: string;
};

function emptyProfileForm(): EditProfileForm {
  return {
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    phone: "",
    email: "",
    username: "",
  };
}

type InviteForm = {
  firstName: string;
  lastName: string;
  email: string;
  roleCode: string;
};

const USER_TABS = [
  { id: "directory", label: "User directory" },
  { id: "invitations", label: "Pending invitations" },
] as const;

type UserTabId = (typeof USER_TABS)[number]["id"];

function emptyInvite(): InviteForm {
  return { firstName: "", lastName: "", email: "", roleCode: "" };
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function statusBadge(status: string): string {
  const key = status.toUpperCase();
  if (key === "ACTIVE") return "bg-label-success";
  if (key === "PENDING" || key === "INVITED") return "bg-label-warning";
  if (key === "SUSPENDED" || key === "DISABLED") return "bg-label-danger";
  if (key === "REVOKED" || key === "ARCHIVED") return "bg-label-secondary";
  return "bg-label-secondary";
}

export function UserManagementWorkspace() {
  const { me, loading: authLoading } = useAuth();
  const tenantId = me?.tenantId ?? "";
  const canAccess = canAccessUserManagement(me);
  const canManage = canManageUserManagement(me);
  const canInvite = canInviteUsers(me);
  const canReset = canSendPasswordReset(me);
  const canViewInvites = canReadInvitations(me);

  const [tab, setTab] = useState<UserTabId>("directory");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [roles, setRoles] = useState<TenantRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_USER_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState<InviteForm>(emptyInvite);
  const [editing, setEditing] = useState<DirectoryUser | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editProductCodes, setEditProductCodes] = useState<string[]>([INDUSTRIAL_PRODUCT_CODE]);
  const [editProfile, setEditProfile] = useState<EditProfileForm>(emptyProfileForm);
  const [editProfileEtag, setEditProfileEtag] = useState<string | null>(null);
  const [editAccessLoading, setEditAccessLoading] = useState(false);
  const [reason, setReason] = useState("");

  const moduleOptions = useMemo(() => industrialModulesWithRoleAccess(), []);

  const load = useCallback(async () => {
    if (!tenantId || !canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const [memberships, platformUsers, tenantRoles] = await Promise.all([
        apiGet<unknown[]>(`/api/v1/tenants/${tenantId}/memberships`),
        apiGet<unknown[]>(`/api/v1/tenants/${tenantId}/users`).catch(() => []),
        apiGet<TenantRoleOption[]>(`/api/v1/tenants/${tenantId}/roles`).catch(() => []),
      ]);
      let directory = toDirectoryUsers(memberships, platformUsers);
      const missingRoles = directory.filter((row) => row.roles.length === 0);
      if (missingRoles.length > 0 && missingRoles.length <= 50) {
        const extras = await Promise.all(
          missingRoles.map(async (row) => {
            try {
              const assigned = await apiGet<Array<{ roleCode?: string; roleName?: string }>>(
                `/api/v1/tenants/${tenantId}/memberships/${row.membershipId}/roles`,
              );
              return [
                row.membershipId,
                assigned
                  .filter((role) => Boolean(role.roleCode))
                  .map((role) => ({
                    roleCode: String(role.roleCode),
                    roleName: String(role.roleName ?? role.roleCode),
                  })),
              ] as const;
            } catch {
              return [row.membershipId, row.roles] as const;
            }
          }),
        );
        const byId = new Map(extras);
        directory = directory.map((row) => ({
          ...row,
          roles: byId.get(row.membershipId) ?? row.roles,
        }));
      }
      setUsers(directory);
      setRoles(Array.isArray(tenantRoles) ? tenantRoles : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, canAccess]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (invite.roleCode || roles.length === 0) return;
    setInvite((current) => ({ ...current, roleCode: preferredInviteRole(roles) }));
  }, [roles, invite.roleCode]);

  const filtered = useMemo(() => filterDirectoryUsers(users, query), [users, query]);
  const stats = useMemo(() => userManagementStats(users), [users]);
  const paged = useMemo(
    () => paginateDirectoryUsers(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  async function membershipIfMatch(membershipId: string): Promise<string> {
    const fresh = await apiGetResult<{ recordVersion: number }>(
      `/api/v1/tenants/${tenantId}/memberships/${membershipId}`,
    );
    return fresh.etag ?? toIfMatch(fresh.data.recordVersion);
  }

  async function userIfMatch(userId: string): Promise<string> {
    const fresh = await apiGetResult<{ recordVersion: number }>(
      `/api/v1/tenants/${tenantId}/users/${userId}`,
    );
    return fresh.etag ?? toIfMatch(fresh.data.recordVersion);
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!canInvite) return;
    setBusyId("invite");
    setError(null);
    try {
      await apiSend(
        "/api/v1/auth/invitations",
        "POST",
        {
          tenantId,
          email: invite.email.trim(),
          firstName: invite.firstName.trim() || undefined,
          lastName: invite.lastName.trim() || undefined,
          roleCodes: invite.roleCode ? [invite.roleCode] : [],
          send: true,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      setInvite({ ...emptyInvite(), roleCode: preferredInviteRole(roles) });
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite user");
    } finally {
      setBusyId(null);
    }
  }

  async function openEditAccess(user: DirectoryUser) {
    setEditing(user);
    setEditRoles(user.roles.map((role) => role.roleCode));
    setEditModules([]);
    setEditProductCodes([INDUSTRIAL_PRODUCT_CODE]);
    setEditProfile({
      firstName: user.firstName,
      middleName: "",
      lastName: user.lastName,
      preferredName: "",
      phone: "",
      email: user.email,
      username: user.username,
    });
    setEditProfileEtag(null);
    setEditAccessLoading(true);
    setError(null);
    try {
      const [access, profileResult] = await Promise.all([
        apiGet<MembershipAccessPayload>(
          `/api/v1/tenants/${tenantId}/memberships/${user.membershipId}/products`,
        ),
        apiGetResult<UserProfilePayload>("/api/v1/auth/profile", {
          query: { userId: user.userId },
        }).catch(() => null),
      ]);
      const products = (access.products ?? [])
        .map((row) => String(row.code ?? "").trim())
        .filter(Boolean);
      const modules = (access.modules ?? [])
        .map((row) => String(row.code ?? "").trim())
        .filter(Boolean);
      setEditProductCodes(products.length > 0 ? products : [INDUSTRIAL_PRODUCT_CODE]);
      setEditModules(modules);
      if (profileResult?.data) {
        const profile = profileResult.data;
        setEditProfile({
          firstName: String(profile.firstName ?? user.firstName ?? "").trim(),
          middleName: String(profile.middleName ?? "").trim(),
          lastName: String(profile.lastName ?? user.lastName ?? "").trim(),
          preferredName: String(profile.preferredName ?? "").trim(),
          phone: String(profile.phone ?? "").trim(),
          email: String(profile.email ?? user.email ?? "").trim(),
          username: String(profile.username ?? user.username ?? "").trim(),
        });
        setEditProfileEtag(
          profileResult.etag ??
            (typeof profile.recordVersion === "number" ? toIfMatch(profile.recordVersion) : null),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load user access");
    } finally {
      setEditAccessLoading(false);
    }
  }

  async function onSaveAccess(event: FormEvent) {
    event.preventDefault();
    if (!editing || !canManage) return;
    if (!editProfile.firstName.trim() || !editProfile.lastName.trim()) {
      setError("First name and last name are required");
      return;
    }
    setBusyId(editing.membershipId);
    setError(null);
    try {
      await apiSend(
        "/api/v1/auth/profile",
        "PATCH",
        {
          firstName: editProfile.firstName.trim(),
          lastName: editProfile.lastName.trim(),
          middleName: editProfile.middleName.trim() || null,
          preferredName: editProfile.preferredName.trim() || null,
          phone: editProfile.phone.trim() || null,
          email: editProfile.email.trim() || null,
          username: editProfile.username.trim() || null,
        },
        {
          query: { userId: editing.userId },
          ...(editProfileEtag ? { ifMatch: editProfileEtag } : {}),
        },
      );
      const ifMatchRoles = await membershipIfMatch(editing.membershipId);
      await apiSend(
        `/api/v1/tenants/${tenantId}/memberships/${editing.membershipId}/roles`,
        "PUT",
        {
          roles: editRoles.map((roleCode) => ({ roleCode, organizationId: null })),
        },
        { ifMatch: ifMatchRoles },
      );
      const ifMatchProducts = await membershipIfMatch(editing.membershipId);
      await apiSend(
        `/api/v1/tenants/${tenantId}/memberships/${editing.membershipId}/products`,
        "PUT",
        {
          productCodes: editProductCodes.length > 0 ? editProductCodes : [INDUSTRIAL_PRODUCT_CODE],
          moduleCodes: editModules,
        },
        { ifMatch: ifMatchProducts },
      );
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user access");
    } finally {
      setBusyId(null);
    }
  }

  async function runMembershipAction(
    user: DirectoryUser,
    action: "activate" | "suspend" | "revoke",
  ) {
    if (!canManage) return;
    if ((action === "suspend" || action === "revoke") && reason.trim() === "") {
      setError(`${action} requires a reason`);
      return;
    }
    setBusyId(user.membershipId);
    setError(null);
    try {
      const ifMatch = await membershipIfMatch(user.membershipId);
      if (action === "activate") {
        await apiSend(
          `/api/v1/tenants/${tenantId}/memberships/${user.membershipId}/activate`,
          "POST",
          undefined,
          { ifMatch },
        );
      } else {
        await apiSend(
          `/api/v1/tenants/${tenantId}/memberships/${user.membershipId}/${action}`,
          "POST",
          { reason: reason.trim() },
          { ifMatch },
        );
      }
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} user`);
    } finally {
      setBusyId(null);
    }
  }

  async function runUserAction(user: DirectoryUser, action: "disable" | "enable") {
    if (!canManage) return;
    setBusyId(user.membershipId);
    setError(null);
    try {
      const ifMatch = await userIfMatch(user.userId);
      await apiSend(
        `/api/v1/tenants/${tenantId}/users/${user.userId}/${action}`,
        "POST",
        undefined,
        { ifMatch },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} account`);
    } finally {
      setBusyId(null);
    }
  }

  async function onResetPassword(user: DirectoryUser) {
    if (!canReset) return;
    if (!user.email) {
      setError("This user has no email address to send a reset to");
      return;
    }
    if (user.userStatus.toUpperCase() === "DISABLED") {
      setError("Enable the account before sending a password reset");
      return;
    }
    const confirmed = window.confirm(
      `Send a password reset email to ${user.displayName} (${user.email})? The email will include a reset link and verification code.`,
    );
    if (!confirmed) return;
    setBusyId(user.membershipId);
    setError(null);
    setNotice(null);
    try {
      let method: string | undefined;
      try {
        const result = await apiSend<{ method?: string }>(
          `/api/v1/tenants/${tenantId}/users/${user.userId}/reset-password`,
          "POST",
        );
        method = result?.method;
      } catch (err) {
        const missingEndpoint = err instanceof ApiError && err.status === 404;
        if (!missingEndpoint) throw err;
        await requestCognitoPasswordReset(user.email);
        method = "reset";
      }
      const resetUrl = `${window.location.origin}/auth/reset-password/?email=${encodeURIComponent(user.email)}`;
      setNotice(
        method === "resend"
          ? `A new temporary-password email was sent to ${user.email}. They must set it on first sign-in.`
          : `Reset email sent to ${user.email}. The message includes a link to ${resetUrl}. They enter the verification code from that email on the reset page.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to send password reset",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <p className="text-muted mb-0" role="status">
        Loading user management…
      </p>
    );
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">User management</h4>
        <p className="mb-0">
          This section is limited to Admin, Super Admin, and Creator. Ask a tenant admin if you need
          access.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="user-mgmt-title">
      <ModuleWorkspaceHeader
        id="user-mgmt-title"
        eyebrow="Platform admin"
        title="Users & access"
        description="Invite teammates, assign roles and modules, reset passwords, and manage membership for your company."
        onRefresh={() => void load()}
        refreshing={loading}
      />

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

      {notice ? (
        <div
          className="alert alert-success d-flex flex-wrap align-items-center gap-3 mb-4"
          role="status"
        >
          <span className="flex-grow-1">{notice}</span>
          <button
            type="button"
            className="btn-close"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          />
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={USER_TABS.filter((item) => item.id !== "invitations" || canViewInvites)}
        active={tab}
        onChange={setTab}
        ariaLabel="User management sections"
        tabPanelLabel={tab === "directory" ? "User directory" : "Pending invitations"}
      >
        {tab === "invitations" ? (
          <InvitationsPanel onChanged={() => void load()} />
        ) : (
          <>
            <div className="row g-3 mb-4">
              {[
                {
                  label: "Users",
                  value: `${stats.total}`,
                  hint: "Total users",
                  icon: "bx-user",
                  tone: "primary" as const,
                },
                {
                  label: "Verified users",
                  value: String(stats.verified),
                  hint:
                    stats.total === 0
                      ? "0%"
                      : `${Math.round((stats.verified / stats.total) * 100)}%`,
                  icon: "bx-badge-check",
                  tone: "success" as const,
                },
                {
                  label: "Duplicate users",
                  value: String(stats.duplicates),
                  hint: "Same email on more than one row",
                  icon: "bx-copy-alt",
                  tone: "warning" as const,
                },
                {
                  label: "Verification pending",
                  value: String(stats.pending),
                  hint: "Invited or not yet active",
                  icon: "bx-time-five",
                  tone: "info" as const,
                },
              ].map((card) => (
                <div className="col-sm-6 col-xl-3" key={card.label}>
                  <div className="card h-100 border-0 shadow-none bg-body-secondary bg-opacity-25">
                    <div className="card-body">
                      <div className="d-flex align-items-start justify-content-between gap-3">
                        <div>
                          <span className="d-block text-muted small">{card.label}</span>
                          <h4 className="mb-0">{card.value}</h4>
                          <small className="text-muted">{card.hint}</small>
                        </div>
                        <AdminToneIcon icon={card.icon} tone={card.tone} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showInvite && canInvite ? (
              <form className="card mb-4" onSubmit={(event) => void onInvite(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Add new user</h6>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowInvite(false)}
                  />
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="invite-first">
                        First name
                      </label>
                      <input
                        id="invite-first"
                        className="form-control"
                        value={invite.firstName}
                        onChange={(e) => setInvite({ ...invite, firstName: e.target.value })}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="invite-last">
                        Last name
                      </label>
                      <input
                        id="invite-last"
                        className="form-control"
                        value={invite.lastName}
                        onChange={(e) => setInvite({ ...invite, lastName: e.target.value })}
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="invite-email">
                        Email
                      </label>
                      <input
                        id="invite-email"
                        type="email"
                        required
                        className="form-control"
                        value={invite.email}
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="invite-role">
                        Role
                      </label>
                      <select
                        id="invite-role"
                        className="form-select"
                        value={invite.roleCode}
                        onChange={(e) => setInvite({ ...invite, roleCode: e.target.value })}
                      >
                        <option value="">No role yet</option>
                        {roles.map((role) => (
                          <option key={role.code} value={role.code}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setShowInvite(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={busyId === "invite"}>
                    {busyId === "invite" ? "Sending…" : "Send invite"}
                  </button>
                </div>
              </form>
            ) : null}

            {editing && canManage ? (
              <form className="card mb-4" onSubmit={(event) => void onSaveAccess(event)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">Edit user · {editing.displayName}</h6>
                  <button type="button" className="btn-close" onClick={() => setEditing(null)} />
                </div>
                <div className="card-body row g-3">
                  <div className="col-12">
                    <p className="text-muted small mb-0">{editing.email}</p>
                  </div>
                  {editAccessLoading ? (
                    <div className="col-12">
                      <p className="text-muted mb-0" role="status">
                        Loading user details…
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="col-12">
                        <h6 className="text-uppercase small text-muted mb-2">Other info</h6>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-first-name">
                          First name
                        </label>
                        <input
                          id="edit-first-name"
                          className="form-control"
                          required
                          value={editProfile.firstName}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, firstName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-last-name">
                          Last name
                        </label>
                        <input
                          id="edit-last-name"
                          className="form-control"
                          required
                          value={editProfile.lastName}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, lastName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-middle-name">
                          Middle name
                        </label>
                        <input
                          id="edit-middle-name"
                          className="form-control"
                          value={editProfile.middleName}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, middleName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-preferred-name">
                          Preferred name
                        </label>
                        <input
                          id="edit-preferred-name"
                          className="form-control"
                          value={editProfile.preferredName}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, preferredName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-username">
                          Username
                        </label>
                        <input
                          id="edit-username"
                          className="form-control"
                          value={editProfile.username}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, username: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label" htmlFor="edit-phone">
                          Phone
                        </label>
                        <input
                          id="edit-phone"
                          type="tel"
                          className="form-control"
                          value={editProfile.phone}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, phone: e.target.value }))
                          }
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label" htmlFor="edit-contact-email">
                          Contact email
                        </label>
                        <input
                          id="edit-contact-email"
                          type="email"
                          className="form-control"
                          value={editProfile.email}
                          onChange={(e) =>
                            setEditProfile((prev) => ({ ...prev, email: e.target.value }))
                          }
                        />
                        <div className="form-text">
                          Does not change their Cognito sign-in email.
                        </div>
                      </div>
                      <div className="col-12">
                        <AdminSearchMultiSelect
                          id="edit-roles"
                          label="Roles"
                          value={editRoles}
                          onChange={setEditRoles}
                          options={roles.map((role) => ({
                            value: role.code,
                            label: role.name,
                            hint: role.code,
                          }))}
                          placeholder="Search roles…"
                        />
                      </div>
                      <div className="col-12">
                        <AdminSearchMultiSelect
                          id="edit-modules"
                          label="Modules"
                          value={editModules}
                          onChange={setEditModules}
                          options={moduleOptions.map((mod) => ({
                            value: mod.code,
                            label: mod.name,
                            hint: mod.group,
                          }))}
                          placeholder="Search modules…"
                        />
                        <div className="form-text">
                          Limits which company-enabled modules this user can open. Roles still
                          control permissions inside each module.
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="card-footer d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busyId === editing.membershipId || editAccessLoading}
                  >
                    Save user
                  </button>
                </div>
              </form>
            ) : null}

            <div className="card">
              <div className="card-header d-flex flex-wrap align-items-center gap-2">
                <h6 className="mb-0 me-auto">Search filter</h6>
                <label className="small text-muted mb-0">
                  Show
                  <select
                    className="form-select form-select-sm d-inline-block w-auto mx-1"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {USER_MANAGEMENT_PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  entries
                </label>
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: "16rem" }}
                  placeholder="Search user"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => downloadCsv("tenant-users.csv", directoryUsersCsv(filtered))}
                  disabled={filtered.length === 0}
                >
                  <i className="bx bx-export me-1" />
                  Export
                </button>
                {canInvite ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setShowInvite(true)}
                  >
                    <i className="bx bx-plus me-1" />
                    Add New User
                  </button>
                ) : null}
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Verified</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-muted">
                          Loading users…
                        </td>
                      </tr>
                    ) : paged.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted">
                          No platform users for this tenant yet.
                        </td>
                      </tr>
                    ) : (
                      paged.items.map((user, index) => (
                        <tr key={user.membershipId}>
                          <td>{paged.from + index}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="avatar avatar-sm">
                                <span
                                  className={`avatar-initial rounded-circle bg-label-${user.avatarTone}`}
                                >
                                  {user.initials}
                                </span>
                              </div>
                              <div>
                                <div className="fw-medium">{user.displayName}</div>
                                <small className={`badge ${statusBadge(user.membershipStatus)}`}>
                                  {user.membershipStatus}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>{user.email || "—"}</td>
                          <td>
                            <i
                              className={`bx ${user.verified ? "bxs-check-shield text-success" : "bxs-x-circle text-danger"} fs-4`}
                              title={user.verified ? "Verified" : "Not verified"}
                            />
                          </td>
                          <td>
                            {user.roles.length === 0
                              ? "—"
                              : user.roles.map((role) => role.roleName || role.roleCode).join(", ")}
                          </td>
                          <td>
                            {canManage || canReset ? (
                              <AdminActionDropdown
                                busy={busyId === user.membershipId}
                                items={[
                                  {
                                    id: "reset",
                                    label: "Send password reset",
                                    icon: "bx-key",
                                    tone: "primary",
                                    hidden: !canReset,
                                    disabled: user.email === "",
                                    onClick: () => void onResetPassword(user),
                                  },
                                  {
                                    id: "roles",
                                    label: "Edit user",
                                    icon: "bx-user",
                                    hidden: !canManage,
                                    onClick: () => void openEditAccess(user),
                                  },
                                  {
                                    id: "activate",
                                    label: "Activate membership",
                                    icon: "bx-user-check",
                                    hidden:
                                      !canManage ||
                                      user.membershipStatus.toUpperCase() === "ACTIVE",
                                    onClick: () => void runMembershipAction(user, "activate"),
                                  },
                                  {
                                    id: "suspend",
                                    label: "Suspend membership",
                                    icon: "bx-pause",
                                    tone: "warning",
                                    hidden: !canManage,
                                    onClick: () => void runMembershipAction(user, "suspend"),
                                  },
                                  {
                                    id: "revoke",
                                    label: "Revoke access",
                                    icon: "bx-block",
                                    tone: "danger",
                                    hidden: !canManage,
                                    onClick: () => void runMembershipAction(user, "revoke"),
                                  },
                                  {
                                    id: "enable",
                                    label: "Enable sign-in",
                                    icon: "bx-log-in-circle",
                                    hidden:
                                      !canManage || user.userStatus.toUpperCase() !== "DISABLED",
                                    onClick: () => void runUserAction(user, "enable"),
                                  },
                                  {
                                    id: "disable",
                                    label: "Disable sign-in",
                                    icon: "bx-log-out-circle",
                                    tone: "danger",
                                    hidden:
                                      !canManage || user.userStatus.toUpperCase() === "DISABLED",
                                    onClick: () => void runUserAction(user, "disable"),
                                  },
                                ]}
                              />
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
                {canManage ? (
                  <label className="small text-muted mb-0">
                    Reason for suspend / revoke
                    <input
                      className="form-control form-control-sm mt-1"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Required for suspend"
                    />
                  </label>
                ) : (
                  <span className="text-muted small">
                    Showing {paged.from} to {paged.to} of {filtered.length} entries
                  </span>
                )}
                <div className="d-flex align-items-center gap-2">
                  {canManage ? (
                    <span className="text-muted small">
                      Showing {paged.from} to {paged.to} of {filtered.length} entries
                    </span>
                  ) : null}
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

export function UserManagementSettingsCard() {
  const { me } = useAuth();
  if (!canAccessUserManagement(me)) return null;
  return (
    <AdminSectionCard
      title="Users & access"
      description="Invite teammates, reset passwords, and manage roles."
      icon="bx-user"
      tone="primary"
      href="/settings/users/"
      actionLabel="Manage users"
    />
  );
}
