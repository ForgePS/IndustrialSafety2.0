import type { ReactNode } from "react";

export function ForgePageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div>
      {breadcrumbs}
      <div className="forge-page-header">
        <div>
          <h1 className="forge-page-header__title">{title}</h1>
          {subtitle ? <p className="forge-page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="forge-page-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function ForgePageActions({ children }: { children: ReactNode }) {
  return <div className="forge-page-actions">{children}</div>;
}
