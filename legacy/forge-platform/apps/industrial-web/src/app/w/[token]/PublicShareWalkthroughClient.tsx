"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import {
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  flattenWalkthroughScenes,
  formatWalkthroughRuntime,
} from "@forge/contracts";

type ShareResolve = {
  publicToken: string;
  requirePin: boolean;
  unlocked: boolean;
  allowInteractive: boolean;
  allowVideoDownload: boolean;
  allowChapterNavigation: boolean;
  walkthrough: {
    code: string;
    name: string;
    description: string | null;
    version: string;
    tagline?: string;
    closingTagline?: string;
    chapters: Array<{ id: string; title: string; order: number; targetDurationMs: number }>;
  };
  runtime: { formatted: string; totalMs: number; status: string };
  viewerPath: string;
  demoBadge: boolean;
};

export default function PublicShareWalkthroughClient() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const token = String(params?.token ?? "").trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareResolve | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [chaptersOpen, setChaptersOpen] = useState(false);

  const scenes = useMemo(() => flattenWalkthroughScenes(INDUSTRIAL_PLATFORM_WALKTHROUGH), []);
  const scene = scenes[sceneIndex] ?? null;

  useEffect(() => {
    if (!token || token === "placeholder") {
      setLoading(false);
      setError("Missing share token");
      return;
    }
    let cancelled = false;
    void apiGet<ShareResolve>(`/api/v1/public/walkthrough/share/${encodeURIComponent(token)}`)
      .then((row) => {
        if (!cancelled) setShare(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Unable to open share link");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!share?.unlocked) return;
    if (searchParams.get("chapters") === "1" && share.allowChapterNavigation) {
      setChaptersOpen(true);
    }
    if (searchParams.get("play") === "1" && share.allowInteractive) {
      setPlaying(true);
    }
  }, [share, searchParams]);

  useEffect(() => {
    if (!playing || !scene) return;
    const words = scene.narrationText.trim().split(/\s+/).filter(Boolean).length;
    const readingMs = Math.round((words / 155) * 60_000) + 800;
    const holdMs = Math.min(scene.durationMs, Math.max(2_800, readingMs));
    const timer = window.setTimeout(() => {
      setSceneIndex((idx) => {
        if (idx >= scenes.length - 1) {
          setPlaying(false);
          return idx;
        }
        return idx + 1;
      });
    }, holdMs);
    return () => window.clearTimeout(timer);
  }, [playing, scene, scenes.length]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const unlocked = await apiSend<ShareResolve>(
        `/api/v1/public/walkthrough/share/${encodeURIComponent(token)}/unlock`,
        "POST",
        { pin },
      );
      setShare(unlocked);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to unlock");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-muted m-4">Loading shared walkthrough…</p>;
  }

  if (error && !share) {
    return (
      <div className="container-xxl flex-grow-1 container-p-y">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!share) return null;

  if (share.requirePin && !share.unlocked) {
    return (
      <div className="container-xxl flex-grow-1 container-p-y">
        <div className="card mx-auto" style={{ maxWidth: 420 }}>
          <div className="card-body">
            <span className="badge bg-warning text-dark mb-2">DEMO ENVIRONMENT</span>
            <h5 className="mb-1">{share.walkthrough.name}</h5>
            <p className="text-muted small">Enter the PIN to continue.</p>
            {error ? <div className="alert alert-danger py-2">{error}</div> : null}
            <form onSubmit={onUnlock}>
              <input
                className="form-control mb-3"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                required
              />
              <button type="submit" className="btn btn-primary w-100" disabled={busy}>
                Unlock
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const progressPct = scenes.length > 0 ? Math.round(((sceneIndex + 1) / scenes.length) * 100) : 0;

  return (
    <div
      className="container-xxl flex-grow-1 container-p-y"
      data-walkthrough-id="public-share-viewer"
    >
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <span className="badge bg-warning text-dark mb-2">DEMO ENVIRONMENT</span>
          <h4 className="mb-1">{share.walkthrough.name}</h4>
          <p className="text-muted mb-0">{share.walkthrough.tagline}</p>
        </div>
        <div className="text-end">
          <div className="small text-muted">Runtime</div>
          <strong>{share.runtime.formatted}</strong>
        </div>
      </div>

      {error ? <div className="alert alert-warning">{error}</div> : null}

      <div className="card mb-3">
        <div className="card-body">
          <p className="mb-3">{share.walkthrough.description}</p>
          <div className="d-flex flex-wrap gap-2">
            {share.allowInteractive ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setSceneIndex(0);
                    setPlaying(true);
                  }}
                >
                  Start presentation
                </button>
                {playing ? (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setPlaying(false)}
                  >
                    Pause
                  </button>
                ) : sceneIndex > 0 ? (
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => setPlaying(true)}
                  >
                    Resume
                  </button>
                ) : null}
              </>
            ) : null}
            {share.allowChapterNavigation ? (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setChaptersOpen((v) => !v)}
              >
                {chaptersOpen ? "Hide chapters" : "Chapters"}
              </button>
            ) : null}
            {share.allowVideoDownload ? (
              <span className="align-self-center small text-muted">
                Video download is enabled for this share. Request the latest MP4 from the host
                tenant.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {(playing || sceneIndex > 0) && scene ? (
        <div className="card mb-3 border-primary">
          <div className="card-body">
            <div className="d-flex justify-content-between small text-muted mb-2">
              <span>
                {scene.name} ({sceneIndex + 1}/{scenes.length})
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="progress mb-3" style={{ height: 8 }}>
              <div className="progress-bar" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-muted small text-uppercase mb-1">{scene.module}</div>
            <h5 className="mb-2">{scene.name}</h5>
            <p className="mb-0" style={{ fontSize: "1.05rem", lineHeight: 1.55 }}>
              {scene.narrationText}
            </p>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={sceneIndex <= 0}
                onClick={() => setSceneIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={sceneIndex >= scenes.length - 1}
                onClick={() => setSceneIndex((i) => Math.min(scenes.length - 1, i + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chaptersOpen || (!playing && sceneIndex === 0) ? (
        <div className="card">
          <div className="card-header">
            <h6 className="mb-0">Chapters</h6>
          </div>
          <div className="list-group list-group-flush">
            {share.walkthrough.chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                disabled={!share.allowChapterNavigation && !share.allowInteractive}
                onClick={() => {
                  const first = INDUSTRIAL_PLATFORM_WALKTHROUGH.chapters.find(
                    (c) => c.id === chapter.id,
                  )?.scenes[0];
                  if (!first) return;
                  const idx = scenes.findIndex((s) => s.id === first.id);
                  if (idx >= 0) {
                    setSceneIndex(idx);
                    setPlaying(true);
                    setChaptersOpen(false);
                  }
                }}
              >
                <span>
                  {chapter.order}. {chapter.title}
                </span>
                <span className="text-muted small">
                  {formatWalkthroughRuntime(chapter.targetDurationMs)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
