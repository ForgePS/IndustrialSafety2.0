import { describe, expect, it } from "vitest";
import { certCopyFromRecord, guessPersonnelCertMime } from "./personnel-cert-upload";

describe("guessPersonnelCertMime", () => {
  it("prefers the browser-provided type", () => {
    const file = new File([""], "card.pdf", { type: "application/pdf" });
    expect(guessPersonnelCertMime(file)).toBe("application/pdf");
  });

  it("falls back from the extension", () => {
    const file = new File([""], "card.JPG", { type: "" });
    expect(guessPersonnelCertMime(file)).toBe("image/jpeg");
  });
});

describe("certCopyFromRecord", () => {
  it("reads nested copy metadata", () => {
    expect(
      certCopyFromRecord(
        {
          cprCertificationCopy: {
            documentId: "11111111-1111-4111-8111-111111111111",
            originalFilename: "cpr.pdf",
            mimeType: "application/pdf",
          },
        },
        "CPR",
      ),
    ).toEqual({
      documentId: "11111111-1111-4111-8111-111111111111",
      originalFilename: "cpr.pdf",
      mimeType: "application/pdf",
    });
  });

  it("falls back to a bare document id", () => {
    expect(
      certCopyFromRecord(
        { firstAidCertificationDocumentId: "22222222-2222-4222-8222-222222222222" },
        "FIRST_AID",
      ),
    ).toEqual({
      documentId: "22222222-2222-4222-8222-222222222222",
      originalFilename: "Certification copy",
    });
  });

  it("returns null when nothing is on file", () => {
    expect(certCopyFromRecord({}, "CPR")).toBeNull();
  });
});
