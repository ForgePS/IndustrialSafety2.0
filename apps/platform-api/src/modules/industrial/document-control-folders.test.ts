import { describe, expect, it } from "vitest";
import { mergeDocumentFolders, normalizeFolderName } from "./document-control-folders";

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

  it("only lets empty stored folders be deleted", () => {
    const folders = mergeDocumentFolders({
      stored: [
        { id: "f1", name: "Empty" },
        { id: "f2", name: "Used" },
      ],
      categoryCounts: [{ category: "Used", count: 1 }],
      builtIns: [],
    });
    expect(folders.map((f) => [f.name, f.canDelete])).toEqual([
      ["Empty", true],
      ["Used", false],
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
