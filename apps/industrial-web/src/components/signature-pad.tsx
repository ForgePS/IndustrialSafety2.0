"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  notifyUnsavedChange,
  shouldTrackUnsavedField,
} from "@/lib/unsaved-changes";
import { canImportProfileSignature } from "@/lib/profile-signature";

/**
 * Pointer-drawn signature capture.
 *
 * Emits a JPEG data URL on each completed stroke, or an empty string once
 * cleared. The industrial API has no upload endpoint wired for personnel, so
 * the caller stores the data URL directly in personnel.signature_url.
 *
 * Export is downscaled so the PATCH body stays under AWS WAF's 8 KB
 * SizeRestrictions_BODY inspection window when combined with other fields.
 */

const SIGNATURE_EXPORT_WIDTH = 480;
const SIGNATURE_EXPORT_HEIGHT = 140;
const SIGNATURE_JPEG_QUALITY = 0.55;

function exportSignatureDataUrl(source: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = SIGNATURE_EXPORT_WIDTH;
  out.height = SIGNATURE_EXPORT_HEIGHT;
  const ctx = out.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", SIGNATURE_JPEG_QUALITY);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);
  ctx.drawImage(source, 0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);
  return out.toDataURL("image/jpeg", SIGNATURE_JPEG_QUALITY);
}

function isImageSrc(value: string): boolean {
  return value.startsWith("data:image/") || /^https?:\/\//i.test(value);
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = window.devicePixelRatio || 1;
  ctx.scale(ratio, ratio);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";
}

export function SignaturePad({
  value,
  onChange,
  disabled,
  label = "Signature",
  profileSignature,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  label?: string;
  /** Optional signature from the user's profile / personnel file. */
  profileSignature?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const paintedValue = useRef<string | null>(null);
  const paintToken = useRef(0);
  const [ready, setReady] = useState(false);
  /** When canvas cannot decode ink (CORS / bad URL), show an <img> fallback. */
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const paintStoredValue = useCallback((src: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !isImageSrc(src)) {
      setPreviewSrc(isImageSrc(src) ? src : null);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setPreviewSrc(src);
      return;
    }

    const token = ++paintToken.current;
    const rect = canvas.getBoundingClientRect();

    const draw = (img: HTMLImageElement) => {
      if (token !== paintToken.current || canvasRef.current !== canvas) return;
      clearCanvas(canvas);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      hasInk.current = true;
      paintedValue.current = src;
      setPreviewSrc(null);
    };

    const fail = () => {
      if (token !== paintToken.current) return;
      // Keep the value for submit; show a visible preview if canvas paint fails
      // (common for legacy http(s) signatures without CORS headers).
      hasInk.current = false;
      paintedValue.current = src;
      setPreviewSrc(src);
    };

    const load = (useCors: boolean) => {
      const img = new Image();
      img.onload = () => {
        try {
          draw(img);
        } catch {
          fail();
        }
      };
      img.onerror = () => {
        if (useCors) {
          // Retry without CORS so the browser can still display the image.
          load(false);
          return;
        }
        fail();
      };
      if (useCors && /^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
      img.src = src;
    };

    load(/^https?:\/\//i.test(src));
  }, []);

  /** Backing store is sized to the device pixel ratio to avoid blurry strokes. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    hasInk.current = false;
    paintedValue.current = null;
    setPreviewSrc(null);
    setReady(true);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Show an existing captured signature on the pad so it is a real signable area.
  useEffect(() => {
    if (!ready) return;
    if (value === "") {
      paintToken.current += 1;
      const canvas = canvasRef.current;
      if (canvas) clearCanvas(canvas);
      hasInk.current = false;
      paintedValue.current = null;
      setPreviewSrc(null);
      return;
    }
    // Always re-paint when the stored value changes (e.g. "Use my signature").
    // Do not skip just because the canvas has ink — that left blank pads when
    // import replaced a previous capture.
    if (paintedValue.current === value) return;
    paintStoredValue(value);
  }, [value, ready, paintStoredValue]);

  function pointFor(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !ready) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Hide image fallback once the user starts drawing over it.
    if (previewSrc) setPreviewSrc(null);
    drawing.current = true;
    canvasRef.current?.setPointerCapture(ev.pointerId);
    const { x, y } = pointFor(ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no drag should still leave a visible mark.
    ctx.lineTo(x + 0.1, y);
    ctx.stroke();
    hasInk.current = true;
    paintedValue.current = null;
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFor(ev);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function commit() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    try {
      onChange(exportSignatureDataUrl(canvas));
    } catch {
      // Tainted canvas (remote image without CORS) — keep prior value.
      return;
    }
    if (shouldTrackUnsavedField(canvas)) notifyUnsavedChange();
  }

  function clear() {
    const canvas = canvasRef.current;
    paintToken.current += 1;
    if (canvas) clearCanvas(canvas);
    hasInk.current = false;
    paintedValue.current = null;
    setPreviewSrc(null);
    onChange("");
    if (canvas && shouldTrackUnsavedField(canvas)) notifyUnsavedChange();
  }

  function useProfile() {
    const src = (profileSignature ?? "").trim();
    if (!src || disabled) return;
    // Force the value-effect / paint path even if the pad already had ink.
    hasInk.current = false;
    paintedValue.current = null;
    setPreviewSrc(null);
    onChange(src);
    paintStoredValue(src);
    notifyUnsavedChange();
  }

  const canImportProfile = canImportProfileSignature(profileSignature, value);

  return (
    <div className="ind-signature">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
        <span className="form-label mb-0">{label}</span>
        <div className="d-flex flex-wrap gap-2">
          {canImportProfile ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={useProfile}
              disabled={disabled}
            >
              <i className="bx bx-user me-1" aria-hidden="true" />
              Use my signature
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={clear}
            disabled={disabled || value === ""}
          >
            <i className="bx bx-eraser me-1" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>
      <div className="ind-signature-stage">
        <canvas
          ref={canvasRef}
          className="ind-signature-canvas"
          aria-label={`${label} drawing area`}
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={commit}
          onPointerCancel={commit}
        />
        {previewSrc ? (
          <img
            className="ind-signature-preview"
            src={previewSrc}
            alt={`${label} preview`}
            draggable={false}
          />
        ) : null}
      </div>
      <div className="form-text d-flex align-items-center gap-1">
        <i
          className={`bx ${value === "" ? "bx-pen" : "bx-check-circle text-success"}`}
          aria-hidden="true"
        />
        {value === ""
          ? canImportProfile
            ? "Sign above, or use the signature from your profile."
            : "Sign above using a mouse, pen or finger."
          : previewSrc
            ? "Signature on file (preview)."
            : "Signature captured."}
      </div>
    </div>
  );
}
