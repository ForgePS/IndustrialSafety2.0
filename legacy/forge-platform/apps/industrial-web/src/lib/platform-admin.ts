/**
 * Platform administration helpers for Settings → Admin surfaces.
 */

import { isIndustrialDemoTenantKey } from "@forge/contracts";
import { apiGet, apiGetResult, apiSend } from "@forge/web-kit";

import { canAccessUserManagement } from "@/lib/user-management";

export type AuthLike =
  | {
      isPlatformAdmin?: boolean;
      permissions?: readonly string[];
      activeProducts?: readonly string[];
      tenantId?: string | null;
      /** Active tenant is a synthetic demo environment (forge-platform). */
      isDemoTenant?: boolean;
      tenants?: ReadonlyArray<{
        tenantId: string;
        slug: string;
        isDemoTenant?: boolean;
      }>;
    }
  | null
  | undefined;

/** Walkthrough Studio / Executive Walkthrough — Forge Platform demo tenants only. */
export function isWalkthroughEligibleTenant(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isDemoTenant) return true;
  const active = me.tenants?.find((t) => t.tenantId === me.tenantId);
  if (!active) return false;
  if (active.isDemoTenant) return true;
  return isIndustrialDemoTenantKey(active.slug);
}

export function hasAnyPermission(me: AuthLike, codes: string[]): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  const permissions = new Set(me.permissions ?? []);
  return codes.some((code) => permissions.has(code));
}

export function canReadAuditLog(me: AuthLike): boolean {
  return hasAnyPermission(me, [
    "platform.audit.read",
    "industrial.admin",
    "platform.membership.manage",
  ]);
}

export function canManageTrainingPortalQr(me: AuthLike): boolean {
  return hasAnyPermission(me, ["industrial.admin"]);
}

/**
 * Executive Walkthrough / Walkthrough Studio — Forge Platform demo tenant only.
 * Customer tenants (e.g. Producers Rice Mill) never see these surfaces.
 */
export function canAccessExecutiveWalkthrough(me: AuthLike): boolean {
  if (!me) return false;
  if (!isWalkthroughEligibleTenant(me)) return false;
  if (me.isPlatformAdmin) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  return hasAnyPermission(me, [
    "industrial.access",
    "industrial.admin",
    "industrial.presentation.executive.view",
    "industrial.presentation.executive.manage",
    "industrial.presentation.executive.export",
    "industrial.walkthrough.view",
    "industrial.walkthrough.manage",
  ]);
}

export function canAccessWalkthroughStudio(me: AuthLike): boolean {
  if (!me) return false;
  if (!isWalkthroughEligibleTenant(me)) return false;
  if (me.isPlatformAdmin) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  return hasAnyPermission(me, [
    "industrial.admin",
    "industrial.walkthrough.view",
    "industrial.walkthrough.manage",
    "industrial.presentation.executive.view",
    "industrial.presentation.executive.manage",
  ]);
}

export function canManageWalkthroughStudio(me: AuthLike): boolean {
  if (!me) return false;
  if (!isWalkthroughEligibleTenant(me)) return false;
  if (me.isPlatformAdmin) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  return hasAnyPermission(me, [
    "industrial.admin",
    "industrial.walkthrough.manage",
    "industrial.presentation.executive.manage",
  ]);
}

/**
 * Sanitation sub-module (tab) toggles: Tenant Admin and Forge Creator only.
 */
export function canManageSanitationSubmodules(me: AuthLike): boolean {
  if (!me) return false;
  if (me.isPlatformAdmin) return true;
  if ((me.activeProducts ?? []).includes("FORGE_CREATOR")) return true;
  return hasAnyPermission(me, ["industrial.admin", "industrial.sanitation.manage"]);
}

/** Company admins can turn industrial modules on/off for their tenant. */
export function canManageCompanyModules(me: AuthLike): boolean {
  return hasAnyPermission(me, ["industrial.admin"]);
}

export function canManageConfiguration(me: AuthLike): boolean {
  return hasAnyPermission(me, [
    "platform.configuration.update",
    "tenant.configuration.update",
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "industrial.admin",
  ]);
}

