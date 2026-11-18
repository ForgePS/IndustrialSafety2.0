"use client";

import { useEffect, useRef, useState } from "react";

type FormSignaturePadProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Touch-friendly signature: typed name or canvas drawing (data URL). */
export function FormSignaturePad({ value, onChange, disabled }: FormSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [typedName, setTypedName] = useState(() =>
    value.startsWith("typed:") ? value.slice("typed:".length) : "",
  );

  useEffect(() => {
    if (!value.startsWith("data:")) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = value;
  }, [value]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function emitDrawn() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
    setTypedName("");
  }

  return (
    <div className="ff-sig-pad">
      <input
        className="ff-input"
        type="text"
        value={typedName}
        disabled={disabled}
        placeholder="Type full name"
        aria-label="Typed signature name"
        onChange={(e) => {
          const next = e.target.value;
          setTypedName(next);
          onChange(next.trim() ? `typed:${next.trim()}` : "");
          clearCanvas();
        }}
      />
      <p className="ff-hint ff-hint--left">Or draw signature</p>
      <canvas
        ref={canvasRef}
        width={320}
        height={110}
        className="ff-sig-canvas"
        style={{ touchAction: "none" }}
        aria-label="Draw signature"
        onPointerDown={(ev) => {
          if (disabled) return;
          drawingRef.current = true;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;
          const rect = canvas.getBoundingClientRect();
          ctx.strokeStyle = "#222";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(
            ((ev.clientX - rect.left) / rect.width) * canvas.width,
            ((ev.clientY - rect.top) / rect.height) * canvas.height,
          );
          (ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId);
        }}
        onPointerMove={(ev) => {
          if (!drawingRef.current || disabled) return;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;
          const rect = canvas.getBoundingClientRect();
          ctx.lineTo(
            ((ev.clientX - rect.left) / rect.width) * canvas.width,
            ((ev.clientY - rect.top) / rect.height) * canvas.height,
          );
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          emitDrawn();
        }}
      />
      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        disabled={disabled || !value}
        onClick={() => {
          clearCanvas();
          setTypedName("");
          onChange("");
        }}
      >
        Clear signature
      </button>
    </div>
  );
}
