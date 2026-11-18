import { describe, expect, it } from "vitest";
import { isValidVin, normalizeVin, validateVin } from "./vin.js";

describe("VIN validation", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeVin(" 1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
  });

  it("accepts a known-good VIN check digit", () => {
    // Classic sample VIN with valid check digit
    const result = validateVin("1HGCM82633A004352");
    expect(result.ok).toBe(true);
    expect(isValidVin("1HGCM82633A004352")).toBe(true);
  });

  it("rejects wrong length and illegal characters", () => {
    expect(validateVin("SHORT").ok).toBe(false);
    expect(validateVin("1HGCM82633A00435I").reason).toBe("illegal_char");
  });

  it("rejects bad check digit", () => {
    expect(validateVin("1HGCM82633A004353").reason).toBe("check_digit");
  });
});
