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

  it("accepts company-drivers, ppe-allowance, first-aid, and archived aliases", () => {
    expect(parsePersonnelQuickView("company-drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("ppe-allowance")).toBe("ppe-allowance");
    expect(parsePersonnelQuickView("ppe")).toBe("ppe-allowance");
    expect(parsePersonnelQuickView("first-aid")).toBe("first-aid");
    expect(parsePersonnelQuickView("cpr")).toBe("first-aid");
    expect(parsePersonnelQuickView("archived")).toBe("archived");
  });
});

describe("personnelOffPageLinks", () => {
  it("returns destinations that are not current", () => {
    expect(personnelOffPageLinks("dashboard").map((l) => l.id)).toEqual([
      "company-drivers",
      "ppe-allowance",
      "first-aid",
      "archived",
    ]);
    expect(personnelOffPageLinks("first-aid").map((l) => l.id)).toEqual([
      "dashboard",
      "company-drivers",
      "ppe-allowance",
      "archived",
    ]);
  });

  it("covers every quick link exactly once across off-page sets", () => {
    expect(PERSONNEL_QUICK_LINKS).toHaveLength(5);
    for (const link of PERSONNEL_QUICK_LINKS) {
      const others = personnelOffPageLinks(link.id);
      expect(others).toHaveLength(4);
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
    expect(personnelListQueryForView("ppe-allowance")).toEqual({ ppeTracked: "true" });
    expect(personnelListQueryForView("first-aid")).toEqual({ firstAidTracked: "true" });
    expect(personnelListQueryForView("archived")).toEqual({ archived: "true" });
  });
});

describe("personnelDirectoryTitle", () => {
  it("labels each view", () => {
    expect(personnelDirectoryTitle("dashboard")).toBe("Personnel Directory");
    expect(personnelDirectoryTitle("company-drivers")).toBe("Company DRIVERS");
    expect(personnelDirectoryTitle("ppe-allowance")).toBe("PPE Allowance");
    expect(personnelDirectoryTitle("first-aid")).toBe("First Aid");
    expect(personnelDirectoryTitle("archived")).toBe("Archived Personnel");
  });
});
