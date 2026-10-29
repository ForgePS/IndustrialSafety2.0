"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildReportingNavGroups, reportingNavActive } from "@/lib/reporting-nav";

export function ReportingAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const groups = buildReportingNavGroups();

  return (
    <div className="ind-content settings-admin-shell reporting-admin-shell">
      <div className="row g-4">
        <aside className="col-12 col-lg-4 col-xl-3 settings-admin-sidebar">
          <div className="card h-100">
            <div className="card-body">
              <p className="settings-admin-sidebar__eyebrow mb-2">Reporting</p>
              <p className="text-muted small mb-3">
                Build, analyze, schedule, export, and manage reports across your organization.
              </p>
              <nav aria-label="Reporting sections" className="settings-admin-nav">
                {groups.map((group) => (
                  <div key={group.id} className="settings-admin-nav__group">
                    {group.id !== "home" ? (
                      <p className="settings-admin-nav__group-label">{group.label}</p>
                    ) : null}
                    {group.items
                      .filter((item) => item.visible)
                      .map((item) => {
                        if (item.soon) {
                          return (
                            <span
                              key={item.href}
                              className="settings-admin-nav__link settings-admin-nav__link--soon"
                              aria-disabled="true"
                              title="Coming soon"
                            >
                              <i
                                className={`bx ${item.icon} settings-admin-nav__icon`}
                                aria-hidden
                              />
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
                        const active = reportingNavActive(pathname, item.href);
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
            </div>
          </div>
        </aside>
        <div className="col-12 col-lg-8 col-xl-9 settings-admin-main">{children}</div>
      </div>
    </div>
  );
}
