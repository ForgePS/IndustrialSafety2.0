import { describe, expect, it } from "vitest";
import {
  companyDriverMvrConsentOnFile,
  companyDriverMvrOnFile,
  missingCompanyDriverMvrRequirements,
  parseCompanyDriverMvrSnapshot,
} from "./company-driver-mvr-requirements";

describe("company-driver-mvr-requirements", () => {
  it("detects MVR and consent on file", () => {
    const snapshot = parseCompanyDriverMvrSnapshot({
      lastMvrDate: "2026-01-01",
      mvrReleaseUploadCount: 1,
    });
    expect(companyDriverMvrOnFile(snapshot)).toBe(true);
    expect(companyDriverMvrConsentOnFile(snapshot)).toBe(true);
    expect(missingCompanyDriverMvrRequirements(snapshot)).toEqual([]);
  });

  it("reports missing MVR and consent", () => {
    expect(missingCompanyDriverMvrRequirements(parseCompanyDriverMvrSnapshot({}))).toEqual([
      "MVR",
      "MVR Consent form",
    ]);
  });

  it("parses uploaded MVR report and consent file lists", () => {
    const snapshot = parseCompanyDriverMvrSnapshot({
      mvrFiles: [{ name: "mvr.pdf", documentId: "11111111-1111-1111-1111-111111111111" }],
      mvrConsentFiles: [
        { name: "consent.pdf", documentId: "22222222-2222-2222-2222-222222222222" },
      ],
    });
    expect(companyDriverMvrOnFile(snapshot)).toBe(true);
    expect(companyDriverMvrConsentOnFile(snapshot)).toBe(true);
    expect(snapshot?.mvrFiles?.[0]?.documentId).toBe("11111111-1111-1111-1111-111111111111");
    expect(snapshot?.mvrConsentFiles?.[0]?.name).toBe("consent.pdf");
  });
});
