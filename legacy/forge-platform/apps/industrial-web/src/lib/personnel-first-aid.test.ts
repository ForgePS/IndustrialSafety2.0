import { describe, expect, it } from "vitest";
import {
  filterFirstAidPeople,
  personTracksFirstAid,
  sortFirstAidPeople,
  toFirstAidPerson,
  type FirstAidPerson,
} from "./personnel-first-aid";

describe("personTracksFirstAid", () => {
  it("tracks when flag or either expiration is set", () => {
    expect(personTracksFirstAid({})).toBe(false);
    expect(personTracksFirstAid({ tracksFirstAid: true })).toBe(true);
    expect(personTracksFirstAid({ cprCertificationExpiresDate: "2026-09-01" })).toBe(true);
    expect(personTracksFirstAid({ firstAidCertificationExpiresDate: "2026-09-01" })).toBe(true);
  });
});

describe("toFirstAidPerson", () => {
  it("maps name, department, location, and expiry statuses", () => {
    const person = toFirstAidPerson(
      {
        id: "p1",
        displayName: "Alex Mill",
        departmentName: "Operations",
        siteName: "PRM Stuttgart AR",
        tracksFirstAid: true,
        cprCertificationExpiresDate: "2020-01-01",
        firstAidCertificationExpiresDate: "2099-01-01",
      },
      new Date("2026-08-20T12:00:00Z"),
    );
    expect(person).toMatchObject({
      id: "p1",
      displayName: "ALEX MILL",
      departmentName: "Operations",
      locationLabel: "PRM Stuttgart AR",
      cprExpiryStatus: "expired",
      firstAidExpiryStatus: "ok",
    });
  });
});

describe("sortFirstAidPeople", () => {
  it("sorts by location then name", () => {
    const people: FirstAidPerson[] = [
      {
        id: "2",
        displayName: "Zoe",
        departmentName: "A",
        locationLabel: "Wynne",
        employeeNumber: "",
        tracksFirstAid: true,
        cprExpiresDate: "",
        cprExpiryStatus: "none",
        firstAidExpiresDate: "2099-01-01",
        firstAidExpiryStatus: "ok",
      },
      {
        id: "1",
        displayName: "Ann",
        departmentName: "A",
        locationLabel: "Stuttgart",
        employeeNumber: "",
        tracksFirstAid: true,
        cprExpiresDate: "",
        cprExpiryStatus: "none",
        firstAidExpiresDate: "2099-01-01",
        firstAidExpiryStatus: "ok",
      },
      {
        id: "3",
        displayName: "Bob",
        departmentName: "A",
        locationLabel: "Stuttgart",
        employeeNumber: "",
        tracksFirstAid: true,
        cprExpiresDate: "",
        cprExpiryStatus: "none",
        firstAidExpiresDate: "2099-01-01",
        firstAidExpiryStatus: "ok",
      },
    ];
    expect(sortFirstAidPeople(people).map((p) => p.id)).toEqual(["1", "3", "2"]);
  });
});

describe("filterFirstAidPeople", () => {
  it("filters expiring within 30 days or expired", () => {
    const people: FirstAidPerson[] = [
      {
        id: "ok",
        displayName: "Ok",
        departmentName: "",
        locationLabel: "A",
        employeeNumber: "",
        tracksFirstAid: true,
        cprExpiresDate: "2099-01-01",
        cprExpiryStatus: "ok",
        firstAidExpiresDate: "2099-01-01",
        firstAidExpiryStatus: "ok",
      },
      {
        id: "soon",
        displayName: "Soon",
        departmentName: "",
        locationLabel: "A",
        employeeNumber: "",
        tracksFirstAid: true,
        cprExpiresDate: "2026-09-01",
        cprExpiryStatus: "expiring_soon",
        firstAidExpiresDate: "",
        firstAidExpiryStatus: "none",
      },
    ];
    expect(filterFirstAidPeople(people, "expiring").map((p) => p.id)).toEqual(["soon"]);
  });
});
