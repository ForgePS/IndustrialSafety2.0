import { describe, expect, it } from "vitest";
import {
  generatePublicToken,
  hashPublicToken,
  isValidPublicToken,
  normalizeQrAccessMode,
  QR_AUDIT_EVENT_TYPES,
} from "./qr-token.js";

describe("qr-token", () => {
  it("generates opaque non-sequential tokens", () => {
    const a = generatePublicToken();
    const b = generatePublicToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(isValidPublicToken(a)).toBe(true);
    expect(isValidPublicToken("short")).toBe(false);
  });

  it("hashes tokens stably without leaking the raw value", () => {
    const token = generatePublicToken();
    const hash = hashPublicToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashPublicToken(token));
    expect(hash).not.toContain(token);
  });

  it("normalizes access modes", () => {
    expect(normalizeQrAccessMode("employee-number")).toBe("EMPLOYEE_NUMBER");
    expect(normalizeQrAccessMode("PUBLIC_LIMITED")).toBe("PUBLIC_LIMITED");
  });

  it("includes admin audit event types required by the QR sprint", () => {
    expect(QR_AUDIT_EVENT_TYPES).toContain("ACCESS_MODE_CHANGED");
    expect(QR_AUDIT_EVENT_TYPES).toContain("ACTION_CONFIGURATION_CHANGED");
    expect(QR_AUDIT_EVENT_TYPES).toContain("ASSIGNED");
    expect(QR_AUDIT_EVENT_TYPES).toContain("PRINTED");
  });
});
