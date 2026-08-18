"use client";

import {
  BODY_MAP_IMAGE,
  BODY_VIEWS,
  bodyMapArrowPlacement,
  heatTone,
  regionsForView,
  type BodyRegion,
} from "@/lib/incident-body-map";

type BodyMapProps = {
  /** "select" lets the user toggle regions; "display" shows severity arrows. */
  mode: "select" | "display";
  /** Region ids currently marked (select mode). */
  selected?: readonly string[];
  /** Region id → incident count (display mode). */
  counts?: Map<string, number>;
  /** Highest region count, used to scale severity tones. */
  maxCount?: number;
  /** Currently focused injury area (display mode). */
  activeRegionId?: string | null;
  onToggle?: (id: string) => void;
  /** Display mode: open injuries for this body area. */
  onRegionActivate?: (id: string) => void;
};

function regionHitStyle(region: BodyRegion): React.CSSProperties {
  return {
    top: `${region.top}%`,
    left: `${region.left}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  };
}

/**
 * Safety Tim — front and back on transparent art, FRONT/BACK labels above.
 * Display mode uses severity-colored arrows so Tim stays visible; arrows are
 * clickable to drill into injuries for that area.
 */
export function IncidentBodyMap({
  mode,
  selected = [],
  counts,
  maxCount = 0,
  activeRegionId = null,
  onToggle,
  onRegionActivate,
}: BodyMapProps) {
  const selectedSet = new Set(selected);

  return (
    <div className="ind-bodymap">
      {BODY_VIEWS.map((view) => (
        <figure className="ind-bodymap__view" key={view.id}>
          <figcaption className="ind-bodymap__caption">{view.label}</figcaption>
          <div className="ind-bodymap__stage">
            <img
              className={`ind-bodymap__img ind-bodymap__img--${view.id}`}
              src={BODY_MAP_IMAGE}
              alt={view.id === "front" ? "Worker front view" : "Worker back view"}
              width={288}
              height={433}
              draggable={false}
            />
            {regionsForView(view.id).map((region) => {
              if (mode === "select") {
                const isActive = selectedSet.has(region.id);
                return (
                  <button
                    key={region.id}
                    type="button"
                    className={`ind-bodymap__region${isActive ? " is-active" : ""}`}
                    style={regionHitStyle(region)}
                    aria-pressed={isActive}
                    aria-label={region.part}
                    title={region.part}
                    onClick={() => onToggle?.(region.id)}
                  >
                    {isActive ? (
                      <span className="ind-bodymap__marker" aria-hidden="true">
                        <i className="bx bx-x" />
                      </span>
                    ) : null}
                  </button>
                );
              }

              const count = counts?.get(region.id) ?? 0;
              const tone = heatTone(count, maxCount);
              if (!tone) return null;
              const place = bodyMapArrowPlacement(region);
              const isFocused = activeRegionId === region.id;
              const vars = {
                "--tip-x": `${place.tipX}%`,
                "--tip-y": `${place.tipY}%`,
                "--badge-x": `${place.badgeX}%`,
                "--badge-y": `${place.badgeY}%`,
                "--arrow-angle": `${place.angleDeg}deg`,
              } as React.CSSProperties;

              return (
                <span
                  key={region.id}
                  className={`ind-bodymap__callout ind-bodymap__callout--${tone}${isFocused ? " is-active" : ""}`}
                  style={vars}
                >
                  <span className="ind-bodymap__callout-line" aria-hidden="true" />
                  <span className="ind-bodymap__callout-tip" aria-hidden="true" />
                  <button
                    type="button"
                    className={`ind-bodymap__callout-hit bg-label-${tone}`}
                    style={{ left: `${place.badgeX}%`, top: `${place.badgeY}%` }}
                    title={`View ${count} ${region.part} injur${count === 1 ? "y" : "ies"}`}
                    aria-label={`View ${count} ${region.part} injuries`}
                    aria-pressed={isFocused}
                    onClick={() => onRegionActivate?.(region.id)}
                  >
                    <span className="ind-bodymap__callout-total">{count}</span>
                  </button>
                </span>
              );
            })}
          </div>
        </figure>
      ))}
    </div>
  );
}
