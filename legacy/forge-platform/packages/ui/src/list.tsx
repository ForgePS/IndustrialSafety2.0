"use client";

import type { ChangeEvent, ReactNode } from "react";

function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  return {
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

export function SearchInput({
  id = "forge-search",
  label = "Search",
  value,
  onChange,
  placeholder = "Search…",
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="forge-search-input" htmlFor={id}>
      <span className="forge-search-input__label">{label}</span>
      <input
        id={id}
        className="forge-input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </label>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="forge-filter-bar">{children}</div>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = totalPages(total, pageSize);
  const range = pageRange(page, pageSize, total);
  return (
    <div className="forge-pagination">
      <span className="forge-pagination__meta">
        {range.from}-{range.to} of {total}
      </span>
      <div className="forge-pagination__controls">
        <button
          type="button"
          className="forge-btn forge-btn--outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="forge-pagination__page">
          Page {page} / {pages}
        </span>
        <button
          type="button"
          className="forge-btn forge-btn--outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
