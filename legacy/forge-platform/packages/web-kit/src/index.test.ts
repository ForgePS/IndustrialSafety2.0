import { describe, expect, it } from "vitest";
import {
  buildListQuery,
  filterBySearch,
  pageRange,
  paginate,
  sortByField,
  toIfMatch,
  totalPages,
} from "./index.js";

describe("api helpers", () => {
  it("formats If-Match from record version", () => {
    expect(toIfMatch(42)).toBe('W/"42"');
  });
});

describe("list controls", () => {
  it("paginates items", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });

  it("filters by search keys", () => {
    const rows = [{ name: "Alpha" }, { name: "Beta" }];
    expect(filterBySearch(rows, "alp", [(row) => row.name])).toEqual([{ name: "Alpha" }]);
  });

  it("sorts by configured field", () => {
    const rows = [{ n: 2 }, { n: 1 }];
    expect(sortByField(rows, "n", { n: (row) => row.n }).map((row) => row.n)).toEqual([1, 2]);
  });

  it("builds server list query", () => {
    expect(buildListQuery({ page: 2, pageSize: 25, search: "fire", filter: "DRAFT" })).toEqual({
      page: "2",
      pageSize: "25",
      search: "fire",
      filter: "DRAFT",
    });
  });

  it("computes page range and totals", () => {
    expect(pageRange(2, 25, 60)).toEqual({ from: 26, to: 50 });
    expect(totalPages(60, 25)).toBe(3);
  });
});
