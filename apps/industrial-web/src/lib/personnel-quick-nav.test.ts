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

  it("accepts company-drivers, ppe-allowance, and archived aliases", () => {
    expect(parsePersonnelQuickView("company-drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("drivers")).toBe("company-drivers");
    expect(parsePersonnelQuickView("ppe-allowance")).toBe("ppe-allowance");
    expect(parsePersonnelQuickView("ppe")).toBe("ppe-allowance");
    expect(parsePersonnelQuickView("archived")).toBe("archived");
  });
});

describe("personnelOffPageLinks", () => {
  it("returns destinations that are not current, with PPE next to company drivers", () => {
    expect(personnelOffPageLinks("dashboard").map((l) => l.id)).toEqual([
      "company-drivers",
      "ppe-allowance",
      "archived",
    ]);
    expect(personnelOffPageLinks("company-drivers").map((l) => l.id)).toEqual([
      "dashboard",
      "ppe-allowance",
      "archived",
    ]);
    expect(personnelOffPageLinks("ppe-allowance").map((l) => l.id)).toEqual([
      "dashboard",
      "company-drivers",
      "archived",
    ]);
    expect(personnelOffPageLinks("archived").map((l) => l.id)).toEqual([
      "dashboard",
      "company-drivers",
      "ppe-allowance",
    ]);
  });

  it("covers every quick link exactly once across off-page sets", () => {
    expect(PERSONNEL_QUICK_LINKS).toHaveLength(4);
    for (const link of PERSONNEL_QUICK_LINKS) {
      const others = personnelOffPageLinks(link.id);
      expect(others).toHaveLength(3);
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
    expect(personnelListQueryForView("archived")).toEqual({ archived: "true" });
  });
});

describe("personnelDirectoryTitle", () => {
  it("labels each view", () => {
    expect(personnelDirectoryTitle("dashboard")).toBe("Personnel Directory");
    expect(personnelDirectoryTitle("company-drivers")).toBe("Company Drivers");
    expect(personnelDirectoryTitle("ppe-allowance")).toBe("PPE Allowance");
    expect(personnelDirectoryTitle("archived")).toBe("Archived Personnel");
  });
});
