import { apiGetResult } from "@forge/web-kit";
import { toRosterPeople, type RosterPerson } from "./personnel-directory";

/** Personnel list API allows up to 1000 per page — use that to avoid offset gaps. */
const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGES = 50;

type ListPayload = { items?: unknown[] };

function appendUniqueRows(rows: unknown[], items: unknown[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null) {
      const id = String((row as Record<string, unknown>).id ?? "").trim();
      if (id) seen.add(id);
    }
  }
  for (const row of items) {
    if (typeof row !== "object" || row === null) continue;
    const id = String((row as Record<string, unknown>).id ?? "").trim();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    rows.push(row);
  }
}

export async function fetchAllPersonnelRows(opts: {
  listPath?: string;
  pageSize?: number;
  maxPages?: number;
  query?: Record<string, string | undefined>;
  /** Called after each page so the UI can paint before the full crawl finishes. */
  onPage?: (partial: { people: RosterPerson[]; total: number; done: boolean }) => void;
}): Promise<{ people: RosterPerson[]; total: number }> {
  const listPath = opts.listPath ?? "/api/v1/industrial/personnel";
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const rows: unknown[] = [];
  let reportedTotal = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await apiGetResult<ListPayload>(listPath, {
      query: {
        page: String(page),
        pageSize: String(pageSize),
        ...opts.query,
      },
    });
    const items = Array.isArray(result.data.items) ? result.data.items : [];
    appendUniqueRows(rows, items);
    reportedTotal = Math.max(result.meta?.pagination?.total ?? 0, reportedTotal);

    const people = toRosterPeople(rows);
    const total = Math.max(reportedTotal, people.length);
    const done =
      items.length === 0 ||
      (reportedTotal > 0 && rows.length >= reportedTotal) ||
      (items.length < pageSize && (reportedTotal <= 0 || rows.length >= reportedTotal));

    opts.onPage?.({ people, total, done });

    if (done) break;
  }

  const people = toRosterPeople(rows);
  const total = Math.max(reportedTotal, people.length);
  return { people, total };
}
