import { describe, expect, it } from "vitest";
import {
  buildLotoBatchPrintableHtml,
  buildLotoPrintableHtml,
  plainLotoPrintText,
  resolveLotoSheetBackgroundUrl,
} from "./loto-print.js";

describe("loto-print", () => {
  it("rejects corrupted object-string scope text", () => {
    expect(plainLotoPrintText("[object Object],[object Object]")).toBe("");
    expect(plainLotoPrintText({ id: 1 } as unknown as string)).toBe("");
    expect(plainLotoPrintText("Isolate fan")).toBe("Isolate fan");
  });

  it("resolves a sheet background url", () => {
    const url = resolveLotoSheetBackgroundUrl("https://example.com");
    expect(
      url.startsWith("data:image/png;base64,") || url.includes("producers-loto-procedure-sheet"),
    ).toBe(true);
  });

  it("builds a 2-page printable with steps, photos, and editable page-2 content", () => {
    const html = buildLotoPrintableHtml({
      detail: {
        title: "Boiler LOTO",
        equipmentName: "Boiler",
        procedureNumber: "PRM-UTL-001",
        revision: "1",
        siteName: "Utilities",
        departmentName: "Utilities",
        areaName: "Utilities",
        createdAt: "2026-07-24T12:00:00.000Z",
        updatedAt: "2026-07-24T12:00:00.000Z",
        scope: "[object Object],[object Object]",
        notes: [{ text: "Ensure the machine has come to a complete stop." }],
        equipmentImageUrl: "data:image/jpeg;base64,equip",
        equipmentImageAnnotations: [{ id: "a1", x1: 0.2, y1: 0.3, x2: 0.6, y2: 0.55 }],
        printPurpose: "Custom purpose text",
        printScopeStatement: "Custom scope text",
        printEnforcement: "Custom enforcement text",
        shutdownSequence: [{ step: "Notify", description: "Tell everyone" }],
        restoreSequence: [{ step: "Inspect", description: "Look around" }],
        steps: [
          {
            stepNumber: 1,
            stepPhase: "ISOLATION",
            isVerification: false,
            instruction: "Open disconnect",
            sourcePayload: {
              energySourceName: "Electrical",
              descriptionCode: "E-1 480V",
              customDescription: "Main disconnect at panel E-4",
              printedProcedureDescription:
                "Move disconnect to off position and lock out — Detail: Main disconnect at panel E-4",
              lockoutDeviceName: "lock and hasp",
              verificationMethodName: "Attempt restart at all control panels",
              stepImageUrl: "data:image/jpeg;base64,step",
              stepImageAnnotations: [{ id: "s1", x1: 0.1, y1: 0.1, x2: 0.4, y2: 0.5 }],
            },
          },
        ],
      },
      sheetBackgroundUrl: "data:image/png;base64,sheet",
      qrImageDataUrl: "data:image/png;base64,qrcode",
    });
    expect(html).toContain("Print / Save as PDF");
    expect(html).toContain("PRM-UTL-001");
    expect(html).toContain("Boiler");
    expect(html).toContain("ENERGY ISOLATION POINT");
    expect(html).toContain("Move disconnect to off position and lock out");
    expect(html).not.toContain("qr-desc");
    expect(html).not.toContain("step-own-desc");
    expect(html).not.toContain("Main disconnect at panel E-4");
    expect(html).not.toContain("Detail: Main disconnect at panel E-4");
    expect(html).toContain("Description:");
    expect(html).not.toContain("Equipment:");
    expect(html).toContain("LOCKOUT POINT");
    expect(html).toContain("data:image/jpeg;base64,equip");
    expect(html).toContain("data:image/jpeg;base64,step");
    expect(html).toContain("data:image/png;base64,qrcode");
    expect(html).toContain("meta-qr");
    expect(html).not.toContain("qr-equip");
    expect(html).not.toContain("qr-id");
    expect(html).not.toContain("qr-desc");
    expect(html).not.toContain("qr-block");
    expect(html).toContain("equip-hero");
    expect(html).toContain("info-photo");
    expect(html).toContain("loto-annotated-photo");
    expect(html).toContain("loto-photo-arrows");
    expect(html).toContain('x1="0.2"');
    expect(html).toContain('x1="0.1"');
    expect(html).toContain("#dc2626");
    expect(html).toContain("🔒E");
    expect(html).toContain("Custom purpose text");
    expect(html).toContain("SHUTDOWN, LOCK, TAG");
    expect(html).toContain("section-bar shutdown");
    expect(html).toContain("RESTORE TO SERVICE SEQUENCE");
    expect(html).toContain("section-bar restore");
    expect(html).toContain("Tell everyone");
    expect(html).toContain("Look around");
    expect(html).toContain("Typical minimal lockout procedures");
    expect(html).not.toContain("gallery-label");
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("Screenshot");
  });

  it("keeps all isolation steps on page 1 with QR beside Location", () => {
    const html = buildLotoPrintableHtml({
      detail: {
        title: "Baghouse LOTO",
        equipmentName: "Baghouse",
        procedureNumber: "PRM-BH-001",
        revision: "1",
        equipmentImageUrl: "data:image/jpeg;base64,equip",
        steps: [1, 2, 3, 4].map((n) => ({
          stepNumber: n,
          stepPhase: "ISOLATION",
          isVerification: false,
          instruction: `Isolate point ${n}`,
          sourcePayload: {
            energySourceName: n % 2 === 0 ? "Pneumatic" : "Electrical",
            descriptionCode: n % 2 === 0 ? `P-${n}` : `E-${n}`,
            printedProcedureDescription: `Action for step ${n}`,
            verificationMethodName: "Attempt restart at all control panels",
            stepImageUrl: `data:image/jpeg;base64,step${n}`,
          },
        })),
      },
      sheetBackgroundUrl: "data:image/png;base64,sheet",
      qrImageDataUrl: "data:image/png;base64,qrcode",
    });
    expect(html).toContain("ENERGY ISOLATION POINT");
    expect(html).not.toContain("ENERGY ISOLATION POINT (continued)");
    expect(html).toContain("Action for step 1");
    expect(html).toContain("Action for step 2");
    expect(html).toContain("Action for step 3");
    expect(html).toContain("Action for step 4");
    expect(html).toContain("meta-qr");
    expect(html).toContain("Location:");
    expect((html.match(/class="sheet sheet--page1/g) || []).length).toBe(1);
  });

  it("prints multiple equipment and step photos when arrays are present", () => {
    const html = buildLotoPrintableHtml({
      detail: {
        title: "Press LOTO",
        equipmentName: "Press",
        procedureNumber: "PRM-001",
        revision: "1",
        equipmentImages: [
          { imageUrl: "data:image/jpeg;base64,equip1" },
          { imageUrl: "data:image/jpeg;base64,equip2" },
        ],
        steps: [
          {
            stepNumber: 1,
            stepPhase: "ISOLATION",
            isVerification: false,
            instruction: "Open disconnect",
            sourcePayload: {
              energySourceName: "Electrical",
              descriptionCode: "E-1",
              printedProcedureDescription: "Open disconnect",
              verificationMethodName: "Try start",
              stepImages: [
                { imageUrl: "data:image/jpeg;base64,stepA" },
                { imageUrl: "data:image/jpeg;base64,stepB" },
              ],
            },
          },
        ],
      },
      sheetBackgroundUrl: "data:image/png;base64,sheet",
    });
    expect(html).toContain("data:image/jpeg;base64,equip1");
    expect(html).toContain("data:image/jpeg;base64,equip2");
    expect(html).toContain("data:image/jpeg;base64,stepA");
    expect(html).toContain("data:image/jpeg;base64,stepB");
    expect(html).toContain("Equipment photo 1");
    expect(html).toContain("Equipment photo 2");
  });

  it("prints the completed date and leaves no blank page after the last sheet", () => {
    const html = buildLotoPrintableHtml({
      detail: { equipmentName: "Press", approvedAt: "2026-03-05T15:00:00.000Z", steps: [] },
      qrImageDataUrl: null,
    });
    expect(html).toContain("Completed:");
    expect(html).toMatch(/Completed:<\/span><span class="value">[^<]*2026/);
    // Breaks go before each sheet after the first, never after the last one.
    expect(html).toContain(".sheet + .sheet");
    expect(html).not.toMatch(/\.sheet\s*\{[^}]*break-after:\s*page/);
  });

  it("shows a dash when a procedure has no completed date", () => {
    const html = buildLotoPrintableHtml({ detail: { equipmentName: "Press", steps: [] } });
    expect(html).toMatch(/Completed:<\/span><span class="value">—</);
  });

  it("puts several procedures into one printable document", () => {
    const html = buildLotoBatchPrintableHtml([
      { detail: { equipmentName: "Press A", steps: [] } },
      { detail: { equipmentName: "Press B", steps: [] } },
    ]);
    expect(html.match(/<!doctype html>/gi)?.length).toBe(1);
    expect(html).toContain("Press A");
    expect(html).toContain("Press B");
    expect(html).toContain("<title>2 LOTO procedures</title>");
    expect(html.match(/class="sheet[ "]/g)?.length).toBe(4);
  });
});
