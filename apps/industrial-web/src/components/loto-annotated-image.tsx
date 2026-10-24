"use client";

import type { CSSProperties } from "react";
import { lotoArrowHeadPoints, type LotoImageArrow } from "@/lib/loto-image-annotations";

type Props = {
  src: string;
  alt: string;
  arrows?: readonly LotoImageArrow[];
  className?: string;
  imgStyle?: CSSProperties;
  selectedId?: string | null;
  onSelectArrow?: (id: string) => void;
};

export function LotoAnnotatedImage({
  src,
  alt,
  arrows = [],
  className = "",
  imgStyle,
  selectedId,
  onSelectArrow,
}: Props) {
  return (
    <div className={`loto-annotated-photo position-relative d-inline-block ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="rounded border d-block"
        style={{ maxWidth: "100%", height: "auto", ...imgStyle }}
        draggable={false}
      />
      {arrows.length > 0 ? (
        <svg
          className="loto-photo-arrows"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden={onSelectArrow ? undefined : true}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: onSelectArrow ? "auto" : "none",
          }}
        >
          {arrows.map((arrow) => {
            const selected = selectedId === arrow.id;
            const stroke = selected ? "#2563eb" : "#dc2626";
            const outline = selected ? "#93c5fd" : "#ffffff";
            return (
              <g
                key={arrow.id}
                role={onSelectArrow ? "button" : undefined}
                tabIndex={onSelectArrow ? 0 : undefined}
                onClick={
                  onSelectArrow
                    ? (event) => {
                        event.stopPropagation();
                        onSelectArrow(arrow.id);
                      }
                    : undefined
                }
                onKeyDown={
                  onSelectArrow
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectArrow(arrow.id);
                        }
                      }
                    : undefined
                }
                style={{ cursor: onSelectArrow ? "pointer" : undefined }}
              >
                <line
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  stroke={outline}
                  strokeWidth={0.018}
                  strokeLinecap="round"
                />
                <line
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  stroke={stroke}
                  strokeWidth={0.01}
                  strokeLinecap="round"
                />
                <polygon
                  points={lotoArrowHeadPoints(arrow)}
                  fill={stroke}
                  stroke={outline}
                  strokeWidth={0.006}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
