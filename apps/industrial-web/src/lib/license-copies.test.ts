import { describe, expect, it } from "vitest";
import {
  hasLicenseCopyGap,
  isAcceptableLicenseImage,
  isOversizedLicenseImage,
  MAX_LICENSE_DATA_URL_LENGTH,
  personnelLicenseCopies,
  toLicenseUpload,
  uploadImageSrc,
} from "./license-copies";

describe("uploadImageSrc", () => {
  it("reads data URLs and https URLs from strings", () => {
    expect(uploadImageSrc("data:image/jpeg;base64,AAA")).toBe("data:image/jpeg;base64,AAA");
    expect(uploadImageSrc("https://cdn.example/dl-front.jpg")).toBe(
      "https://cdn.example/dl-front.jpg",
    );
    expect(uploadImageSrc("  ")).toBeNull();
    expect(uploadImageSrc("ftp://x")).toBeNull();
  });

  it("reads common upload object keys", () => {
    expect(uploadImageSrc({ dataUrl: "data:image/png;base64,BB" })).toBe(
      "data:image/png;base64,BB",
    );
    expect(uploadImageSrc({ downloadURL: "https://firebasestorage.googleapis.com/x" })).toBe(
      "https://firebasestorage.googleapis.com/x",
    );
    expect(uploadImageSrc({ url: "https://cdn.example/back.jpg", fileName: "back.jpg" })).toBe(
      "https://cdn.example/back.jpg",
    );
  });
});

describe("personnelLicenseCopies", () => {
  it("prefers explicit URL fields over upload objects", () => {
    expect(
      personnelLicenseCopies({
        licenseFrontUrl: "https://a/front.jpg",
        licenseFrontUpload: { url: "https://b/front.jpg" },
        licenseBackUpload: { dataUrl: "data:image/jpeg;base64,BACK" },
      }),
    ).toEqual({
      front: "https://a/front.jpg",
      back: "data:image/jpeg;base64,BACK",
    });
  });

  it("falls back to a single driversLicenseCopy as the front image", () => {
    expect(
      personnelLicenseCopies({
        driversLicenseCopy: { url: "https://cdn.example/dl.jpg" },
      }),
    ).toEqual({
      front: "https://cdn.example/dl.jpg",
      back: null,
    });
  });

  it("reports missing sides", () => {
    expect(hasLicenseCopyGap({ front: "x", back: "y" })).toBe(false);
    expect(hasLicenseCopyGap({ front: "x", back: null })).toBe(true);
  });
});

describe("toLicenseUpload / size checks", () => {
  it("builds an upload object from a data URL", () => {
    const upload = toLicenseUpload("data:image/jpeg;base64,AAA", "front");
    expect(upload).toMatchObject({
      dataUrl: "data:image/jpeg;base64,AAA",
      fileName: "drivers-license-front.jpg",
      contentType: "image/jpeg",
    });
    expect(typeof upload?.uploadedAt).toBe("string");
  });

  it("rejects oversized data URLs", () => {
    const huge = `data:image/jpeg;base64,${"A".repeat(MAX_LICENSE_DATA_URL_LENGTH)}`;
    expect(isOversizedLicenseImage(huge)).toBe(true);
    expect(isAcceptableLicenseImage(huge)).toBe(false);
    expect(isAcceptableLicenseImage("https://cdn.example/ok.jpg")).toBe(true);
  });
});
