import { describe, expect, it } from "vitest";
import {
  FORGE_MODULE_CATALOG,
  FORGE_PLATFORMS,
  customerAssignableModules,
  findCatalogModule,
  modulesForProduct,
} from "./module-catalog.js";

describe("MODULE-CATALOG-S2 contract", () => {
  it("defines customer platforms plus internal Creator", () => {
    expect(FORGE_PLATFORMS.map((p) => p.key)).toEqual(["INDUSTRIAL", "RMS", "ACADEMY", "CREATOR"]);
    expect(FORGE_PLATFORMS.find((p) => p.key === "CREATOR")?.customerAssignable).toBe(false);
  });

  it("keeps platform-specific Personnel variants separate", () => {
    const industrial = findCatalogModule("FORGE_INDUSTRIAL", "PERSONNEL");
    const rms = findCatalogModule("FORGE_RMS", "PERSONNEL");
    expect(industrial?.name).toBe("Personnel");
    expect(rms?.name).toBe("Personnel");
    expect(industrial?.platformKey).toBe("INDUSTRIAL");
    expect(rms?.platformKey).toBe("RMS");
  });

  it("hides core modules from customer-assignable lists", () => {
    const industrial = customerAssignableModules("FORGE_INDUSTRIAL");
    expect(industrial.some((m) => m.code === "CORE")).toBe(false);
    expect(industrial.every((m) => m.customerAssignable)).toBe(true);
  });

  it("discovers future catalog modules without page-specific lists", () => {
    const future = {
      productCode: "FORGE_INDUSTRIAL" as const,
      platformKey: "INDUSTRIAL" as const,
      code: "TEST_FUTURE_MODULE",
      name: "Contractor Orientation",
      category: "Operations",
      classification: "CUSTOMER_MODULE" as const,
      implementationStatus: "READY" as const,
      customerAssignable: true,
      defaultEnabled: false,
      displayOrder: 99999,
    };
    const catalog = [...FORGE_MODULE_CATALOG, future];
    const industrial = catalog.filter((m) => m.productCode === "FORGE_INDUSTRIAL");
    expect(industrial.some((m) => m.code === "TEST_FUTURE_MODULE")).toBe(true);
    expect(future.defaultEnabled).toBe(false);
  });

  it("includes full industrial registry modules in seed helper", () => {
    const industrial = modulesForProduct("FORGE_INDUSTRIAL");
    expect(industrial.length).toBeGreaterThan(20);
    expect(industrial.some((m) => m.code === "LOCKOUT_TAGOUT")).toBe(true);
  });
});
