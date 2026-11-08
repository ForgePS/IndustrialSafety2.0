import { describe, expect, it } from "vitest";
import { DOCUMENT_FOLDERS, EHS_POLICIES_CATEGORY, sortByDocumentName } from "./document-folders";

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("sortByDocumentName", () => {
  it("puts the lowest number first", () => {
    const input = ["EHS-010 Hot Work", "EHS-2 PPE", "EHS-001 Policy Statement", "EHS-100 Audits"];
    expect(names(sortByDocumentName(input.map((name) => ({ name }))))).toEqual([
      "EHS-001 Policy Statement",
      "EHS-2 PPE",
      "EHS-010 Hot Work",
      "EHS-100 Audits",
    ]);
  });

  it("orders leading numbers numerically, not alphabetically", () => {
    const input = ["10 Lockout", "1 General", "2 Hazcom"];
    expect(names(sortByDocumentName(input.map((name) => ({ name }))))).toEqual([
      "1 General",
      "2 Hazcom",
      "10 Lockout",
    ]);
  });
});

describe("DOCUMENT_FOLDERS", () => {
  it("includes an EHS Policies folder filtered by its category", () => {
    expect(DOCUMENT_FOLDERS.find((f) => f.id === "ehs-policies")?.category).toBe(
      EHS_POLICIES_CATEGORY,
    );
  });
});
