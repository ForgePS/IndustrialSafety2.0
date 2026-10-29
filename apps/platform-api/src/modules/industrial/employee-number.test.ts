import { describe, expect, it } from "vitest";
import {
  canonicalEmployeeNumber,
  employeeNumberLookupKeys,
  employeeNumbersMatch,
} from "./employee-number.js";

describe("canonicalEmployeeNumber", () => {
  it("normalizes bare numeric input", () => {
    expect(canonicalEmployeeNumber("15099")).toBe("EMP-15099");
    expect(canonicalEmployeeNumber("015099")).toBe("EMP-15099");
  });

  it("normalizes prefixed input", () => {
    expect(canonicalEmployeeNumber("EMP-15099")).toBe("EMP-15099");
    expect(canonicalEmployeeNumber("emp15099")).toBe("EMP-15099");
  });
});

describe("employeeNumberLookupKeys", () => {
  it("includes bare and prefixed aliases", () => {
    expect(employeeNumberLookupKeys("15099")).toEqual(
      expect.arrayContaining(["15099", "emp-15099"]),
    );
    expect(employeeNumberLookupKeys("EMP-15099")).toEqual(
      expect.arrayContaining(["15099", "emp-15099"]),
    );
  });
});

describe("employeeNumbersMatch", () => {
  it("matches bare and prefixed forms", () => {
    expect(employeeNumbersMatch("15099", "EMP-15099")).toBe(true);
    expect(employeeNumbersMatch("EMP-15099", "15099")).toBe(true);
    expect(employeeNumbersMatch("15099", "15098")).toBe(false);
  });
});
