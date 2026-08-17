import { describe, expect, it } from "vitest";
import {
  matchesRosterQuery,
  personEditHref,
  personFileHref,
  rosterInitials,
  rosterMeta,
  rosterSubtitle,
  sortRosterPeople,
  statusBadgeClass,
  toRosterPeople,
  toRosterPerson,
  type RosterPerson,
} from "./personnel-directory";

const base = {
  id: "p1",
  displayName: "Aaliyah Z Shelton",
  firstName: "Aaliyah",
  lastName: "Shelton",
  jobTitle: "Quality Tech",
  departmentName: "Quality",
  employeeNumber: "EMP-23344",
  email: "az@example.com",
  siteId: "site-1",
  siteLabel: "",
  status: "Active",
  isCompanyDriver: false,
};

describe("toRosterPerson", () => {
  it("normalizes a flat list row", () => {
    expect(toRosterPerson({ ...base })).toEqual(base);
  });

  it("drops rows without an id", () => {
    expect(toRosterPerson({ displayName: "No Id" })).toBeNull();
  });

  it("falls back to preferred/first plus last name", () => {
    const person = toRosterPerson({
      id: "p2",
      preferredName: "Sal",
      firstName: "Salvador",
      lastName: "Ruiz",
    });
    expect(person?.displayName).toBe("Sal Ruiz");
  });

  it("treats missing fields as empty strings and driver as boolean", () => {
    const person = toRosterPerson({ id: "p3", isCompanyDriver: "true" });
    expect(person).toEqual({
      id: "p3",
      displayName: "p3",
      firstName: "",
      lastName: "",
      jobTitle: "",
      departmentName: "",
      employeeNumber: "",
      email: "",
      siteId: "",
      siteLabel: "",
      status: "",
      isCompanyDriver: false,
    });
  });

  it("skips non-object rows in a list", () => {
    expect(toRosterPeople([{ ...base }, null, "x", 4])).toHaveLength(1);
  });
});

describe("card labels", () => {
  it("uses first letters of the first two words", () => {
    expect(rosterInitials("Aaliyah Z Shelton")).toBe("AZ");
    expect(rosterInitials("Addie Finlay Jr.")).toBe("AF");
    expect(rosterInitials("Prince")).toBe("PR");
    expect(rosterInitials("   ")).toBe("?");
  });

  it("prefers job title, then department", () => {
    expect(rosterSubtitle({ ...base })).toBe("Quality Tech");
    expect(rosterSubtitle({ ...base, jobTitle: "" })).toBe("Quality");
    expect(rosterSubtitle({ ...base, jobTitle: "", departmentName: "" })).toBe("Team member");
  });

  it("joins employee number with site, falling back to department", () => {
    expect(rosterMeta({ ...base }, "Stuttgart")).toBe("EMP-23344 · Stuttgart");
    expect(rosterMeta({ ...base })).toBe("EMP-23344 · Quality");
    expect(rosterMeta({ ...base, employeeNumber: "", departmentName: "" })).toBe("");
  });

  it("maps status to a Sneat label class", () => {
    expect(statusBadgeClass("Active")).toBe("bg-label-success");
    expect(statusBadgeClass("leave of absence")).toBe("bg-label-warning");
    expect(statusBadgeClass("Terminated")).toBe("bg-label-danger");
    expect(statusBadgeClass("Seasonal")).toBe("bg-label-secondary");
  });
});

describe("sortRosterPeople", () => {
  function person(fields: Partial<RosterPerson> & { id: string }): RosterPerson {
    return { ...base, displayName: fields.id, ...fields };
  }

  const roster = [
    person({ id: "c", firstName: "Cody", lastName: "Alvarez", displayName: "Cody Alvarez" }),
    person({ id: "a", firstName: "aaron", lastName: "Tucker", displayName: "aaron Tucker" }),
    person({ id: "b", firstName: "Bea", lastName: "Nguyen", displayName: "Bea Nguyen" }),
  ];

  it("alphabetizes by first name, ignoring case", () => {
    expect(sortRosterPeople(roster, "firstName").map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("alphabetizes by last name", () => {
    expect(sortRosterPeople(roster, "lastName").map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks ties on the other name", () => {
    const smiths = [
      person({ id: "2", firstName: "Zoe", lastName: "Smith", displayName: "Zoe Smith" }),
      person({ id: "1", firstName: "Abe", lastName: "Smith", displayName: "Abe Smith" }),
    ];
    expect(sortRosterPeople(smiths, "lastName").map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("falls back to words of the display name when columns are blank", () => {
    const mixed = [
      person({ id: "x", firstName: "", lastName: "", displayName: "Wanda Zeller" }),
      person({ id: "y", firstName: "", lastName: "", displayName: "Amos Baker" }),
    ];
    expect(sortRosterPeople(mixed, "firstName").map((p) => p.id)).toEqual(["y", "x"]);
    expect(sortRosterPeople(mixed, "lastName").map((p) => p.id)).toEqual(["y", "x"]);
  });

  it("does not mutate the input", () => {
    const input = [...roster];
    sortRosterPeople(input, "firstName");
    expect(input.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });
});

describe("personFileHref", () => {
  it("passes the id as a query param for the static export route", () => {
    expect(personFileHref("a b/c")).toBe("/modules/personnel/person/?id=a%20b%2Fc");
  });
});

describe("personEditHref", () => {
  it("points at the dedicated edit screen", () => {
    expect(personEditHref("abc")).toBe("/modules/personnel/edit/?id=abc");
  });
});

describe("matchesRosterQuery", () => {
  it("matches name, title, employee number, email and site", () => {
    expect(matchesRosterQuery({ ...base }, "shelton")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "quality tech")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "23344")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "az@")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "stuttgart", "Stuttgart")).toBe(true);
  });

  it("keeps everything when the query is blank", () => {
    expect(matchesRosterQuery({ ...base }, "  ")).toBe(true);
  });

  it("excludes non-matches", () => {
    expect(matchesRosterQuery({ ...base }, "welder")).toBe(false);
  });

  it("narrows on each keystroke as a partial name is typed", () => {
    for (const partial of ["a", "aa", "aal", "aaliyah", "aaliyah s"]) {
      expect(matchesRosterQuery({ ...base }, partial)).toBe(true);
    }
  });

  it("ignores word order and punctuation", () => {
    expect(matchesRosterQuery({ ...base }, "shelton aaliyah")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "shelton, aaliyah")).toBe(true);
    expect(matchesRosterQuery({ ...base }, "emp-23344")).toBe(true);
  });

  it("does not match the middle of a name unless widened", () => {
    const brandon = { ...base, displayName: "Brandon D Bratchie", firstName: "Brandon", lastName: "Bratchie" };
    expect(matchesRosterQuery(brandon, "don")).toBe(false);
    expect(matchesRosterQuery(brandon, "don", undefined, true)).toBe(true);
  });
});
