import { describe, expect, it } from "vitest";
import {
  REFERENCE_IMPORT_ADAPTER_KEY,
  adapterRegistryKey,
  resolveImportAdapterKey,
} from "./adapter.js";

describe("resolveImportAdapterKey", () => {
  it("prefers an explicit adapterKey", () => {
    expect(
      resolveImportAdapterKey({
        adapterKey: "custom:ADAPTER:x@9",
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "PERSONNEL",
        recordType: "personnel",
      }),
    ).toBe("custom:ADAPTER:x@9");
  });

  it("selects authorized Industrial product adapters", () => {
    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "PERSONNEL",
        recordType: "personnel",
      }),
    ).toBe("FORGE_INDUSTRIAL:PERSONNEL:personnel@1");

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "FLEET",
        recordType: "fleet_vehicle",
      }),
    ).toBe(
      adapterRegistryKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "FLEET",
        recordType: "fleet_vehicle",
      }),
    );

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "ORG",
        recordType: "department",
      }),
    ).toBe("FORGE_INDUSTRIAL:ORG:department@1");

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "ORG",
        recordType: "site",
      }),
    ).toBe("FORGE_INDUSTRIAL:ORG:site@1");

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "ORG",
        recordType: "position",
      }),
    ).toBe("FORGE_INDUSTRIAL:ORG:position@1");

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "ORG",
        recordType: "employment_type",
      }),
    ).toBe("FORGE_INDUSTRIAL:ORG:employment_type@1");

    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_INDUSTRIAL",
        moduleKey: "TRAINING",
        recordType: "training_record",
      }),
    ).toBe("FORGE_INDUSTRIAL:TRAINING:training_record@1");
  });

  it("falls back to the reference adapter for unknown products", () => {
    expect(
      resolveImportAdapterKey({
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordType: "generic_record",
      }),
    ).toBe(REFERENCE_IMPORT_ADAPTER_KEY);
  });
});
