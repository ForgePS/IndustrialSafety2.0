"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE } from "@forge/contracts";
import { executiveWalkthroughApi } from "./api";
import type { WalkthroughExport } from "./types";
import {
  DEFAULT_WALKTHROUGH_VOICE,
  WALKTHROUGH_VOICE_OPTIONS,
  type WalkthroughVoiceId,
} from "./voices";

type Props = {
  contentVersion: string;
  onClose: () => void;
  latestExport?: WalkthroughExport | null;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  preparing: "Preparing presentation",
  rendering: "Rendering walkthrough",
  encoding: "Encoding MP4",
  uploading: "Finalizing",
  completed: "Complete",
  failed: "Failed",
};

export function WalkthroughExportDialog({ contentVersion, onClose, latestExport }: Props) {
  const [title, setTitle] = useState(EXECUTIVE_WALKTHROUGH_DEFAULT_TITLE);
  const [resolution, setResolution] = useState<"1080p" | "720p">("1080p");
  const [includeNarration, setIncludeNarration] = useState(true);
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [includeIntro, setIncludeIntro] = useState(true);
  const [includeOutro, setIncludeOutro] = useState(true);
  const [voiceId, setVoiceId] = useState<WalkthroughVoiceId>(DEFAULT_WALKTHROUGH_VOICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<WalkthroughExport | null>(
    latestExport?.contentVersion === contentVersion ? latestExport : null,
  );

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = window.setInterval(() => {
      void executiveWalkthroughApi
        .getExport(job.id)
        .then(setJob)
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await executiveWalkthroughApi.updateSettings({ voiceId }).catch(() => undefined);
      await executiveWalkthroughApi.ensureNarration({ voiceId }).catch(() => undefined);
      const created = await executiveWalkthroughApi.createExport({
        videoTitle: title,
        resolution,
        includeNarration,
        burnCaptions,
        includeIntro,
        includeOutro,
      });
      setJob(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start MP4 export");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const result = await executiveWalkthroughApi.downloadExport(job.id);
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download MP4");
    } finally {
      setBusy(false);
    }
  }

  const matchingLatest =
    latestExport && latestExport.contentVersion === contentVersion && latestExport.status === "completed"
      ? latestExport
      : null;

  return (
    <div className="exec-walkthrough-modal" role="dialog" aria-modal="true" aria-label="Export MP4">
      <div className="exec-walkthrough-modal-card card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Download MP4</h5>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="card-body">
          {error ? <div className="alert alert-danger py-2">{error}</div> : null}

          {matchingLatest && !job ? (
            <div className="alert alert-success py-2">
              A current MP4 already exists for this presentation version.
              <div className="mt-2 d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setJob(matchingLatest);
                    void download();
                  }}
                >
                  Download Latest MP4
                </button>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void generate()}>
                  Generate New MP4
                </button>
              </div>
            </div>
          ) : null}

          {!job || job.status === "failed" ? (
            <div className="row g-3">
              {job?.status === "failed" ? (
                <div className="col-12">
                  <div className="alert alert-danger py-2 mb-0">
                    {job.errorMessage || "Export failed. You can retry."}
                  </div>
                </div>
              ) : null}
              <div className="col-12">
                <label className="form-label">Video title</label>
                <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Quality</label>
                <select
                  className="form-select"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as "1080p" | "720p")}
                >
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="ew-export-voice">
                  Narration voice
                </label>
                <select
                  id="ew-export-voice"
                  className="form-select"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value as WalkthroughVoiceId)}
                >
                  {WALKTHROUGH_VOICE_OPTIONS.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label} — {voice.hint}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 form-check">
                <input
                  id="ew-narration"
                  className="form-check-input"
                  type="checkbox"
                  checked={includeNarration}
                  onChange={(e) => setIncludeNarration(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="ew-narration">
                  Include narration
                </label>
              </div>
              <div className="col-12 form-check">
                <input
                  id="ew-captions"
                  className="form-check-input"
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="ew-captions">
                  Burn captions into video
                </label>
              </div>
              <div className="col-12 form-check">
                <input
                  id="ew-intro"
                  className="form-check-input"
                  type="checkbox"
                  checked={includeIntro}
                  onChange={(e) => setIncludeIntro(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="ew-intro">
                  Include standard Forge intro
                </label>
              </div>
              <div className="col-12 form-check">
                <input
                  id="ew-outro"
                  className="form-check-input"
                  type="checkbox"
                  checked={includeOutro}
                  onChange={(e) => setIncludeOutro(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="ew-outro">
                  Include standard Forge outro
                </label>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2">{STATUS_LABEL[job.status] ?? job.status}</p>
              <div className="progress mb-3" style={{ height: 10 }}>
                <div className="progress-bar" style={{ width: `${job.progress}%` }} />
              </div>
              {job.status === "completed" ? (
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void download()}>
                    Download MP4
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={async () => {
                      const result = await executiveWalkthroughApi.downloadExport(job.id);
                      await navigator.clipboard.writeText(result.downloadUrl);
                    }}
                  >
                    Copy Download Link
                  </button>
                  <button type="button" className="btn btn-outline-primary" onClick={() => void generate()}>
                    Generate Again
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <div className="card-footer d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Close
          </button>
          {!job || job.status === "failed" ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void generate()}>
              {busy ? "Starting…" : "Generate MP4"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
