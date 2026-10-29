"use client";

import type { ReactNode } from "react";

type Props<T extends string> = {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  /** Sneat tab panel body — rendered inside `.tab-content > .tab-pane`. */
  children?: ReactNode;
  tabPanelLabel?: string;
};

/** Sneat nav-tabs + optional connected tab panel for module sub-sections. */
export function ModuleWorkspaceTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  children,
  tabPanelLabel,
}: Props<T>) {
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="nav-align-top mb-4">
      <ul className="nav nav-tabs flex-wrap" role="tablist" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <li className="nav-item" key={t.id}>
            <button
              type="button"
              role="tab"
              className={`nav-link${active === t.id ? " active" : ""}`}
              aria-selected={active === t.id}
              onClick={() => onChange(t.id)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>
      {children ? (
        <div className="tab-content">
          <div
            className="tab-pane fade show active"
            role="tabpanel"
            aria-label={tabPanelLabel ?? activeTab?.label}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
