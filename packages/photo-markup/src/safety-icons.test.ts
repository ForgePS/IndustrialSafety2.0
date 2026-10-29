import { describe, expect, it } from "vitest";
import { searchSafetyIcons, getSafetyIcon, SAFETY_ICONS } from "./safety-icons.js";

describe("safety icons", () => {
  it("includes core categories", () => {
    expect(SAFETY_ICONS.length).toBeGreaterThan(40);
    expect(getSafetyIcon("warning")?.label).toBe("Warning");
    expect(getSafetyIcon("hard-hat")?.category).toBe("ppe");
  });

  it("searches by label", () => {
    const hits = searchSafetyIcons("forklift");
    expect(hits.some((i) => i.key === "forklift")).toBe(true);
  });
});
