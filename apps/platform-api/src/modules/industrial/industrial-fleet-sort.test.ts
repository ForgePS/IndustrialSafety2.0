import { describe, expect, it } from "vitest";
import {
  compareFleetAssetsByLocation,
  compareFleetRenewalsByLocationThenSoonest,
} from "./fleet-list-sort.js";

describe("fleet list sorting", () => {
  it("sorts assets by location, empty last", () => {
    const rows = [
      { id: "3", locationName: "Yard B", assetNumber: "3" },
      { id: "1", locationName: null, assetNumber: "1" },
      { id: "2", locationName: "Yard A", assetNumber: "2" },
      { id: "4", locationName: "Yard A", assetNumber: "4" },
    ];
    const sorted = [...rows].sort(compareFleetAssetsByLocation);
    expect(sorted.map((r) => r.id)).toEqual(["2", "4", "3", "1"]);
  });

  it("sorts renewals by location then soonest expiry", () => {
    const rows = [
      {
        id: "later",
        locationName: "Plant",
        renewalDate: "2099-12-01",
        registrationRenewalMonth: null,
      },
      {
        id: "soon",
        locationName: "Plant",
        renewalDate: "2020-01-01",
        registrationRenewalMonth: null,
      },
      {
        id: "other",
        locationName: "Dock",
        renewalDate: "2090-06-01",
        registrationRenewalMonth: null,
      },
      {
        id: "unknown",
        locationName: "Plant",
        renewalDate: null,
        registrationRenewalMonth: null,
      },
    ];
    const sorted = [...rows].sort(compareFleetRenewalsByLocationThenSoonest);
    expect(sorted.map((r) => r.id)).toEqual(["other", "soon", "later", "unknown"]);
  });
});
