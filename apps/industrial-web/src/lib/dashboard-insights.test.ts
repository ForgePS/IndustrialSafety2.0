import { describe, expect, it } from "vitest";
import { aggregateInspectionsBySite } from "./dashboard-insights";

describe("aggregateInspectionsBySite", () => {
  it("groups by site name and sorts by count", () => {
    const sites = aggregateInspectionsBySite([
      { id: "1", siteName: "Plant A" },
      { id: "2", site: "Plant B" },
      { id: "3", siteName: "Plant A" },
      { id: "4" },
    ]);
    expect(sites).toEqual([
      { label: "Plant A", count: 2 },
      { label: "Plant B", count: 1 },
      { label: "Unassigned site", count: 1 },
    ]);
  });

  it("resolves siteId via lookup map", () => {
    const sites = aggregateInspectionsBySite(
      [{ id: "1", siteId: "abc" }],
      new Map([["abc", "North Yard"]]),
    );
    expect(sites).toEqual([{ label: "North Yard", count: 1 }]);
  });
});
