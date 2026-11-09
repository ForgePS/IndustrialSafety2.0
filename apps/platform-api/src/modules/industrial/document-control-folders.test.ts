import { describe, expect, it } from "vitest";
import {
  checkFolderRename,
  mergeDocumentFolders,
  normalizeFolderName,
} from "./document-control-folders";

describe("normalizeFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeFolderName("  Safety   Data Sheets ")).toBe("Safety Data Sheets");
  });

  it("rejects empty, non-string, and too-long names", () => {
    expect(normalizeFolderName("   ")).toBeNull();
    expect(normalizeFolderName(42)).toBeNull();
    expect(normalizeFolderName("x".repeat(121))).toBeNull();
  });
});

describe("mergeDocumentFolders", () => {
  it("combines built-ins, stored folders, and categories in use", () => {
    const folders = mergeDocumentFolders({
      stored: [{ id: "f1", name: "SOPs" }],
      categoryCounts: [
        { category: "GENERAL", count: 3 },
        { category: "ehs policies", count: 2 },
        { category: null, count: 5 },
      ],
    });
    expect(folders.map((f) => [f.name, f.documentCount, f.builtIn])).toEqual([
      ["EHS Policies", 2, true],
      ["GENERAL", 3, false],
      ["SOPs", 0, false],
    ]);
  });

  it("lets every folder except built-ins be renamed and deleted, even with documents", () => {
    const folders = mergeDocumentFolders({
      stored: [{ id: "f1", name: "Used" }],
      categoryCounts: [
        { category: "Used", count: 1 },
        { category: "GENERAL", count: 4 },
      ],
    });
    expect(folders.map((f) => [f.name, f.canRename, f.canDelete])).toEqual([
      ["EHS Policies", false, false],
      ["GENERAL", true, true],
      ["Used", true, true],
    ]);
  });

  it("sorts folder names with numbers by value", () => {
    const folders = mergeDocumentFolders({
      stored: [
        { id: "a", name: "Area 10" },
        { id: "b", name: "Area 2" },
      ],
      categoryCounts: [],
      builtIns: [],
    });
    expect(folders.map((f) => f.name)).toEqual(["Area 2", "Area 10"]);
  });
});

describe("checkFolderRename", () => {
  const folders = mergeDocumentFolders({
    stored: [{ id: "f1", name: "SOPs" }],
    categoryCounts: [{ category: "GENERAL", count: 2 }],
  });

  it("allows a new unique name", () => {
    expect(checkFolderRename(folders, "SOPs", " Standard  Procedures ")).toEqual({
      ok: true,
      name: "Standard Procedures",
      caseOnly: false,
    });
  });

  it("allows changing only the capitalization", () => {
    expect(checkFolderRename(folders, "general", "General")).toEqual({
      ok: true,
      name: "General",
      caseOnly: true,
    });
  });

  it("rejects duplicates, built-ins, unknown folders, and blank names", () => {
    expect(checkFolderRename(folders, "SOPs", "general")).toMatchObject({ code: "CONFLICT" });
    expect(checkFolderRename(folders, "SOPs", "EHS policies")).toMatchObject({
      code: "CONFLICT",
    });
    expect(checkFolderRename(folders, "EHS Policies", "Policies")).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(checkFolderRename(folders, "Missing", "Other")).toMatchObject({ code: "NOT_FOUND" });
    expect(checkFolderRename(folders, "SOPs", "  ")).toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
