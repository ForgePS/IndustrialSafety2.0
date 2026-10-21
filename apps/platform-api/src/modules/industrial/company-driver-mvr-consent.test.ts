import { describe, expect, it } from "vitest";
import {
  companyDriverMvrConsentOnFile,
  fleetDriverMissingMvrConsent,
} from "./company-driver-mvr-consent.js";

describe("company-driver MVR consent", () => {
  it("treats a release date or signed upload as on file", () => {
    expect(companyDriverMvrConsentOnFile({ mvrReleaseDate: "2026-01-04" })).toBe(true);
    expect(
      companyDriverMvrConsentOnFile({
        mvrReleaseUploads: [{ fileName: "consent.pdf" }],
      }),
    ).toBe(true);
    expect(companyDriverMvrConsentOnFile({})).toBe(false);
  });

  it("flags active roster rows without consent and skips removed drivers", () => {
    expect(fleetDriverMissingMvrConsent({ status: "on_insurance", payload: {} })).toBe(true);
    expect(
      fleetDriverMissingMvrConsent({
        status: "on_insurance",
        payload: { status: "removed" },
      }),
    ).toBe(false);
    expect(
      fleetDriverMissingMvrConsent({
        status: "removed",
        payload: {},
      }),
    ).toBe(false);
  });
});
