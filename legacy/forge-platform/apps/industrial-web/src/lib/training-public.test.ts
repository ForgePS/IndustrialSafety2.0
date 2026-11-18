import { describe, expect, it } from "vitest";
import {
  courseContentRequirementMet,
  defaultEmployeeNumberInput,
  EMPLOYEE_NUMBER_PREFIX,
  isEmployeeNumberComplete,
  updateEmployeeNumberInput,
  type PublicCourseSection,
} from "./training-public";

const videoSection: PublicCourseSection = {
  id: "s1",
  title: "Lockout video",
  contentType: "VIDEO",
  sortOrder: 0,
  required: true,
};

describe("courseContentRequirementMet", () => {
  it("unlocks the quiz for group-presented assignments without any sections done", () => {
    expect(
      courseContentRequirementMet({
        contentDelivery: "GROUP_PRESENTED",
        sections: [videoSection],
        progress: { sectionsCompleted: [], quizAvailable: false },
      }),
    ).toBe(true);
  });

  it("keeps self-paced quizzes locked until required sections are done", () => {
    const course = { contentDelivery: "SELF_PACED" as const, sections: [videoSection] };
    expect(courseContentRequirementMet({ ...course, progress: { quizAvailable: false } })).toBe(
      false,
    );
    expect(courseContentRequirementMet({ ...course, progress: null })).toBe(false);
    expect(courseContentRequirementMet({ ...course, progress: { quizAvailable: true } })).toBe(
      true,
    );
  });

  it("treats older assignments with no delivery value as self-paced", () => {
    expect(courseContentRequirementMet({ sections: [videoSection], progress: null })).toBe(false);
  });

  it("does not require anything when no sections are required", () => {
    expect(
      courseContentRequirementMet({
        sections: [{ ...videoSection, required: false }],
        progress: null,
      }),
    ).toBe(true);
  });
});

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
