import { describe, expect, it } from "vitest";
import { canImportProfileSignature } from "./profile-signature";

describe("canImportProfileSignature", () => {
  it("offers import when profile has ink and the field is empty", () => {
    expect(canImportProfileSignature("data:image/png;base64,AAA", "")).toBe(true);
  });

  it("hides import when profile has no signature", () => {
    expect(canImportProfileSignature(null, "")).toBe(false);
    expect(canImportProfileSignature("  ", "")).toBe(false);
  });

  it("hides import when the field already matches the profile signature", () => {
    const sig = "data:image/png;base64,AAA";
    expect(canImportProfileSignature(sig, sig)).toBe(false);
    expect(canImportProfileSignature(sig, ` ${sig} `)).toBe(false);
  });
});
