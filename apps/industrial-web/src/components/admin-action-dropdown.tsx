"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { adminLabelToneClass, type AdminLabelTone } from "@/lib/admin-ui";

export type AdminActionItem = {
  id: string;
  label: string;
  icon?: string;
  tone?: "default" | "danger" | "warning" | "primary";
  disabled?: boolean;
  hidden?: boolean;
  onClick: () => void;
};

type Props = {
  label?: string;
  items: AdminActionItem[];
  busy?: boolean;
};

/** Compact actions menu for admin table rows. */
export function AdminActionDropdown({ label = "Actions", items, busy }: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (visible.length === 0) return <span className="text-muted">—</span>;

  return (
    <div className="dropdown position-static" ref={rootRef}>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary dropdown-toggle"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        disabled={busy}
        onClick={() => setOpen((current) => !current)}
      >
        {busy ? "Working…" : label}
      </button>
      {open ? (
        <ul className="dropdown-menu dropdown-menu-end show" id={menuId} role="menu">
          {visible.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={`dropdown-item${item.tone === "danger" ? " text-danger" : ""}${item.tone === "warning" ? " text-warning" : ""}`}
                disabled={item.disabled || busy}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon ? <i className={`bx ${item.icon} me-2`} /> : null}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AdminSectionCard({
  title,
  description,
  icon,
  tone = "primary",
  href,
  actionLabel,
  hidden,
}: {
  title: string;
  description: string;
  icon: string;
  tone?: AdminLabelTone;
  href: string;
  actionLabel: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="col-12 col-sm-6 col-xl-4">
      <div className="card settings-admin-overview-card">
        <div className="card-body d-flex flex-column">
          <div className="d-flex align-items-start gap-3 mb-3">
            <span className="settings-admin-stat-icon rounded">
              <span className={`avatar-initial rounded ${adminLabelToneClass(tone)}`}>
                <i className={`bx ${icon}`} />
              </span>
            </span>
            <div>
              <h2 className="h6 mb-1">{title}</h2>
              <p className="small text-muted mb-0">{description}</p>
            </div>
          </div>
          <Link href={href} className="btn btn-sm btn-primary mt-auto align-self-start">
            {actionLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-5">
      <span className="avatar avatar-lg mb-3">
        <span className="avatar-initial rounded bg-label-secondary">
          <i className="bx bx-info-circle fs-3" />
        </span>
      </span>
      <h3 className="h6">{title}</h3>
      <p className="text-muted small mb-3">{description}</p>
      {action}
    </div>
  );
}
