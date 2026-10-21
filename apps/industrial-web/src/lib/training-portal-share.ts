import { openPrintableHtmlPopup } from "@/lib/dvir";

export const TRAINING_PORTAL_HEADING = "Company Training Portal";

export function buildPortalShareText(url: string, title?: string): string {
  const heading = title?.trim() || TRAINING_PORTAL_HEADING;
  return [
    heading,
    "",
    "Scan the QR code or open this link to sign in with your EMPLOYEE number:",
    url,
  ].join("\n");
}

export async function copyPortalShareText(url: string, title?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildPortalShareText(url, title));
    return true;
  } catch {
    return false;
  }
}

export async function copyPortalUrl(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load QR image"));
    image.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

export async function buildPortalShareCardBlob(input: {
  qrImageSrc: string;
  url: string;
  title?: string;
}): Promise<Blob> {
  const qrImage = await loadImage(input.qrImageSrc);
  const padding = 32;
  const qrSize = 280;
  const cardWidth = qrSize + padding * 2;
  const title = input.title?.trim() || TRAINING_PORTAL_HEADING;

  const scratch = document.createElement("canvas");
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) throw new Error("Could not create share card");

  scratchCtx.font = "bold 20px system-ui, sans-serif";
  const titleLines = wrapText(scratchCtx, title, cardWidth - padding * 2);
  const urlText = input.url.trim();
  scratchCtx.font = "14px system-ui, sans-serif";
  const urlLines = urlText ? wrapText(scratchCtx, urlText, cardWidth - padding * 2) : [];

  const textBlockHeight =
    titleLines.length * 26 + 12 + (urlLines.length ? urlLines.length * 20 + 16 : 8);
  const cardHeight = padding + qrSize + 24 + textBlockHeight + padding;

  const canvas = document.createElement("canvas");
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create share card");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cardWidth, cardHeight);
  ctx.drawImage(qrImage, padding, padding, qrSize, qrSize);

  let y = padding + qrSize + 28;
  ctx.fillStyle = "#111111";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const line of titleLines) {
    ctx.fillText(line, cardWidth / 2, y);
    y += 26;
  }

  y += 8;
  if (urlLines.length) {
    ctx.fillStyle = "#444444";
    ctx.font = "14px system-ui, sans-serif";
    for (const line of urlLines) {
      ctx.fillText(line, cardWidth / 2, y);
      y += 20;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not export share card"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export async function sharePortalQrAndUrl(input: {
  url: string;
  title?: string;
  qrBlob: Blob;
  fileName?: string;
}): Promise<"shared" | "copied" | "failed"> {
  const text = buildPortalShareText(input.url, input.title);
  const file = new File([input.qrBlob], input.fileName ?? "training-portal-qr.png", {
    type: input.qrBlob.type || "image/png",
  });

  if (typeof navigator.share === "function") {
    const shareData: ShareData = { title: input.title ?? TRAINING_PORTAL_HEADING, text };
    if (typeof navigator.canShare === "function" && navigator.canShare({ ...shareData, files: [file] })) {
      try {
        await navigator.share({ ...shareData, files: [file] });
        return "shared";
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return "failed";
      }
    }

    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "failed";
    }
  }

  if (await copyPortalShareText(input.url, input.title)) return "copied";
  return "failed";
}

/** PNG card with the Company Training Portal heading and QR code (no URL). */
export async function buildTrainingPortalQrCardBlob(input: {
  qrImageSrc: string;
}): Promise<Blob> {
  return buildPortalShareCardBlob({
    qrImageSrc: input.qrImageSrc,
    url: "",
    title: TRAINING_PORTAL_HEADING,
  });
}

export async function downloadTrainingPortalQrPng(input: {
  qrImageSrc: string;
  fileName?: string;
}): Promise<void> {
  const blob = await buildTrainingPortalQrCardBlob(input);
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = input.fileName ?? "company-training-portal-qr.png";
  anchor.click();
  URL.revokeObjectURL(href);
}

/** Opens a print dialog for the Company Training Portal QR card. */
export async function printTrainingPortalQr(input: {
  qrImageSrc: string;
}): Promise<string | null> {
  if (typeof window === "undefined") return "Browser only";
  try {
    const blob = await buildTrainingPortalQrCardBlob(input);
    const imageSrc = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read QR card for print."));
      reader.readAsDataURL(blob);
    });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${TRAINING_PORTAL_HEADING}</title>
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
  <img src="${imageSrc}" alt="${TRAINING_PORTAL_HEADING}" />
</body>
</html>`;
    return openPrintableHtmlPopup(html, true);
  } catch (error) {
    return error instanceof Error ? error.message : "Could not print training portal QR.";
  }
}
