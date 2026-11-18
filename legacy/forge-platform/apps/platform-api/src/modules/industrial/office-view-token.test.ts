import { describe, expect, it } from "vitest";
import {
  buildOfficeMaterialViewUrl,
  issueOfficeViewToken,
  verifyOfficeViewToken,
} from "./office-view-token.js";

describe("office-view-token", () => {
  it("issues and verifies a material view token", () => {
    const issued = issueOfficeViewToken("tenant-1", "material-1");
    expect(issued.token.includes(".")).toBe(true);
    expect(verifyOfficeViewToken(issued.token, "material-1")).toEqual({ tenantId: "tenant-1" });
    expect(verifyOfficeViewToken(issued.token, "material-2")).toBeNull();
    expect(verifyOfficeViewToken("bad.token", "material-1")).toBeNull();
  });

  it("builds a public office-view URL", () => {
    const url = buildOfficeMaterialViewUrl("https://api.example.com", "mat-1", "abc.def");
    expect(url).toBe(
      "https://api.example.com/api/v1/public/training/materials/mat-1/office-view?token=abc.def",
    );
  });
});
