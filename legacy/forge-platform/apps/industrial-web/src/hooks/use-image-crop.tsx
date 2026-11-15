"use client";

import { useCallback, useState } from "react";
import { ImageCropModal } from "@/components/image-crop-modal";
import { isLikelyImageFile, isPdfFile } from "@/lib/compress-image";
import type { ImageCropAspect } from "@/lib/crop-image";

type CropSession = {
  file: File;
  initialAspect: ImageCropAspect;
  resolve: (file: File | null) => void;
};

type Options = {
  /** Starting aspect for the crop box. */
  initialAspect?: ImageCropAspect;
  title?: string;
};

async function canDecodeForCrop(file: File): Promise<boolean> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return true;
    }
  } catch {
    return false;
  }
  // Fallback: try HTMLImageElement decode via object URL.
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Promise-based crop gate for upload flows. PDFs and non-images pass through;
 * images open a modal and resolve with the cropped JPEG (or null if cancelled).
 */
export function useImageCrop() {
  const [session, setSession] = useState<CropSession | null>(null);
  const [title, setTitle] = useState("Crop image before upload");

  const cropIfNeeded = useCallback(async (file: File, options?: Options): Promise<File | null> => {
    if (isPdfFile(file) || !isLikelyImageFile(file)) {
      return file;
    }
    // HEIC / unsupported formats: skip crop rather than blocking the upload.
    if (!(await canDecodeForCrop(file))) {
      return file;
    }

    return new Promise((resolve) => {
      setTitle(options?.title ?? "Crop image before upload");
      setSession({
        file,
        initialAspect: options?.initialAspect ?? "free",
        resolve,
      });
    });
  }, []);

  const cropModal = session ? (
    <ImageCropModal
      file={session.file}
      title={title}
      initialAspect={session.initialAspect}
      onCancel={() => {
        session.resolve(null);
        setSession(null);
      }}
      onConfirm={(cropped) => {
        session.resolve(cropped);
        setSession(null);
      }}
    />
  ) : null;

  return { cropIfNeeded, cropModal };
}
