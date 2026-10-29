/**
 * Shared client-side image compression for personnel, DOT/DQF, fleet, and
 * related uploads. Prefer iterative JPEG shrink until under a size budget so
 * phone camera photos stop failing after a single soft compress pass.
 */

export const DEFAULT_MAX_DATA_URL_LENGTH = 3_500_000;
export const DEFAULT_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Soft target for S3 photo uploads — keeps requests fast and under edge limits. */
export const TARGET_UPLOAD_BYTES = 2_500_000;

export const IMAGE_COMPRESS_STEPS: Array<{ maxDim: number; quality: number }> = [
  { maxDim: 1600, quality: 0.78 },
  { maxDim: 1400, quality: 0.7 },
  { maxDim: 1200, quality: 0.62 },
  { maxDim: 1000, quality: 0.55 },
  { maxDim: 800, quality: 0.48 },
  { maxDim: 640, quality: 0.4 },
  { maxDim: 480, quality: 0.35 },
];

const IMAGE_NAME_PATTERN = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_NAME_PATTERN.test(file.name);
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function encodeJpegDataUrl(bitmap: ImageBitmap, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to compress image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function canvasToBlob(bitmap: ImageBitmap, maxDim: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Unable to compress image"));
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to compress image"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function tryCreateImageBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

/**
 * Compress an image file to a JPEG data URL under `maxLength`.
 * Non-image files are returned as raw data URLs (caller should size-check).
 */
export async function compressImageToDataUrl(
  file: File,
  maxLength: number = DEFAULT_MAX_DATA_URL_LENGTH,
): Promise<string> {
  if (!isLikelyImageFile(file)) {
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > maxLength) {
      throw new Error("IMAGE_TOO_LARGE");
    }
    return dataUrl;
  }

  const bitmap = await tryCreateImageBitmap(file);
  if (!bitmap) {
    // HEIC / unsupported decode — fall back to raw read if it already fits.
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > maxLength) {
      throw new Error("IMAGE_UNSUPPORTED");
    }
    return dataUrl;
  }

  try {
    let last = "";
    for (const step of IMAGE_COMPRESS_STEPS) {
      last = encodeJpegDataUrl(bitmap, step.maxDim, step.quality);
      if (last.length <= maxLength) return last;
    }
    throw new Error("IMAGE_TOO_LARGE");
  } finally {
    bitmap.close();
  }
}

/**
 * Prepare a file for binary/S3 upload. Images are iteratively JPEG-compressed
 * toward `targetBytes` and must finish under `maxBytes`. PDFs and other
 * non-images pass through unchanged (still size-checked).
 */
export async function compressImageToUploadFile(
  file: File,
  options?: {
    maxBytes?: number;
    targetBytes?: number;
  },
): Promise<File> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const targetBytes = options?.targetBytes ?? TARGET_UPLOAD_BYTES;

  if (file.size <= 0) {
    throw new Error("File is empty.");
  }
  if (isPdfFile(file) || !isLikelyImageFile(file)) {
    if (file.size > maxBytes) {
      throw new Error(`File must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`);
    }
    return file;
  }

  // Already small enough — keep original (preserves HEIC/PNG when tiny).
  if (file.size <= targetBytes) {
    return file;
  }

  const bitmap = await tryCreateImageBitmap(file);
  if (!bitmap) {
    if (file.size <= maxBytes) return file;
    throw new Error(
      "This photo format could not be compressed in the browser. Convert to JPG or PDF and try again.",
    );
  }

  try {
    let lastBlob: Blob | null = null;
    for (const step of IMAGE_COMPRESS_STEPS) {
      lastBlob = await canvasToBlob(bitmap, step.maxDim, step.quality);
      if (lastBlob.size <= targetBytes) break;
      if (
        lastBlob.size <= maxBytes &&
        step === IMAGE_COMPRESS_STEPS[IMAGE_COMPRESS_STEPS.length - 1]
      ) {
        break;
      }
    }
    if (!lastBlob) throw new Error("Unable to compress image");
    if (lastBlob.size > maxBytes) {
      throw new Error("IMAGE_TOO_LARGE");
    }
    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    return new File([lastBlob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export function imageCompressErrorMessage(
  err: unknown,
  fallback = "Unable to read that image.",
): string {
  if (err instanceof Error) {
    if (err.message === "IMAGE_TOO_LARGE") {
      return "Image is too large after compression. Try a clearer, closer photo.";
    }
    if (err.message === "IMAGE_UNSUPPORTED") {
      return "This photo format could not be compressed. Convert to JPG or PNG and try again.";
    }
    if (err.message.trim()) return err.message;
  }
  return fallback;
}
