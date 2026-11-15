import { describe, expect, it } from "vitest";
import { searchQuerySchema, SEARCH_ENTITY_TYPES, SEARCH_GROUP_LABELS } from "./search-domain.js";

describe("search-domain (MK-S18)", () => {
  it("parses search query", () => {
    const parsed = searchQuerySchema.parse({ q: "acme" });
    expect(parsed.limitPerType).toBe(8);
    expect(SEARCH_ENTITY_TYPES).toContain("tenant");
    expect(SEARCH_GROUP_LABELS.facility).toBe("Facilities");
  });

  it("rejects empty query", () => {
    expect(() => searchQuerySchema.parse({ q: "  " })).toThrow();
  });
});
