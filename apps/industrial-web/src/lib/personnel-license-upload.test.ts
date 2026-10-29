import { describe, expect, it } from "vitest";
import {
  isLicensePdfCopy,
  licenseFileNameFromUpload,
  licenseMimeFromUpload,
} from "./personnel-license-upload";

describe("license PDF detection", () => {
  it("detects PDF from mime, filename, and src", () => {
    expect(isLicensePdfCopy({ mimeType: "application/pdf" })).toBe(true);
    expect(isLicensePdfCopy({ fileName: "VANHOUTEN_-_DL_FRONT.pdf" })).toBe(true);
    expect(
      isLicensePdfCopy({
        src: "https://bucket.s3.amazonaws.com/tenants/x/personnel/license/front/a-DL_FRONT.pdf?X-Amz-Signature=1",
      }),
    ).toBe(true);
    expect(isLicensePdfCopy({ mimeType: "image/jpeg", fileName: "front.jpg" })).toBe(false);
  });

  it("reads mime and name from upload objects", () => {
    expect(
      licenseMimeFromUpload({
        documentId: "01a086d1-4b58-77cc-8727-ecec374177c4",
        contentType: "application/pdf",
        name: "Vanhouten_-_DL_FRONT.pdf",
      }),
    ).toBe("application/pdf");
    expect(
      licenseFileNameFromUpload({
        fileName: "Vanhouten_-_DL_FRONT.pdf",
      }),
    ).toBe("Vanhouten_-_DL_FRONT.pdf");
  });
});
