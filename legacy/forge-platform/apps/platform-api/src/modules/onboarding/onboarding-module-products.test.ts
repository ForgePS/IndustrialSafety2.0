import { describe, expect, it } from "vitest";
import { resolveModuleProducts } from "./onboarding-module-products.js";

const catalog: Record<string, string[]> = {
  FORGE_INDUSTRIAL: ["CORE", "PERSONNEL", "TRAINING", "LOCKOUT_TAGOUT"],
  FORGE_ACADEMY: ["CORE", "COURSES"],
};
const lookup = (productCode: string) => catalog[productCode] ?? [];

describe("resolveModuleProducts", () => {
  it("assigns shared codes to the only selected product that offers them", () => {
    expect(resolveModuleProducts(["CORE", "LOCKOUT_TAGOUT"], ["FORGE_INDUSTRIAL"], lookup)).toEqual(
      [
        { moduleCode: "CORE", productCode: "FORGE_INDUSTRIAL" },
        { moduleCode: "LOCKOUT_TAGOUT", productCode: "FORGE_INDUSTRIAL" },
      ],
    );
  });

  it("picks the right product per module when several products are selected", () => {
    expect(
      resolveModuleProducts(["COURSES", "TRAINING"], ["FORGE_INDUSTRIAL", "FORGE_ACADEMY"], lookup),
    ).toEqual([
      { moduleCode: "COURSES", productCode: "FORGE_ACADEMY" },
      { moduleCode: "TRAINING", productCode: "FORGE_INDUSTRIAL" },
    ]);
  });

  it("rejects a code two selected products both offer, unless it is qualified", () => {
    expect(() =>
      resolveModuleProducts(["CORE"], ["FORGE_INDUSTRIAL", "FORGE_ACADEMY"], lookup),
    ).toThrow(/FORGE_INDUSTRIAL:CORE/);
    expect(
      resolveModuleProducts(["FORGE_ACADEMY:CORE"], ["FORGE_INDUSTRIAL", "FORGE_ACADEMY"], lookup),
    ).toEqual([{ moduleCode: "CORE", productCode: "FORGE_ACADEMY" }]);
  });

  it("leaves modules outside every selected catalog for lookup by code", () => {
    expect(resolveModuleProducts(["LEGACY_MODULE"], ["FORGE_INDUSTRIAL"], lookup)).toEqual([
      { moduleCode: "LEGACY_MODULE", productCode: undefined },
    ]);
  });

  it("uses the real catalog by default", () => {
    const [core] = resolveModuleProducts(["CORE"], ["FORGE_INDUSTRIAL"]);
    expect(core).toEqual({ moduleCode: "CORE", productCode: "FORGE_INDUSTRIAL" });
  });
});
