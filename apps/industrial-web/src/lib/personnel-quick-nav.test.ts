import { describe, expect, it } from "vitest";
import {
  PERSONNEL_QUICK_LINKS,
  parsePersonnelQuickView,
  personnelDirectoryTitle,
  personnelListQueryForView,
  personnelOffPageLinks,
} from "./personnel-quick-nav";

describe("parsePersonnelQuickView", () => {
  it("defaults unknown values to dashboard", () => {
    expect(parsePersonnelQuickView(null)).toBe("dashboard");
    expect(parsePersonnelQuickView("")).toBe("dashboard");
    expect(parsePersonnelQuickView("nope")).toBe("dashboard");
  });

  it("accepts company-drivers and archived aliases", () => {
    expect(parsePersonnelQuickView("company-drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("archived")).toBe("archived");
  });
});

describe("personnelOffPageLinks", () => {
  it("returns the two destinations that are not current", () => {
    expect(personnelOffPageLinks("dashboard").map((l) => l.id)).toEqual([
      "company-drivers",
      "archived",
    ]);
    expect(personnelOffPageLinks("company-drivers").map((l) => l.id)).toEqual([
      "dashboard",
      "archived",
    ]);
    expect(personnelOffPageLinks("archived").map((l) => l.id)).toEqual([
      "dashboard",
      "company-drivers",
    ]);
  });

  it("covers every quick link exactly once across off-page sets", () => {
    expect(PERSONNEL_QUICK_LINKS).toHaveLength(3);
    for (const link of PERSONNEL_QUICK_LINKS) {
      const others = personnelOffPageLinks(link.id);
      expect(others).toHaveLength(2);
      expect(others.some((o) => o.id === link.id)).toBe(false);
    }
  });
});

describe("personnelListQueryForView", () => {
  it("adds list filters for filtered views only", () => {
    expect(personnelListQueryForView("dashboard")).toEqual({});
    expect(personnelListQueryForView("company-drivers")).toEqual({
      isCompanyDriver: "true",
    });
    expect(personnelListQueryForView("archived")).toEqual({ archived: "true" });
  });
});

describe("personnelDirectoryTitle", () => {
  it("labels each view", () => {
    expect(personnelDirectoryTitle("dashboard")).toBe("Personnel Directory");
    expect(personnelDirectoryTitle("company-drivers")).toBe("Company Drivers");
    expect(personnelDirectoryTitle("archived")).toBe("Archived Personnel");
  });
});
