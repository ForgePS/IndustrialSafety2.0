import { describe, expect, it } from "vitest";
import {
  parseContentDelivery,
  parseContentPresentedAt,
  quizSkipsCourseContent,
} from "./industrial-training-delivery.js";

describe("parseContentDelivery", () => {
  it("defaults to self-paced", () => {
    expect(parseContentDelivery(undefined)).toBe("SELF_PACED");
    expect(parseContentDelivery("")).toBe("SELF_PACED");
  });

  it("accepts group-presented in any case", () => {
    expect(parseContentDelivery("group_presented")).toBe("GROUP_PRESENTED");
  });

  it("rejects unknown values", () => {
    expect(() => parseContentDelivery("VIDEO_SKIP")).toThrow(/contentDelivery/);
  });
});

describe("parseContentPresentedAt", () => {
  const now = new Date("2026-11-04T15:00:00Z");

  it("is null for self-paced even when a date is sent", () => {
    expect(parseContentPresentedAt("SELF_PACED", "2026-11-01", now)).toBeNull();
  });

  it("defaults to now for group-presented", () => {
    expect(parseContentPresentedAt("GROUP_PRESENTED", undefined, now)).toEqual(now);
  });

  it("uses the given date and rejects bad ones", () => {
    expect(parseContentPresentedAt("GROUP_PRESENTED", "2026-11-01", now)?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(() => parseContentPresentedAt("GROUP_PRESENTED", "not a date", now)).toThrow();
  });
});

describe("quizSkipsCourseContent", () => {
  it("only skips content for group-presented assignments", () => {
    expect(quizSkipsCourseContent("GROUP_PRESENTED")).toBe(true);
    expect(quizSkipsCourseContent("SELF_PACED")).toBe(false);
    expect(quizSkipsCourseContent(null)).toBe(false);
  });
});
