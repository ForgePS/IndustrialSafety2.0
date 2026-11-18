"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@forge/web-kit";
import {
  inlineDataUrlFromRow,
  isFleetImageMime,
  isFleetPdfMime,
  mimeFromDataUrl,
} from "@/lib/fleet-document-view";

type Props = {
  docId: string;
  title?: string;
  /** Skip fetch when the caller already has inline bytes (e.g. right after upload). */
  inlineDataUrl?: string | null;
  onClose: () => void;
};

export function FleetDocumentViewer({ docId, title, inlineDataUrl, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDataUrl(null);
      setMimeType("");

      try {
        let resolved = inlineDataUrl?.trim() || null;
        if (!resolved?.startsWith("data:")) {
          const doc = await apiGet<Record<string, unknown>>(
            `/api/v1/industrial/fleet/documents/${encodeURIComponent(docId)}`,
          );
          resolved = inlineDataUrlFromRow(doc);
        }
        if (!resolved) {
          throw new Error("No file is stored for this record.");
        }
        if (cancelled) return;
        setDataUrl(resolved);
        setMimeType(mimeFromDataUrl(resolved));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load document.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [docId, inlineDataUrl]);

  const label = title?.trim() || "Fleet document";

  return (
    <>
      <button
        type="button"
        className="modal-backdrop fade show"
        aria-label="Close document viewer"
        onClick={onClose}
      />
      <div
        className="modal fade show d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fleet-doc-viewer-title"
      >
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="fleet-doc-viewer-title">
                {label}
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body p-0" style={{ minHeight: 320 }}>
              {loading ? (
                <p className="text-muted p-4 mb-0">Loading document…</p>
              ) : error ? (
                <p className="text-danger p-4 mb-0" role="alert">
                  {error}
                </p>
              ) : dataUrl && isFleetImageMime(mimeType) ? (
                <img
                  src={dataUrl}
                  alt={label}
                  className="w-100"
                  style={{ maxHeight: "75vh", objectFit: "contain", background: "#111" }}
                />
              ) : dataUrl && isFleetPdfMime(mimeType) ? (
                <iframe
                  src={dataUrl}
                  title={label}
                  className="w-100 border-0"
                  style={{ minHeight: "75vh", background: "#fff" }}
                />
              ) : dataUrl ? (
                <div className="p-4">
                  <p className="mb-3">Preview is not available for this file type.</p>
                  <a href={dataUrl} download className="btn btn-primary">
                    Download file
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
