"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type FieldAction = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  icon: string;
  match: RegExp;
};

const FIELD_ACTIONS: FieldAction[] = [
  {
    id: "incident",
    label: "Report incident",
    shortLabel: "Incident",
    href: "/modules/incidents#ops-create",
    icon: "bx-error",
    match: /\/modules\/incidents/,
  },
  {
    id: "inspection",
    label: "Start inspection",
    shortLabel: "Inspect",
    href: "/modules/inspections#ops-create",
    icon: "bx-check-shield",
    match: /\/modules\/inspections/,
  },
  {
    id: "observation",
    label: "Log observation",
    shortLabel: "Observe",
    href: "/modules/observations#ops-create",
    icon: "bx-show",
    match: /\/modules\/observations/,
  },
  {
    id: "loto",
    label: "LOTO procedure",
    shortLabel: "LOTO",
    href: "/modules/lockout-tagout",
    icon: "bx-lock-alt",
    match: /\/modules\/(loto|lockout-tagout)/,
  },
];

/**
 * Mobile-only sticky field actions — reachable thumbs for plant-floor workflows.
 */
export function FieldQuickBar() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="ind-field-bar d-md-none" aria-label="Field quick actions">
      <ul className="ind-field-bar__list">
        {FIELD_ACTIONS.map((action) => {
          const active = action.match.test(pathname);
          return (
            <li key={action.id}>
              <Link
                href={action.href}
                className={`ind-field-bar__item${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <i className={`bx ${action.icon}`} aria-hidden />
                <span>{action.shortLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { FIELD_ACTIONS };
