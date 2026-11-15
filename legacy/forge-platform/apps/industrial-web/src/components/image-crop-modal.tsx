"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  applyAspectToCrop,
  aspectRatioForPreset,
  clampCropRect,
  cropImageFile,
  defaultCropRect,
  type ImageCropAspect,
  type ImageCropRect,
} from "@/lib/crop-image";

type Props = {
  file: File;
  title?: string;
  /** Preferred starting aspect — license uploads default to card shape. */
  initialAspect?: ImageCropAspect;
  onCancel: () => void;
  /** `area` is the kept part as fractions (0–1) of the original width and height. */
  onConfirm: (cropped: File, area: ImageCropRect) => void;
};

type DragMode =
  | { kind: "move"; startX: number; startY: number; origin: ImageCropRect }
  | {
      kind: "resize";
      handle: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      origin: ImageCropRect;
    };

const PRESETS: Array<{ id: ImageCropAspect; label: string }> = [
  { id: "free", label: "Free" },
  { id: "license", label: "License card" },
  { id: "4:3", label: "4:3" },
  { id: "square", label: "Square" },
];

/**
 * Manual crop step before image uploads — trims desk / background so only the
 * document or subject is stored.
 */
export function ImageCropModal({
  file,
  title = "Crop image before upload",
  initialAspect = "free",
  onCancel,
  onConfirm,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [display, setDisplay] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<ImageCropRect | null>(null);
  const [aspect, setAspect] = useState<ImageCropAspect>(initialAspect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<DragMode | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const aspectValue = useMemo(() => aspectRatioForPreset(aspect), [aspect]);

  function onImageLoad(img: HTMLImageElement) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    setNatural({ width, height });
    setCrop(defaultCropRect(width, height, aspectRatioForPreset(initialAspect)));
    measureDisplay(img);
  }

  function measureDisplay(img: HTMLImageElement) {
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDisplay({ width: rect.width, height: rect.height });
    }
  }

  useEffect(() => {
    function onResize() {
      const img = stageRef.current?.querySelector("img");
      if (img instanceof HTMLImageElement) measureDisplay(img);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const scale = useMemo(() => {
    if (!natural || !display) return 1;
    return display.width / natural.width;
  }, [natural, display]);

  const screenCrop = useMemo(() => {
    if (!crop) return null;
    return {
      left: crop.x * scale,
      top: crop.y * scale,
      width: crop.width * scale,
      height: crop.height * scale,
    };
  }, [crop, scale]);

  const updateCropFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      const stage = stageRef.current;
      if (!drag || !stage || !natural || !crop) return;
      const bounds = stage.getBoundingClientRect();
      const dx = (clientX - drag.startX) / scale;
      const dy = (clientY - drag.startY) / scale;
      const origin = drag.origin;

      if (drag.kind === "move") {
        setCrop(
          clampCropRect(
            {
              x: origin.x + dx,
              y: origin.y + dy,
              width: origin.width,
              height: origin.height,
            },
            natural.width,
            natural.height,
          ),
        );
        return;
      }

      let x = origin.x;
      let y = origin.y;
      let width = origin.width;
      let height = origin.height;
      if (drag.handle === "se") {
        width = origin.width + dx;
        height = origin.height + dy;
      } else if (drag.handle === "sw") {
        x = origin.x + dx;
        width = origin.width - dx;
        height = origin.height + dy;
      } else if (drag.handle === "ne") {
        y = origin.y + dy;
        width = origin.width + dx;
        height = origin.height - dy;
      } else {
        x = origin.x + dx;
        y = origin.y + dy;
        width = origin.width - dx;
        height = origin.height - dy;
      }

      let next = clampCropRect({ x, y, width, height }, natural.width, natural.height);
      if (aspectValue) {
        // Lock aspect from the fixed opposite corner.
        const fixedX = drag.handle.includes("w") ? origin.x + origin.width : origin.x;
        const fixedY = drag.handle.includes("n") ? origin.y + origin.height : origin.y;
        let nextW = Math.abs(
          drag.handle.includes("w") ? fixedX - (origin.x + dx) : origin.width + dx,
        );
        let nextH = nextW / aspectValue;
        if (drag.handle.includes("n")) {
          // Prefer height when dragging top edge-ish for stability.
          nextH = Math.abs(fixedY - (origin.y + dy));
          nextW = nextH * aspectValue;
        }
        if (drag.handle.includes("w")) x = fixedX - nextW;
        else x = fixedX;
        if (drag.handle.includes("n")) y = fixedY - nextH;
        else y = fixedY;
        next = clampCropRect({ x, y, width: nextW, height: nextH }, natural.width, natural.height);
        next = applyAspectToCrop(next, natural.width, natural.height, aspectValue);
      }
      // Keep pointer inside the stage roughly — ignore if outside heavily.
      if (
        clientX < bounds.left - 40 ||
        clientX > bounds.right + 40 ||
        clientY < bounds.top - 40 ||
        clientY > bounds.bottom + 40
      ) {
        return;
      }
      setCrop(next);
    },
    [aspectValue, crop, natural, scale],
  );

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      updateCropFromPointer(ev.clientX, ev.clientY);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateCropFromPointer]);

  function startMove(ev: ReactPointerEvent) {
    if (!crop) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = {
      kind: "move",
      startX: ev.clientX,
      startY: ev.clientY,
      origin: crop,
    };
  }

  function startResize(handle: "nw" | "ne" | "sw" | "se", ev: ReactPointerEvent) {
    if (!crop) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragRef.current = {
      kind: "resize",
      handle,
      startX: ev.clientX,
      startY: ev.clientY,
      origin: crop,
    };
  }

  function setPreset(next: ImageCropAspect) {
    setAspect(next);
    if (!natural) return;
    const ratio = aspectRatioForPreset(next);
    setCrop((prev) =>
      applyAspectToCrop(
        prev ?? defaultCropRect(natural.width, natural.height, ratio),
        natural.width,
        natural.height,
        ratio,
      ),
    );
  }

  async function confirm() {
    if (!crop || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cropped = await cropImageFile(file, crop, { fileName: file.name });
      const safe = natural ? clampCropRect(crop, natural.width, natural.height) : crop;
      onConfirm(
        cropped,
        natural
          ? {
              x: safe.x / natural.width,
              y: safe.y / natural.height,
              width: safe.width / natural.width,
              height: safe.height / natural.height,
            }
          : { x: 0, y: 0, width: 1, height: 1 },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to crop that image.");
      setBusy(false);
    }
  }

  async function submitFullImage() {
    if (!natural || busy) return;
    setBusy(true);
    setError(null);
    try {
      const full = clampCropRect(
        { x: 0, y: 0, width: natural.width, height: natural.height },
        natural.width,
        natural.height,
      );
      const cropped = await cropImageFile(file, full, { fileName: file.name });
      onConfirm(cropped, { x: 0, y: 0, width: 1, height: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to prepare that image.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title mb-0" id="image-crop-title">
                  {title}
                </h5>
                <p className="text-muted small mb-0">
                  Drag the box to frame only what should be saved — desk, fingers, and background
                  stay out of the upload.
                </p>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Cancel crop"
                disabled={busy}
                onClick={onCancel}
              />
            </div>
            <div className="modal-body">
              <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Crop shape">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`btn btn-sm ${aspect === preset.id ? "btn-primary" : "btn-outline-secondary"}`}
                    disabled={busy}
                    onClick={() => setPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div
                ref={stageRef}
                className="position-relative mx-auto bg-dark rounded overflow-hidden"
                style={{ maxWidth: "100%", maxHeight: "60vh", touchAction: "none" }}
              >
                {objectUrl ? (
                  // Plain <img> on purpose: static export, so next/image optimization is unavailable.
                  <img
                    src={objectUrl}
                    alt="Crop preview"
                    className="d-block"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "60vh",
                      width: "auto",
                      height: "auto",
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                    onLoad={(ev) => onImageLoad(ev.currentTarget)}
                  />
                ) : null}

                {screenCrop ? (
                  <>
                    <div
                      aria-hidden="true"
                      className="position-absolute top-0 start-0 w-100 h-100"
                      style={{
                        boxShadow: `0 0 0 9999px rgba(0,0,0,0.55)`,
                        left: screenCrop.left,
                        top: screenCrop.top,
                        width: screenCrop.width,
                        height: screenCrop.height,
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      role="presentation"
                      className="position-absolute border border-2 border-white"
                      style={{
                        left: screenCrop.left,
                        top: screenCrop.top,
                        width: screenCrop.width,
                        height: screenCrop.height,
                        cursor: "move",
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                      }}
                      onPointerDown={startMove}
                    >
                      {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                        <span
                          key={handle}
                          role="presentation"
                          className="position-absolute bg-white border border-primary rounded-circle"
                          style={{
                            width: 14,
                            height: 14,
                            ...(handle === "nw"
                              ? { left: -7, top: -7, cursor: "nwse-resize" }
                              : handle === "ne"
                                ? { right: -7, top: -7, cursor: "nesw-resize" }
                                : handle === "sw"
                                  ? { left: -7, bottom: -7, cursor: "nesw-resize" }
                                  : { right: -7, bottom: -7, cursor: "nwse-resize" }),
                          }}
                          onPointerDown={(ev) => startResize(handle, ev)}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              {error ? (
                <p className="text-danger small mt-3 mb-0" role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-muted small mt-3 mb-0">
                  Tip: use <strong>License card</strong> for driver&apos;s licenses so the crop
                  matches the ID shape.
                </p>
              )}
            </div>
            <div className="modal-footer flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={busy || !natural}
                onClick={() => void submitFullImage()}
              >
                Use full image
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !crop}
                onClick={() => void confirm()}
              >
                {busy ? "Preparing…" : "Crop & continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
