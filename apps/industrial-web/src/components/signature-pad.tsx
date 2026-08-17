"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pointer-drawn signature capture.
 *
 * Emits a PNG data URL on each completed stroke, or an empty string once
 * cleared. The industrial API has no upload endpoint wired for personnel, so
 * the caller stores the data URL directly in personnel.signature_url; the size
 * guard lives in personnel-form.ts.
 */
export function SignaturePad({
  value,
  onChange,
  disabled,
  label = "Signature",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [ready, setReady] = useState(false);

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
    setReady(true);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // An externally cleared value (e.g. after a successful save) wipes the canvas.
  useEffect(() => {
    if (value !== "" || !hasInk.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }, [value]);

  function pointFor(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || !ready) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(ev.pointerId);
    const { x, y } = pointFor(ev);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no drag should still leave a visible mark.
    ctx.lineTo(x + 0.1, y);
    ctx.stroke();
    hasInk.current = true;
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
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    onChange("");
  }

  return (
    <div className="ind-signature">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
        <span className="form-label mb-0">{label}</span>
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
      <canvas
        ref={canvasRef}
        className="ind-signature-canvas"
        aria-label={`${label} drawing area`}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={commit}
        onPointerLeave={commit}
        onPointerCancel={commit}
      />
      <div className="form-text d-flex align-items-center gap-1">
        <i
          className={`bx ${value === "" ? "bx-pen" : "bx-check-circle text-success"}`}
          aria-hidden="true"
        />
        {value === "" ? "Sign above using a mouse, pen or finger." : "Signature captured."}
      </div>
    </div>
  );
}
