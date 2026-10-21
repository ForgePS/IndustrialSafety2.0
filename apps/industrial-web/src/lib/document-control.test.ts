import { describe, expect, it } from "vitest";
import { formatWorkflowLabel, workflowBadgeClass } from "./document-control";

describe("document-control client helpers", () => {
  it("maps workflow badges", () => {
    expect(workflowBadgeClass("PUBLISHED")).toContain("success");
    expect(workflowBadgeClass("IN_REVIEW")).toContain("warning");
    expect(workflowBadgeClass("OBSOLETE")).toContain("secondary");
    expect(workflowBadgeClass("DRAFT")).toContain("primary");
  });

  it("formats workflow labels", () => {
    expect(formatWorkflowLabel("IN_REVIEW")).toBe("IN REVIEW");
    expect(formatWorkflowLabel("PUBLISHED")).toBe("PUBLISHED");
  });
});
