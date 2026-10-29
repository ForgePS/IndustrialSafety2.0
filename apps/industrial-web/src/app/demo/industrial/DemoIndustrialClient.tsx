"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  INDUSTRIAL_PLATFORM_WALKTHROUGH,
  WALKTHROUGH_VOICE_PROFILES,
  formatWalkthroughRuntime,
  flattenWalkthroughScenes,
} from "@forge/contracts";
import { useAuth } from "@forge/web-kit";
import { useWalkthroughController } from "@/features/executive-walkthrough/WalkthroughController";
import { DEFAULT_WALKTHROUGH_VOICE } from "@/features/executive-walkthrough/voices";
import { walkthroughStudioApi } from "@/features/walkthrough-studio/api";

export default function DemoIndustrialPage() {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const walkthrough = useWalkthroughController();
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [voiceProfileId, setVoiceProfileId] = useState(
    INDUSTRIAL_PLATFORM_WALKTHROUGH.defaultVoiceProfileId,
  );
  const [exploreMode, setExploreMode] = useState(false);
  const chapters = INDUSTRIAL_PLATFORM_WALKTHROUGH.chapters;
  const scenes = useMemo(() => flattenWalkthroughScenes(), []);
  const activeVoice =
    WALKTHROUGH_VOICE_PROFILES.find((v) => v.id === voiceProfileId) ??
    WALKTHROUGH_VOICE_PROFILES.find(
      (v) => v.id === INDUSTRIAL_PLATFORM_WALKTHROUGH.defaultVoiceProfileId,
    ) ??
    WALKTHROUGH_VOICE_PROFILES[0]!;

  useEffect(() => {
    void walkthroughStudioApi.trackEvent({ eventType: "walkthrough_start" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void walkthroughStudioApi
      .list()
      .then((list) => {
        if (cancelled) return;
        const profileId = list.items[0]?.voice?.id;
        if (profileId && WALKTHROUGH_VOICE_PROFILES.some((v) => v.id === profileId)) {
          setVoiceProfileId(profileId);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const preview = searchParams.get("preview") === "1";
    const chaptersParam = searchParams.get("chapters") === "1";
    const share = searchParams.get("share");
    if (chaptersParam) setChaptersOpen(true);
    if (preview) {
      setPresentationMode(true);
      walkthrough.start({
        mode: "interactive",
        narrationEnabled: true,
        captions: false,
        voiceId: activeVoice.providerVoiceId || DEFAULT_WALKTHROUGH_VOICE,
      });
    }
    if (share) {
      void walkthroughStudioApi
        .trackEvent({ eventType: "share_open", payload: { share } })
        .catch(() => undefined);
    }
    // Query-driven entry on first mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!presentationMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (walkthrough.session?.playing) walkthrough.pause();
        else walkthrough.play();
      } else if (e.key === "ArrowRight") walkthrough.next();
      else if (e.key === "ArrowLeft") walkthrough.previous();
      else if (e.key === "Escape") setPresentationMode(false);
      else if (e.key.toLowerCase() === "c") walkthrough.toggleCaptions();
      else if (e.key.toLowerCase() === "m") walkthrough.toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentationMode, walkthrough]);

  function startWalkthrough(asPresentation = false) {
    setExploreMode(false);
    if (asPresentation) setPresentationMode(true);
    walkthrough.start({
      mode: "interactive",
      narrationEnabled: true,
      captions: false,
      voiceId: activeVoice.providerVoiceId || DEFAULT_WALKTHROUGH_VOICE,
    });
    void walkthroughStudioApi
      .trackEvent({ eventType: "walkthrough_start", payload: { voiceProfileId } })
      .catch(() => undefined);
  }

  const step = walkthrough.step;
  const stepIndex = walkthrough.stepIndex;
  const progressPct = scenes.length > 0 ? Math.round(((stepIndex + 1) / scenes.length) * 100) : 0;
  const stepTitle =
    step && "title" in step && typeof step.title === "string"
      ? step.title
      : step && "name" in step
        ? String(step.name)
        : "Scene";

  return (
    <div
      className={`demo-industrial-viewer ${presentationMode ? "presentation-mode" : ""}`}
      data-walkthrough-id="demo-industrial-viewer"
    >
      {!presentationMode ? (
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
          <div>
            <div className="text-muted small text-uppercase mb-1">Interactive walkthrough</div>
            <h4 className="mb-1">{INDUSTRIAL_PLATFORM_WALKTHROUGH.name}</h4>
            <p className="text-muted mb-0">{INDUSTRIAL_PLATFORM_WALKTHROUGH.tagline}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <Link className="btn btn-outline-secondary btn-sm" href="/admin/walkthrough-studio/">
              Open Studio
            </Link>
            {!walkthrough.session?.active ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => startWalkthrough()}
                >
                  Play walkthrough
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => startWalkthrough(true)}
                >
                  Presentation mode
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={`card mb-3 ${presentationMode ? "position-fixed bottom-0 start-50 translate-middle-x mb-3 shadow" : ""}`}
        style={presentationMode ? { zIndex: 1080, width: "min(920px, 94vw)" } : undefined}
      >
        <div className="card-body">
          {!presentationMode ? (
            <div className="row g-3 align-items-end mb-2">
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="demo-ind-voice">
                  Voice
                </label>
                <select
                  id="demo-ind-voice"
                  className="form-select"
                  value={voiceProfileId}
                  disabled={Boolean(walkthrough.session?.active)}
                  onChange={(e) => setVoiceProfileId(e.target.value)}
                >
                  {WALKTHROUGH_VOICE_PROFILES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <div className="d-flex flex-wrap gap-2">
            {walkthrough.session?.active ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => walkthrough.play()}
                >
                  Play
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.pause()}
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.previous()}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.next()}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.restart()}
                >
                  Restart
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.toggleMute()}
                >
                  {walkthrough.session.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => walkthrough.toggleCaptions()}
                >
                  Captions
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setChaptersOpen((v) => !v)}
                >
                  Chapters
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setPresentationMode((v) => !v)}
                >
                  {presentationMode ? "Exit presentation" : "Presentation"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => {
                    walkthrough.exit();
                    setPresentationMode(false);
                  }}
                >
                  Exit
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  setExploreMode(true);
                  void walkthroughStudioApi
                    .trackEvent({ eventType: "explore_forge" })
                    .catch(() => undefined);
                }}
              >
                Explore Forge
              </button>
            )}
          </div>

          {walkthrough.session?.active ? (
            <div className="mt-3">
              <div className="d-flex justify-content-between small text-muted mb-1">
                <span>
                  {stepTitle} ({stepIndex + 1}/{scenes.length})
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="progress" style={{ height: 8 }}>
                <div className="progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {chaptersOpen ? (
        <div className="card mb-3">
          <div className="card-header d-flex justify-content-between">
            <h6 className="mb-0">Chapters</h6>
            <button
              type="button"
              className="btn btn-sm btn-link"
              onClick={() => setChaptersOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="list-group list-group-flush">
            {chapters.map((chapter, idx) => (
              <button
                key={chapter.id}
                type="button"
                className="list-group-item list-group-item-action d-flex justify-content-between"
                onClick={() => {
                  const sceneIndex = scenes.findIndex((s) => s.id === chapter.scenes[0]?.id);
                  if (sceneIndex >= 0) walkthrough.goTo(sceneIndex);
                  setChaptersOpen(false);
                  void walkthroughStudioApi
                    .trackEvent({
                      eventType: "chapter_select",
                      chapterKey: chapter.id,
                    })
                    .catch(() => undefined);
                }}
              >
                <span>
                  {idx + 1}. {chapter.title}
                </span>
                <span className="text-muted small">
                  {formatWalkthroughRuntime(chapter.targetDurationMs)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {exploreMode && !walkthrough.session?.active ? (
        <div className="alert alert-info d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>
            Explore mode is active inside the demo tenant. Production records are not written.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => startWalkthrough()}
          >
            Return to Walkthrough
          </button>
        </div>
      ) : null}

      {!presentationMode ? (
        <div className="card">
          <div className="card-body">
            <h5 className="mb-2">{INDUSTRIAL_PLATFORM_WALKTHROUGH.tagline}</h5>
            <p className="mb-3">
              Signed in as {me?.userId ?? "demo viewer"}. Use Play to run the automated module tour
              with narration, or Explore Forge to navigate the demo tenant yourself.
            </p>
            <div className="row g-2">
              {chapters.slice(0, 8).map((chapter) => (
                <div className="col-6 col-md-3" key={chapter.id}>
                  <div className="border rounded p-2 h-100">
                    <div className="fw-medium small">{chapter.title}</div>
                    <div className="text-muted small">
                      {formatWalkthroughRuntime(chapter.targetDurationMs)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
