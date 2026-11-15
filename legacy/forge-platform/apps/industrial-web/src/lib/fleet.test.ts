import { describe, expect, it } from "vitest";
import {
  FLEET_COMMON_MAINTENANCE_ITEMS,
  fleetAssetHref,
  fleetAssetLabel,
  fleetAssetPrintFieldValues,
  fleetAssetPrintQrUrl,
  fleetDocumentPreviewSrc,
  fleetListHref,
  fleetMaintenanceItemByTitle,
} from "./fleet";

describe("fleet helpers", () => {
  it("builds static-export asset hrefs", () => {
    expect(fleetAssetHref("abc-1")).toBe("/modules/fleet/asset/?id=abc-1");
    expect(fleetListHref("maintenance")).toBe("/modules/fleet/?tab=maintenance");
  });

  it("labels assets from year/make/model or plate", () => {
    expect(fleetAssetLabel({ year: 2019, make: "Ford", model: "F-150" })).toBe("2019 Ford F-150");
    expect(fleetAssetLabel({ licensePlate: "ABC123" })).toBe("ABC123");
  });

  it("returns image previews for document rows", () => {
    expect(fleetDocumentPreviewSrc({ dataUrl: "data:image/jpeg;base64,AAA" })).toBe(
      "data:image/jpeg;base64,AAA",
    );
    expect(fleetDocumentPreviewSrc({ dataUrl: "data:application/pdf;base64,AAA" })).toBeNull();
  });

  it("maps common maintenance items to types", () => {
    expect(FLEET_COMMON_MAINTENANCE_ITEMS.some((i) => i.title === "Oil change")).toBe(true);
    expect(fleetMaintenanceItemByTitle("Tire replacement")?.maintenanceType).toBe("TIRES");
    expect(fleetMaintenanceItemByTitle("Other")?.maintenanceType).toBe("OTHER");
  });

  it("includes a QR payload pointing at the asset page for non-DOT assets", () => {
    const qr = fleetAssetPrintQrUrl(
      { id: "veh-1", assetNumber: "U-12" },
      "https://industrial.example.com",
    );
    expect(qr).toBe("https://industrial.example.com/modules/fleet/asset/?id=veh-1");
    const fields = fleetAssetPrintFieldValues(
      { id: "veh-1", assetNumber: "U-12", vin: "1FT" },
      { appBaseUrl: "https://industrial.example.com" },
    );
    expect(fields.qrPayload).toBe(qr);
    expect(fields.qr).toBe(qr);
    expect(fields.unit).toBe("U-12");
    expect(fields.vin).toBe("1FT");
  });

  it("omits fallback asset-page QR for DOT assets until DVIR URL is supplied", () => {
    const fields = fleetAssetPrintFieldValues(
      { id: "veh-1", dotRegulated: true, assetNumber: "T-9" },
      { appBaseUrl: "https://industrial.example.com" },
    );
    expect(fields.qrPayload).toBeUndefined();
    expect(fields.unit).toBe("T-9");
  });

  it("allows an explicit QR override (e.g. DVIR public URL)", () => {
    const fields = fleetAssetPrintFieldValues(
      { id: "veh-1", dotRegulated: true },
      { qrPayload: "https://industrial.example.com/dvir/token123" },
    );
    expect(fields.qrPayload).toBe("https://industrial.example.com/dvir/token123");
  });

  it("resolves DOT Brady QR via ensure helper", async () => {
    const { ensureFleetDvirPrintQrPayload } = await import("./fleet");
    const url = await ensureFleetDvirPrintQrPayload(
      { id: "veh-1", dotRegulated: true },
      {
        appBaseUrl: "https://industrial.example.com",
        ensureDvirQr: async () => ({ url: "https://industrial.example.com/dvir/abc" }),
      },
    );
    expect(url).toBe("https://industrial.example.com/dvir/abc");
  });
});
