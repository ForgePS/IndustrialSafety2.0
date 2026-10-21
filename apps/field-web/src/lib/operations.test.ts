import { describe, expect, it } from "vitest";
import {
  enabledOperationsHubs,
  equipmentDisplayName,
  filterEquipmentByLocation,
  filterFleetByLocation,
  fleetDisplayName,
  forkliftDisplayName,
  matchesOrgSite,
} from "./operations";
import { ensureSignatureDataUrl } from "./signature-data-url";
import { isFieldFeatureModuleEnabled } from "./field-modules";
import { fieldHrefFromIndustrialPath } from "./scan-routes";

describe("operations helpers", () => {
  it("formats equipment and fleet display names", () => {
    expect(equipmentDisplayName({ id: "1", name: "Press brake", equipmentNumber: "EQ-9" })).toBe(
      "Press brake",
    );
    expect(
      fleetDisplayName({
        id: "2",
        assetNumber: "T-12",
        year: 2019,
        make: "Freightliner",
        model: "Cascadia",
      }),
    ).toContain("T-12");
    expect(
      forkliftDisplayName({
        id: "3",
        title: "",
        sourcePayload: { unitNumber: "FL-4" },
      }),
    ).toBe("FL-4");
  });

  it("scopes lists by Location (site_id) while allowing unset site rows", () => {
    expect(matchesOrgSite(null, "loc-1")).toBe(true);
    expect(matchesOrgSite("loc-1", "loc-1")).toBe(true);
    expect(matchesOrgSite("loc-2", "loc-1")).toBe(false);
    expect(
      filterEquipmentByLocation(
        [
          { id: "a", siteId: "loc-1" },
          { id: "b", siteId: "loc-2" },
          { id: "c", siteId: null },
        ],
        "loc-1",
      ).map((r) => r.id),
    ).toEqual(["a", "c"]);
    expect(
      filterFleetByLocation(
        [
          { id: "a", siteId: "loc-1" },
          { id: "b", siteId: "loc-2" },
        ],
        "",
      ),
    ).toHaveLength(2);
  });

  it("filters operations hubs by enabled modules", () => {
    const hubs = enabledOperationsHubs((code) => code === "EQUIPMENT" || code === "FORMS");
    expect(hubs.map((h) => h.id)).toEqual(["equipment", "forms"]);
  });
});

describe("operations feature gating", () => {
  it("gates Me Tools cards for fleet, forklifts, DOT, and forms", () => {
    expect(isFieldFeatureModuleEnabled(["FLEET"], "fleet")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "fleet")).toBe(false);
    expect(isFieldFeatureModuleEnabled(["DOT_COMPLIANCE"], "more-dot")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["FORMS"], "more-forms")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["FORKLIFTS"], "forklifts")).toBe(true);
  });
});

describe("operations scan routes", () => {
  it("routes fleet and DOT hubs without a target id", () => {
    expect(
      fieldHrefFromIndustrialPath("/modules/fleet", {
        targetType: "VEHICLE",
        targetId: "",
        qrLinkId: null,
      }),
    ).toBe("/fleet/");
    expect(
      fieldHrefFromIndustrialPath("/modules/forklifts", {
        targetType: "FORKLIFT",
        targetId: "",
        qrLinkId: null,
      }),
    ).toBe("/forklifts/");
    expect(
      fieldHrefFromIndustrialPath("/modules/dot-compliance", {
        targetType: "VEHICLE",
        targetId: "v1",
        qrLinkId: null,
      }),
    ).toBe("/dvir/v1/");
  });
});

describe("signature data url", () => {
  it("passes through image signatures", () => {
    expect(ensureSignatureDataUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("returns empty for blank values outside the browser", () => {
    expect(ensureSignatureDataUrl("")).toBe("");
    expect(ensureSignatureDataUrl("typed:Ada")).toBe("");
  });
});
