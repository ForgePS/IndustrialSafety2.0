"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FIELD_PRIMARY_NAV } from "@/lib/field-nav";
import { useUnreadNotificationCount } from "@/hooks/use-my-work";

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <span className="ff-tabbar-icon" aria-hidden="true">
      {children}
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path
        d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path
        d="M8 4H5a1 1 0 0 0-1 1v3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M16 20h3a1 1 0 0 0 1-1v-3M8 8h8v8H8V8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 24 24" focusable="false">
      <path
        d="M12 4a5 5 0 0 1 5 5v2.2l1.4 2.8a1 1 0 0 1-.9 1.5H6.5a1 1 0 0 1-.9-1.5L7 11.2V9a5 5 0 0 1 5-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  me: (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 19.5c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const unread = useUnreadNotificationCount();

  return (
    <nav className="ff-tabbar" aria-label="Primary">
      <div className="ff-tabbar-inner">
        {FIELD_PRIMARY_NAV.map((item) => {
          const current = item.match(pathname);
          const className = [
            "ff-tabbar-item",
            item.scan ? "ff-tabbar-item--scan" : "",
            current ? "ff-tabbar-item--active" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const content = (
            <>
              <TabIcon>{ICONS[item.id]}</TabIcon>
              <span className="ff-tabbar-label">
                {item.id === "alerts" && unread > 0 ? (
                  <>
                    Alerts
                    <span className="ff-tabbar-badge">{unread > 9 ? "9+" : unread}</span>
                  </>
                ) : (
                  item.label
                )}
              </span>
            </>
          );

          if (item.scan) {
            return (
              <button
                key={item.href}
                type="button"
                className={className}
                aria-current={current ? "page" : undefined}
                aria-label="Scan QR code"
                onClick={() => router.push("/scan/")}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={className}
              aria-current={current ? "page" : undefined}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
