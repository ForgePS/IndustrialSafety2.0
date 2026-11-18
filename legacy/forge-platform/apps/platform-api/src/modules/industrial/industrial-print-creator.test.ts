import { describe, expect, it } from "vitest";
import { computeCreatorPrintingEnabled } from "./industrial-print-creator.util.js";

describe("creator printing enablement", () => {
  it("requires product and module ACTIVE", () => {
    expect(
      computeCreatorPrintingEnabled({
        productStatus: "ACTIVE",
        printManagerModuleStatus: "ACTIVE",
        forgePrintingEnabled: true,
        printManagerFlagEnabled: true,
      }),
    ).toBe(true);
    expect(
      computeCreatorPrintingEnabled({
        productStatus: "ACTIVE",
        printManagerModuleStatus: "INACTIVE",
        forgePrintingEnabled: true,
        printManagerFlagEnabled: true,
      }),
    ).toBe(false);
  });

  it("treats missing flags as enabled", () => {
    expect(
      computeCreatorPrintingEnabled({
        productStatus: "ACTIVE",
        printManagerModuleStatus: "ACTIVE",
        forgePrintingEnabled: undefined,
        printManagerFlagEnabled: undefined,
      }),
    ).toBe(true);
  });

  it("respects explicit flag off", () => {
    expect(
      computeCreatorPrintingEnabled({
        productStatus: "ACTIVE",
        printManagerModuleStatus: "ACTIVE",
        forgePrintingEnabled: false,
        printManagerFlagEnabled: true,
      }),
    ).toBe(false);
  });
});
