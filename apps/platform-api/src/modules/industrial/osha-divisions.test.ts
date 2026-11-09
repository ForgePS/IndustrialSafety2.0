import { describe, expect, it } from "vitest";
import {
  divisionFromPayload,
  emptyOshaForm300AMeta,
  fillOshaForm300AMetaDefaults,
  hydrateOshaFromSource,
  mergeOshaCasePayloadFields,
  parseOshaForm300AMeta,
  readOshaForm300AMetaForDivision,
  writeOshaForm300AMetaForDivision,
} from "./osha-helpers.js";

const base = { title: "Case", sourcePayload: { employeeName: "A Worker", site: "Crowley" } };

describe("OSHA establishments come from divisions", () => {
  it("reads division name variants from a payload", () => {
    expect(divisionFromPayload({ division: "Rice Milling" })).toBe("Rice Milling");
    expect(divisionFromPayload({ DivisionName: "Seed Plant" })).toBe("Seed Plant");
    expect(divisionFromPayload({ site: "Crowley" })).toBe("");
    expect(divisionFromPayload(null)).toBe("");
  });

  it("prefers the case, then department, incident, then employee division", () => {
    const all = {
      departmentDivision: "Dept Div",
      incident: { division: "Incident Div" },
      personnelDivision: "Person Div",
    };
    expect(
      hydrateOshaFromSource({
        ...base,
        sourcePayload: { ...base.sourcePayload, division: "Case Div" },
        ...all,
      }).division,
    ).toBe("Case Div");
    expect(hydrateOshaFromSource({ ...base, ...all }).division).toBe("Dept Div");
    expect(hydrateOshaFromSource({ ...base, ...all, departmentDivision: null }).division).toBe(
      "Incident Div",
    );
    expect(hydrateOshaFromSource({ ...base, personnelDivision: "Person Div" }).division).toBe(
      "Person Div",
    );
  });

  it("never falls back to the site name", () => {
    const hydrated = hydrateOshaFromSource(base);
    expect(hydrated.establishment).toBe("Crowley");
    expect(hydrated.division).toBe("");
  });

  it("saves a case's division through the case editor whitelist", () => {
    expect(mergeOshaCasePayloadFields({}, { division: "Rice Milling" }).division).toBe(
      "Rice Milling",
    );
  });

  it("stores Form 300A details per division and year", () => {
    const meta2026 = parseOshaForm300AMeta(
      { annualAverageEmployees: 40, naics: "311212" },
      2026,
      "Rice Milling",
    );
    let store = writeOshaForm300AMetaForDivision(undefined, "Rice Milling", meta2026);
    store = writeOshaForm300AMetaForDivision(
      store,
      "Seed Plant",
      parseOshaForm300AMeta({ annualAverageEmployees: 7 }, 2026, "Seed Plant"),
    );
    const read = readOshaForm300AMetaForDivision(store, "rice milling", 2026);
    expect(read.annualAverageEmployees).toBe(40);
    expect(read.naics).toBe("311212");
    expect(readOshaForm300AMetaForDivision(store, "Seed Plant", 2026).annualAverageEmployees).toBe(
      7,
    );
    // Other years and unknown divisions come back empty.
    expect(readOshaForm300AMetaForDivision(store, "Rice Milling", 2025).naics).toBe("");
    expect(readOshaForm300AMetaForDivision(store, "Nope", 2026).establishmentName).toBe("Nope");
  });
});

describe("Form 300 header defaults", () => {
  const company = {
    companyName: "Producers Rice Mill, Inc.",
    matchesDivision: false,
    street: "518 E Harrison St",
    city: "Stuttgart",
    state: "AR",
    zip: "72160",
    phone: "",
  };

  it("replaces a bare division code with the company name and fills the address", () => {
    const meta = fillOshaForm300AMetaDefaults(emptyOshaForm300AMeta(2026, "PRI"), "PRI", company);
    expect(meta.establishmentName).toBe("Producers Rice Mill, Inc. – PRI");
    expect(meta).toMatchObject({ city: "Stuttgart", state: "AR", zip: "72160" });
  });

  it("uses the organization name alone when it is the division", () => {
    const meta = fillOshaForm300AMetaDefaults(emptyOshaForm300AMeta(2026), "PRI", {
      ...company,
      matchesDivision: true,
    });
    expect(meta.establishmentName).toBe("Producers Rice Mill, Inc.");
  });

  it("keeps details the user saved", () => {
    const saved = {
      ...emptyOshaForm300AMeta(2026, "Stuttgart Mill"),
      city: "Carlisle",
      state: "AR",
    };
    const meta = fillOshaForm300AMetaDefaults(saved, "PRI", company);
    expect(meta).toMatchObject({ establishmentName: "Stuttgart Mill", city: "Carlisle" });
  });

  it("falls back to the division when there is no company record", () => {
    const meta = fillOshaForm300AMetaDefaults(emptyOshaForm300AMeta(2026), "PRI", {
      ...company,
      companyName: "",
      city: "",
    });
    expect(meta.establishmentName).toBe("PRI");
    expect(meta.city).toBe("");
  });
});
