import { decodeBase64ToBlob } from "@/lib/binary";
import { drawCenteredLines, printDvirQrSticker, stickerTextLines } from "@/lib/dvir-qr-sticker";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load QR image for sticker."));
    img.src = src;
  });
}

function blockHeight(lineCount: number, fontSize: number, lineGap: number): number {
  if (lineCount <= 0) return 0;
  return lineCount * fontSize + Math.max(0, lineCount - 1) * lineGap;
}

/** Printable PNG sticker: optional label/subtitle/description over a scannable QR. */
export async function composeQrLinkStickerBlob(
  qrPngBase64: string,
  label: string,
  subtitle?: string | null,
  description?: string | null,
): Promise<Blob> {
  const qrBlob = decodeBase64ToBlob(qrPngBase64, "image/png");
  const qrObjectUrl = URL.createObjectURL(qrBlob);
  try {
    const qrImg = await loadImage(qrObjectUrl);
    const qrSize = qrImg.naturalWidth || qrImg.width || 320;
    const pad = 24;
    const titleSize = 22;
    const subSize = 15;
    const descLabelSize = 13;
    const descSize = 13;
    const lineGap = 4;
    const blockGap = 10;
    const maxTextWidth = qrSize;
    const titleText = label.trim();
    const subText = subtitle?.trim() ?? "";
    // Reject non-string / object stringifications from callers.
    const descText =
      typeof description === "string" && !description.includes("[object Object]")
        ? description.trim()
        : "";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");

    // Empty label → QR-only sticker (no default "QR link" heading).
    let titleLines: string[] = [];
    if (titleText) {
      ctx.font = `bold ${titleSize}px Arial, Helvetica, sans-serif`;
      titleLines = stickerTextLines(ctx, titleText, maxTextWidth, 3);
    }

    let subLines: string[] = [];
    if (subText) {
      ctx.font = `${subSize}px Arial, Helvetica, sans-serif`;
      subLines = stickerTextLines(ctx, subText, maxTextWidth, 2);
    }

    let descLabelLines: string[] = [];
    let descBodyLines: string[] = [];
    if (descText) {
      ctx.font = `bold ${descLabelSize}px Arial, Helvetica, sans-serif`;
      descLabelLines = ["Description"];
      ctx.font = `${descSize}px Arial, Helvetica, sans-serif`;
      descBodyLines = stickerTextLines(ctx, descText, maxTextWidth, 4);
    }

    const titleBlock = blockHeight(titleLines.length, titleSize, lineGap);
    const subBlock =
      subLines.length > 0 ? blockGap + blockHeight(subLines.length, subSize, lineGap) : 0;
    const descBlock =
      descLabelLines.length > 0
        ? blockGap +
          blockHeight(descLabelLines.length, descLabelSize, lineGap) +
          (descBodyLines.length > 0
            ? lineGap + blockHeight(descBodyLines.length, descSize, lineGap)
            : 0)
        : 0;
    // Always leave space between the last text block and the QR.
    const qrGap =
      titleLines.length > 0 || subLines.length > 0 || descLabelLines.length > 0 ? blockGap : 0;

    const width = qrSize + pad * 2;
    const height = pad + titleBlock + subBlock + descBlock + qrGap + qrSize + pad;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    let cursor = pad;

    if (titleLines.length > 0) {
      ctx.font = `bold ${titleSize}px Arial, Helvetica, sans-serif`;
      drawCenteredLines(ctx, titleLines, width / 2, cursor + titleSize, titleSize, lineGap);
      cursor += titleBlock;
    }

    if (subLines.length > 0) {
      cursor += blockGap;
      ctx.fillStyle = "#333333";
      ctx.font = `${subSize}px Arial, Helvetica, sans-serif`;
      drawCenteredLines(ctx, subLines, width / 2, cursor + subSize, subSize, lineGap);
      cursor += blockHeight(subLines.length, subSize, lineGap);
    }

    if (descLabelLines.length > 0) {
      cursor += blockGap;
      ctx.fillStyle = "#111111";
      ctx.font = `bold ${descLabelSize}px Arial, Helvetica, sans-serif`;
      drawCenteredLines(
        ctx,
        descLabelLines,
        width / 2,
        cursor + descLabelSize,
        descLabelSize,
        lineGap,
      );
      cursor += blockHeight(descLabelLines.length, descLabelSize, lineGap);
      if (descBodyLines.length > 0) {
        cursor += lineGap;
        ctx.fillStyle = "#333333";
        ctx.font = `${descSize}px Arial, Helvetica, sans-serif`;
        drawCenteredLines(ctx, descBodyLines, width / 2, cursor + descSize, descSize, lineGap);
        cursor += blockHeight(descBodyLines.length, descSize, lineGap);
      }
    }

    cursor += qrGap;
    ctx.drawImage(qrImg, pad, cursor, qrSize, qrSize);

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

export async function printQrLinkSticker(
  stickerObjectUrl: string,
  title = "Forge QR sticker",
  stickerBlob?: Blob | null,
): Promise<string | null> {
  return printDvirQrSticker(stickerObjectUrl, title, stickerBlob);
}
