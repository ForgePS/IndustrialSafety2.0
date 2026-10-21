"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DEFAULT_MARKUP_COLOR, STROKE_PRESETS } from "./colors.js";
import { HistoryManager } from "./history.js";
import { createAnnotationId } from "./ids.js";
import type { MarkupDocument, MarkupTool, PhotoAnnotation } from "./types.js";

export type UseMarkupEditorOptions = {
  initialAnnotations?: readonly PhotoAnnotation[] | undefined;
  initialDocument?: MarkupDocument | undefined;
  defaultTool?: MarkupTool;
  defaultColor?: string;
  readOnly?: boolean;
};

export function useMarkupEditor(options: UseMarkupEditorOptions = {}) {
  const historyRef = useRef(new HistoryManager());
  const [annotations, setAnnotations] = useState<PhotoAnnotation[]>(() => [
    ...(options.initialAnnotations ?? []),
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkupTool>(options.defaultTool ?? "arrow");
  const [color, setColor] = useState(options.defaultColor ?? DEFAULT_MARKUP_COLOR);
  const [strokePreset, setStrokePreset] = useState<(typeof STROKE_PRESETS)[number]["id"]>("medium");
  const [opacity, setOpacity] = useState(1);
  const [draft, setDraft] = useState<PhotoAnnotation | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [crop, setCrop] = useState<MarkupDocument["crop"] | undefined>(
    () => options.initialDocument?.crop,
  );
  const [rotation, setRotation] = useState<MarkupDocument["rotation"]>(
    () => options.initialDocument?.rotation ?? 0,
  );
  const [flipX, setFlipX] = useState(() => options.initialDocument?.flipX ?? false);
  const [flipY, setFlipY] = useState(() => options.initialDocument?.flipY ?? false);
  const activeDrawToolRef = useRef<MarkupTool | null>(null);

  const strokeWidth = useMemo(() => {
    const preset = STROKE_PRESETS.find((p) => p.id === strokePreset) ?? STROKE_PRESETS[1];
    return preset.width;
  }, [strokePreset]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  }, []);

  const commit = useCallback(
    (next: PhotoAnnotation[], pushHistory = true) => {
      if (pushHistory) {
        historyRef.current.push(annotations);
      }
      setAnnotations(next);
      setDirty(true);
      syncHistoryFlags();
    },
    [annotations, syncHistoryFlags],
  );

  const reset = useCallback((next: readonly PhotoAnnotation[], doc?: MarkupDocument) => {
    historyRef.current.clear();
    setAnnotations(
      next.map((a) => {
        const copy: PhotoAnnotation = { ...a };
        if (a.points) copy.points = [...a.points];
        return copy;
      }),
    );
    setSelectedId(null);
    setDraft(null);
    setCrop(doc?.crop);
    setRotation(doc?.rotation ?? 0);
    setFlipX(doc?.flipX ?? false);
    setFlipY(doc?.flipY ?? false);
    setDirty(false);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const undo = useCallback(() => {
    const previous = historyRef.current.undo(annotations);
    if (!previous) return;
    setAnnotations(previous);
    setSelectedId(null);
    setDirty(true);
    syncHistoryFlags();
  }, [annotations, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo(annotations);
    if (!next) return;
    setAnnotations(next);
    setSelectedId(null);
    setDirty(true);
    syncHistoryFlags();
  }, [annotations, syncHistoryFlags]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(annotations.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }, [annotations, commit, selectedId]);

  const clearAll = useCallback(() => {
    if (annotations.length === 0) return;
    commit([]);
    setSelectedId(null);
  }, [annotations.length, commit]);

  const nextZ = useCallback(() => {
    if (annotations.length === 0) return 0;
    return Math.max(...annotations.map((a) => a.zIndex)) + 1;
  }, [annotations]);

  const beginShape = useCallback(
    (point: { x: number; y: number }) => {
      if (options.readOnly) return;
      if (tool === "select" || tool === "eraser") return;
      activeDrawToolRef.current = tool;
      const base: PhotoAnnotation = {
        id: createAnnotationId(tool),
        type:
          tool === "pen" || tool === "highlighter"
            ? tool
            : tool === "callout"
              ? "callout"
              : tool === "icon"
                ? "icon"
                : tool === "blur"
                  ? "blur"
                  : tool === "redaction"
                    ? "redaction"
                    : tool === "crop"
                      ? "rectangle"
                      : tool,
        x: point.x,
        y: point.y,
        stroke: tool === "crop" ? "#2563EB" : color,
        strokeWidth: tool === "highlighter" ? strokeWidth * 2.5 : strokeWidth,
        opacity: tool === "highlighter" ? 0.4 : tool === "crop" ? 0.35 : opacity,
        zIndex: nextZ(),
        createdAt: new Date().toISOString(),
      };
      if (tool === "pen" || tool === "highlighter") {
        base.points = [point.x, point.y, point.x, point.y];
      } else if (tool === "line" || tool === "arrow") {
        base.x2 = point.x;
        base.y2 = point.y;
      } else if (tool === "rectangle" || tool === "ellipse" || tool === "crop") {
        base.width = 0;
        base.height = 0;
        base.fill = tool === "crop" ? "rgba(37,99,235,0.15)" : "transparent";
        if (tool === "crop") base.lineStyle = "dashed";
      } else if (tool === "blur" || tool === "redaction") {
        base.width = 0;
        base.height = 0;
        if (tool === "redaction") {
          base.fill = "#000000";
          base.opacity = 1;
        } else {
          base.opacity = 0.85;
        }
      } else if (tool === "text") {
        base.text = "Label";
        base.fontSize = 24;
        base.fontWeight = "bold";
        base.backgroundColor = "#000000";
        base.stroke = "#FFFFFF";
      } else if (tool === "callout") {
        const used = new Set(
          annotations.filter((a) => a.type === "callout").map((a) => a.calloutNumber ?? 0),
        );
        let n = 1;
        while (used.has(n) && n < 99) n += 1;
        base.calloutNumber = n;
        base.fill = color;
      } else if (tool === "icon") {
        base.iconKey = "warning";
        base.width = 0.09;
        base.height = 0.09;
      }
      setDraft(base);
      setSelectedId(null);
    },
    [annotations, color, nextZ, opacity, options.readOnly, strokeWidth, tool],
  );

  /** Track drag origin for box tools */
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);

  const beginShapeWithOrigin = useCallback(
    (point: { x: number; y: number }) => {
      dragOriginRef.current = point;
      beginShape(point);
    },
    [beginShape],
  );

  const updateDraftWithOrigin = useCallback((point: { x: number; y: number }) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const origin = dragOriginRef.current;
      if (prev.type === "pen" || prev.type === "highlighter") {
        return { ...prev, points: [...(prev.points ?? []), point.x, point.y] };
      }
      if (prev.type === "line" || prev.type === "arrow") {
        return { ...prev, x2: point.x, y2: point.y };
      }
      if ((prev.type === "rectangle" || prev.type === "ellipse" || prev.type === "blur" || prev.type === "redaction") && origin) {
        // crop drafts also use rectangle type
        return {
          ...prev,
          x: Math.min(origin.x, point.x),
          y: Math.min(origin.y, point.y),
          width: Math.abs(point.x - origin.x),
          height: Math.abs(point.y - origin.y),
        };
      }
      if (prev.type === "text" || prev.type === "callout" || prev.type === "icon") {
        return { ...prev, x: point.x, y: point.y };
      }
      return prev;
    });
  }, []);

  const finishDraft = useCallback(() => {
    const current = draft;
    const drawTool = activeDrawToolRef.current;
    activeDrawToolRef.current = null;
    dragOriginRef.current = null;
    setDraft(null);
    if (!current) return;

    if (drawTool === "crop") {
      if ((current.width ?? 0) < 0.02 || (current.height ?? 0) < 0.02) return;
      setCrop({
        x: current.x,
        y: current.y,
        width: current.width ?? 0,
        height: current.height ?? 0,
      });
      setDirty(true);
      setTool("select");
      return;
    }

    if (current.type === "pen" || current.type === "highlighter") {
      const pts = current.points ?? [];
      if (pts.length < 6) return;
      commit([...annotations, current]);
      return;
    }
    if (current.type === "line" || current.type === "arrow") {
      const dx = (current.x2 ?? current.x) - current.x;
      const dy = (current.y2 ?? current.y) - current.y;
      if (dx * dx + dy * dy < 0.0004) return;
      commit([...annotations, current]);
      setSelectedId(current.id);
      return;
    }
    if (current.type === "rectangle" || current.type === "ellipse" || current.type === "blur" || current.type === "redaction") {
      if ((current.width ?? 0) < 0.01 || (current.height ?? 0) < 0.01) return;
      commit([...annotations, current]);
      setSelectedId(current.id);
      return;
    }
    if (current.type === "text" || current.type === "callout" || current.type === "icon") {
      commit([...annotations, current]);
      setSelectedId(current.id);
    }
  }, [annotations, commit, draft]);

  const hitTest = useCallback(
    (point: { x: number; y: number }): PhotoAnnotation | null => {
      const sorted = [...annotations].sort((a, b) => b.zIndex - a.zIndex);
      for (const a of sorted) {
        if (a.type === "arrow" || a.type === "line") {
          const x2 = a.x2 ?? a.x;
          const y2 = a.y2 ?? a.y;
          const dist = pointToSegmentDistance(point.x, point.y, a.x, a.y, x2, y2);
          if (dist < 0.025) return a;
        } else if (a.type === "rectangle" || a.type === "ellipse" || a.type === "blur" || a.type === "redaction") {
          const w = a.width ?? 0;
          const h = a.height ?? 0;
          if (
            point.x >= a.x &&
            point.x <= a.x + w &&
            point.y >= a.y &&
            point.y <= a.y + h
          ) {
            return a;
          }
        } else if (a.type === "callout" || a.type === "text" || a.type === "icon") {
          const dx = point.x - a.x;
          const dy = point.y - a.y;
          const thresh = a.type === "icon" ? 0.004 : 0.0025;
          if (dx * dx + dy * dy < thresh) return a;
        } else if ((a.type === "pen" || a.type === "highlighter") && a.points) {
          for (let i = 0; i < a.points.length - 2; i += 2) {
            const dist = pointToSegmentDistance(
              point.x,
              point.y,
              a.points[i]!,
              a.points[i + 1]!,
              a.points[i + 2]!,
              a.points[i + 3]!,
            );
            if (dist < 0.02) return a;
          }
        }
      }
      return null;
    },
    [annotations],
  );

  const selectOrEraseAt = useCallback(
    (point: { x: number; y: number }) => {
      const hit = hitTest(point);
      if (tool === "eraser") {
        if (hit) {
          commit(annotations.filter((a) => a.id !== hit.id));
          setSelectedId(null);
        }
        return;
      }
      setSelectedId(hit?.id ?? null);
    },
    [annotations, commit, hitTest, tool],
  );

  const updateSelectedText = useCallback(
    (text: string) => {
      if (!selectedId) return;
      commit(
        annotations.map((a) => (a.id === selectedId ? { ...a, text } : a)),
      );
    },
    [annotations, commit, selectedId],
  );

  const placeIcon = useCallback(
    (iconKey: string, point?: { x: number; y: number }) => {
      if (options.readOnly) return;
      const at = point ?? { x: 0.5, y: 0.5 };
      const annotation: PhotoAnnotation = {
        id: createAnnotationId("icon"),
        type: "icon",
        x: at.x,
        y: at.y,
        width: 0.09,
        height: 0.09,
        iconKey,
        stroke: color,
        opacity: 1,
        zIndex: nextZ(),
        createdAt: new Date().toISOString(),
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
    },
    [annotations, color, commit, nextZ, options.readOnly],
  );

  const bringForward = useCallback(() => {
    if (!selectedId) return;
    const sorted = [...annotations].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((a) => a.id === selectedId);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const a = sorted[idx]!;
    const b = sorted[idx + 1]!;
    const az = a.zIndex;
    commit(
      annotations.map((item) => {
        if (item.id === a.id) return { ...item, zIndex: b.zIndex };
        if (item.id === b.id) return { ...item, zIndex: az };
        return item;
      }),
    );
  }, [annotations, commit, selectedId]);

  const sendBackward = useCallback(() => {
    if (!selectedId) return;
    const sorted = [...annotations].sort((a, b) => a.zIndex - b.zIndex);
    const idx = sorted.findIndex((a) => a.id === selectedId);
    if (idx <= 0) return;
    const a = sorted[idx]!;
    const b = sorted[idx - 1]!;
    const az = a.zIndex;
    commit(
      annotations.map((item) => {
        if (item.id === a.id) return { ...item, zIndex: b.zIndex };
        if (item.id === b.id) return { ...item, zIndex: az };
        return item;
      }),
    );
  }, [annotations, commit, selectedId]);

  const rotateLeft = useCallback(() => {
    setRotation((prev) => {
      const next = ((prev ?? 0) - 90 + 360) % 360;
      return next as MarkupDocument["rotation"];
    });
    setDirty(true);
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((prev) => {
      const next = ((prev ?? 0) + 90) % 360;
      return next as MarkupDocument["rotation"];
    });
    setDirty(true);
  }, []);

  const toggleFlipX = useCallback(() => {
    setFlipX((v) => !v);
    setDirty(true);
  }, []);

  const toggleFlipY = useCallback(() => {
    setFlipY((v) => !v);
    setDirty(true);
  }, []);

  const clearCrop = useCallback(() => {
    setCrop(undefined);
    setDirty(true);
  }, []);

  const visibleAnnotations = draft ? [...annotations, draft] : annotations;

  return {
    annotations,
    visibleAnnotations,
    selectedId,
    selected: annotations.find((a) => a.id === selectedId) ?? null,
    tool,
    setTool,
    color,
    setColor,
    strokePreset,
    setStrokePreset,
    strokeWidth,
    opacity,
    setOpacity,
    dirty,
    canUndo,
    canRedo,
    crop,
    rotation,
    flipX,
    flipY,
    undo,
    redo,
    deleteSelected,
    clearAll,
    reset,
    beginShapeWithOrigin,
    updateDraftWithOrigin,
    finishDraft,
    selectOrEraseAt,
    updateSelectedText,
    placeIcon,
    bringForward,
    sendBackward,
    setSelectedId,
    rotateLeft,
    rotateRight,
    toggleFlipX,
    toggleFlipY,
    clearCrop,
  };
}

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
