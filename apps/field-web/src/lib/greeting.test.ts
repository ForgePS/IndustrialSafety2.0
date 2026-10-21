import { describe, expect, it } from "vitest";
import { firstNameFromDisplay, timeOfDayGreeting } from "./greeting";

describe("greeting helpers", () => {
  it("returns first name", () => {
    expect(firstNameFromDisplay("Jeremy Powell")).toBe("Jeremy");
    expect(firstNameFromDisplay("")).toBe("there");
  });

  it("picks time-of-day greeting", () => {
    expect(timeOfDayGreeting(new Date("2026-08-31T08:00:00"))).toBe("Good Morning");
    expect(timeOfDayGreeting(new Date("2026-08-31T14:00:00"))).toBe("Good Afternoon");
    expect(timeOfDayGreeting(new Date("2026-08-31T20:00:00"))).toBe("Good Evening");
  });
});
