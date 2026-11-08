import { describe, expect, it } from "vitest";
import {
  UNKNOWN_COURSE_TITLE,
  courseTitleFor,
  missingCourseIds,
} from "./training-qc-course-titles.js";

describe("missingCourseIds", () => {
  it("returns each unknown course id once and skips known or empty ids", () => {
    const known = new Map([["active", "Forklift Safety"]]);
    expect(missingCourseIds(known, ["active", "archived", "archived", "", null, undefined])).toEqual([
      "archived",
    ]);
  });
});

describe("courseTitleFor", () => {
  const titles = new Map([
    ["crane", "Overhead Crane Operator"],
    ["blank", "   "],
  ]);

  it("returns the course title for the question's course", () => {
    expect(courseTitleFor(titles, "crane")).toBe("Overhead Crane Operator");
  });

  it("falls back to a dash, not a placeholder label, when the course is not found", () => {
    expect(courseTitleFor(titles, "deleted")).toBe(UNKNOWN_COURSE_TITLE);
    expect(courseTitleFor(titles, "blank")).toBe(UNKNOWN_COURSE_TITLE);
    expect(courseTitleFor(titles, null)).toBe(UNKNOWN_COURSE_TITLE);
    expect(UNKNOWN_COURSE_TITLE).not.toBe("Course");
  });
});
