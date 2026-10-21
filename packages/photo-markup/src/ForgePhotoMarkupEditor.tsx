"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { STROKE_PRESETS } from "./colors.js";
import {
  clearMarkupSessionDraft,
  loadMarkupSessionDraft,
  saveMarkupSessionDraft,
} from "./draft-storage.js";
import { MarkupCanvas } from "./MarkupCanvas.js";
import { buildMarkupDocument, renderMarkedUpImage } from "./render.js";
import { ColorPicker, MarkupToolbar } from "./Toolbar.js";
import { SafetyIconPicker } from "./SafetyIconPicker.js";
import type { ForgePhotoMarkupEditorProps } from "./types.js";
import { useMarkupEditor } from "./useMarkupEditor.js";

function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

export function ForgePhotoMarkupEditor({
  imageSrc,
  photoId,
  initialAnnotations,
  initialDocument,
  mode = "full",
  allowedTools,
  readOnly = false,
  embedded = false,
  title = "Photo Markup",
  className,
  style,
  onSave,
  onCancel,
}: ForgePhotoMarkupEditorProps) {
  const isMobile = useIsMobile();
  const editor = useMarkupEditor({
    ...(initialAnnotations || initialDocument?.annotations
      ? { initialAnnotations: initialAnnotations ?? initialDocument?.annotations }
      : {}),
    ...(initialDocument ? { initialDocument } : {}),
    defaultTool: "arrow",
    readOnly,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const recoveredRef = useRef(false);

  useEffect(() => {
    recoveredRef.current = false;
    const draft = loadMarkupSessionDraft(imageSrc, photoId);
    if (draft?.annotations.length && !initialAnnotations?.length && !initialDocument?.annotations?.length) {
      editor.reset(draft.annotations, draft.document);
      setDraftNotice("Recovered unsaved photo markup.");
      recoveredRef.current = true;
      return;
    }
    editor.reset(
      initialAnnotations ?? initialDocument?.annotations ?? [],
      initialDocument,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when source image/revision changes
  }, [imageSrc, photoId]);

  useEffect(() => {
    if (readOnly || !editor.dirty) return;
    const timer = window.setTimeout(() => {
      saveMarkupSessionDraft({
        imageSrc,
        ...(photoId ? { photoId } : {}),
        annotations: editor.annotations,
        document: buildMarkupDocument(editor.annotations, 0, 0, {
          ...(editor.crop ? { crop: editor.crop } : {}),
          ...(editor.rotation ? { rotation: editor.rotation } : {}),
          ...(editor.flipX ? { flipX: true } : {}),
          ...(editor.flipY ? { flipY: true } : {}),
        }),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    editor.annotations,
    editor.crop,
    editor.dirty,
    editor.flipX,
    editor.flipY,
    editor.rotation,
    imageSrc,
    photoId,
    readOnly,
  ]);

  useEffect(() => {
    if (editor.selected?.type === "text") {
      setTextDraft(editor.selected.text ?? "");
    }
  }, [editor.selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (readOnly) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        editor.undo();
        return;
      }
      if ((meta && event.key.toLowerCase() === "y") || (meta && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        editor.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (event.key === "Escape") {
        if (editor.selectedId) {
          editor.setSelectedId(null);
          return;
        }
        onCancel?.();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
          return;
        }
        editor.deleteSelected();
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, typeof editor.tool> = {
        v: "select",
        p: "pen",
        a: "arrow",
        l: "line",
        t: "text",
        r: "rectangle",
        c: "callout",
      };
      const next = map[event.key.toLowerCase()];
      if (next) {
        event.preventDefault();
        editor.setTool(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleSave is stable enough via editor state at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, onCancel, readOnly]);

  const handleSave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const document = buildMarkupDocument(editor.annotations, 0, 0, {
        ...(editor.crop ? { crop: editor.crop } : {}),
        ...(editor.rotation ? { rotation: editor.rotation } : {}),
        ...(editor.flipX ? { flipX: true } : {}),
        ...(editor.flipY ? { flipY: true } : {}),
      });
      let renderedDataUrl: string | undefined;
      let renderedBlob: Blob | undefined;
      try {
        const rendered = await renderMarkedUpImage({
          imageSrc,
          annotations: editor.annotations,
          ...(editor.crop ? { crop: editor.crop } : {}),
          ...(editor.rotation ? { rotation: editor.rotation } : {}),
          ...(editor.flipX ? { flipX: true } : {}),
          ...(editor.flipY ? { flipY: true } : {}),
        });
        renderedDataUrl = rendered.dataUrl;
        renderedBlob = rendered.blob;
        document.canvasWidth = rendered.width;
        document.canvasHeight = rendered.height;
      } catch {
        // Spec: store markup JSON first; rendering failure must not lose annotations.
      }
      await onSave({
        annotations: editor.annotations,
        document,
        ...(photoId ? { photoId } : {}),
        ...(renderedDataUrl ? { renderedDataUrl } : {}),
        ...(renderedBlob ? { renderedBlob } : {}),
      });
      clearMarkupSessionDraft(imageSrc, photoId);
      setDraftNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Markup could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [editor.annotations, editor.crop, editor.rotation, editor.flipX, editor.flipY, imageSrc, onSave, photoId, saving]);

  const drawing = editor.tool !== "select" && editor.tool !== "eraser";

  const chrome = (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
          flexShrink: 0,
        }}
      >
        {onCancel ? (
          <button type="button" onClick={onCancel} style={btnSecondary}>
            {embedded ? "Cancel" : "Back"}
          </button>
        ) : null}
        <strong style={{ flex: 1, fontSize: 15 }}>{title}</strong>
        <button type="button" onClick={editor.undo} disabled={!editor.canUndo || readOnly} style={btnSecondary}>
          Undo
        </button>
        <button type="button" onClick={editor.redo} disabled={!editor.canRedo || readOnly} style={btnSecondary}>
          Redo
        </button>
        {onSave ? (
          <button type="button" onClick={() => void handleSave()} disabled={saving || readOnly} style={btnPrimary}>
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
      </header>

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {!isMobile && !readOnly ? (
          <MarkupToolbar
            tool={editor.tool}
            onToolChange={(next) => {
              editor.setTool(next);
              if (next === "icon") setIconPickerOpen(true);
            }}
            mode={mode}
            layout="side"
            {...(allowedTools ? { allowedTools } : {})}
          />
        ) : null}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <MarkupCanvas
            imageSrc={imageSrc}
            annotations={editor.visibleAnnotations}
            selectedId={editor.selectedId}
            cursor={drawing ? "crosshair" : editor.tool === "eraser" ? "cell" : "default"}
            style={{ flex: 1, minHeight: 280 }}
            onPointerDownUnit={(point) => {
              if (readOnly) return;
              if (editor.tool === "select" || editor.tool === "eraser") {
                editor.selectOrEraseAt(point);
                return;
              }
              if (editor.tool === "icon") {
                setIconPickerOpen(true);
                return;
              }
              editor.beginShapeWithOrigin(point);
            }}
            onPointerMoveUnit={(point, event) => {
              if (readOnly) return;
              if (event.buttons !== 1) return;
              editor.updateDraftWithOrigin(point);
            }}
            onPointerUpUnit={() => {
              if (readOnly) return;
              editor.finishDraft();
            }}
          />
          <SafetyIconPicker
            open={iconPickerOpen}
            color={editor.color}
            onClose={() => setIconPickerOpen(false)}
            onSelect={(icon) => editor.placeIcon(icon.key)}
          />

          {!readOnly ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                padding: "8px 12px",
                borderTop: "1px solid #e5e7eb",
                background: "#f9fafb",
              }}
            >
              <ColorPicker color={editor.color} onChange={editor.setColor} />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                Width
                <select
                  value={editor.strokePreset}
                  onChange={(e) => editor.setStrokePreset(e.target.value as typeof editor.strokePreset)}
                  style={{ minHeight: 36 }}
                >
                  {STROKE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={editor.rotateLeft} disabled={readOnly} style={btnSecondary}>
                Rotate left
              </button>
              <button type="button" onClick={editor.rotateRight} disabled={readOnly} style={btnSecondary}>
                Rotate right
              </button>
              <button type="button" onClick={editor.toggleFlipX} disabled={readOnly} style={btnSecondary}>
                Flip H
              </button>
              <button type="button" onClick={editor.toggleFlipY} disabled={readOnly} style={btnSecondary}>
                Flip V
              </button>
              {editor.crop ? (
                <button type="button" onClick={editor.clearCrop} disabled={readOnly} style={btnSecondary}>
                  Clear crop
                </button>
              ) : null}
              <button type="button" onClick={editor.deleteSelected} disabled={!editor.selectedId} style={btnSecondary}>
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Clear all markup on this photo?")) {
                    editor.clearAll();
                  }
                }}
                disabled={editor.annotations.length === 0}
                style={btnSecondary}
              >
                Clear all
              </button>
              <button type="button" onClick={editor.bringForward} disabled={!editor.selectedId} style={btnSecondary}>
                Forward
              </button>
              <button type="button" onClick={editor.sendBackward} disabled={!editor.selectedId} style={btnSecondary}>
                Backward
              </button>
              {editor.selected?.type === "text" ? (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, flex: 1, minWidth: 160 }}>
                  Text
                  <input
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onBlur={() => editor.updateSelectedText(textDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        editor.updateSelectedText(textDraft);
                      }
                    }}
                    style={{ flex: 1, minHeight: 36, padding: "4px 8px" }}
                  />
                </label>
              ) : null}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                {editor.annotations.length} annotation{editor.annotations.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>

        {isMobile && !readOnly ? (
          <MarkupToolbar
            tool={editor.tool}
            onToolChange={(next) => {
              editor.setTool(next);
              if (next === "icon") setIconPickerOpen(true);
            }}
            mode={mode}
            layout="bottom"
            {...(allowedTools ? { allowedTools } : {})}
          />
        ) : null}
      </div>

      {draftNotice ? (
        <div
          role="status"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 12px",
            background: "#eff6ff",
            color: "#1e3a8a",
            fontSize: 13,
          }}
        >
          <span style={{ flex: 1 }}>{draftNotice}</span>
          <button
            type="button"
            style={btnSecondary}
            onClick={() => {
              clearMarkupSessionDraft(imageSrc, photoId);
              editor.reset(initialAnnotations ?? initialDocument?.annotations ?? [], initialDocument);
              setDraftNotice(null);
            }}
          >
            Discard Draft
          </button>
          <button type="button" style={btnSecondary} onClick={() => setDraftNotice(null)}>
            Continue Editing
          </button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ padding: "8px 12px", background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
          {error} Your local draft has been retained.
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", minHeight: 420, ...style }}>
        {chrome}
      </div>
    );
  }

  return (
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1050,
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        paddingBottom: "env(safe-area-inset-bottom)",
        ...style,
      }}
    >
      {chrome}
    </div>
  );
}

const btnSecondary: CSSProperties = {
  minHeight: 40,
  minWidth: 44,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: 13,
};

const btnPrimary: CSSProperties = {
  ...btnSecondary,
  background: "#2563eb",
  borderColor: "#2563eb",
  color: "#ffffff",
  fontWeight: 600,
};
