import { describe, expect, it } from "vitest";
import { resolveReportPhotos, reportPhotosHtml } from "./report-photo.js";

describe("resolveReportPhotos", () => {
  const marked = {
    dataUrl: "data:image/jpeg;base64,marked",
    originalDataUrl: "data:image/jpeg;base64,original",
    hasMarkup: true,
    fileName: "guard.jpg",
  };

  it("prefers marked when available", () => {
    const out = resolveReportPhotos(marked, "marked_if_available");
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("marked");
    expect(out[0]?.src).toContain("marked");
  });

  it("returns both when requested", () => {
    const out = resolveReportPhotos(marked, "both");
    expect(out.map((r) => r.kind)).toEqual(["original", "marked"]);
  });

  it("returns original only", () => {
    const out = resolveReportPhotos(marked, "original");
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("original");
  });
});

describe("reportPhotosHtml", () => {
  it("renders figures", () => {
    const html = reportPhotosHtml([
      {
        dataUrl: "data:image/jpeg;base64,abc",
        hasMarkup: false,
        fileName: "a.jpg",
      },
    ]);
    expect(html).toContain("<figure");
    expect(html).toContain("a.jpg");
  });
});
