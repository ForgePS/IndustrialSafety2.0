import { describe, expect, it } from "vitest";
import {
  assertQrLinkStatus,
  generateDisplayCode,
  generatePublicToken,
  hashPublicToken,
  isPublicQrAccessMode,
  isPublicRequiredQrTarget,
  isValidPublicToken,
  normalizeQrAccessMode,
  parseOptionalUuid,
  publicTokenHint,
  resolveQrAccessModeForTarget,
} from "./qr-token.js";

describe("qr-token", () => {
  it("hashes tokens deterministically with sha256 hex", () => {
    const token = "test-token-value-123456";
    expect(hashPublicToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPublicToken(token)).toBe(hashPublicToken(token));
  });

  it("generates base64url tokens of sufficient length", () => {
    const token = generatePublicToken();
    expect(token.length).toBeGreaterThanOrEqual(16);
    expect(isValidPublicToken(token)).toBe(true);
  });

  it("validates public token bounds", () => {
    expect(isValidPublicToken("short")).toBe(false);
    expect(isValidPublicToken("x".repeat(16))).toBe(true);
    expect(isValidPublicToken("x".repeat(257))).toBe(false);
  });

  it("normalizes access modes", () => {
    expect(normalizeQrAccessMode("authenticated_record")).toBe("AUTHENTICATED_RECORD");
    expect(normalizeQrAccessMode(undefined)).toBe("AUTHENTICATED_ONLY");
    expect(normalizeQrAccessMode("unknown-mode")).toBe("AUTHENTICATED_ONLY");
  });

  it("forces PUBLIC_ACTION for LOTO and fleet vehicle targets", () => {
    expect(resolveQrAccessModeForTarget("LOTO_PROCEDURE", "EMPLOYEE_NUMBER")).toBe("PUBLIC_ACTION");
    expect(resolveQrAccessModeForTarget("VEHICLE", "AUTHENTICATED_ONLY")).toBe("PUBLIC_ACTION");
    expect(resolveQrAccessModeForTarget("EQUIPMENT", "EMPLOYEE_NUMBER")).toBe("EMPLOYEE_NUMBER");
    expect(isPublicRequiredQrTarget("LOTO_PROCEDURE")).toBe(true);
    expect(isPublicRequiredQrTarget("VEHICLE")).toBe(true);
    expect(isPublicQrAccessMode("PUBLIC_ACTION")).toBe(true);
    expect(isPublicQrAccessMode("EMPLOYEE_NUMBER")).toBe(false);
  });

  it("parses optional UUIDs including Forge UUIDv7 ids", () => {
    expect(parseOptionalUuid("")).toBeNull();
    expect(parseOptionalUuid("not-a-uuid")).toBeNull();
    expect(parseOptionalUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(parseOptionalUuid("019ff7d0-c20f-7659-81e4-c0cd68e23262")).toBe(
      "019ff7d0-c20f-7659-81e4-c0cd68e23262",
    );
    expect(parseOptionalUuid("analytics")).toBeNull();
  });

  it("asserts QR link statuses", () => {
    expect(assertQrLinkStatus("active")).toBe("ACTIVE");
    expect(() => assertQrLinkStatus("bogus")).toThrow(/Invalid QR link status/);
  });

  it("builds a short public token hint", () => {
    const hash = hashPublicToken("demo-token-for-hint-test");
    expect(publicTokenHint(hash)).toMatch(/^.{8}…$/);
    expect(publicTokenHint(null)).toBeNull();
  });

  it("generates display codes", () => {
    expect(generateDisplayCode()).toMatch(/^QR-[0-9A-F]{6}$/);
  });
});
