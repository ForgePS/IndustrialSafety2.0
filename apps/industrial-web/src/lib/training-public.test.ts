import { describe, expect, it } from "vitest";
import {
  defaultEmployeeNumberInput,
  EMPLOYEE_NUMBER_PREFIX,
  isEmployeeNumberComplete,
  updateEmployeeNumberInput,
} from "./training-public";

describe("employee number input helpers", () => {
  it("defaults to the EMP- prefix", () => {
    expect(defaultEmployeeNumberInput()).toBe(EMPLOYEE_NUMBER_PREFIX);
  });

  it("keeps and normalizes values typed after the prefix", () => {
    expect(updateEmployeeNumberInput("emp-21055")).toBe("EMP-21055");
    expect(updateEmployeeNumberInput("21055")).toBe("EMP-21055");
    expect(updateEmployeeNumberInput("EMP21055")).toBe("EMP-21055");
  });

  it("restores the prefix when the field is cleared", () => {
    expect(updateEmployeeNumberInput("")).toBe(EMPLOYEE_NUMBER_PREFIX);
    expect(updateEmployeeNumberInput("EM")).toBe(EMPLOYEE_NUMBER_PREFIX);
  });

  it("requires characters after the prefix", () => {
    expect(isEmployeeNumberComplete(EMPLOYEE_NUMBER_PREFIX)).toBe(false);
    expect(isEmployeeNumberComplete("EMP-21055")).toBe(true);
  });
});
