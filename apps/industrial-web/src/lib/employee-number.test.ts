import { describe, expect, it } from "vitest";
import {
  canonicalEmployeeNumber,
  employeeNumberDigitsForInput,
  formatEmployeeNumberFromDigits,
  sanitizeEmployeeNumberDigitsInput,
} from "./employee-number";

describe("employee-number", () => {
  it("canonicalizes bare numeric input", () => {
    expect(canonicalEmployeeNumber("25080")).toBe("EMP-25080");
    expect(canonicalEmployeeNumber("EMP-25080")).toBe("EMP-25080");
  });

  it("strips prefix for onboarding input", () => {
    expect(employeeNumberDigitsForInput("EMP-25080")).toBe("25080");
    expect(employeeNumberDigitsForInput("25080")).toBe("25080");
  });

  it("keeps only digits while typing", () => {
    expect(sanitizeEmployeeNumberDigitsInput("25a08-0")).toBe("25080");
  });

  it("builds canonical employee numbers from digits", () => {
    expect(formatEmployeeNumberFromDigits("25080")).toBe("EMP-25080");
  });
});
