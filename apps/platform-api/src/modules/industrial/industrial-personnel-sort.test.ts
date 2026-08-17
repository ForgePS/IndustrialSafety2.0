import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { IndustrialDomainService } from "./industrial-domain.service.js";

/**
 * The roster grid pages 48 people at a time, so alphabetical order has to come
 * from the query rather than the client. These assert the ORDER BY terms the
 * directory relies on: case-insensitive, display-name fallback for imported
 * rows, and an id tiebreak so paging cannot repeat or skip a person.
 */
type Sorter = { personnelOrderBy(sort: string): unknown[] };

const dialect = new PgDialect();

function orderTerms(sort: string): string[] {
  const db = { transaction: vi.fn() } as never;
  const service = new IndustrialDomainService(db) as unknown as Sorter;
  return service.personnelOrderBy(sort).map((term) => dialect.sqlToQuery(sql`${term}`).sql);
}

describe("personnel roster ordering", () => {
  it("sorts by first name with a last name tiebreak", () => {
    const [primary, secondary, tiebreak] = orderTerms("firstName");
    expect(primary).toContain("first_name");
    expect(primary).toContain("lower");
    expect(secondary).toContain("last_name");
    expect(tiebreak).toContain('"id"');
  });

  it("sorts by last name with a first name tiebreak", () => {
    const [primary, secondary] = orderTerms("lastName");
    expect(primary).toContain("last_name");
    expect(secondary).toContain("first_name");
  });

  it("falls back to the matching word of the display name", () => {
    const [byFirst] = orderTerms("firstName");
    expect(byFirst).toContain("split_part");
    expect(byFirst).toContain("display_name");
    const [byLast] = orderTerms("lastName");
    expect(byLast).toContain("regexp_replace");
    expect(byLast).toContain("display_name");
  });

  it("keeps recently-updated-first for callers that pass no sort", () => {
    const [primary] = orderTerms("");
    expect(primary).toContain("updated_at");
    expect(primary?.toLowerCase()).toContain("desc");
    expect(orderTerms("bogus")[0]).toContain("updated_at");
  });
});
