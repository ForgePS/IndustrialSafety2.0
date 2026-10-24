import type { ReactNode } from "react";
import type { ForgeLinkRender } from "../shell/types.js";

export function ForgeMetricCard({
  label,
  value,
  hint,
  loading,
  unavailableLabel = "Not available",
}: {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  loading?: boolean;
  /** Shown when value is null/undefined (never fabricate 0). */
  unavailableLabel?: string;
}) {
  const display = loading ? "…" : value === null || value === undefined ? unavailableLabel : value;
  return (
    <article className="forge-metric-card">
      <p className="forge-metric-card__label">{label}</p>
      <p className="forge-metric-card__value">{display}</p>
      {hint ? <p className="forge-metric-card__hint">{hint}</p> : null}
    </article>
  );
}

/** Mission alias for ForgeMetricCard */
export const StatCard = ForgeMetricCard;

export function ChartCard({
  title,
  description,
  children,
  emptyLabel = "No chart data available.",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  emptyLabel?: string;
}) {
  return (
    <article className="forge-chart-card">
      <header className="forge-chart-card__header">
        <h3 className="forge-chart-card__title">{title}</h3>
        {description ? <p className="forge-chart-card__desc">{description}</p> : null}
      </header>
      <div className="forge-chart-card__body">
        {children ?? <p className="forge-muted">{emptyLabel}</p>}
      </div>
    </article>
  );
}

export function ForgeMetricGrid({ children }: { children: ReactNode }) {
  return <div className="forge-metric-grid">{children}</div>;
}

export function ForgeStatusCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail?: string;
}) {
  const tone = status.toLowerCase().replace(/\s+/g, "-");
  return (
    <article className="forge-metric-card">
      <p className="forge-metric-card__label">{title}</p>
      <p
        className="forge-metric-card__value"
        style={{ fontSize: "1.1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <span className={`forge-status-dot forge-status-dot--${tone}`} aria-hidden />
        {status}
      </p>
      {detail ? <p className="forge-metric-card__hint">{detail}</p> : null}
    </article>
  );
}

export function ForgeModuleCard({
  name,
  meta,
  href,
  renderLink,
  disabled,
  disabledReason,
}: {
  name: string;
  meta?: string;
  href: string;
  renderLink?: ForgeLinkRender;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const body = (
    <>
      <p className="forge-module-card__name">{name}</p>
      {meta ? <p className="forge-module-card__meta">{meta}</p> : null}
      {disabled && disabledReason ? (
        <p className="forge-module-card__meta">{disabledReason}</p>
      ) : null}
    </>
  );
  if (disabled) {
    return (
      <div className="forge-module-card" aria-disabled="true" style={{ opacity: 0.55 }}>
        {body}
      </div>
    );
  }
  if (renderLink) {
    return (
      <>
        {renderLink({
          href,
          className: "forge-module-card",
          children: body,
        })}
      </>
    );
  }
  return (
    <a className="forge-module-card" href={href}>
      {body}
    </a>
  );
}

export function ForgeModuleGrid({ children }: { children: ReactNode }) {
  return <div className="forge-module-grid">{children}</div>;
}

/** Mission alias for ForgeModuleCard */
export const ModuleCard = ForgeModuleCard;

export function ForgeStepper({
  steps,
  activeIndex,
}: {
  steps: Array<{ id: string; label: string }>;
  activeIndex: number;
}) {
  return (
    <ol className="forge-stepper" aria-label="Progress">
      {steps.map((step, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={step.id}
            className={[
              "forge-stepper__step",
              active ? "is-active" : "",
              complete ? "is-complete" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span aria-hidden>{complete ? "✓" : index + 1}</span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
