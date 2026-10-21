import { decodeBase64ToBlob } from "@/lib/binary";
import { openPrintableHtmlPopup } from "@/lib/dvir";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read sticker for print."));
    reader.readAsDataURL(blob);
  });
}

async function stickerSrcForPrint(
  stickerObjectUrl: string,
  stickerBlob?: Blob | null,
): Promise<string> {
  if (stickerBlob) return blobToDataUrl(stickerBlob);
  if (stickerObjectUrl.startsWith("data:")) return stickerObjectUrl;

  // Re-rasterize via canvas — fetch(blob:) is unreliable in some browsers.
  const img = await loadImage(stickerObjectUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error("Sticker image has no dimensions.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

/** Opens a print dialog for the composed DVIR QR sticker image. */
export async function printDvirQrSticker(
  stickerObjectUrl: string,
  title = "DVIR vehicle QR",
  stickerBlob?: Blob | null,
): Promise<string | null> {
  if (typeof window === "undefined") return "Browser only";
  if (!stickerObjectUrl && !stickerBlob) return "Issue or refresh the QR sticker before printing.";
  try {
    const imageSrc = await stickerSrcForPrint(stickerObjectUrl, stickerBlob);
    const safeTitle = escapeHtml(title);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { margin: 0.5in; }
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      background: #fff;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <img id="sticker" src="${imageSrc}" alt="${safeTitle}" />
  <script>
    (function () {
      function runPrint() {
        try {
          window.focus();
          window.print();
        } catch (e) { /* ignore */ }
      }
      var img = document.getElementById("sticker");
      if (!img) return;
      if (img.complete && img.naturalWidth > 0) {
        runPrint();
        return;
      }
      img.addEventListener("load", runPrint);
      img.addEventListener("error", function () {
        document.body.textContent = "Sticker image could not load for printing.";
      });
    })();
  </script>
</body>
</html>`;
    return openPrintableHtmlPopup(html, false);
  } catch {
    return "Could not prepare sticker for printing.";
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load QR image for sticker."));
    img.src = src;
  });
}

function splitLongToken(ctx: CanvasRenderingContext2D, token: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let rest = token;
  while (rest.length > 0) {
    let end = rest.length;
    while (end > 1 && ctx.measureText(rest.slice(0, end)).width > maxWidth) {
      end -= 1;
    }
    lines.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return lines;
}

/** Split label text into up to `maxLines` lines that fit sticker width. */
export function stickerTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];

  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    if (!word) continue;
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) {
        const tail = words.slice(i).join(" ");
        lines[maxLines - 1] = `${lines[maxLines - 1]} ${tail}`.trim();
        return lines;
      }
    }

    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }

    const chunks = splitLongToken(ctx, word, maxWidth);
    for (const chunk of chunks) {
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1]}${chunk}`.trim();
        return lines;
      }
      lines.push(chunk);
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [normalized];
}

export function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  startY: number,
  fontSize: number,
  lineGap: number,
): number {
  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, centerX, y);
    y += fontSize + lineGap;
  }
  return y;
}

/** Raster PNG sticker: asset name, VIN, and scannable QR (labels baked in for print). */
export async function composeDvirQrStickerBlob(
  qrPngBase64: string,
  assetName: string,
  vin?: string | null,
): Promise<Blob> {
  const qrBlob = decodeBase64ToBlob(qrPngBase64, "image/png");
  const qrObjectUrl = URL.createObjectURL(qrBlob);
  try {
    const qrImg = await loadImage(qrObjectUrl);
    const qrSize = qrImg.naturalWidth || qrImg.width || 320;
    const pad = 24;
    const assetSize = 22;
    const vinSize = 15;
    const lineGap = 4;
    const blockGap = 10;
    const maxTextWidth = qrSize;
    const vinText = vin?.trim() ?? "";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");

    ctx.font = `bold ${assetSize}px Arial, Helvetica, sans-serif`;
    const assetLines = stickerTextLines(
      ctx,
      assetName.trim() || "Vehicle",
      maxTextWidth,
      2,
    );

    let vinLines: string[] = [];
    if (vinText) {
      ctx.font = `${vinSize}px Arial, Helvetica, sans-serif`;
      vinLines = stickerTextLines(ctx, `VIN: ${vinText}`, maxTextWidth, 2);
    }

    const assetBlock =
      assetLines.length * assetSize + Math.max(0, assetLines.length - 1) * lineGap;
    const vinBlock =
      vinLines.length > 0
        ? vinLines.length * vinSize + Math.max(0, vinLines.length - 1) * lineGap + blockGap
        : 0;

    const width = qrSize + pad * 2;
    const height = pad + assetBlock + vinBlock + qrSize + pad;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold ${assetSize}px Arial, Helvetica, sans-serif`;
    let y = drawCenteredLines(ctx, assetLines, width / 2, pad + assetSize, assetSize, lineGap);

    if (vinLines.length > 0) {
      y += blockGap;
      ctx.fillStyle = "#333333";
      ctx.font = `${vinSize}px Arial, Helvetica, sans-serif`;
      drawCenteredLines(ctx, vinLines, width / 2, y + vinSize - lineGap, vinSize, lineGap);
    }

    const qrY = pad + assetBlock + vinBlock;
    ctx.drawImage(qrImg, pad, qrY, qrSize, qrSize);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Sticker export failed."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(qrObjectUrl);
  }
}
