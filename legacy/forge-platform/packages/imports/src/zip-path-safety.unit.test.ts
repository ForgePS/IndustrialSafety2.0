import { describe, expect, it } from "vitest";
import { isUnsafeZipEntryPath } from "./formats/zip.js";

describe("isUnsafeZipEntryPath", () => {
  it("allows normal relative file paths", () => {
    expect(isUnsafeZipEntryPath("manifest.json")).toBe(false);
    expect(isUnsafeZipEntryPath("data/rows.csv")).toBe(false);
  });

  it("rejects traversal and absolute paths", () => {
    expect(isUnsafeZipEntryPath("../etc/passwd")).toBe(true);
    expect(isUnsafeZipEntryPath("foo/../../secret.txt")).toBe(true);
    expect(isUnsafeZipEntryPath("/etc/passwd")).toBe(true);
    expect(isUnsafeZipEntryPath("C:/Windows/system32")).toBe(true);
    expect(isUnsafeZipEntryPath("")).toBe(true);
  });
});
