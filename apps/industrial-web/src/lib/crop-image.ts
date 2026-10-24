/**
 * Client-side image crop helpers — produce a JPEG File from a natural-pixel crop.
 */

export type ImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageCropAspect = "free" | "license" | "square" | "4:3";

/** US driver's license aspect ≈ 3.375" × 2.125" → ~1.588. */
export const LICENSE_CARD_ASPECT = 85.6 / 53.98;

export function aspectRatioForPreset(preset: ImageCropAspect): number | null {
  if (preset === "free") return null;
  if (preset === "license") return LICENSE_CARD_ASPECT;
  if (preset === "square") return 1;
  return 4 / 3;
}

export function clampCropRect(
  crop: ImageCropRect,
  imageWidth: number,
  imageHeight: number,
  minSize = 32,
): ImageCropRect {
  const maxW = Math.max(1, imageWidth);
  const maxH = Math.max(1, imageHeight);
  let width = Math.min(Math.max(minSize, crop.width), maxW);
  let height = Math.min(Math.max(minSize, crop.height), maxH);
  const x = Math.min(Math.max(0, crop.x), Math.max(0, maxW - width));
  const y = Math.min(Math.max(0, crop.y), Math.max(0, maxH - height));
  width = Math.min(width, maxW - x);
  height = Math.min(height, maxH - y);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** Default crop inset ~8% so the user starts already trimming edges. */
export function defaultCropRect(
  imageWidth: number,
  imageHeight: number,
  aspect: number | null = null,
): ImageCropRect {
  const insetX = imageWidth * 0.08;
  const insetY = imageHeight * 0.08;
  let width = Math.max(32, imageWidth - insetX * 2);
  let height = Math.max(32, imageHeight - insetY * 2);
  if (aspect && aspect > 0) {
    if (width / height > aspect) {
      width = height * aspect;
    } else {
      height = width / aspect;
    }
  }
  const x = (imageWidth - width) / 2;
  const y = (imageHeight - height) / 2;
  return clampCropRect({ x, y, width, height }, imageWidth, imageHeight);
}

export function applyAspectToCrop(
  crop: ImageCropRect,
  imageWidth: number,
  imageHeight: number,
  aspect: number | null,
): ImageCropRect {
  if (!aspect || aspect <= 0) return clampCropRect(crop, imageWidth, imageHeight);
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  let width = crop.width;
  let height = crop.height;
  if (width / height > aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }
  // Fit inside the image while keeping aspect.
  if (width > imageWidth) {
    width = imageWidth;
    height = width / aspect;
  }
  if (height > imageHeight) {
    height = imageHeight;
    width = height * aspect;
  }
  return clampCropRect(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
    imageWidth,
    imageHeight,
  );
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to load that image for cropping."));
    img.src = src;
  });
}

/**
 * Rasterize the crop region to a JPEG File. Caps the longest edge so uploads
 * stay reasonable before the shared compressor runs.
 */
export async function cropImageFile(
  source: File | Blob | string,
  crop: ImageCropRect,
  options?: { fileName?: string; maxDim?: number; quality?: number },
): Promise<File> {
  const maxDim = options?.maxDim ?? 2400;
  const quality = options?.quality ?? 0.92;
  const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadHtmlImage(objectUrl);
    const safe = clampCropRect(
      crop,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
    );
    const scale = Math.min(1, maxDim / Math.max(safe.width, safe.height));
    const outW = Math.max(1, Math.round(safe.width * scale));
    const outH = Math.max(1, Math.round(safe.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to crop image");
    ctx.drawImage(img, safe.x, safe.y, safe.width, safe.height, 0, 0, outW, outH);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (next) => {
          if (!next) {
            reject(new Error("Unable to crop image"));
            return;
          }
          resolve(next);
        },
        "image/jpeg",
        quality,
      );
    });
    const base =
      (options?.fileName || (source instanceof File ? source.name : "photo")).replace(
        /\.[^.]+$/,
        "",
      ) || "photo";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(objectUrl);
  }
}
