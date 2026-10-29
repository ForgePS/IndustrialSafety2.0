import { annotationsToSvgMarkup } from "./svg.js";
import type { MarkupDocument, PhotoAnnotation } from "./types.js";

export type RenderMarkupOptions = {
  imageSrc: string;
  annotations: readonly PhotoAnnotation[];
  /** Target pixel width; defaults to natural image width. */
  width?: number;
  /** Target pixel height; defaults to natural image height. */
  height?: number;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  quality?: number;
  crop?: MarkupDocument["crop"];
  rotation?: MarkupDocument["rotation"];
  flipX?: boolean;
  flipY?: boolean;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for markup render"));
    img.src = src;
  });
}

function applyBlurRegions(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement,
  width: number,
  height: number,
  blurs: readonly PhotoAnnotation[],
): void {
  for (const blur of blurs) {
    const x = Math.round((blur.x ?? 0) * width);
    const y = Math.round((blur.y ?? 0) * height);
    const w = Math.max(1, Math.round((blur.width ?? 0) * width));
    const h = Math.max(1, Math.round((blur.height ?? 0) * height));
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    if (!tctx) continue;
    tctx.filter = "blur(12px)";
    tctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    ctx.drawImage(tmp, x, y);
  }
}

/**
 * Flatten original image + annotations into a high-resolution derivative.
 * Does not modify the original file.
 */
export async function renderMarkedUpImage(
  options: RenderMarkupOptions,
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const img = await loadImage(options.imageSrc);
  const width = options.width ?? (img.naturalWidth || img.width);
  const height = options.height ?? (img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(img, 0, 0, width, height);

  const blurs = options.annotations.filter((a) => a.type === "blur");
  if (blurs.length) {
    applyBlurRegions(ctx, img, width, height, blurs);
  }

  const overlayAnnotations = options.annotations.filter((a) => a.type !== "blur");
  const svgMarkup = annotationsToSvgMarkup(overlayAnnotations);
  if (svgMarkup) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1 1" preserveAspectRatio="none">${svgMarkup}</svg>`;
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const overlay = await loadImage(svgUrl);
    ctx.drawImage(overlay, 0, 0, width, height);
  }

  let outCanvas = canvas;
  if (options.flipX || options.flipY) {
    const flipped = document.createElement("canvas");
    flipped.width = width;
    flipped.height = height;
    const fctx = flipped.getContext("2d");
    if (fctx) {
      fctx.translate(options.flipX ? width : 0, options.flipY ? height : 0);
      fctx.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
      fctx.drawImage(outCanvas, 0, 0);
      outCanvas = flipped;
    }
  }

  const rotation = options.rotation ?? 0;
  if (rotation === 90 || rotation === 270) {
    const rotated = document.createElement("canvas");
    rotated.width = height;
    rotated.height = width;
    const rctx = rotated.getContext("2d");
    if (rctx) {
      if (rotation === 90) {
        rctx.translate(height, 0);
        rctx.rotate(Math.PI / 2);
      } else {
        rctx.translate(0, width);
        rctx.rotate(-Math.PI / 2);
      }
      rctx.drawImage(outCanvas, 0, 0);
      outCanvas = rotated;
    }
  } else if (rotation === 180) {
    const rotated = document.createElement("canvas");
    rotated.width = width;
    rotated.height = height;
    const rctx = rotated.getContext("2d");
    if (rctx) {
      rctx.translate(width, height);
      rctx.rotate(Math.PI);
      rctx.drawImage(outCanvas, 0, 0);
      outCanvas = rotated;
    }
  }

  if (options.crop && options.crop.width > 0 && options.crop.height > 0) {
    const srcW = outCanvas.width;
    const srcH = outCanvas.height;
    const cx = Math.round(options.crop.x * srcW);
    const cy = Math.round(options.crop.y * srcH);
    const cw = Math.max(1, Math.round(options.crop.width * srcW));
    const ch = Math.max(1, Math.round(options.crop.height * srcH));
    const cropped = document.createElement("canvas");
    cropped.width = cw;
    cropped.height = ch;
    const cctx = cropped.getContext("2d");
    if (cctx) {
      cctx.drawImage(outCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
      outCanvas = cropped;
    }
  }

  const mimeType = options.mimeType ?? "image/jpeg";
  const quality = options.quality ?? 0.92;
  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to encode marked-up image"));
      },
      mimeType,
      quality,
    );
  });
  const dataUrl = outCanvas.toDataURL(mimeType, quality);
  return { blob, dataUrl, width: outCanvas.width, height: outCanvas.height };
}

export function buildMarkupDocument(
  annotations: readonly PhotoAnnotation[],
  canvasWidth: number,
  canvasHeight: number,
  transforms?: {
    crop?: MarkupDocument["crop"];
    rotation?: MarkupDocument["rotation"];
    flipX?: boolean;
    flipY?: boolean;
  },
): MarkupDocument {
  const doc: MarkupDocument = {
    version: 1,
    canvasWidth,
    canvasHeight,
    annotations: annotations.map((a) => ({ ...a })),
  };
  if (transforms?.crop) doc.crop = transforms.crop;
  if (transforms?.rotation) doc.rotation = transforms.rotation;
  if (transforms?.flipX) doc.flipX = true;
  if (transforms?.flipY) doc.flipY = true;
  return doc;
}
