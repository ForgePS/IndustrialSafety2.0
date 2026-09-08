"use client";

import { useEffect, useId, useRef, useState } from "react";

export type WorkspaceMenuEntry =
  | { type: "action"; id: string; label: string; disabled?: boolean; danger?: boolean; onClick: () => void }
  | { type: "label"; id: string; label: string }
  | { type: "divider"; id: string };

type Props = {
  ariaLabel: string;
  entries: WorkspaceMenuEntry[];
};

/** Overflow menu for workspace cards. */
export function WorkspaceCardMenu({ ariaLabel, entries }: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className="btn btn-sm btn-icon rounded-pill text-muted"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <i className="bx bx-dots-horizontal-rounded bx-sm" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          className="dropdown-menu dropdown-menu-end show"
          id={menuId}
          role="menu"
          style={{ minWidth: "12rem" }}
        >
          {entries.map((entry) => {
            if (entry.type === "divider") {
              return (
                <li key={entry.id}>
                  <hr className="dropdown-divider" />
                </li>
              );
            }
            if (entry.type === "label") {
              return (
                <li key={entry.id} role="presentation">
                  <span className="dropdown-item-text small text-muted py-1">{entry.label}</span>
                </li>
              );
            }
            return (
              <li key={entry.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`dropdown-item${entry.danger ? " text-danger" : ""}`}
                  disabled={entry.disabled}
                  onClick={() => {
                    setOpen(false);
                    entry.onClick();
                  }}
                >
                  {entry.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
