"use client";

type Props = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
};

/** Sneat-style module page header (matches Incidents workspace). */
export function ModuleWorkspaceHeader({
  id,
  eyebrow,
  title,
  description,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-uppercase text-primary fw-semibold small mb-1">{eyebrow}</p>
        ) : null}
        <h4 className="mb-1" id={id}>
          {title}
        </h4>
        {description ? <p className="text-muted mb-0">{description}</p> : null}
      </div>
      {onRefresh ? (
        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <i className="bx bx-refresh me-1" />
          {refreshing ? "Loading…" : "Refresh"}
        </button>
      ) : null}
    </div>
  );
}
