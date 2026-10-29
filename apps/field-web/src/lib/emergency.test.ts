import { describe, expect, it } from "vitest";
import {
  alertAppliesToLocation,
  alertNeedsAcknowledgment,
  criticalFieldsFromRecord,
  filterEmergencyByLocation,
  filterEmergencyByTab,
  isActiveEmergencyAlert,
  parseEmergencyCategory,
  plantEmergencyNumber,
  telHref,
} from "./emergency";
import { isEmergencyFeatureModuleEnabled, isFieldFeatureModuleEnabled } from "./field-modules";
import { fieldHrefFromIndustrialPath, hubPathForTarget } from "./scan-routes";

describe("emergency helpers", () => {
  it("parses category query and filters by Location", () => {
    expect(parseEmergencyCategory("fire")).toBe("fire");
    expect(parseEmergencyCategory("unknown")).toBe("eap");
    expect(
      filterEmergencyByLocation(
        [
          { id: "1", siteId: "loc-1", title: "A" },
          { id: "2", siteId: "loc-2", title: "B" },
          { id: "3", title: "C" },
        ],
        "loc-1",
      ).map((r) => r.id),
    ).toEqual(["1", "3"]);
  });

  it("soft-filters scenario tabs by keywords and falls back to full list", () => {
    const rows = [
      { id: "1", title: "Tornado shelter plan" },
      { id: "2", title: "General scenario" },
    ];
    expect(filterEmergencyByTab(rows, "weather").map((r) => r.id)).toEqual(["1"]);
    expect(filterEmergencyByTab([{ id: "9", title: "Misc" }], "fire")).toHaveLength(1);
  });

  it("detects active alerts and audience location targeting", () => {
    expect(isActiveEmergencyAlert({ id: "a", status: "ACTIVE" })).toBe(true);
    expect(isActiveEmergencyAlert({ id: "b", status: "CLEARED" })).toBe(false);
    expect(
      alertAppliesToLocation(
        { id: "a", audience: { scope: "TARGETED", locationIds: ["loc-1"] } },
        "loc-1",
      ),
    ).toBe(true);
    expect(
      alertAppliesToLocation(
        { id: "a", audience: { scope: "TARGETED", locationIds: ["loc-2"] } },
        "loc-1",
      ),
    ).toBe(false);
  });

  it("reads plant emergency number and builds tel links", () => {
    expect(
      plantEmergencyNumber({
        settings: { plantEmergencyNumber: "555-0100" },
      }),
    ).toBe("555-0100");
    expect(telHref("(555) 010-0200")).toBe("tel:5550100200");
  });

  it("surfaces critical procedure fields", () => {
    const fields = criticalFieldsFromRecord({
      id: "1",
      title: "Muster",
      status: "ACTIVE",
      sourcePayload: { musterPoint: "Lot B", phone: "555-9" },
    });
    expect(fields.find((f) => f.label === "Muster point")?.value).toBe("Lot B");
    expect(fields.find((f) => f.label === "Phone")?.value).toBe("555-9");
  });
  it("detects when acknowledgment is still required", () => {
    expect(alertNeedsAcknowledgment({ id: "a", requiresAcknowledgment: true })).toBe(true);
    expect(
      alertNeedsAcknowledgment({
        id: "a",
        requiresAcknowledgment: true,
        myAcknowledgment: { id: "ack", acknowledgedAt: "2026-09-11T12:00:00.000Z" },
      }),
    ).toBe(false);
    expect(alertNeedsAcknowledgment({ id: "a", requiresAcknowledgment: false })).toBe(false);
  });
});

describe("emergency feature gating", () => {
  it("shows Emergency when either alerts or response module is enabled", () => {
    expect(isEmergencyFeatureModuleEnabled(["EMERGENCY_ALERTS"])).toBe(true);
    expect(isEmergencyFeatureModuleEnabled(["EMERGENCY_RESPONSE"])).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "more-emergency")).toBe(false);
    expect(isFieldFeatureModuleEnabled(["EMERGENCY_RESPONSE"], "more-emergency")).toBe(true);
  });
});

describe("emergency scan routes", () => {
  it("deep-links emergency procedures and alerts", () => {
    expect(hubPathForTarget("EMERGENCY_PROCEDURE", "p1")).toBe(
      "/more/emergency/?id=p1&category=eap",
    );
    expect(hubPathForTarget("EMERGENCY_ALERT", "a1")).toBe("/more/emergency/?id=a1&kind=alert");
    expect(
      fieldHrefFromIndustrialPath("/modules/emergency-alerts?alertId=a9", {
        targetType: "EMERGENCY",
        targetId: "",
        qrLinkId: null,
      }),
    ).toBe("/more/emergency/?id=a9&kind=alert");
  });
});