/** Platform admin → Dropdown lists: Tenant Admin and configuration admins. */
export function canManageDropdowns(me: AuthLike): boolean {
  if (canAccessUserManagement(me)) return true;
  return canManageConfiguration(me);
}

export function canPublishConfiguration(me: AuthLike): boolean {
  return hasAnyPermission(me, [
    "platform.configuration.publish",
    "tenant.configuration.publish",
    "platform.configuration.update",
    "industrial.admin",
  ]);
}

export function canReadInvitations(me: AuthLike): boolean {
  return hasAnyPermission(me, [
    "platform.invitation.read",
    "platform.invitation.manage",
    "platform.user.invite",
  ]);
}

export function canManageInvitations(me: AuthLike): boolean {
  return hasAnyPermission(me, ["platform.invitation.manage", "platform.user.invite"]);
}

export type InvitationRow = {
  id: string;
  tenantId: string;
  email: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listInvitations(
  tenantId: string,
  query?: { status?: string; email?: string },
) {
  const params = new URLSearchParams({ tenantId });
  if (query?.status) params.set("status", query.status);
  if (query?.email) params.set("email", query.email);
  return apiGet<InvitationRow[]>(`/api/v1/auth/invitations?${params.toString()}`);
}

export async function resendInvitation(invitationId: string, tenantId: string) {
  return apiSend<InvitationRow>(
    `/api/v1/auth/invitations/${invitationId}/resend?tenantId=${encodeURIComponent(tenantId)}`,
    "POST",
  );
}

export async function revokeInvitation(invitationId: string, tenantId: string, reason: string) {
  return apiSend<InvitationRow>(
    `/api/v1/auth/invitations/${invitationId}/revoke?tenantId=${encodeURIComponent(tenantId)}`,
    "POST",
    { reason },
  );
}

export type AuditEventRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  riskLevel: string;
  actorUserId: string | null;
  correlationId?: string;
  occurredAt: string;
};

export async function listAuditEvents(
  tenantId: string,
  query: { page: number; pageSize: number; actorUserId?: string },
): Promise<{ events: AuditEventRow[]; total: number }> {
  const result = await apiGetResult<AuditEventRow[]>(`/api/v1/tenants/${tenantId}/audit-events`, {
    query: {
      page: String(query.page),
      pageSize: String(query.pageSize),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    },
  });
  return {
    events: Array.isArray(result.data) ? result.data : [],
    total: result.meta?.pagination?.total ?? result.data.length,
  };
}

export type DropdownOption = {
  value: string;
  label: string;
  sortOrder?: number;
  disabled?: boolean;
};

export type DropdownCatalog = {
  key: string;
  label: string;
  options: DropdownOption[];
};

export type DropdownsPayload = {
  catalogs: DropdownCatalog[];
};

export type ConfigStudioVersion = {
  id: string;
  version: number;
  state: string;
  payloadJson: unknown;
  changeSummary: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ConfigStudioObject = {
  id: string;
  namespace: string;
  objectKey: string;
  displayName: string;
  currentPublishedVersionId: string | null;
};

export function parseDropdownsPayload(payload: unknown): DropdownsPayload {
  if (!payload || typeof payload !== "object") return { catalogs: [] };
  const catalogs = (payload as DropdownsPayload).catalogs;
  if (!Array.isArray(catalogs)) return { catalogs: [] };
  return {
    catalogs: catalogs
      .filter((row) => row && typeof row.key === "string")
      .map((row) => ({
        key: String(row.key),
        label: String(row.label ?? row.key),
        options: Array.isArray(row.options)
          ? row.options
              .filter((opt) => opt && typeof opt.value === "string")
              .map((opt, index) => ({
                value: String(opt.value),
                label: String(opt.label ?? opt.value),
                sortOrder: typeof opt.sortOrder === "number" ? opt.sortOrder : index + 1,
                disabled: Boolean(opt.disabled),
              }))
          : [],
      })),
  };
}

export function slugifyCatalogKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
