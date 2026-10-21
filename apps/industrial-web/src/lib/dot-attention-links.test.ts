import { describe, expect, it } from "vitest";
import {
  dqfWorksheetFocusKey,
  resolveDotAttentionHref,
} from "./dot-attention-links";
import type { DotAttentionIssue } from "./dot-dqf-attention";

describe("dot-attention-links", () => {
  it("maps license fields to the CDL worksheet section", () => {
    expect(dqfWorksheetFocusKey("cdlExpiry")).toBe("cdl-section");
    expect(dqfWorksheetFocusKey("driversLicenseCopy")).toBe("cdl-section");
    expect(dqfWorksheetFocusKey("mvrAnnual")).toBe("mvrAnnual");
  });

  it("opens linked forms for form-backed DQF fields", () => {
    const issue: DotAttentionIssue = {
      kind: "missingDocuments",
      recordId: "drv-1",
      driverName: "Ada Byron",
      fieldId: "mvrReleaseForm",
      personnelId: "person-1",
      reason: "Missing MVR Consent",
    };
    const href = resolveDotAttentionHref(issue, {
      dqfFormIds: { mvrReleaseForm: "form-mvr" },
    });
    expect(href).toBe("/modules/forms/?tab=fill&form=form-mvr&personnel=person-1");
  });

  it("opens the MVR Consent form for missing company-driver consent", () => {
    const issue: DotAttentionIssue = {
      kind: "missingMvrConsent",
      recordId: "fleet-1",
      driverName: "Roster Driver",
      fieldId: "mvrReleaseForm",
      personnelId: "person-9",
      reason: "Missing MVR Consent form",
      source: "fleet",
    };
    expect(
      resolveDotAttentionHref(issue, {
        dqfFormIds: { mvrReleaseForm: "form-mvr" },
        companyDriversHref: "/modules/personnel/?view=company-drivers",
      }),
    ).toBe("/modules/forms/?tab=fill&form=form-mvr&personnel=person-9");
  });

  it("opens the DQF file at the worksheet field when no digital form exists", () => {
    const issue: DotAttentionIssue = {
      kind: "expired",
      recordId: "drv-1",
      driverName: "Ada Byron",
      fieldId: "cdlExpiry",
      reason: "License expired",
    };
    expect(
      resolveDotAttentionHref(issue, { dqfFormIds: {} }),
    ).toBe("/modules/dot-compliance/file/?id=drv-1&focus=cdl-section");
  });

  it("opens generic form fill for non-MVR linked templates", () => {
    const issue: DotAttentionIssue = {
      kind: "missingDocuments",
      recordId: "drv-2",
      driverName: "Tim",
      fieldId: "certificationOfRoadTest",
      personnelId: "person-2",
      reason: "Missing road test",
    };
    const href = resolveDotAttentionHref(issue, {
      dqfFormIds: { certificationOfRoadTest: "form-road" },
    });
    expect(href).toBe(
      "/modules/forms/?tab=fill&form=form-road&personnel=person-2&dotRecord=drv-2",
    );
  });

  it("opens the personnel file for company roster license issues", () => {
    const issue: DotAttentionIssue = {
      kind: "expired",
      recordId: "fleet-1",
      driverName: "Roster Driver",
      fieldId: "cdlExpiry",
      personnelId: "person-9",
      reason: "Expired 2024-01-01",
      source: "fleet",
    };
    expect(resolveDotAttentionHref(issue, { dqfFormIds: {} })).toBe(
      "/modules/personnel/person/?id=person-9",
    );
  });
});
