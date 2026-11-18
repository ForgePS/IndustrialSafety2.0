import { describe, expect, it } from "vitest";
import {
  COMPANY_DOCUMENT_ALLOWED_MIME_TYPES,
  isAllowedCompanyDocumentMime,
} from "./company-documents.mime.js";

describe("company document mime allowlist", () => {
  it("accepts PDF, Office, and common image types", () => {
    expect(isAllowedCompanyDocumentMime("application/pdf")).toBe(true);
    expect(isAllowedCompanyDocumentMime("application/msword")).toBe(true);
    expect(
      isAllowedCompanyDocumentMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedCompanyDocumentMime("application/vnd.ms-excel")).toBe(true);
    expect(
      isAllowedCompanyDocumentMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(isAllowedCompanyDocumentMime("image/jpeg")).toBe(true);
    expect(isAllowedCompanyDocumentMime("image/png")).toBe(true);
    expect(isAllowedCompanyDocumentMime("image/webp")).toBe(true);
    expect(isAllowedCompanyDocumentMime("image/gif")).toBe(true);
  });

  it("rejects disallowed or blank mime types", () => {
    expect(isAllowedCompanyDocumentMime("application/zip")).toBe(false);
    expect(isAllowedCompanyDocumentMime("text/html")).toBe(false);
    expect(isAllowedCompanyDocumentMime("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedCompanyDocumentMime("Application/PDF")).toBe(true);
    expect(isAllowedCompanyDocumentMime(" IMAGE/PNG ")).toBe(true);
  });

  it("exposes a stable allowlist set", () => {
    expect(COMPANY_DOCUMENT_ALLOWED_MIME_TYPES.has("application/pdf")).toBe(true);
    expect(COMPANY_DOCUMENT_ALLOWED_MIME_TYPES.size).toBeGreaterThanOrEqual(9);
  });
});
