"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { ForgePhotoMarkupEditor, PhotoCompareViewer } from "@forge/photo-markup";
import { compressImageToDataUrl, DEFAULT_MAX_DATA_URL_LENGTH } from "@/lib/compress-image";

type CloseoutDetail = {
  id: string;
  title?: string | null;
  description?: string | null;
  finding?: string | null;
  status?: string | null;
  ownerName?: string | null;
  photos?: Array<{
    id?: string;
    fileName?: string;
    dataUrl?: string;
    originalDataUrl?: string;
    hasMarkup?: boolean;
  }>;
  completedAt?: string | null;
  evidenceNotes?: string | null;
};

type Photo = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
  originalDataUrl?: string;
  hasMarkup?: boolean;
};

async function compressImageFile(file: File): Promise<Photo> {
  const dataUrl = await compressImageToDataUrl(file, DEFAULT_MAX_DATA_URL_LENGTH);
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name.replace(/\.\w+$/, "") + ".jpg",
    contentType: "image/jpeg",
    dataUrl,
  };
}

function CloseoutForm({ token }: { token: string }) {
  const [detail, setDetail] = useState<CloseoutDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [completedByName, setCompletedByName] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingBasePhoto, setPendingBasePhoto] = useState<Photo | null>(null);
  const [markupStep, setMarkupStep] = useState<"gate" | "edit" | null>(null);
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const data = await apiGet<CloseoutDetail>(
          `/api/v1/public/corrective-actions/closeout/${encodeURIComponent(token)}`,
        );
        if (!cancelled) {
          setDetail(data);
          if (String(data.status ?? "").toUpperCase() === "COMPLETED") setDone(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Close-out link is invalid or expired");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onAddPhotos(files: FileList | null) {
    if (!files?.length) return;
    const file = Array.from(files)[0];
    if (!file) return;
    const photo = await compressImageFile(file);
    setPendingBasePhoto(photo);
    setMarkupStep("gate");
  }

  function commitCloseoutPhoto(photo: Photo) {
    setPhotos((prev) => [...prev, photo]);
    setPendingBasePhoto(null);
    setMarkupStep(null);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!token || !notes.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiSend<CloseoutDetail>(
        `/api/v1/public/corrective-actions/closeout/${encodeURIComponent(token)}`,
        "POST",
        {
          notes: notes.trim(),
          completedByName: completedByName.trim() || undefined,
          photos,
        },
      );
      setDetail(updated);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to submit close-out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-xxl">
      {markupStep === "gate" && pendingBasePhoto ? (
        <div
          className="card mb-3"
          style={{ position: "fixed", inset: 16, zIndex: 1080, overflow: "auto" }}
        >
          <div className="card-body">
            <h2 className="h5">Use this evidence photo?</h2>
            <img
              src={pendingBasePhoto.dataUrl}
              alt="Evidence preview"
              className="img-fluid rounded border mb-3"
              style={{ maxHeight: 280 }}
            />
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setMarkupStep("edit")}
              >
                Add Markup
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => commitCloseoutPhoto(pendingBasePhoto)}
              >
                Save Without Markup
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => {
                  setPendingBasePhoto(null);
                  setMarkupStep(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {markupStep === "edit" && pendingBasePhoto ? (
        <ForgePhotoMarkupEditor
          imageSrc={pendingBasePhoto.dataUrl}
          title="Mark up evidence photo"
          mode="quick"
          module="corrective_actions"
          onCancel={() => setMarkupStep("gate")}
          onSave={({ renderedDataUrl }) => {
            commitCloseoutPhoto({
              ...pendingBasePhoto,
              originalDataUrl: pendingBasePhoto.dataUrl,
              dataUrl: renderedDataUrl || pendingBasePhoto.dataUrl,
              hasMarkup: true,
              fileName: pendingBasePhoto.fileName.replace(/(\.[^.]+)?$/, "-marked$1"),
            });
          }}
        />
      ) : null}
      {compare ? (
        <PhotoCompareViewer
          originalSrc={compare.before}
          markedSrc={compare.after}
          title="Before / after"
          onClose={() => setCompare(null)}
        />
      ) : null}
      <div className="authentication-wrapper authentication-basic container-p-y">
        <div className="authentication-inner" style={{ maxWidth: 560 }}>
          <div className="card">
            <div className="card-body">
              <h1 className="h4 mb-1">Corrective action close-out</h1>
              <p className="text-muted mb-4">
                Submit notes and optional photos to close this inspection finding.
              </p>

              {error ? (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              ) : null}

              {busy && !detail ? <p className="text-muted">Loading…</p> : null}

              {detail ? (
                <div className="mb-4">
                  <div className="fw-medium">{detail.title || "Open finding"}</div>
                  {detail.finding ? <p className="mb-1">{detail.finding}</p> : null}
                  {detail.ownerName ? (
                    <small className="text-muted">Owner: {detail.ownerName}</small>
                  ) : null}
                  {(detail.photos ?? []).length > 0 ? (
                    <div className="mt-2">
                      <div className="small text-muted mb-1">Finding photos (before)</div>
                      <div className="d-flex flex-wrap gap-2">
                        {(detail.photos ?? []).map((photo, idx) =>
                          photo.dataUrl ? (
                            <img
                              key={photo.id || idx}
                              src={photo.dataUrl}
                              alt={photo.fileName || "Finding photo"}
                              className="rounded border"
                              style={{ width: 88, height: 88, objectFit: "cover" }}
                            />
                          ) : null,
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {done ? (
                <div className="alert alert-success mb-0" role="status">
                  Close-out submitted
                  {detail?.completedAt
                    ? ` on ${new Date(detail.completedAt).toLocaleString()}`
                    : ""}
                  . Thank you.
                </div>
              ) : detail ? (
                <form onSubmit={(ev) => void onSubmit(ev)}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="closeout-by">
                      Your name
                    </label>
                    <input
                      id="closeout-by"
                      className="form-control"
                      value={completedByName}
                      onChange={(ev) => setCompletedByName(ev.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="closeout-notes">
                      Close-out notes
                    </label>
                    <textarea
                      id="closeout-notes"
                      className="form-control"
                      rows={4}
                      required
                      value={notes}
                      onChange={(ev) => setNotes(ev.target.value)}
                    />
                  </div>
                  <div className="mb-4">
                    <label className="form-label" htmlFor="closeout-photos">
                      Evidence photos
                    </label>
                    <input
                      id="closeout-photos"
                      type="file"
                      className="form-control"
                      accept="image/*"
                      capture="environment"
                      onChange={(ev) => void onAddPhotos(ev.target.files)}
                    />
                    {photos.length > 0 ? (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {photos.map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.dataUrl}
                            alt={photo.fileName}
                            className="rounded border"
                            style={{ width: 88, height: 88, objectFit: "cover" }}
                          />
                        ))}
                      </div>
                    ) : null}
                    {detail.photos?.[0]?.dataUrl && photos[0]?.dataUrl ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary mt-2"
                        onClick={() =>
                          setCompare({
                            before: detail.photos![0]!.dataUrl!,
                            after: photos[0]!.dataUrl,
                          })
                        }
                      >
                        Compare before / after
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy || !notes.trim()}
                  >
                    Submit close-out
                  </button>
                </form>
              ) : null}

              <div className="mt-4">
                <Link href="/" className="text-muted small">
                  Back to Forge Industrial
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseoutTokenResolver() {
  const search = useSearchParams();
  const params = useParams<{ token?: string }>();
  const fromQuery = search.get("token")?.trim() || "";
  const fromPath = typeof params.token === "string" ? params.token.trim() : "";
  const token = fromQuery || (fromPath && fromPath !== "placeholder" ? fromPath : "");

  if (!token) {
    return (
      <div className="container-xxl py-5">
        <div className="alert alert-warning" role="alert">
          Missing close-out token. Open the link from your inspection report.
        </div>
      </div>
    );
  }

  return <CloseoutForm token={token} />;
}

export function CloseoutWorkspace() {
  return (
    <Suspense fallback={<p className="text-muted p-4 mb-0">Loading close-out…</p>}>
      <CloseoutTokenResolver />
    </Suspense>
  );
}
