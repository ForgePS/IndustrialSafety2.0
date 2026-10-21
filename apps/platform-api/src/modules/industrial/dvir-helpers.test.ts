import { describe, expect, it } from "vitest";
import {
  assertDvirDriverBody,
  DVIR_RETENTION_DAYS,
  dvirRetentionCutoffDate,
  dvirStatusForDefects,
  dvirTitle,
  isDvirDotRecord,
  resolveDvirItemsFromPayload,
} from "./dvir-helpers.js";
import { qrCodePngBuffer, qrCodeSvg, qrCodeDvirStickerSvg } from "./qr-svg.js";

const REQUIRED_IDS = [
  "air-compressor",
  "air-lines",
  "battery",
  "brake-accessories",
  "brakes",
  "carburetor",
  "clutch",
  "defroster",
  "drive-line",
  "engine",
  "fifth-wheel",
  "front-axle",
  "fuel-tanks",
  "heater",
  "horn",
  "lights-head-stop",
  "lights-tail-dash",
  "lights-turn",
  "mirrors",
  "muffler",
  "oil-pressure",
  "on-board-recorder",
  "radiator",
  "rear-end",
  "reflectors",
  "springs",
  "starter",
  "steering",
  "tachograph",
  "tires",
  "transmission",
  "wheels",
  "windows",
  "windshield-wipers",
  "truck-other",
  "fire-extinguisher",
  "first-aid-kit",
  "flags-flares-fuses",
  "spare-bulbs-fuses",
  "spare-seal-beam",
  "trailer-brake-connections",
  "trailer-brakes",
  "coupling-chains",
  "coupling-king-pin",
  "doors",
  "hitch",
  "landing-gear",
  "trailer-lights",
  "roof",
  "trailer-springs",
  "tarpaulin",
  "trailer-tires",
  "trailer-wheels",
  "trailer-other",
] as const;

function allYesItems(overrides?: Record<string, { answer: "YES" | "NO" | "NA"; notes?: string }>) {
  return REQUIRED_IDS.map((id) => {
    const override = overrides?.[id];
    return {
      id,
      label: id,
      section: id.startsWith("trailer") ||
        ["coupling-chains", "coupling-king-pin", "doors", "hitch", "landing-gear", "roof", "tarpaulin"].includes(
          id,
        )
        ? "trailer"
        : "truck",
      answer: override?.answer ?? ("YES" as const),
      notes: override?.notes ?? "",
    };
  });
}

describe("dvir-helpers", () => {
  it("titles and status", () => {
    expect(dvirTitle("PRE_TRIP", "12")).toBe("Pre-trip DVIR 12");
    expect(dvirStatusForDefects(0)).toBe("CLOSED");
    expect(dvirStatusForDefects(2)).toBe("OPEN");
  });

  it("asserts driver body with full Yes/No/N/A answers", () => {
    const parsed = assertDvirDriverBody({
      tripType: "POST_TRIP",
      inspectionDate: "2026-08-21",
      truckNumber: "88",
      workerName: "Jamie",
      items: allYesItems(),
      remarks: "",
      conditionSatisfactory: true,
      driverSignatureDataUrl: "data:image/jpeg;base64,xx",
    });
    expect(parsed.tripType).toBe("POST_TRIP");
    expect(parsed.conditionSatisfactory).toBe(true);
    expect(parsed.items).toHaveLength(REQUIRED_IDS.length);
    expect(parsed.truckDefects).toEqual([]);

    expect(() =>
      assertDvirDriverBody({
        tripType: "PRE_TRIP",
        inspectionDate: "2026-08-21",
        truckNumber: "88",
        workerName: "Jamie",
        items: allYesItems({ brakes: { answer: "NO" } }),
        remarks: "",
        conditionSatisfactory: false,
        driverSignatureDataUrl: "data:image/jpeg;base64,xx",
      }),
    ).toThrow(/note/i);

    const withDefect = assertDvirDriverBody({
      tripType: "PRE_TRIP",
      inspectionDate: "2026-08-21",
      truckNumber: "88",
      workerName: "Jamie",
      items: allYesItems({ brakes: { answer: "NO", notes: "Soft pedal" } }),
      remarks: "",
      conditionSatisfactory: false,
      driverSignatureDataUrl: "data:image/jpeg;base64,xx",
    });
    expect(withDefect.truckDefects).toEqual(["brakes"]);
    expect(withDefect.items.find((item) => item.id === "brakes")?.notes).toBe("Soft pedal");
  });

  it("rejects incomplete checklists", () => {
    expect(() =>
      assertDvirDriverBody({
        tripType: "PRE_TRIP",
        inspectionDate: "2026-08-21",
        truckNumber: "88",
        workerName: "Jamie",
        items: allYesItems().slice(0, 10),
        conditionSatisfactory: true,
        driverSignatureDataUrl: "data:image/jpeg;base64,xx",
      }),
    ).toThrow(/every item/i);
  });

  it("retention cutoff is 91 calendar days", () => {
    expect(DVIR_RETENTION_DAYS).toBe(91);
    const now = new Date("2026-08-22T12:00:00Z");
    expect(dvirRetentionCutoffDate(now)).toBe("2026-05-24");
  });

  it("resolveDvirItemsFromPayload fills legacy defect lists", () => {
    const items = resolveDvirItemsFromPayload({
      truckDefects: ["brakes"],
      trailerDefects: ["trailer-tires"],
      remarks: "Needs shop",
    });
    expect(items.length).toBeGreaterThan(50);
    expect(items.find((item) => item.id === "brakes")?.answer).toBe("NO");
    expect(items.find((item) => item.id === "trailer-tires")?.answer).toBe("NO");
    expect(items.find((item) => item.id === "horn")?.answer).toBe("YES");
  });

  it("isDvirDotRecord detects DVIR payloads", () => {
    expect(isDvirDotRecord({ recordType: "DVIR" }, null)).toBe(true);
    expect(isDvirDotRecord({}, "dvirs")).toBe(true);
    expect(isDvirDotRecord({ recordType: "MVR" }, "drivers")).toBe(false);
  });
});

describe("qr-svg", () => {
  it("returns an svg for a path-style DVIR url", async () => {
    const svg = await qrCodeSvg("https://example.com/dvir/abc123456789012345678901234");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.length).toBeGreaterThan(500);
  });

  it("supports longer production hostnames", async () => {
    const url =
      "https://www.industrial.forgepublicsafety.com/dvir/abcdefghijklmnopqrstuvwxyz123456";
    const svg = await qrCodeSvg(url);
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("returns a png buffer for sticker printing", async () => {
    const png = await qrCodePngBuffer("https://example.com/dvir/abc123456789012345678901234");
    expect(png.length).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
  });

  it("builds a printable sticker with asset label and VIN", async () => {
    const url = "https://example.com/dvir/abc123456789012345678901234";
    const svg = await qrCodeDvirStickerSvg(url, {
      assetLabel: "Unit 12",
      vin: "1HGCM82633A123456",
    });
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("Unit 12");
    expect(svg).toContain("VIN: 1HGCM82633A123456");
    expect(svg).toContain("data:image/png;base64,");
  });
});
