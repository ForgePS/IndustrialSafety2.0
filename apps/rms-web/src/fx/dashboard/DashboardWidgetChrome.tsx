import type { ReactNode } from "react";

export function DashboardWidgetHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="rms-fx-widget__header">
      <h3 className="rms-fx-widget__title">{title}</h3>
      {actions ? <div className="rms-fx-widget__actions">{actions}</div> : null}
    </header>
  );
}

export function DashboardWidgetBody({ children }: { children: ReactNode }) {
  return <div className="rms-fx-widget__body">{children}</div>;
}

export function DashboardWidgetFooter({
  timestamp,
  href,
  linkLabel,
}: {
  timestamp?: string | null;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <footer className="rms-fx-widget__footer">
      <span>{timestamp ? `Updated ${timestamp}` : "Updated —"}</span>
      {href && linkLabel ? (
        <a className="rms-fx-widget__link" href={href}>
          {linkLabel}
        </a>
      ) : (
        <span />
      )}
    </footer>
  );
}
