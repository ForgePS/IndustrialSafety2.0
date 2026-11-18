/** Convert an inline data URL into a Blob for reliable browser preview/open. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]*)(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(trimmed);
  if (!match) {
    throw new Error("Invalid file data.");
  }
  const mime = match[1]?.trim() || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const body = match[3] ?? "";
  if (isBase64) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

export function isFleetImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

export function isFleetPdfMime(mime: string): boolean {
  const lower = mime.toLowerCase();
  return lower === "application/pdf" || lower.includes("pdf");
}

export function blobUrlFromDataUrl(dataUrl: string): string {
  return URL.createObjectURL(dataUrlToBlob(dataUrl));
}

export function inlineDataUrlFromRow(row: Record<string, unknown>): string | null {
  const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl.trim() : "";
  return dataUrl.startsWith("data:") ? dataUrl : null;
}

export function mimeFromDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl.trim())?.[1]?.trim() || "application/octet-stream";
}
