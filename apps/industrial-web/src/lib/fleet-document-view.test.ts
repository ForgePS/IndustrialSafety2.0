import { describe, expect, it } from "vitest";
import {
  dataUrlToBlob,
  isFleetImageMime,
  isFleetPdfMime,
} from "./fleet-document-view";

describe("fleet-document-view", () => {
  it("converts base64 image data URLs to blobs", () => {
    const blob = dataUrlToBlob("data:image/png;base64,QUJD");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
  });

  it("detects image and pdf mime types", () => {
    expect(isFleetImageMime("image/jpeg")).toBe(true);
    expect(isFleetPdfMime("application/pdf")).toBe(true);
    expect(isFleetImageMime("application/pdf")).toBe(false);
  });
});
