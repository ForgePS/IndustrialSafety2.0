import { describe, expect, it } from "vitest";
import {
  formatSmsPhone,
  lastNameMatchesPersonnel,
  maskSmsPhone,
  normalizeSmsPhone,
} from "./sms-signup.js";

describe("normalizeSmsPhone", () => {
  it("accepts common US formats", () => {
    expect(normalizeSmsPhone("(870) 555-0142")).toBe("8705550142");
    expect(normalizeSmsPhone("870.555.0142")).toBe("8705550142");
    expect(normalizeSmsPhone("+1 870 555 0142")).toBe("8705550142");
    expect(normalizeSmsPhone("18705550142")).toBe("8705550142");
  });

  it("rejects short, long, and invalid area codes", () => {
    expect(normalizeSmsPhone("555-0142")).toBeNull();
    expect(normalizeSmsPhone("287055501421")).toBeNull();
    expect(normalizeSmsPhone("0705550142")).toBeNull();
    expect(normalizeSmsPhone("1705550142")).toBeNull();
    expect(normalizeSmsPhone("")).toBeNull();
    expect(normalizeSmsPhone(null)).toBeNull();
  });

  it("formats and masks", () => {
    expect(formatSmsPhone("8705550142")).toBe("(870) 555-0142");
    expect(maskSmsPhone("8705550142")).toBe("(***) ***-0142");
  });
});

describe("lastNameMatchesPersonnel", () => {
  it("matches the lastName column ignoring case, spaces, accents, and punctuation", () => {
    expect(lastNameMatchesPersonnel("smith", { lastName: "Smith" })).toBe(true);
    expect(lastNameMatchesPersonnel("  SMITH ", { lastName: "Smith" })).toBe(true);
    expect(lastNameMatchesPersonnel("Pena", { lastName: "Peña" })).toBe(true);
    expect(lastNameMatchesPersonnel("OBrien", { lastName: "O'Brien" })).toBe(true);
    expect(lastNameMatchesPersonnel("Jones", { lastName: "Smith" })).toBe(false);
  });

  it("matches a single part of a multi-part surname", () => {
    expect(lastNameMatchesPersonnel("Smith-Jones", { lastName: "Smith-Jones" })).toBe(true);
    expect(lastNameMatchesPersonnel("Jones", { lastName: "Smith-Jones" })).toBe(true);
    expect(lastNameMatchesPersonnel("Garcia", { lastName: "De La Garcia" })).toBe(true);
  });

  it("falls back to displayName when lastName is empty", () => {
    expect(lastNameMatchesPersonnel("Smith", { lastName: null, displayName: "John Smith" })).toBe(true);
    expect(lastNameMatchesPersonnel("Smith", { displayName: "John Smith Jr." })).toBe(true);
    expect(lastNameMatchesPersonnel("Smith", { displayName: "Smith, John" })).toBe(true);
    expect(lastNameMatchesPersonnel("John", { displayName: "John Smith" })).toBe(false);
    expect(lastNameMatchesPersonnel("Smith", { displayName: "Smith" })).toBe(false);
  });

  it("rejects empty or single-letter input", () => {
    expect(lastNameMatchesPersonnel("", { lastName: "Smith" })).toBe(false);
    expect(lastNameMatchesPersonnel("S", { lastName: "S" })).toBe(false);
  });
});
