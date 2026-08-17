"use client";

import Link from "next/link";
import {
  PERSONNEL_QUICK_LINKS,
  personnelOffPageLinks,
  type PersonnelQuickView,
} from "@/lib/personnel-quick-nav";

/**
 * Dashboard shows a quick card with all three destinations. On Company Drivers
 * or Archived, only the other two surfaces appear as link tabs.
 */
export function PersonnelQuickNav({ current }: { current: PersonnelQuickView }) {
  if (current === "dashboard") {
    return (
      <div className="card ind-personnel-quick-card mb-0" aria-label="Personnel shortcuts">
        <div className="card-body py-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div>
              <h6 className="mb-0">Quick links</h6>
              <small className="text-muted">Jump to common personnel views</small>
            </div>
          </div>
          <div className="row g-2">
            {PERSONNEL_QUICK_LINKS.map((link) => (
              <div className="col-md-4" key={link.id}>
                <Link
                  href={link.href}
                  className={`ind-personnel-quick-link${
                    link.id === current ? " is-current" : ""
                  }`}
                  aria-current={link.id === current ? "page" : undefined}
                >
                  <span className="ind-personnel-quick-link__icon" aria-hidden="true">
                    <i className={`bx ${link.icon}`} />
                  </span>
                  <span className="ind-personnel-quick-link__copy">
                    <strong>{link.label}</strong>
                    <small>{link.description}</small>
                  </span>
                  <i className="bx bx-chevron-right ind-personnel-quick-link__chevron" aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const others = personnelOffPageLinks(current);
  return (
    <div
      className="ind-personnel-switcher ind-personnel-offpage-tabs"
      role="navigation"
      aria-label="Other personnel views"
    >
      {others.map((link) => (
        <Link key={link.id} href={link.href} className="ind-personnel-offpage-tab">
          <i className={`bx ${link.icon} me-1`} aria-hidden="true" />
          {link.label}
        </Link>
      ))}
    </div>
  );
}
