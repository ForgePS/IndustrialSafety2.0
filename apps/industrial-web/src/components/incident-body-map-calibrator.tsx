"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { useBodyRegions } from "@/hooks/use-body-regions";
import { canAccessUserManagement } from "@/lib/user-management";
import {
  BODY_MAP_IMAGE,
  BODY_REGIONS,
  BODY_VIEWS,
  clampBodyRegion,
  regionsForView,
  type BodyRegion,
  type BodyView,
} from "@/lib/incident-body-map";

type DragState =
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      origTop: number;
      origLeft: number;
    }
  | {
      kind: "resize";
      id: string;
      startX: number;
      startY: number;
      origTop: number;
      origLeft: number;
      origWidth: number;
      origHeight: number;
    };

function pctDelta(pixels: number, stageSize: number): number {
  if (stageSize <= 0) return 0;
  return (pixels / stageSize) * 100;
}

function regionStyle(region: BodyRegion): React.CSSProperties {
  return {
    top: `${region.top}%`,
    left: `${region.left}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  };
}

export function IncidentBodyMapCalibrator() {
  const { me, loading: authLoading } = useAuth();
  const canAccess = canAccessUserManagement(me);
  const {
    regions: savedRegions,
    loading: configLoading,
    saving,
    isCustom,
    updatedAt,
    error,
    notice,
    saveRegions,
    clearNotice,
  } = useBodyRegions();

  const [regions, setRegions] = useState<BodyRegion[]>(() => [...BODY_REGIONS]);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(BODY_REGIONS[0]?.id ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const stageRefs = useRef<Record<BodyView, HTMLDivElement | null>>({
    front: null,
    back: null,
  });

  useEffect(() => {
    if (configLoading || dirty) return;
    setRegions(savedRegions.map((region) => ({ ...region })));
  }, [configLoading, dirty, savedRegions]);

  const selected = regions.find((region) => region.id === selectedId) ?? null;

  const patchRegion = useCallback((id: string, patch: Partial<Pick<BodyRegion, "top" | "left" | "width" | "height">>) => {
    setDirty(true);
    clearNotice();
    setSaveError(null);
    setRegions((current) =>
      current.map((region) =>
        region.id === id ? clampBodyRegion({ ...region, ...patch }) : region,
      ),
    );
  }, [clearNotice]);

  const finishDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const region = regions.find((item) => item.id === drag.id);
      if (!region) return;
      const stage = stageRefs.current[region.view];
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const deltaLeft = pctDelta(event.clientX - drag.startX, rect.width);
      const deltaTop = pctDelta(event.clientY - drag.startY, rect.height);

      if (drag.kind === "move") {
        patchRegion(drag.id, {
          top: drag.origTop + deltaTop,
          left: drag.origLeft + deltaLeft,
        });
        return;
      }

      patchRegion(drag.id, {
        top: drag.origTop,
        left: drag.origLeft,
        width: drag.origWidth + deltaLeft,
        height: drag.origHeight + deltaTop,
      });
    },
    [patchRegion, regions],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [finishDrag, onPointerMove]);

  const startMove = (event: React.PointerEvent, region: BodyRegion) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(region.id);
    dragRef.current = {
      kind: "move",
      id: region.id,
      startX: event.clientX,
      startY: event.clientY,
      origTop: region.top,
      origLeft: region.left,
    };
  };

  const startResize = (event: React.PointerEvent, region: BodyRegion) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(region.id);
    dragRef.current = {
      kind: "resize",
      id: region.id,
      startX: event.clientX,
      startY: event.clientY,
      origTop: region.top,
      origLeft: region.left,
      origWidth: region.width,
      origHeight: region.height,
    };
  };

  const onReset = () => {
    setRegions(BODY_REGIONS.map((region) => ({ ...region })));
    setDirty(true);
    clearNotice();
    setSaveError(null);
  };

  const onSave = async () => {
    setSaveError(null);
    try {
      await saveRegions(regions);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save body map.");
    }
  };

  if (authLoading || configLoading) {
    return (
      <p className="text-muted mb-0" role="status">
        Loading body map calibrator…
      </p>
    );
  }

  if (!canAccess) {
    return (
      <div className="alert alert-warning" role="alert">
        <h4 className="alert-heading">Body map calibrator</h4>
        <p className="mb-0">
          This tool is limited to Admin, Super Admin, and Creator. Ask a tenant admin if you need
          access.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="body-map-cal-title">
      <ModuleWorkspaceHeader
        id="body-map-cal-title"
        eyebrow="Platform admin"
        title="Body map"
        description="Drag injury hotspots into place on front and back views. Save when finished so everyone in your company sees the updated map."
      />

      {error ? (
        <div className="alert alert-warning mb-4" role="alert">
          {error} Platform defaults are shown until tenant settings load.
        </div>
      ) : null}

      {notice ? (
        <div className="alert alert-success mb-4" role="status">
          {notice}
        </div>
      ) : null}

      {saveError ? (
        <div className="alert alert-danger mb-4" role="alert">
          {saveError}
        </div>
      ) : null}

      <div className="alert alert-info mb-4" role="status">
        <strong>How to use:</strong> click a region to select it, drag to move, pull the corner dot
        to resize, then click <strong>Save body map</strong>. Changes apply to new injury reports
        and the injury map for your company.
        {isCustom && updatedAt ? (
          <span className="d-block mt-2 small">
            Last saved: {new Date(updatedAt).toLocaleString()}
          </span>
        ) : (
          <span className="d-block mt-2 small">Using platform defaults until you save.</span>
        )}
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card">
            <div className="card-body">
              <div className="ind-bodymap ind-bodymap--calibrate">
                {BODY_VIEWS.map((view) => (
                  <figure className="ind-bodymap__view" key={view.id}>
                    <figcaption className="ind-bodymap__caption">{view.label}</figcaption>
                    <div
                      className="ind-bodymap__stage"
                      ref={(node) => {
                        stageRefs.current[view.id] = node;
                      }}
                    >
                      <img
                        className={`ind-bodymap__img ind-bodymap__img--${view.id}`}
                        src={BODY_MAP_IMAGE}
                        alt={view.id === "front" ? "Worker front view" : "Worker back view"}
                        width={288}
                        height={433}
                        draggable={false}
                      />
                      {regionsForView(view.id, regions).map((region) => {
                        const isSelected = selectedId === region.id;
                        return (
                          <div
                            key={region.id}
                            className={`ind-bodymap__cal-region${isSelected ? " is-selected" : ""}`}
                            style={regionStyle(region)}
                            onPointerDown={(event) => startMove(event, region)}
                          >
                            <span className="ind-bodymap__cal-label">{region.part}</span>
                            <span
                              className="ind-bodymap__cal-handle"
                              aria-hidden="true"
                              onPointerDown={(event) => startResize(event, region)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card mb-4">
            <div className="card-header">
              <h6 className="mb-0">Selected region</h6>
            </div>
            <div className="card-body">
              {selected ? (
                <>
                  <p className="fw-medium mb-1">{selected.part}</p>
                  <p className="text-muted small mb-3">
                    {selected.id} · {selected.view} view
                  </p>
                  <div className="row g-2">
                    {(["top", "left", "width", "height"] as const).map((field) => (
                      <div className="col-6" key={field}>
                        <label className="form-label small text-capitalize mb-1" htmlFor={`cal-${field}`}>
                          {field} (%)
                        </label>
                        <input
                          id={`cal-${field}`}
                          type="number"
                          step={0.1}
                          min={0}
                          max={100}
                          className="form-control form-control-sm"
                          value={selected[field]}
                          onChange={(event) =>
                            patchRegion(selected.id, {
                              [field]: Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted small mb-0">Select a hotspot on the map to edit numbers.</p>
              )}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <h6 className="mb-0">All regions</h6>
            </div>
            <div className="list-group list-group-flush ind-bodymap-cal-list">
              {regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className={`list-group-item list-group-item-action small${
                    selectedId === region.id ? " active" : ""
                  }`}
                  onClick={() => setSelectedId(region.id)}
                >
                  <span className="fw-medium">{region.part}</span>
                  <span className="d-block text-muted">{region.view}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : dirty ? "Save body map" : "Saved"}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={onReset}>
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
