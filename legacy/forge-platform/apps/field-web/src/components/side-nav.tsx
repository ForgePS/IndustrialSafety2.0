"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FIELD_PRIMARY_NAV, FIELD_TABLET_EXTRA_NAV } from "@/lib/field-nav";
import { FIELD_PRODUCT_SHORT_NAME } from "@/lib/brand";
import { useUnreadNotificationCount } from "@/hooks/use-my-work";

export function SideNav({ tenantName }: { tenantName?: string }) {
  const pathname = usePathname() ?? "/";
  const unread = useUnreadNotificationCount();

  return (
    <aside className="ff-sidenav" aria-label="Primary">
      <div className="ff-sidenav-brand">
        <p className="ff-sidenav-product">{FIELD_PRODUCT_SHORT_NAME}</p>
        {tenantName ? <p className="ff-sidenav-tenant">{tenantName}</p> : null}
      </div>
      <nav className="ff-sidenav-nav">
        {FIELD_PRIMARY_NAV.map((item) => {
          const current = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ff-sidenav-link${item.scan ? " ff-sidenav-link--scan" : ""}${current ? " ff-sidenav-link--active" : ""}`}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
              {item.id === "alerts" && unread > 0 ? (
                <span className="ff-sidenav-badge">{unread > 9 ? "9+" : unread}</span>
              ) : null}
            </Link>
          );
        })}
        <div className="ff-sidenav-divider" role="presentation" />
        {FIELD_TABLET_EXTRA_NAV.map((item) => {
          const current = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ff-sidenav-link${current ? " ff-sidenav-link--active" : ""}`}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
