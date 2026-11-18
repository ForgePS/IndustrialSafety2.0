"use client";

import Link from "next/link";
import { useAuth } from "@forge/web-kit";
import { AdminSectionCard } from "@/components/admin-action-dropdown";
import { RolesPermissionsSettingsCard } from "@/components/roles-permissions-workspace";
import { UserManagementSettingsCard } from "@/components/user-management-workspace";
import { UserActivitySettingsCard } from "@/components/user-activity-workspace";
import { canAccessUserManagement } from "@/lib/user-management";
import {
  canReadAuditLog,
  canManageDropdowns,
  canManageCompanyModules,
  canManageTrainingPortalQr,
  canManageConfiguration,
  canAccessExecutiveWalkthrough,
  hasAnyPermission,
} from "@/lib/platform-admin";

export default function IndustrialSettingsPage() {
  const { me } = useAuth();
  const canUsers = canAccessUserManagement(me);
  const canCompliance = hasAnyPermission(me, [
    "industrial.legal.acknowledgments.read_tenant",
    "industrial.admin",
    "industrial.access",
  ]);
  const canDropdowns = canManageDropdowns(me);
  const canModules = canManageCompanyModules(me);
  const canTrainingPortal = canManageTrainingPortalQr(me);
  const canAudit = canReadAuditLog(me);
  const canConfiguration = canManageConfiguration(me);
  const canPresentation = canAccessExecutiveWalkthrough(me);

  return (
    <>
      <div className="mb-4" data-walkthrough="tenant-settings">
        <p className="settings-admin-sidebar__eyebrow mb-2">Platform admin</p>
        <h1 className="h4 mb-1">Administration overview</h1>
        <p className="text-muted mb-0">
          Everything you need to run your company on Forge Industrial — organization, users,
          permissions, picklists, compliance evidence, and audit history.
        </p>
      </div>

      <div className="row g-3 mb-4">
        <AdminSectionCard
          title="Company profile"
          description="Legal name, timezone, locale, and primary contact for this tenant."
          icon="bx-buildings"
          tone="primary"
          href="/settings/company-profile/"
          actionLabel="Edit profile"
          hidden={!canConfiguration}
        />
        <AdminSectionCard
          title="Branding"
          description="Company logo, colors, and identity for emails, reports, and documents."
          icon="bx-palette"
          tone="info"
          href="/settings/branding/"
          actionLabel="Edit branding"
          hidden={!canConfiguration}
        />
        <UserManagementSettingsCard />
        <UserActivitySettingsCard />
        <RolesPermissionsSettingsCard />
        <AdminSectionCard
          title="Company modules"
          description="Turn modules on when your team is ready. Unchecked modules stay hidden until enabled."
          icon="bx-toggle-left"
          tone="primary"
          href="/settings/modules/"
          actionLabel="Manage modules"
          hidden={!canModules}
        />
        <AdminSectionCard
          title="Workspace defaults"
          description="Set the initial My Workspace layout, required modules, and role presets."
          icon="bx-layout"
          tone="info"
          href="/settings/workspace/"
          actionLabel="Manage workspace"
          hidden={!canModules}
        />
        <AdminSectionCard
          title="Dropdown lists"
          description="Sites, departments, positions, divisions, and module picklists."
          icon="bx-list-ul"
          tone="info"
          href="/settings/dropdowns/"
          actionLabel="Manage lists"
          hidden={!canDropdowns}
        />
        <AdminSectionCard
          title="Body map"
          description="Drag injury hotspots on front and back views to fine-tune alignment."
          icon="bx-body"
          tone="info"
          href="/settings/body-map/"
          actionLabel="Calibrate map"
          hidden={!canDropdowns}
        />
        <AdminSectionCard
          title="Executive Walkthrough"
          description="Launch the Complete Platform Overview presentation and configure MP4 export defaults."
          icon="bx-slideshow"
          tone="primary"
          href="/settings/presentation/"
          actionLabel="Open walkthrough"
          hidden={!canPresentation}
        />
        <AdminSectionCard
          title="Training portal QR"
          description="Create and rotate the company training portal QR code for employee self-service."
          icon="bx-qr"
          tone="primary"
          href="/settings/training-portal/"
          actionLabel="Manage portal QR"
          hidden={!canTrainingPortal}
        />
        <AdminSectionCard
          title="Printer Bridges"
          description="Pair Windows bridge agents and manage shop-floor label printers."
          icon="bx-printer"
          tone="info"
          href="/settings/integrations/printer-bridges/"
          actionLabel="Manage bridges"
          hidden={!canConfiguration && !canModules}
        />
        <AdminSectionCard
          title="Compliance"
          description="Review legal acknowledgments and publish tenant policies."
          icon="bx-check-shield"
          tone="success"
          href="/settings/compliance/"
          actionLabel="Open compliance"
          hidden={!canCompliance}
        />
        <AdminSectionCard
          title="Audit log"
          description="See who changed permissions, reset passwords, and updated configuration."
          icon="bx-history"
          tone="warning"
          href="/settings/audit/"
          actionLabel="View audit log"
          hidden={!canAudit}
        />
        <AdminSectionCard
          title="My profile"
          description="Update your name, contact details, and personal preferences."
          icon="bx-id-card"
          tone="secondary"
          href="/profile/"
          actionLabel="Open profile"
        />
        <AdminSectionCard
          title="Reporting"
          description="Operational reporting and exports for safety programs."
          icon="bx-bar-chart-alt-2"
          tone="primary"
          href="/reporting/"
          actionLabel="Open reporting"
        />
      </div>

      {canUsers ? (
        <div className="card border shadow-none">
          <div className="card-body">
            <h2 className="h6">Quick start for new admins</h2>
            <ol className="small text-muted mb-0 ps-3">
              <li>
                Confirm <Link href="/settings/company-profile/">company profile</Link> and{" "}
                <Link href="/settings/branding/">branding</Link>.
              </li>
              <li>
                <Link href="/settings/users/">Invite users</Link> and assign a starter role.
              </li>
              <li>
                Review <Link href="/settings/roles/">roles &amp; permissions</Link> before granting
                admin access.
              </li>
              <li>
                Customize <Link href="/settings/dropdowns/">dropdown lists</Link> so forms match
                your organization.
              </li>
              <li>
                Use <Link href="/settings/modules/">company modules</Link> to turn programs on only
                when your team is ready.
              </li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="alert alert-secondary mb-0" role="status">
          Platform administration is limited to tenant admins. Contact your administrator if you
          need access to users, roles, or configuration.
        </div>
      )}
    </>
  );
}
