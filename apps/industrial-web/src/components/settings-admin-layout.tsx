"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@forge/web-kit";
import { canAccessUserManagement } from "@/lib/user-management";
import {
  canManageDropdowns,
  canManageCompanyModules,
  canManageTrainingPortalQr,
  canManageConfiguration,
  canReadAuditLog,
  canReadInvitations,
  canAccessExecutiveWalkthrough,
  hasAnyPermission,
} from "@/lib/platform-admin";
import { buildSettingsNavGroups, settingsNavActive } from "@/lib/settings-nav";

export function SettingsAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { me } = useAuth();

  const groups = buildSettingsNavGroups({
    canUsers: canAccessUserManagement(me),
    canDropdowns: canManageDropdowns(me),
    canTrainingPortal: canManageTrainingPortalQr(me),
    canModules: canManageCompanyModules(me),
    canCompliance:
      hasAnyPermission(me, [
        "industrial.legal.acknowledgments.read_tenant",
        "industrial.admin",
        "industrial.access",
      ]) ?? false,
    canAudit: canReadAuditLog(me),
    canConfiguration: canManageConfiguration(me),
    canPresentation: canAccessExecutiveWalkthrough(me),
  });

  return (
    <div className="ind-content settings-admin-shell">
      <div className="row g-4">
        <aside className="col-12 col-lg-4 col-xl-3 settings-admin-sidebar">
          <div className="card h-100">
            <div className="card-body">
              <p className="settings-admin-sidebar__eyebrow mb-2">Platform admin</p>
              <p className="text-muted small mb-3">
                Configure your company — organization, access, modules, lists, and compliance.
              </p>
              <nav aria-label="Settings sections" className="settings-admin-nav">
                {groups.map((group) => (
                  <div key={group.id} className="settings-admin-nav__group">
                    {group.id !== "home" ? (
                      <p className="settings-admin-nav__group-label">{group.label}</p>
                    ) : null}
                    {group.items.map((item) => {
                      if (item.soon) {
                        return (
                          <span
                            key={item.href}
                            className="settings-admin-nav__link settings-admin-nav__link--soon"
                            aria-disabled="true"
                            title="Coming soon"
                          >
                            <i className={`bx ${item.icon} settings-admin-nav__icon`} aria-hidden />
                            <span>
                              <span className="settings-admin-nav__label">
                                {item.label}{" "}
                                <span className="settings-admin-nav__soon-badge">Soon</span>
                              </span>
                              <span className="settings-admin-nav__hint">{item.description}</span>
                            </span>
                          </span>
                        );
                      }
                      const active = !item.external && settingsNavActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`settings-admin-nav__link${active ? " is-active" : ""}`}
                          aria-current={active ? "page" : undefined}
                        >
                          <i className={`bx ${item.icon} settings-admin-nav__icon`} aria-hidden />
                          <span>
                            <span className="settings-admin-nav__label">{item.label}</span>
                            <span className="settings-admin-nav__hint">{item.description}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
              {canReadInvitations(me) ? (
                <p className="small text-muted mt-3 mb-0">
                  Pending invites live under <Link href="/settings/users/">Users</Link>.
                </p>
              ) : null}
            </div>
          </div>
        </aside>
        <div className="col-12 col-lg-8 col-xl-9 settings-admin-main">{children}</div>
      </div>
    </div>
  );
}
