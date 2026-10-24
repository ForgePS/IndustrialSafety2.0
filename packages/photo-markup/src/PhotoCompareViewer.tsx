"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type CompareMode = "side-by-side" | "slider" | "toggle";

type Props = {
  originalSrc: string;
  markedSrc: string;
  title?: string;
  initialMode?: CompareMode;
  className?: string;
  style?: CSSProperties;
  onClose?: () => void;
};

/**
 * Original vs marked-up photo comparison for corrective actions,
 * inspections, and sanitation evidence review.
 */
export function PhotoCompareViewer({
  originalSrc,
  markedSrc,
  title = "Compare photos",
  initialMode = "slider",
  className,
  style,
  onClose,
}: Props) {
  const [mode, setMode] = useState<CompareMode>(initialMode);
  const [showMarked, setShowMarked] = useState(true);
  const [slider, setSlider] = useState(50);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        {onClose ? (
          <button type="button" onClick={onClose} style={btn}>
            Close
          </button>
        ) : null}
        <strong style={{ flex: 1 }}>{title}</strong>
        {(["slider", "side-by-side", "toggle"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            style={{
              ...btn,
              background: mode === m ? "#dbeafe" : "#fff",
              borderColor: mode === m ? "#2563eb" : "#d1d5db",
            }}
          >
            {m === "side-by-side" ? "Side by side" : m === "slider" ? "Swipe" : "Toggle"}
          </button>
        ))}
      </header>

      <div style={{ flex: 1, minHeight: 0, padding: 12, background: "#111827" }}>
        {mode === "side-by-side" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              height: "100%",
              alignItems: "center",
            }}
          >
            <LabeledImage src={originalSrc} label="Original" />
            <LabeledImage src={markedSrc} label="Marked" />
          </div>
        ) : null}

        {mode === "toggle" ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                style={btnLight}
                onClick={() => setShowMarked(false)}
                aria-pressed={!showMarked}
              >
                Original
              </button>
              <button
                type="button"
                style={btnLight}
                onClick={() => setShowMarked(true)}
                aria-pressed={showMarked}
              >
                Marked
              </button>
            </div>
            <LabeledImage
              src={showMarked ? markedSrc : originalSrc}
              label={showMarked ? "Marked" : "Original"}
              fill
            />
          </div>
        ) : null}

        {mode === "slider" ? (
          <div
            ref={trackRef}
            style={{
              position: "relative",
              height: "100%",
              maxHeight: "70vh",
              overflow: "hidden",
              borderRadius: 8,
              userSelect: "none",
              touchAction: "none",
            }}
            onPointerDown={(event) => {
              trackRef.current?.setPointerCapture(event.pointerId);
              updateSlider(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) return;
              updateSlider(event.clientX);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalSrc}
              alt="Original"
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${slider}%`,
                overflow: "hidden",
                borderRight: "2px solid #fff",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={markedSrc}
                alt="Marked"
                draggable={false}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: trackRef.current ? `${trackRef.current.clientWidth}px` : "100vw",
                  maxWidth: "none",
                  objectFit: "contain",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: `calc(${slider}% - 18px)`,
                top: "50%",
                transform: "translateY(-50%)",
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#fff",
                border: "2px solid #2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#1e3a8a",
                pointerEvents: "none",
              }}
            >
              ⟷
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  function updateSlider(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setSlider(Math.min(100, Math.max(0, next)));
  }

  if (onClose) {
    return (
      <div
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          ...style,
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ display: "flex", flexDirection: "column", minHeight: 360, ...style }}
    >
      {body}
    </div>
  );
}

function LabeledImage({ src, label, fill }: { src: string; label: string; fill?: boolean }) {
  return (
    <div style={{ position: "relative", height: fill ? "100%" : "auto", textAlign: "center" }}>
      <span
        style={{
          position: "absolute",
          left: 8,
          top: 8,
          zIndex: 1,
          background: "rgba(17,24,39,0.8)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 4,
        }}
      >
        {label}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        style={{
          maxWidth: "100%",
          maxHeight: fill ? "100%" : "65vh",
          objectFit: "contain",
          borderRadius: 8,
        }}
      />
    </div>
  );
}

const btn: CSSProperties = {
  minHeight: 40,
  minWidth: 44,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

const btnLight: CSSProperties = {
  ...btn,
  background: "#1f2937",
  borderColor: "#374151",
  color: "#f9fafb",
};
