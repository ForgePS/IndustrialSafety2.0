/** Clipboard helpers for LOTO procedure / step photos. */

import { compressImageToDataUrl, DEFAULT_MAX_DATA_URL_LENGTH } from "@/lib/compress-image";

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp)(\?|#|$)/i;
const IMAGE_MIME = /^image\/(jpeg|png|webp|heic|heif|gif|bmp)$/i;

export function isLotoImageFile(file: File): boolean {
  return IMAGE_MIME.test(file.type) || IMAGE_EXT.test(file.name);
}

export function isDisplayableLotoImageUrl(url: string | null | undefined): boolean {
  const value = (url ?? "").trim();
  if (!value) return false;
  return /^(data:image\/|blob:|https?:\/\/)/i.test(value);
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function dedupeFiles(files: File[]): File[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (!isLotoImageFile(file) && !file.type.startsWith("image/")) return false;
    const key = fileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Prefer clipboard files, then image clipboard items (Snipping Tool / Ctrl+C image). */
export function imagesFromClipboardEvent(event: ClipboardEvent): File[] {
  const fromFiles = Array.from(event.clipboardData?.files ?? []);
  const fromItems = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return dedupeFiles([...fromFiles, ...fromItems]);
}

export function imageFilesFromFileList(list: FileList | null | undefined): File[] {
  return dedupeFiles(Array.from(list ?? []));
}

/** True when clipboard carries image bytes or an image URL (browser may otherwise open a tab). */
export function clipboardLooksLikeImage(event: ClipboardEvent): boolean {
  if (imagesFromClipboardEvent(event).length > 0) return true;
  const data = event.clipboardData;
  if (!data) return false;
  if (Array.from(data.types).some((t) => t.startsWith("image/"))) return true;
  const text = data.getData("text/uri-list") || data.getData("text/plain") || "";
  if (looksLikeImageUrl(text)) return true;
  const html = data.getData("text/html") || "";
  return /<img\b/i.test(html) || /https?:\/\/[^"'>\s]+\.(jpe?g|png|webp|gif|bmp)/i.test(html);
}

export function looksLikeImageUrl(value: string): boolean {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (IMAGE_EXT.test(text)) return true;
  // Common CDN / signed URLs without a file extension.
  return /[?&](content-type|response-content-type)=image%2F/i.test(text) || /\/image\//i.test(text);
}

export function imageUrlFromClipboardEvent(event: ClipboardEvent): string | null {
  const data = event.clipboardData;
  if (!data) return null;
  const uri = (data.getData("text/uri-list") || "")
    .split(/\r?\n/)
    .find((line) => looksLikeImageUrl(line));
  if (uri) return uri.trim();
  const plain = (data.getData("text/plain") || "").trim();
  if (looksLikeImageUrl(plain)) return plain;
  const html = data.getData("text/html") || "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1] && isDisplayableLotoImageUrl(match[1])) return match[1].trim();
  return null;
}

export async function fileFromImageUrl(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch the pasted image URL.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") && !IMAGE_EXT.test(url)) {
    throw new Error("Pasted link is not an image.");
  }
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return new File([blob], `pasted-loto-photo.${ext}`, { type });
}

export async function readImagesFromClipboard(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    throw new Error(
      "Clipboard paste is not available in this browser. Use Ctrl+V in the photo box.",
    );
  }
  const items = await navigator.clipboard.read();
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    files.push(new File([blob], `pasted-loto-photo.${ext}`, { type: blob.type || type }));
  }
  return files;
}

export async function copyImageUrlToClipboard(url: string): Promise<void> {
  const src = url.trim();
  if (!src) throw new Error("No photo to copy.");
  if (!navigator.clipboard?.write) {
    throw new Error("Clipboard copy is not available in this browser.");
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not read the photo to copy.");
  const blob = await response.blob();
  const type = blob.type.startsWith("image/") ? blob.type : "image/png";
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
}

/** Compress to JPEG data URL so LOTO payloads stay under typical API body limits. */
export async function compressLotoImageFile(
  file: File,
): Promise<{ dataUrl: string; fileName: string }> {
  const fileName = file.name?.trim() || `loto-photo-${Date.now()}.jpg`;
  const dataUrl = await compressImageToDataUrl(file, DEFAULT_MAX_DATA_URL_LENGTH);
  return {
    dataUrl,
    fileName: /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(fileName)
      ? fileName.replace(/\.\w+$/, "") + ".jpg"
      : `${fileName}.jpg`,
  };
}
