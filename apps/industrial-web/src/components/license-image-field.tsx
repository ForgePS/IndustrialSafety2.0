"use client";

import { useRef, useState } from "react";
import {
  isAcceptableLicenseImage,
  isOversizedLicenseImage,
} from "@/lib/license-copies";

type LicenseImageFieldProps = {
  id: string;
  label: string;
  value: string;
  help?: string;
  disabled?: boolean;
  onChange: (dataUrl: string) => void;
};

async function compressImageFile(file: File, maxDim = 1600, quality = 0.78): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Unable to compress image");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Front/back driver's license photo capture for the personnel form.
 * Stores a compressed JPEG data URL (or keeps an imported https URL).
 */
export function LicenseImageField({
  id,
  label,
  value,
  help,
  disabled,
  onChange,
}: LicenseImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await compressImageFile(file);
      if (!isAcceptableLicenseImage(dataUrl) || isOversizedLicenseImage(dataUrl)) {
        setError("Image is too large after compression. Try a clearer, closer photo.");
        return;
      }
      onChange(dataUrl);
    } catch {
      setError("Unable to read that image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      {value ? (
        <div className="mb-2">
          <img
            src={value}
            alt={label}
            className="img-fluid border rounded bg-white"
            style={{ maxHeight: 220 }}
          />
        </div>
      ) : (
        <p className="text-muted small mb-2">No copy on file yet.</p>
      )}
      <div className="d-flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp"
          className="form-control"
          style={{ maxWidth: 320 }}
          disabled={disabled || busy}
          onChange={(ev) => void onFile(ev.target.files?.[0] ?? null)}
        />
        {value ? (
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={disabled || busy}
            onClick={() => onChange("")}
          >
            Clear
          </button>
        ) : null}
      </div>
      {busy ? (
        <div className="form-text" role="status">
          Compressing…
        </div>
      ) : null}
      {error ? <div className="text-danger small mt-1">{error}</div> : null}
      {help ? <div className="form-text">{help}</div> : null}
    </div>
  );
}
