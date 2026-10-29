"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@forge/web-kit";
import { fleetDocumentPreviewSrc } from "@/lib/fleet";
import { inlineDataUrlFromRow, isFleetImageMime, mimeFromDataUrl } from "@/lib/fleet-document-view";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

type Props = {
  row: Record<string, unknown>;
  onView: (docId: string, inlineDataUrl?: string) => void;
};

/** Thumbnail + open action for a fleet document row (lazy-loads image bytes when needed). */
export function FleetDocumentPhotoCell({ row, onView }: Props) {
  const docId = asText(row.id);
  const inlinePreview = fleetDocumentPreviewSrc(row);
  const [thumbSrc, setThumbSrc] = useState<string | null>(inlinePreview);
  const [inlineDataUrl, setInlineDataUrl] = useState<string | undefined>(
    inlinePreview ?? undefined,
  );
  const [loadingThumb, setLoadingThumb] = useState(false);

  useEffect(() => {
    setThumbSrc(inlinePreview);
    setInlineDataUrl(inlinePreview ?? undefined);
  }, [inlinePreview]);

  useEffect(() => {
    if (thumbSrc || !row.hasPhoto || !docId) return;

    let cancelled = false;
    setLoadingThumb(true);

    void apiGet<Record<string, unknown>>(
      `/api/v1/industrial/fleet/documents/${encodeURIComponent(docId)}`,
    )
      .then((doc) => {
        if (cancelled) return;
        const dataUrl = inlineDataUrlFromRow(doc);
        if (!dataUrl || !isFleetImageMime(mimeFromDataUrl(dataUrl))) return;
        setInlineDataUrl(dataUrl);
        setThumbSrc(dataUrl);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingThumb(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docId, row.hasPhoto, thumbSrc]);

  if (thumbSrc) {
    return (
      <button
        type="button"
        className="btn p-0 border-0 bg-transparent"
        aria-label={`View ${asText(row.title) || "document"}`}
        onClick={() => onView(docId, inlineDataUrl)}
      >
        <img
          src={thumbSrc}
          alt={asText(row.title) || "Document"}
          className="rounded border"
          style={{ width: 72, height: 72, objectFit: "cover" }}
        />
      </button>
    );
  }

  if (row.hasPhoto || asText(row.contentType).toLowerCase().includes("pdf")) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        disabled={loadingThumb}
        onClick={() => onView(docId, inlineDataUrl)}
      >
        {loadingThumb ? "Loading…" : "View file"}
      </button>
    );
  }

  return <span className="text-muted">—</span>;
}
