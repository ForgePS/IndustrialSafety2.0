import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@forge/fx-utils";

export type FxButtonTone = "primary" | "secondary" | "danger" | "ghost";

export type FxButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: FxButtonTone;
  loading?: boolean;
};

export function FxButton({
  tone = "primary",
  loading,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: FxButtonProps) {
  return (
    <button
      type={type}
      className={cn("fx-btn", `fx-btn--${tone}`, loading && "fx-btn--loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? "Loading…" : children}
    </button>
  );
}

export type FxBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export function FxStatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: FxBadgeTone;
  children: ReactNode;
}) {
  return <span className={cn("fx-badge", `fx-badge--${tone}`)}>{children}</span>;
}

export function FxPriorityBadge({
  priority,
}: {
  priority: "low" | "normal" | "high" | "critical";
}) {
  const tone: FxBadgeTone =
    priority === "critical" || priority === "high"
      ? priority === "critical"
        ? "danger"
        : "warning"
      : priority === "normal"
        ? "info"
        : "neutral";
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return <FxStatusBadge tone={tone}>{label} priority</FxStatusBadge>;
}

export function FxCard({
  title,
  children,
  actions,
}: {
  title?: string | undefined;
  children: ReactNode;
  actions?: ReactNode | undefined;
}) {
  return (
    <section className="fx-card">
      {(title || actions) && (
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: "var(--fx-space-12)" }}
        >
          {title ? <h3 className="fx-card__title">{title}</h3> : <span />}
          {actions}
        </div>
      )}
      <div className="fx-card__body">{children}</div>
    </section>
  );
}

export function FxMetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <FxCard>
      <div className="fx-metric">
        <div className="fx-metric__label">{label}</div>
        <div className="fx-metric__value">{value}</div>
        {hint ? <p className="fx-card__body">{hint}</p> : null}
      </div>
    </FxCard>
  );
}

export function FxAlert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("fx-alert", tone !== "info" && `fx-alert--${tone}`)}
      role={tone === "danger" ? "alert" : "status"}
    >
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function FxTextField({
  id,
  label,
  hint,
  error,
  required,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="fx-field">
      <label className="fx-field__label" htmlFor={id}>
        {label}
        {required ? " (required)" : null}
      </label>
      <input
        id={id}
        className="fx-field__input"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        required={required}
        {...rest}
      />
      {hint && !error ? (
        <span id={hintId} className="fx-field__hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="fx-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function FxEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="fx-empty">
      <h2 className="fx-empty__title">{title}</h2>
      <p>{description}</p>
      {action ? <div style={{ marginTop: "var(--fx-space-16)" }}>{action}</div> : null}
    </div>
  );
}

export function FxSkeleton({
  width = "100%",
  height = "1rem",
}: {
  width?: string;
  height?: string;
}) {
  return <span className="fx-skeleton" style={{ width, height }} aria-hidden />;
}

export function FxLoadingRegion({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="fx-field__hint">{label}</span>
      <FxSkeleton height="4rem" />
    </div>
  );
}

export function FxTable({
  columns,
  rows,
  caption,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <table className="fx-table">
      <caption
        className="fx-field__hint"
        style={{ textAlign: "left", marginBottom: "var(--fx-space-8)" }}
      >
        {caption}
      </caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FxDialog({
  open,
  title,
  children,
  onClose,
  actions,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const titleId = "fx-dialog-title";
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel || !focusable?.length) return;
      const list = Array.from(focusable);
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fx-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="fx-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="fx-dialog__title">
          {title}
        </h2>
        <div>{children}</div>
        <div className="fx-dialog__actions">
          {actions ?? (
            <FxButton tone="secondary" onClick={onClose}>
              Close
            </FxButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function FxEnvBanner({ children }: { children: ReactNode }) {
  return <div className="fx-banner">{children}</div>;
}

export function FxOfflineIndicator({
  status,
  pending = 0,
}: {
  status: "online" | "degraded" | "offline" | "syncing";
  pending?: number;
}) {
  return (
    <span
      className={cn("fx-offline", status === "offline" && "fx-offline--offline")}
      aria-live="polite"
    >
      {status === "online" && "Online"}
      {status === "degraded" && "Degraded"}
      {status === "offline" && "Offline"}
      {status === "syncing" && "Syncing…"}
      {pending > 0 ? ` · ${pending} pending` : null}
    </span>
  );
}

export function FxPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="fx-card" aria-label={title}>
      <h3 className="fx-card__title">{title}</h3>
      {children}
    </section>
  );
}
