import { describe, expect, it } from "vitest";
import { IMPORT_PERMISSIONS, isCreatorOnlyPermission } from "@forge/contracts";

describe("import permission seed catalog", () => {
  it("exports twelve import.* permissions", () => {
    expect(IMPORT_PERMISSIONS).toHaveLength(12);
    expect(IMPORT_PERMISSIONS).toContain("import.view");
    expect(IMPORT_PERMISSIONS).toContain("import.sensitive");
  });

  it("does not mark import permissions as creator-only platform grants", () => {
    for (const code of IMPORT_PERMISSIONS) {
      expect(isCreatorOnlyPermission(code)).toBe(false);
    }
  });
});
