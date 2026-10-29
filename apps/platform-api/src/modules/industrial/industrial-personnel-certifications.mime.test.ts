import { describe, expect, it } from "vitest";
import {
  isAllowedPersonnelCertMime,
  isPersonnelCertKind,
  personnelCertColumn,
  personnelCertObjectKeyPrefix,
} from "./industrial-personnel-certifications.mime.js";

describe("personnel cert mime helpers", () => {
  it("accepts PDF and common images", () => {
    expect(isAllowedPersonnelCertMime("application/pdf")).toBe(true);
    expect(isAllowedPersonnelCertMime("image/jpeg")).toBe(true);
    expect(isAllowedPersonnelCertMime("application/json")).toBe(false);
  });

  it("parses kind helpers", () => {
    expect(isPersonnelCertKind("CPR")).toBe(true);
    expect(isPersonnelCertKind("FIRST_AID")).toBe(true);
    expect(isPersonnelCertKind("OTHER")).toBe(false);
    expect(personnelCertColumn("CPR")).toBe("cprCertificationDocumentId");
    expect(personnelCertColumn("FIRST_AID")).toBe("firstAidCertificationDocumentId");
    expect(personnelCertObjectKeyPrefix("t1", "CPR")).toContain("/cpr/");
  });
});
