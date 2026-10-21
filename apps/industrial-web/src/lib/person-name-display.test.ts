import { describe, expect, it } from "vitest";
import { personNameDisplay } from "./person-name-display";

describe("personNameDisplay", () => {
  it("uppercases mixed-case names", () => {
    expect(personNameDisplay("Leroy Bones")).toBe("LEROY BONES");
    expect(personNameDisplay("CHRIS R BOGY")).toBe("CHRIS R BOGY");
  });

  it("trims and falls back when empty", () => {
    expect(personNameDisplay("  ")).toBe("");
    expect(personNameDisplay(null, "Unnamed")).toBe("Unnamed");
    expect(personNameDisplay(undefined, "—")).toBe("—");
  });
});
