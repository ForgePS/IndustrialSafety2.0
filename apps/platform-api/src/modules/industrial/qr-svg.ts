/**
 * DVIR vehicle QR stickers — uses the `qrcode` library for scanner-compatible output.
 */
import QRCode from "qrcode";

const QR_OPTIONS = {
  errorCorrectionLevel: "Q" as const,
  margin: 4,
};

export type DvirQrStickerOptions = {
  assetLabel: string;
  vin?: string | null;
  qrSizePx?: number;
};

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Primary sticker line: asset number/name before year/make/model fallback. */
export function fleetVehicleStickerAssetLabel(row: {
  assetNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  licensePlate?: string | null;
  id?: string;
}): string {
  const assetNumber = row.assetNumber?.trim();
  if (assetNumber) return assetNumber;
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ");
  if (ymm) return ymm;
  const plate = row.licensePlate?.trim();
  if (plate) return plate;
  return row.id ?? "Vehicle";
}

export async function qrCodeSvg(text: string, sizePx = 256): Promise<string> {
  return QRCode.toString(text, {
    ...QR_OPTIONS,
    type: "svg",
    width: sizePx,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export async function qrCodePngBuffer(text: string, sizePx = 280): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    ...QR_OPTIONS,
    type: "png",
    width: sizePx,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Printable sticker: asset label, optional VIN line, and scannable QR. */
export async function qrCodeDvirStickerSvg(url: string, options: DvirQrStickerOptions): Promise<string> {
  const qrSize = options.qrSizePx ?? 280;
  const png = await qrCodePngBuffer(url, qrSize);
  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  const assetLabel = escapeSvgText(options.assetLabel.trim() || "Vehicle");
  const vin = options.vin?.trim() || "";
  const vinEscaped = vin ? escapeSvgText(vin) : "";

  const pad = 20;
  const titleSize = 22;
  const vinSize = 15;
  const lineGap = 10;
  const titleLine = titleSize + lineGap;
  const vinLine = vin ? vinSize + lineGap : 0;
  const width = qrSize + pad * 2;
  const height = pad + titleLine + vinLine + qrSize + pad;

  const titleY = pad + titleSize;
  const vinY = pad + titleLine + vinSize;
  const qrY = pad + titleLine + vinLine;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${width / 2}" y="${titleY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700" fill="#111111">${assetLabel}</text>
  ${vin ? `<text x="${width / 2}" y="${vinY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${vinSize}" fill="#333333">VIN: ${vinEscaped}</text>` : ""}
  <image href="${dataUri}" x="${pad}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
</svg>`;
}
