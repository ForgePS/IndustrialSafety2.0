import { describe, expect, it } from "vitest";
import { code128Svg } from "./barcode-code128.js";
import {
  defaultElementsLayout,
  elementsToZpl,
  parseLayoutElements,
  resolveElementContent,
} from "./industrial-label-elements.js";

describe("label elements + barcode", () => {
  it("builds default ELEMENTS layout with qr and barcode", () => {
    const layout = defaultElementsLayout();
    expect(layout.kind).toBe("ELEMENTS");
    expect(parseLayoutElements(layout).some((e) => e.type === "qr")).toBe(true);
    expect(parseLayoutElements(layout).some((e) => e.type === "barcode")).toBe(true);
  });

  it("resolves dynamic text and emits ZPL with QR + Code 128", () => {
    const elements = parseLayoutElements(defaultElementsLayout());
    const values = {
      title: "LOTO Tag",
      body: "Valve A",
      qr: "https://forge.example/loto/1",
      asset: "EQ-42",
    };
    expect(resolveElementContent(elements[0]!, values)).toBe("LOTO Tag");
    const zpl = elementsToZpl({
      widthInches: 4,
      heightInches: 4,
      dpi: 300,
      elements,
      values,
    });
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^BQN");
    expect(zpl).toContain("^BCN");
    expect(zpl).toContain("EQ-42");
    expect(zpl).toContain("^XZ");
  });

  it("renders Code 128 SVG modules", () => {
    const svg = code128Svg("ABC-123", { widthPx: 200, heightPx: 60 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("ABC-123");
    expect(svg).toContain("<rect");
  });
});
