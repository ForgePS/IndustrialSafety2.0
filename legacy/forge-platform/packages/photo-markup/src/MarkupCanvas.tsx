"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampUnit } from "./ids.js";
import { annotationsToSvgMarkup } from "./svg.js";
import type { PhotoAnnotation } from "./types.js";

type Props = {
  imageSrc: string;
  annotations: readonly PhotoAnnotation[];
  selectedId?: string | null;
  cursor?: string;
  onPointerDownUnit?: (point: { x: number; y: number }, event: React.PointerEvent) => void;
  onPointerMoveUnit?: (point: { x: number; y: number }, event: React.PointerEvent) => void;
  onPointerUpUnit?: (point: { x: number; y: number }, event: React.PointerEvent) => void;
  style?: CSSProperties;
  className?: string;
};

export function MarkupCanvas({
  imageSrc,
  annotations,
  selectedId,
  cursor = "crosshair",
  onPointerDownUnit,
  onPointerMoveUnit,
  onPointerUpUnit,
  style,
  className,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const toUnit = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    return { x: clampUnit(x), y: clampUnit(y) };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [imageSrc]);

  const onWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(4, Math.max(0.5, z + delta)));
  };

  const svgInner = annotationsToSvgMarkup(annotations, selectedId);

  return (
    <div
      className={className}
      style={{
        overflow: "hidden",
        background: "#111827",
        borderRadius: 8,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        position: "relative",
        ...style,
      }}
      onWheel={onWheel}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100%",
          padding: 8,
        }}
      >
        <div
          ref={stageRef}
          style={{
            position: "relative",
            lineHeight: 0,
            cursor,
            maxWidth: "100%",
          }}
          onPointerDown={(event) => {
            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointersRef.current.size === 2) {
              const pts = [...pointersRef.current.values()];
              const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
              pinchRef.current = { distance: d, zoom };
              return;
            }
            if (event.button !== 0) return;
            event.preventDefault();
            stageRef.current?.setPointerCapture(event.pointerId);
            onPointerDownUnit?.(toUnit(event.clientX, event.clientY), event);
          }}
          onPointerMove={(event) => {
            if (pointersRef.current.has(event.pointerId)) {
              pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            }
            if (pointersRef.current.size === 2 && pinchRef.current) {
              const pts = [...pointersRef.current.values()];
              const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
              const scale = d / (pinchRef.current.distance || 1);
              setZoom(Math.min(4, Math.max(0.5, pinchRef.current.zoom * scale)));
              return;
            }
            onPointerMoveUnit?.(toUnit(event.clientX, event.clientY), event);
          }}
          onPointerUp={(event) => {
            pointersRef.current.delete(event.pointerId);
            if (pointersRef.current.size < 2) pinchRef.current = null;
            try {
              stageRef.current?.releasePointerCapture(event.pointerId);
            } catch {
              // ignore
            }
            onPointerUpUnit?.(toUnit(event.clientX, event.clientY), event);
          }}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId);
            pinchRef.current = null;
          }}
        >
          <img
            src={imageSrc}
            alt=""
            draggable={false}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "min(70vh, 640px)",
              width: "auto",
              height: "auto",
            }}
          />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
            dangerouslySetInnerHTML={{ __html: svgInner }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          display: "flex",
          gap: 4,
        }}
      >
        <ZoomButton
          label="−"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          ariaLabel="Zoom out"
        />
        <ZoomButton
          label={`${Math.round(zoom * 100)}%`}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          ariaLabel="Reset zoom"
        />
        <ZoomButton
          label="+"
          onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          ariaLabel="Zoom in"
        />
      </div>
      {naturalSize.w > 0 ? (
        <span style={{ position: "absolute", left: 8, bottom: 8, color: "#9ca3af", fontSize: 11 }}>
          {naturalSize.w}×{naturalSize.h}
        </span>
      ) : null}
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        minWidth: 36,
        minHeight: 36,
        borderRadius: 6,
        border: "1px solid #4b5563",
        background: "rgba(17,24,39,0.85)",
        color: "#f9fafb",
        cursor: "pointer",
        fontSize: 12,
        padding: "0 8px",
      }}
    >
      {label}
    </button>
  );
}
