import { describe, expect, it } from "vitest";
import { buildEmergencyAlertSmsBody, estimateSmsSegments } from "./emergency-alerts";

describe("buildEmergencyAlertSmsBody", () => {
  it("matches live SMS body rules", () => {
    expect(buildEmergencyAlertSmsBody({ shortMessage: "Evacuate now", isDrill: false })).toBe(
      "Evacuate now",
    );
    expect(buildEmergencyAlertSmsBody({ shortMessage: "Evacuate now", isDrill: true })).toBe(
      "[DRILL] Evacuate now",
    );
  });
});

describe("estimateSmsSegments", () => {
  it("counts GSM segments", () => {
    expect(estimateSmsSegments("hi").segments).toBe(1);
    expect(estimateSmsSegments("a".repeat(161)).segments).toBe(2);
  });
});
