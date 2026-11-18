import { describe, expect, it } from "vitest";
import {
  formatSmsNotificationDisplay,
  normalizeSmsDigits,
  parsePersonnelSmsAuthorization,
  smsAuthorizationStatusLabel,
} from "./personnel-sms-authorization";

describe("personnel SMS authorization", () => {
  it("uses personnel phone as the SMS Notification number", () => {
    const state = parsePersonnelSmsAuthorization({
      phone: "(501) 555-1212",
      smsAuthorizedAt: "2026-09-04T12:00:00.000Z",
    });
    expect(state.smsNotificationNumber).toBe("(501) 555-1212");
    expect(state.smsAuthorized).toBe(true);
    expect(state.phoneValid).toBe(true);
    expect(smsAuthorizationStatusLabel(state)).toBe("Authorized");
  });

  it("formats and validates US numbers", () => {
    expect(normalizeSmsDigits("+1 501-555-1212")).toBe("5015551212");
    expect(formatSmsNotificationDisplay("5015551212")).toBe("(501) 555-1212");
    expect(normalizeSmsDigits("123")).toBeNull();
  });

  it("reports phone required when missing", () => {
    const state = parsePersonnelSmsAuthorization({});
    expect(state.smsAuthorized).toBe(false);
    expect(smsAuthorizationStatusLabel(state)).toBe("Phone required");
  });
});
