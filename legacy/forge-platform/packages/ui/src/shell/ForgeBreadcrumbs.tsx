import type { ForgeLinkRender } from "./types.js";

export type ForgeBreadcrumbItem = { label: string; href?: string };

export function ForgeBreadcrumbs({
  items,
  renderLink,
}: {
  items: ForgeBreadcrumbItem[];
  renderLink?: ForgeLinkRender;
}) {
  return (
    <nav className="forge-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} style={{ display: "inline-flex", gap: "0.35rem" }}>
            {index > 0 ? <span aria-hidden>/</span> : null}
            {last || !item.href ? (
              <span aria-current={last ? "page" : undefined}>{item.label}</span>
            ) : renderLink ? (
              renderLink({ href: item.href, children: item.label })
            ) : (
              <a href={item.href}>{item.label}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
