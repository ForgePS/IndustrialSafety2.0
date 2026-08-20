"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  title?: string;
  searchId: string;
  searchLabel?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  statusId?: string;
  statusValue?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: Array<{ value: string; label: string }>;
  chips?: FilterChip[];
  onClearAll?: () => void;
  onSubmit: () => void;
  extraFields?: ReactNode;
  children?: ReactNode;
};

/**
 * Shared Industrial filter strip — desktop panel, mobile collapsible drawer.
 */
export function FilterPanel({
  title = "Filters",
  searchId,
  searchLabel = "Search",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  statusId,
  statusValue,
  onStatusChange,
  statusOptions,
  chips = [],
  onClearAll,
  onSubmit,
  extraFields,
  children,
}: Props) {
  const drawerId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = chips.length;

  useEffect(() => {
    function syncDesktop() {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setMobileOpen(true);
      }
    }
    syncDesktop();
    window.addEventListener("resize", syncDesktop);
    return () => window.removeEventListener("resize", syncDesktop);
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches) {
      setMobileOpen(false);
    }
  }

  return (
    <div className="card mb-4 ind-filter-panel">
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h5 className="card-title mb-0">{title}</h5>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary d-md-none ind-filter-toggle"
          aria-expanded={mobileOpen}
          aria-controls={drawerId}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? "Hide filters" : "Show filters"}
          {activeCount > 0 ? (
            <span className="badge bg-label-primary ms-2">{activeCount}</span>
          ) : null}
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="px-3 pt-3 d-md-none" aria-label="Active filters">
          <div className="d-flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={chip.onRemove}
              >
                {chip.label} ×
              </button>
            ))}
            {onClearAll ? (
              <button type="button" className="btn btn-sm btn-link" onClick={onClearAll}>
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        id={drawerId}
        className={`card-body pt-3 ind-filter-body${mobileOpen ? " is-open" : ""}`}
      >
        <form
          className="row g-3 align-items-end"
          onSubmit={handleSubmit}
          aria-label={title}
          data-unsaved-ignore
        >
          <div className={statusId && onStatusChange ? "col-md-5" : "col-md-8"}>
            <label className="form-label" htmlFor={searchId}>
              {searchLabel}
            </label>
            <input
              id={searchId}
              className="form-control form-control-sm"
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          {statusId && onStatusChange ? (
            <div className="col-md-3">
              <label className="form-label" htmlFor={statusId}>
                Status
              </label>
              {statusOptions && statusOptions.length > 0 ? (
                <select
                  id={statusId}
                  className="form-select form-select-sm"
                  value={statusValue ?? ""}
                  onChange={(e) => onStatusChange(e.target.value)}
                >
                  <option value="">All</option>
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={statusId}
                  className="form-control form-control-sm"
                  type="text"
                  value={statusValue ?? ""}
                  onChange={(e) => onStatusChange(e.target.value)}
                  placeholder="Optional"
                  autoComplete="off"
                />
              )}
            </div>
          ) : null}
          {extraFields}
          <div className="col-md-4 d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm flex-grow-1 flex-md-grow-0">
              Apply filters
            </button>
            {onClearAll ? (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm flex-grow-1 flex-md-grow-0"
                onClick={onClearAll}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </form>

        {chips.length > 0 ? (
          <div className="d-none d-md-flex flex-wrap gap-2 mt-3" aria-label="Active filters">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={chip.onRemove}
              >
                {chip.label} ×
              </button>
            ))}
            {onClearAll ? (
              <button type="button" className="btn btn-sm btn-link" onClick={onClearAll}>
                Clear all
              </button>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
