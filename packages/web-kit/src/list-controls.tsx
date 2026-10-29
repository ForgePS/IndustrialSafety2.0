import { useCallback, useState } from "react";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export type ServerListQuery = {
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  filter?: string;
};

export type ServerListState = ServerListQuery & {
  total: number;
  loading: boolean;
  error: string | null;
};

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

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  return {
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

export function buildListQuery(
  state: Pick<ServerListQuery, "page" | "pageSize" | "search" | "filter">,
): Record<string, string> {
  const query: Record<string, string> = {
    page: String(state.page),
    pageSize: String(state.pageSize),
  };
  if (state.search.trim()) {
    query.search = state.search.trim();
  }
  if (state.filter?.trim()) {
    query.filter = state.filter.trim();
  }
  return query;
}

export function useServerListControls(options?: { pageSize?: number; defaultSort?: string }) {
  const pageSize = options?.pageSize ?? 25;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(options?.defaultSort ?? "");
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);

  const resetPage = useCallback(() => setPage(1), []);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const onSortChange = useCallback((value: string) => {
    setSort(value);
    setPage(1);
  }, []);

  const onFilterChange = useCallback((value: string) => {
    setFilter(value || undefined);
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    search,
    sort,
    filter,
    total,
    setPage,
    setTotal,
    onSearchChange,
    onSortChange,
    onFilterChange,
    resetPage,
    query: buildListQuery({
      page,
      pageSize,
      search,
      ...(filter ? { filter } : {}),
    }),
    range: pageRange(page, pageSize, total),
    pages: totalPages(total, pageSize),
  };
}

export type ListControlsLabels = {
  search?: string;
  filter?: string;
  sort?: string;
};

export type ListControlsClassNames = {
  root?: string;
  row?: string;
  label?: string;
  input?: string;
  select?: string;
  pagination?: string;
  muted?: string;
  button?: string;
};

export type ListControlsProps = {
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
  classNames?: ListControlsClassNames;
};

export function ListControlsView({
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
  classNames = {},
}: ListControlsProps) {
  const pages = totalPages(total, pageSize);
  const { from, to } = pageRange(page, pageSize, total);

  return (
    <div className={classNames.root}>
      <div className={classNames.row}>
        <label className={classNames.label} htmlFor="list-search">
          {searchLabel}
        </label>
        <input
          id="list-search"
          className={classNames.input}
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Type to filter…"
        />
      </div>
      {filterOptions && onFilterChange ? (
        <div className={classNames.row}>
          <label className={classNames.label} htmlFor="list-filter">
            {filterLabel}
          </label>
          <select
            id="list-filter"
            className={classNames.select}
            value={filter ?? ""}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className={classNames.row}>
        <label className={classNames.label} htmlFor="list-sort">
          Sort
        </label>
        <select
          id="list-sort"
          className={classNames.select}
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className={classNames.pagination}>
        <span className={classNames.muted}>
          {from}–{to} of {total}
        </span>
        <button
          type="button"
          className={classNames.button}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className={classNames.muted}>
          Page {page} / {pages}
        </span>
        <button
          type="button"
          className={classNames.button}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
