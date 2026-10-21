import { describe, expect, it } from "vitest";
import {
  buildIsoDate,
  dateFieldModeFor,
  daysInMonth,
  isBirthDateField,
  mergeDateParts,
  parseIsoDateParts,
  shouldSyncDatePartsFromValue,
  yearOptionsForMode,
} from "./date-field";

describe("date-field", () => {
  it("detects date of birth fields", () => {
    expect(isBirthDateField({ id: "date-of-birth", label: "Date of Birth" })).toBe(true);
    expect(isBirthDateField({ name: "dateOfBirth" })).toBe(true);
    expect(isBirthDateField({ label: "Signature date" })).toBe(false);
  });

  it("parses and builds ISO dates", () => {
    expect(parseIsoDateParts("1990-04-09")).toEqual({ year: "1990", month: "04", day: "09" });
    expect(buildIsoDate("1990", "04", "09")).toBe("1990-04-09");
    expect(buildIsoDate("1990", "02", "31")).toBe("");
  });

  it("handles leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it("lists many past years for birth mode", () => {
    const years = yearOptionsForMode("birth", new Date("2026-08-20"));
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(1916);
    expect(years.length).toBe(111);
    expect(dateFieldModeFor({ label: "Date of Birth" })).toBe("birth");
  });

  it("keeps partial month/day/year selections while the ISO value is incomplete", () => {
    const partial = mergeDateParts({ year: "", month: "", day: "" }, { month: "04" });
    expect(partial).toEqual({ year: "", month: "04", day: "" });
    expect(buildIsoDate(partial.year, partial.month, partial.day)).toBe("");
    expect(shouldSyncDatePartsFromValue("", partial)).toBe(false);

    const complete = mergeDateParts(partial, { year: "1990", day: "09" });
    expect(buildIsoDate(complete.year, complete.month, complete.day)).toBe("1990-04-09");
    expect(shouldSyncDatePartsFromValue("1990-04-09", complete)).toBe(false);
    expect(shouldSyncDatePartsFromValue("", complete)).toBe(true);
  });
});
