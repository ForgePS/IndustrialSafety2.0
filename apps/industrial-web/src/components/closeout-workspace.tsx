"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";

type CloseoutDetail = {
  id: string;
  title?: string | null;
  description?: string | null;
  finding?: string | null;
  status?: string | null;
  ownerName?: string | null;
  photos?: Array<{ id?: string; fileName?: string; dataUrl?: string }>;
  completedAt?: string | null;
  evidenceNotes?: string | null;
};

type Photo = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
};

async function compressImageFile(file: File): Promise<Photo> {
  if (!file.type.startsWith("image/")) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    });
    return {
      id: `p-${Date.now()}`,
      fileName: file.name || "file.bin",
      contentType: file.type || "application/octet-stream",
      dataUrl,
    };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name.replace(/\.\w+$/, "") + ".jpg",
    contentType: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", 0.72),
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
    const next: Photo[] = [];
    for (const file of Array.from(files)) {
      next.push(await compressImageFile(file));
    }
    setPhotos((prev) => [...prev, ...next]);
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
                    <div className="d-flex flex-wrap gap-2 mt-2">
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
                      multiple
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
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={busy || !notes.trim()}>
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
