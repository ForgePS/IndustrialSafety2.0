"use client";

import {
  BODY_MAP_IMAGE,
  BODY_VIEWS,
  heatTone,
  regionsForView,
  type BodyRegion,
} from "@/lib/incident-body-map";

type BodyMapProps = {
  /** "select" lets the user toggle regions; "display" shows a read-only heatmap. */
  mode: "select" | "display";
  /** Region ids currently marked (select mode). */
  selected?: readonly string[];
  /** Region id → incident count (display mode heatmap). */
  counts?: Map<string, number>;
  /** Highest region count, used to scale heatmap shading. */
  maxCount?: number;
  onToggle?: (id: string) => void;
};

function regionStyle(region: BodyRegion): React.CSSProperties {
  return {
    top: `${region.top}%`,
    left: `${region.left}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  };
}

/**
 * Safety Tim — front and back on transparent art, FRONT/BACK labels above,
 * no panel chrome around the figure.
 */
export function IncidentBodyMap({
  mode,
  selected = [],
  counts,
  maxCount = 0,
  onToggle,
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
                    style={regionStyle(region)}
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
              return (
                <span
                  key={region.id}
                  className={`ind-bodymap__region ind-bodymap__region--heat bg-label-${tone}`}
                  style={regionStyle(region)}
                  title={`${region.part}: ${count}`}
                >
                  <span className="ind-bodymap__count" aria-hidden="true">
                    {count}
                  </span>
                  <span className="visually-hidden">
                    {region.part}: {count}
                  </span>
                </span>
              );
            })}
          </div>
        </figure>
      ))}
    </div>
  );
}
