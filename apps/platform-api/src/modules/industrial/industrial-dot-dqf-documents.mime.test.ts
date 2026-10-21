import { describe, expect, it } from "vitest";
import {
  dotDqfDocumentObjectKeyPrefix,
  isAllowedDotDqfDocumentMime,
  MAX_DOT_DQF_DOCUMENT_BYTES,
} from "./industrial-dot-dqf-documents.mime.js";

describe("dot dqf document mime helpers", () => {
  it("accepts PDF and common images", () => {
    expect(isAllowedDotDqfDocumentMime("application/pdf")).toBe(true);
    expect(isAllowedDotDqfDocumentMime("image/jpeg")).toBe(true);
    expect(isAllowedDotDqfDocumentMime("application/json")).toBe(false);
  });

  it("builds tenant-scoped object keys", () => {
    expect(dotDqfDocumentObjectKeyPrefix("t1", "medicalCertCopy")).toBe(
      "tenants/t1/dot/dqf/medicalCertCopy/",
    );
    expect(MAX_DOT_DQF_DOCUMENT_BYTES).toBeGreaterThan(1_000_000);
  });
});
