"use client";

import styles from "../app/page.module.css";

type ListControlsProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  sort: string;
  sortOptions: Array<{ value: string; label: string }>;
  onSortChange: (value: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  filter?: string;
  filterOptions?: Array<{ value: string; label: string }>;
  onFilterChange?: (value: string) => void;
  filterLabel?: string;
};

export function ListControls({
  search,
  onSearchChange,
  searchLabel = "Search",
  sort,
  sortOptions,
  onSortChange,
  page,
  pageSize,
  total,
  onPageChange,
  filter,
  filterOptions,
  onFilterChange,
  filterLabel = "Filter",
}: ListControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={styles.listControls}>
      <div className={styles.formRow}>
        <label htmlFor="list-search">{searchLabel}</label>
        <input
          id="list-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Type to filter…"
        />
      </div>
      {filterOptions && onFilterChange ? (
        <div className={styles.formRow}>
          <label htmlFor="list-filter">{filterLabel}</label>
          <select
            id="list-filter"
            value={filter ?? ""}
            onChange={(e) => onFilterChange(e.target.value)}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className={styles.formRow}>
        <label htmlFor="list-sort">Sort</label>
        <select id="list-sort" value={sort} onChange={(event) => onSortChange(event.target.value)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.pagination}>
        <span className={styles.muted}>
          {from}–{to} of {total}
        </span>
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className={styles.muted}>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className={styles.buttonSecondary}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function filterBySearch<T>(
  items: T[],
  search: string,
  keys: Array<(item: T) => string>,
): T[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => keys.some((key) => key(item).toLowerCase().includes(needle)));
}

export function sortByField<T>(
  items: T[],
  sort: string,
  fields: Record<string, (item: T) => string | number>,
): T[] {
  const accessor = fields[sort];
  if (!accessor) return items;
  return [...items].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  });
}
