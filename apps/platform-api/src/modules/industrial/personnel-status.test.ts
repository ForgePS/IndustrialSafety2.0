import { describe, expect, it } from "vitest";
import { isActivePersonnelStatus, normalizePersonnelStatus } from "./personnel-status.js";

describe("personnel-status", () => {
  it("treats mixed-case active values as active", () => {
    expect(isActivePersonnelStatus("ACTIVE")).toBe(true);
    expect(isActivePersonnelStatus("Active")).toBe(true);
    expect(isActivePersonnelStatus("active")).toBe(true);
    expect(isActivePersonnelStatus("ARCHIVED")).toBe(false);
  });

  it("normalizes active variants to ACTIVE", () => {
    expect(normalizePersonnelStatus("Active")).toBe("ACTIVE");
    expect(normalizePersonnelStatus("active")).toBe("ACTIVE");
    expect(normalizePersonnelStatus("")).toBe("ACTIVE");
    expect(normalizePersonnelStatus("SEASONAL")).toBe("SEASONAL");
  });
});
