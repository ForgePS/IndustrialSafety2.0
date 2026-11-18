import { describe, expect, it } from "vitest";
import {
  findProducersMvrConsentForm,
  isProducersMvrConsentForm,
  isProducersRiceMillTenant,
  producersMvrConsentFormFillHref,
  PRODUCERS_MVR_FORM_SOURCE_ID,
  PRODUCERS_RICE_MILL_TENANT_SLUG,
} from "./producers-mvr-policy";

describe("producers MVR consent form helpers", () => {
  const mvrForm = {
    id: "form-abc",
    title: "Acknowledgement for Driving Company Vehicles (MVR Consent)",
    sourceDocumentId: PRODUCERS_MVR_FORM_SOURCE_ID,
  };

  it("recognizes the imported PRM MVR consent template", () => {
    expect(isProducersMvrConsentForm(mvrForm)).toBe(true);
  });

  it("finds the MVR consent form in a definitions list", () => {
    expect(
      findProducersMvrConsentForm([{ id: "other", title: "Near miss report" }, mvrForm]),
    ).toEqual(mvrForm);
  });

  it("builds fill URLs with optional personnel attachment", () => {
    expect(producersMvrConsentFormFillHref("form-abc")).toBe(
      "/modules/forms/?tab=fill&form=form-abc",
    );
    expect(producersMvrConsentFormFillHref("form-abc", "person-1")).toBe(
      "/modules/forms/?tab=fill&form=form-abc&personnel=person-1",
    );
  });

  it("detects Producers Rice Mill tenant by slug or display name", () => {
    expect(isProducersRiceMillTenant(PRODUCERS_RICE_MILL_TENANT_SLUG)).toBe(true);
    expect(isProducersRiceMillTenant(null, "Producers Rice Mill")).toBe(true);
    expect(isProducersRiceMillTenant("forge-platform")).toBe(false);
  });
});
