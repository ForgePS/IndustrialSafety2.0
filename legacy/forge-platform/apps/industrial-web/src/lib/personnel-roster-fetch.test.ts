import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetResult } = vi.hoisted(() => ({
  apiGetResult: vi.fn(),
}));

vi.mock("@forge/web-kit", () => ({
  apiGetResult,
}));

import { fetchAllPersonnelRows } from "./personnel-roster-fetch";

describe("fetchAllPersonnelRows", () => {
  beforeEach(() => {
    apiGetResult.mockReset();
  });

  it("keeps paging when the API caps pageSize below the requested size", async () => {
    apiGetResult
      .mockResolvedValueOnce({
        data: { items: Array.from({ length: 500 }, (_, i) => ({ id: `p-${i}` })) },
        meta: { pagination: { total: 967 } },
      })
      .mockResolvedValueOnce({
        data: { items: Array.from({ length: 467 }, (_, i) => ({ id: `p-${500 + i}` })) },
        meta: { pagination: { total: 967 } },
      });

    const roster = await fetchAllPersonnelRows({ pageSize: 1000, maxPages: 5 });
    expect(roster.people).toHaveLength(967);
    expect(roster.total).toBe(967);
    expect(apiGetResult).toHaveBeenCalledTimes(2);
  });
});
