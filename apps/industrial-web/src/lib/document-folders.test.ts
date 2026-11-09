import { describe, expect, it } from "vitest";
import {
  canRenameFolder,
  deleteFolderPrompt,
  sameFolderName,
  sortByDocumentName,
} from "./document-folders";

describe("canRenameFolder", () => {
  const base = { id: "f1", name: "SOPs", documentCount: 0, builtIn: false, canDelete: true };
  it("allows renaming non-built-in folders", () => {
    expect(canRenameFolder({ ...base, canRename: true })).toBe(true);
  });
  it("blocks built-ins and missing folders", () => {
    expect(canRenameFolder({ ...base, builtIn: true, canRename: false })).toBe(false);
    expect(canRenameFolder(null)).toBe(false);
  });
});

describe("deleteFolderPrompt", () => {
  it("says documents are kept when the folder has some", () => {
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 3 })).toContain(
      "3 documents will be kept",
    );
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 1 })).toContain("1 document will");
  });
  it("is a plain question for an empty folder", () => {
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 0 })).toBe(
      'Delete the folder "SOPs"?',
    );
  });
});

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

describe("sameFolderName", () => {
  it("ignores case and surrounding spaces", () => {
    expect(sameFolderName(" ehs policies", "EHS Policies")).toBe(true);
    expect(sameFolderName("SOPs", "EHS Policies")).toBe(false);
    expect(sameFolderName(null, "")).toBe(true);
  });
});
