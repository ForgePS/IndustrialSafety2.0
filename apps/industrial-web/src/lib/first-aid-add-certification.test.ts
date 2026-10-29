import { describe, expect, it } from "vitest";
import {
  buildFirstAidAssignPayload,
  validateFirstAidAddCertification,
} from "./first-aid-add-certification";

const base = {
  personnelId: "11111111-1111-4111-8111-111111111111",
  tracksFirstAid: true,
  cprExpiresDate: "",
  firstAidExpiresDate: "",
  cprDocumentId: "",
  firstAidDocumentId: "",
};

describe("validateFirstAidAddCertification", () => {
  it("requires a personnel file", () => {
    expect(validateFirstAidAddCertification({ ...base, personnelId: "" })).toMatch(/Select/);
  });

  it("requires a cert field", () => {
    expect(validateFirstAidAddCertification({ ...base, tracksFirstAid: true })).toMatch(
      /Add a CPR/,
    );
  });

  it("accepts expiry-only or copy-only", () => {
    expect(validateFirstAidAddCertification({ ...base, cprExpiresDate: "2027-01-15" })).toBeNull();
    expect(
      validateFirstAidAddCertification({
        ...base,
        firstAidDocumentId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBeNull();
  });
});

describe("buildFirstAidAssignPayload", () => {
  it("omits empty optional fields", () => {
    expect(
      buildFirstAidAssignPayload({
        ...base,
        cprExpiresDate: "2027-06-01",
        firstAidDocumentId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      personnelId: base.personnelId,
      tracksFirstAid: true,
      cprCertificationExpiresDate: "2027-06-01",
      firstAidCertificationDocumentId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
