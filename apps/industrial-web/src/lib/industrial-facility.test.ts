import { describe, expect, it } from "vitest";
import {
  ALL_FACILITIES_ID,
  facilityListQuery,
  matchSiteIdByLabel,
  matchesFacilitySelection,
  normalizeFacilityOptions,
  pickActiveFacilityId,
} from "./industrial-facility";

describe("industrial-facility", () => {
  it("normalizes industrial sites and skips archived rows", () => {
    const options = normalizeFacilityOptions({
      items: [
        { id: "b", name: "Greenville" },
        { id: "a", name: "DeWitt", status: "ACTIVE" },
        { id: "gone", name: "Old", archivedAt: "2026-01-01" },
        { id: "dead", name: "Inactive", status: "INACTIVE" },
      ],
    });
    expect(options.map((row) => row.name)).toEqual(["DeWitt", "Greenville"]);
  });

  it("reads a bare facilities catalog array", () => {
    expect(
      normalizeFacilityOptions([{ id: "f1", name: "Primary Facility", facilityKey: "default" }]),
    ).toEqual([{ id: "f1", name: "Primary Facility" }]);
  });

  it("defaults to all locations when several sites exist", () => {
    const options = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    expect(pickActiveFacilityId(options, null)).toBe(ALL_FACILITIES_ID);
    expect(pickActiveFacilityId(options, "b")).toBe("b");
    expect(pickActiveFacilityId([{ id: "a", name: "A" }], null)).toBe("a");
  });

  it("adds siteId to list queries only when a facility is selected", () => {
    expect(facilityListQuery(ALL_FACILITIES_ID)).toEqual({});
    expect(facilityListQuery("site-1")).toEqual({ siteId: "site-1", facilityId: "site-1" });
  });

  it("matches roster rows by site id or location label", () => {
    const options = [{ id: "s1", name: "PRM Greenville MS" }];
    expect(matchesFacilitySelection({ siteId: "s1" }, "s1", options)).toBe(true);
    expect(matchesFacilitySelection({ siteId: "other", siteLabel: "PRM Greenville MS" }, "s1", options)).toBe(
      true,
    );
    expect(matchesFacilitySelection({ siteId: "other" }, "s1", options)).toBe(false);
    expect(matchesFacilitySelection({ siteId: "other" }, ALL_FACILITIES_ID, options)).toBe(true);
  });

  it("resolves imported location labels to facility ids", () => {
    const options = [
      { id: "s1", name: "PRM Greenville MS" },
      { id: "s2", name: "DeWitt" },
    ];
    expect(matchSiteIdByLabel(options, "GREENVILLE")).toBe("s1");
    expect(matchSiteIdByLabel(options, "DeWitt")).toBe("s2");
    expect(matchSiteIdByLabel(options, "")).toBeUndefined();
  });
});
