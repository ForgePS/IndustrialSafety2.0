import { describe, expect, it } from "vitest";
import {
  buildDqfFormIdMap,
  DQF_FORM_TEMPLATE_NAMES,
  dqfFormFillHref,
  findDqfFormDefinition,
} from "./dot-dqf-form-links";

describe("dot-dqf-form-links", () => {
  const definitions = [
    {
      id: "form-mvr",
      title: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
      sourceDocumentId: "z8DdbRny93Oi7TkWNQ3M",
    },
    { id: "form-road", title: "Driver Evaluation Road Test Form" },
    { id: "form-consent", title: "Consent for Drug and/or Alcohol Testing" },
    {
      id: "form-dot-consent-thin",
      title: "DOT Drug & Alcohol Consent for Testing",
      schemaJson: { fields: [{ id: "a" }] },
    },
    {
      id: "form-dot-consent",
      title: "DOT Drug & Alcohol Consent for Testing",
      schemaJson: { fields: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    },
    { id: "form-safety", title: "Safety Performance History Records Request" },
    {
      id: "form-nrcme",
      title: "Medical Examiner's National Registry Verification Form",
      schemaJson: { fields: [{ id: "a" }, { id: "b" }] },
    },
  ];

  it("finds forms by exact template title", () => {
    expect(findDqfFormDefinition(definitions, DQF_FORM_TEMPLATE_NAMES.roadTest)?.id).toBe(
      "form-road",
    );
  });

  it("prefers the richer duplicate when titles collide", () => {
    expect(
      findDqfFormDefinition(definitions, DQF_FORM_TEMPLATE_NAMES.drugAlcoholConsentDot)?.id,
    ).toBe("form-dot-consent");
  });

  it("builds a field-id map for linked DQF forms", () => {
    const map = buildDqfFormIdMap(definitions);
    expect(map.mvrReleaseForm).toBe("form-mvr");
    expect(map.certificationOfRoadTest).toBe("form-road");
    expect(map.consentDrugAlcoholTest).toBe("form-consent");
    expect(map.drugAlcoholTestConsentForm).toBe("form-dot-consent");
    expect(map.safetyPerformanceHistoryRequest).toBe("form-safety");
    expect(map.previousEmployerSafetyPerformance).toBe("form-safety");
    expect(map.medicalExaminerNationalRegistryVerification).toBe("form-nrcme");
  });

  it("builds fill deep links with personnel context", () => {
    expect(dqfFormFillHref({ formId: "form-road", personnelId: "person-1" })).toBe(
      "/modules/forms/?tab=fill&form=form-road&personnel=person-1",
    );
  });
});
