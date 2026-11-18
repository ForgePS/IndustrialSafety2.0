import type { ReactNode } from "react";
import type { ForgeShellNavProps } from "./types.js";
import { isNavActive } from "./types.js";

export function ForgeSidebar({
  brand,
  brandMark = "F",
  productLabel,
  session,
  groups,
  activePath,
  renderLink,
  onNavigate,
  open,
  footer,
}: ForgeShellNavProps & {
  brand: string;
  brandMark?: string;
  productLabel?: string;
  session?: ReactNode;
  open?: boolean;
  footer?: ReactNode;
}) {
  return (
    <aside
      className={["forge-sidebar", open ? "is-open" : ""].filter(Boolean).join(" ")}
      aria-label="Primary"
    >
      <div className="forge-sidebar__brand">
        <span className="forge-sidebar__brand-mark" aria-hidden>
          {brandMark}
        </span>
        <span>
          {brand}
          {productLabel ? (
            <>
              <br />
              <span
                style={{
                  fontSize: "var(--forge-text-xs)",
                  fontWeight: 500,
                  color: "var(--forge-color-muted)",
                }}
              >
                {productLabel}
              </span>
            </>
          ) : null}
        </span>
      </div>
      {session ? <div className="forge-sidebar__session">{session}</div> : null}
      {groups.map((group) => (
        <div key={group.id}>
          <p className="forge-menu-heading">{group.label}</p>
          <nav aria-label={group.label}>
            {group.items.map((item) => {
              const active = isNavActive(activePath, item.route);
              const linkProps: Parameters<ForgeShellNavProps["renderLink"]>[0] = {
                href: item.route,
                className: active ? "forge-nav-link is-active" : "forge-nav-link",
                children: item.label,
              };
              if (active) linkProps["aria-current"] = "page";
              if (onNavigate) linkProps.onClick = onNavigate;
              return <div key={item.id}>{renderLink(linkProps)}</div>;
            })}
          </nav>
        </div>
      ))}
      {footer}
    </aside>
  );
}
