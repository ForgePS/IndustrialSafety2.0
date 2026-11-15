import { describe, expect, it } from "vitest";
import { mobilePrintPermissionCodes } from "./permissions";

describe("mobile-print permissions", () => {
  it("maps mobile capabilities onto industrial.printer RBAC", () => {
    expect(mobilePrintPermissionCodes("view")).toContain("industrial.printer.view");
    expect(mobilePrintPermissionCodes("submit")).toContain("industrial.printer.print");
    expect(mobilePrintPermissionCodes("managePrinters")).toContain(
      "industrial.printer.pair_bluetooth",
    );
  });
});
