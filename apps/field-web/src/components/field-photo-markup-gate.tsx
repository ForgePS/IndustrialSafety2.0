"use client";

import { useState } from "react";
import { ForgePhotoMarkupEditor, type MarkupDocument } from "@forge/photo-markup";

/** Shared photo shape for Field capture → markup → commit flows. */
export type MarkupablePhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
  markupDocument?: unknown;
  caption?: string;
};

type PendingPhoto = {
  original: MarkupablePhoto;
};

type Props = {
  open: boolean;
  pending: PendingPhoto | null;
  module?: string;
  onSaveWithoutMarkup: (photo: MarkupablePhoto) => void;
  onSaveWithMarkup: (photo: MarkupablePhoto) => void;
  onCancel: () => void;
};

/**
 * Field photo post-capture gate: Add Markup | Save Without Markup.
 * Keeps the original data URL when markup is applied.
 */
export function FieldPhotoMarkupGate({
  open,
  pending,
  module = "field",
  onSaveWithoutMarkup,
  onSaveWithMarkup,
  onCancel,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (!open || !pending) return null;

  if (editing) {
    return (
      <ForgePhotoMarkupEditor
        imageSrc={pending.original.dataUrl}
        title="Mark up photo"
        mode="quick"
        module={module}
        onCancel={() => {
          setEditing(false);
        }}
        onSave={({ document, renderedDataUrl }) => {
          const marked: MarkupablePhoto = {
            ...pending.original,
            dataUrl: renderedDataUrl || pending.original.dataUrl,
            originalDataUrl: pending.original.dataUrl,
            hasMarkup: true,
            markupDocument: document as MarkupDocument,
            fileName:
              pending.original.fileName.replace(/(\.[^.]+)?$/, "-marked$1") ||
              "photo-marked.jpg",
          };
          setEditing(false);
          onSaveWithMarkup(marked);
        }}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "#0b1220",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <button type="button" className="ff-btn ff-btn-secondary" onClick={onCancel} style={{ minHeight: 44 }}>
          Retake
        </button>
        <strong style={{ flex: 1, color: "#f9fafb", textAlign: "center" }}>Use this photo?</strong>
        <span style={{ width: 72 }} />
      </header>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
          minHeight: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pending.original.dataUrl}
          alt="Captured photo"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
        <button type="button" className="ff-btn" style={{ minHeight: 48 }} onClick={() => setEditing(true)}>
          Add Markup
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          style={{ minHeight: 48 }}
          onClick={() => onSaveWithoutMarkup(pending.original)}
        >
          Save Without Markup
        </button>
      </div>
    </div>
  );
}
