import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  parseAudience,
  pickSmsNotificationPhone,
} from "./industrial-emergency-alerts-audience.js";

describe("emergency alerts audience", () => {
  it("defaults to TENANT when no targets are selected", () => {
    expect(parseAudience({})).toEqual({
      scope: "TENANT",
      locationIds: [],
      departmentIds: [],
      groupIds: [],
      personnelIds: [],
    });
  });

  it("marks TARGETED when locations are selected", () => {
    const audience = parseAudience({
      locationIds: ["site-1", "site-1", ""],
      departmentIds: ["dept-1"],
    });
    expect(audience.scope).toBe("TARGETED");
    expect(audience.locationIds).toEqual(["site-1"]);
    expect(audience.departmentIds).toEqual(["dept-1"]);
  });

  it("normalizes US phone numbers", () => {
    expect(normalizePhone("(501) 555-1212")).toBe("5015551212");
    expect(normalizePhone("+1 501-555-1212")).toBe("5015551212");
    expect(normalizePhone("123")).toBeNull();
  });

  it("uses personnel phone as the SMS Notification number", () => {
    expect(pickSmsNotificationPhone("(501) 555-1212").eligible).toBe(true);
    expect(pickSmsNotificationPhone("").eligible).toBe(false);
    expect(pickSmsNotificationPhone("").reason).toBe("NO_MOBILE_NUMBER");
  });
});
