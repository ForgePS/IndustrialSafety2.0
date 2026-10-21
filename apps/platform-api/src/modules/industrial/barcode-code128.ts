/**
 * Minimal Code 128B barcode → SVG (no external barcode dependency).
 * Patterns are the standard Code 128 module sequences (11 modules per symbol).
 */

const CODE128_PATTERNS: string[] = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011",
];

const START_B = 104;
const STOP = 106;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encodeCode128B(text: string): number[] {
  const codes: number[] = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 127) {
      throw new Error(`Code 128B does not support character U+${code.toString(16)}`);
    }
    codes.push(code - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < codes.length; i += 1) {
    checksum += codes[i]! * i;
  }
  codes.push(checksum % 103);
  codes.push(STOP);
  return codes;
}

/** SVG barcode; width/height in pixels. */
export function code128Svg(
  text: string,
  opts?: { widthPx?: number; heightPx?: number; showText?: boolean },
): string {
  const payload = String(text ?? "").trim() || "0";
  const codes = encodeCode128B(payload);
  const modules = codes.map((c) => CODE128_PATTERNS[c] ?? "").join("");
  const quiet = 10;
  const moduleCount = modules.length + quiet * 2;
  const widthPx = Math.max(40, opts?.widthPx ?? moduleCount * 2);
  const showText = opts?.showText !== false;
  const textH = showText ? 14 : 0;
  const heightPx = Math.max(20, opts?.heightPx ?? 60);
  const barH = Math.max(10, heightPx - textH - 2);
  const moduleW = widthPx / moduleCount;

  const rects: string[] = [];
  let x = quiet * moduleW;
  for (const bit of modules) {
    if (bit === "1") {
      rects.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${moduleW.toFixed(2)}" height="${barH}" fill="#111"/>`,
      );
    }
    x += moduleW;
  }

  const label = showText
    ? `<text x="${(widthPx / 2).toFixed(1)}" y="${(barH + 12).toFixed(1)}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#111">${escapeXml(payload)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${rects.join("\n  ")}
  ${label}
</svg>`;
}

export async function code128PngBuffer(
  text: string,
  opts?: { widthPx?: number; heightPx?: number; showText?: boolean },
): Promise<Buffer> {
  const svg = code128Svg(text, opts);
  const widthPx = Math.max(40, opts?.widthPx ?? 200);
  const heightPx = Math.max(20, opts?.heightPx ?? 60);
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, {
      background: "white",
      fitTo: { mode: "width", value: widthPx },
      font: {
        loadSystemFonts: true,
        defaultFontFamily: "DejaVu Sans",
        defaultFontSize: 11,
      },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    // Fallback: return a 1x1 white PNG is useless; rethrow as empty SVG raster via sharp-less path.
    // Encode a minimal valid PNG header isn't worth it — callers fall back to embedding SVG data URI.
    void heightPx;
    throw new Error("Could not rasterize Code 128 barcode (Resvg unavailable)");
  }
}
