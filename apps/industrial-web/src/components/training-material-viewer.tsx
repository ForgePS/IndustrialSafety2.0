"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrainingMaterial } from "@/features/training/types";
import {
  buildOfficeEmbedUrl,
  canInlinePreview,
  canUseOfficeEmbed,
  fetchTrainingMaterialBlob,
  fetchTrainingMaterialViewUrl,
  isPptxMime,
  isPresentationMime,
  isTrainingVideoFile,
  officeEmbedBlockedForUserAgent,
  prefersStreamPreview,
  resolveTrainingVideoPlaybackMime,
  type TrainingMaterialViewUrl,
} from "@/features/training/materials";
import {
  extractPptxSlideAudio,
  revokePptxSlideAudio,
  type PptxSlideAudioTrack,
} from "@/lib/pptx-slide-audio";
import {
  playTrainingObjectUrl,
  setTrainingAudioMuted,
  stopTrainingAudio,
  unlockTrainingAudioPlayback,
  type SlideAudioPlayHandle,
} from "@/lib/training-slide-audio-player";

type Props = {
  material: TrainingMaterial;
  onClose: () => void;
  onTakeQuiz?: (material: TrainingMaterial) => void;
  onDelete?: (material: TrainingMaterial) => void;
  deleteBusy?: boolean;
  /** Override content fetch (public training portal uses session-scoped URLs). */
  fetchBlob?: (materialId: string) => Promise<Blob>;
  /** Presigned inline URL for Office Online embed (faithful slide master/layout rendering). */
  fetchViewUrl?: (materialId: string) => Promise<TrainingMaterialViewUrl>;
  /** Hide chrome when embedded in the public course player. */
  embedded?: boolean;
  /** Employee portal: open PowerPoint in a full-viewport overlay with controls. */
  immersive?: boolean;
};

/** pptx-preview embeds `<audio controls>` / `<video controls>` on slides; hide them (we play narration separately). */
function sanitizePptxEmbeddedMedia(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll("video, audio").forEach((node) => {
    const media = node as HTMLMediaElement;
    media.controls = false;
    media.removeAttribute("controls");
    media.setAttribute("playsinline", "true");
    media.muted = true;
    media.pause();
    media.style.pointerEvents = "none";
  });
}

function fitSlideViewport(
  slideWidth: number,
  slideHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / slideWidth, maxHeight / slideHeight);
  return {
    width: Math.max(320, Math.floor(slideWidth * scale)),
    height: Math.max(240, Math.floor(slideHeight * scale)),
  };
}

/** pptx-preview defaults to a black wrapper; keep slide chrome visible without shifting layout. */
function normalizePptxSlideChrome(host: HTMLElement | null) {
  if (!host) return;
  host.querySelectorAll(".pptx-preview-wrapper").forEach((node) => {
    const el = node as HTMLElement;
    el.style.setProperty("background", "#ffffff", "important");
    el.style.removeProperty("transform");
    el.style.overflow = "visible";
  });
  host.querySelectorAll(".pptx-preview-slide-wrapper").forEach((node) => {
    (node as HTMLElement).style.setProperty("overflow", "visible", "important");
  });
  host.querySelectorAll(".slide-master-wrapper, .slide-layout-wrapper, .slide-wrapper").forEach((node) => {
    (node as HTMLElement).style.setProperty("overflow", "visible", "important");
  });
}

type PptxViewer = {
  destroy: () => void;
  currentIndex: number;
  slideCount: number;
  renderSingleSlide: (slideIndex: number) => void;
  renderNextSlide: () => void;
  renderPreSlide: () => void;
};

/** Pause after narration ends before advancing to the next slide. */
const SLIDE_ADVANCE_DELAY_MS = 3000;

export function TrainingMaterialViewer({
  material,
  onClose,
  onTakeQuiz,
  onDelete,
  deleteBusy = false,
  fetchBlob,
  fetchViewUrl,
  embedded = false,
  immersive = false,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const immersiveRootRef = useRef<HTMLDivElement>(null);
  const pptxHostRef = useRef<HTMLDivElement>(null);
  const pptxViewerRef = useRef<PptxViewer | null>(null);
  const slideDimensionsRef = useRef({ width: 1280, height: 720 });
  const slideIndexRef = useRef(0);
  const audioBySlideRef = useRef<Map<number, PptxSlideAudioTrack[]>>(new Map());
  const playHandleRef = useRef<SlideAudioPlayHandle | null>(null);
  const playGenerationRef = useRef(0);
  const slideCountRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playSlideAudioRef = useRef<(index: number) => Promise<void>>(async () => {});
  const advanceAfterAudioRef = useRef<() => void>(() => {});
  const fetchBlobRef = useRef(fetchBlob);
  fetchBlobRef.current = fetchBlob;
  const fetchViewUrlRef = useRef(fetchViewUrl);
  fetchViewUrlRef.current = fetchViewUrl;
  const officeBlobPromiseRef = useRef<Promise<ArrayBuffer> | null>(null);
  const previewIsStreamRef = useRef(false);
  const previewObjectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pptxBuffer, setPptxBuffer] = useState<ArrayBuffer | null>(null);
  const [officeEmbedUrl, setOfficeEmbedUrl] = useState<string | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slideAudioReady, setSlideAudioReady] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioMessage, setAudioMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const isPresentation = isPresentationMime(material.mimeType, material.originalFilename);
  const isPptx = isPptxMime(material.mimeType, material.originalFilename);
  const isVideo = isTrainingVideoFile(material);
  const videoPlaybackType = resolveTrainingVideoPlaybackMime(material);
  const useImmersivePptx = immersive && isPresentation && isPptx;
  const useOfficeViewer = Boolean(useImmersivePptx && fetchViewUrl);
  const [immersiveOpen, setImmersiveOpen] = useState(useImmersivePptx);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (useImmersivePptx) setImmersiveOpen(true);
  }, [material.id, useImmersivePptx]);

  useEffect(() => {
    if (!useImmersivePptx || !immersiveOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [useImmersivePptx, immersiveOpen]);

  useEffect(() => {
    function onFullscreenChange() {
      setBrowserFullscreen(document.fullscreenElement === immersiveRootRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const currentTracks = audioBySlideRef.current.get(slideIndex) ?? [];
  const hasSlideAudio = currentTracks.some((track) => Boolean(track.objectUrl));
  const hasUnsupportedAudio =
    currentTracks.length > 0 && currentTracks.every((track) => !track.objectUrl);

  async function fallbackStreamPreviewToBlob() {
    if (!previewIsStreamRef.current) return;
    // iPad/iPhone Safari: downloading a full training video into a blob often
    // hangs forever and still cannot play an incompatible file. Prefer a clear error.
    // Android tablets can often recover via blob when the stream URL fails mid-play.
    const isVideoFallback = isTrainingVideoFile(material);
    const looksLikeIos =
      typeof navigator !== "undefined" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    if (isVideoFallback && looksLikeIos) {
      previewIsStreamRef.current = false;
      setError(
        "This video could not play on this device. Ask an admin to use Optimize for tablets on the material, then try again.",
      );
      setLoading(false);
      return;
    }
    if (isVideoFallback && material.byteSize > 40_000_000) {
      // Very large files: blob download on cellular tablets is unreliable.
      previewIsStreamRef.current = false;
      setError(
        "This video could not play on this device. Ask an admin to use Optimize for tablets on the material (especially long forklift videos), then try again.",
      );
      setLoading(false);
      return;
    }
    previewIsStreamRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const blob = await (fetchBlobRef.current ?? fetchTrainingMaterialBlob)(material.id);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      const objectUrl = URL.createObjectURL(blob);
      previewObjectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load material");
    } finally {
      setLoading(false);
    }
  }

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current != null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const stopSlideAudio = useCallback(() => {
    clearAdvanceTimer();
    playGenerationRef.current += 1;
    playHandleRef.current?.stop();
    playHandleRef.current = null;
    stopTrainingAudio();
    setAudioPlaying(false);
  }, [clearAdvanceTimer]);

  const playSlideAudio = useCallback(
    async (index: number) => {
      clearAdvanceTimer();
      const tracks = audioBySlideRef.current.get(index) ?? [];
      const track = tracks.find((row) => row.objectUrl) ?? tracks[0];
      if (!track) {
        setAudioMessage(null);
        return;
      }

      if (!track.objectUrl) {
        setAudioMessage(
          "This slide uses an audio format browsers cannot play (often WMA). Re-export the PowerPoint with MP3 or M4A narration.",
        );
        setAudioPlaying(false);
        return;
      }

      unlockTrainingAudioPlayback();
      const generation = ++playGenerationRef.current;
      playHandleRef.current?.stop();
      playHandleRef.current = null;

      try {
        const handle = await playTrainingObjectUrl(track.objectUrl, {
          muted: audioMuted,
          onEnded: () => {
            if (generation !== playGenerationRef.current) return;
            setAudioPlaying(false);
            clearAdvanceTimer();
            advanceTimerRef.current = setTimeout(() => {
              advanceTimerRef.current = null;
              if (generation !== playGenerationRef.current) return;
              advanceAfterAudioRef.current();
            }, SLIDE_ADVANCE_DELAY_MS);
          },
        });
        if (generation !== playGenerationRef.current) {
          handle.stop();
          return;
        }
        playHandleRef.current = handle;
        setAudioPlaying(true);
        setAudioMessage(null);
      } catch (error) {
        if (generation !== playGenerationRef.current) return;
        setAudioPlaying(false);
        const detail = error instanceof Error ? error.message : "Playback failed";
        setAudioMessage(
          /notallowed|interact|gesture|blocked/i.test(detail)
            ? "Click Play sound to start narration."
            : `Could not play audio (${detail}).`,
        );
      }
    },
    [audioMuted, clearAdvanceTimer],
  );

  playSlideAudioRef.current = playSlideAudio;
  advanceAfterAudioRef.current = () => {
    const viewer = pptxViewerRef.current;
    if (!viewer) return;
    const current = slideIndexRef.current;
    const total = slideCountRef.current;
    if (total <= 0 || current >= total - 1) return;

    unlockTrainingAudioPlayback();
    viewer.renderNextSlide();
    sanitizePptxEmbeddedMedia(pptxHostRef.current);
    normalizePptxSlideChrome(pptxHostRef.current);
    const nextIndex = viewer.currentIndex ?? current + 1;
    slideIndexRef.current = nextIndex;
    setSlideIndex(nextIndex);
    void playSlideAudioRef.current(nextIndex);
  };

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => {
      const rect = shell.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setHostSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        return;
      }
      if (useImmersivePptx && immersiveOpen && typeof window !== "undefined") {
        setHostSize({
          width: Math.floor(window.innerWidth),
          height: Math.floor(Math.max(320, window.innerHeight - 220)),
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [immersiveOpen, useImmersivePptx, mounted]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function loadPptxSlideAudio(buffer: ArrayBuffer) {
      audioBySlideRef.current = new Map();
      setSlideAudioReady(false);
      try {
        const tracks = await extractPptxSlideAudio(buffer.slice(0));
        if (cancelled) return;
        audioBySlideRef.current = tracks;
        setSlideAudioReady(tracks.size > 0);
      } catch {
        if (!cancelled) setAudioMessage("Could not load presentation audio.");
      }
    }

    async function load() {
      setLoading(true);
      setError(null);
      setPreviewUrl(null);
      previewIsStreamRef.current = false;
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPptxBuffer(null);
      setOfficeEmbedUrl(null);
      setSlideAudioReady(false);
      setAudioMessage(null);
      stopSlideAudio();
      revokePptxSlideAudio(audioBySlideRef.current);
      audioBySlideRef.current = new Map();
      pptxViewerRef.current?.destroy();
      pptxViewerRef.current = null;
      slideIndexRef.current = 0;
      setSlideIndex(0);
      slideCountRef.current = 0;
      setSlideCount(0);

      try {
        const blobFetcher = fetchBlobRef.current ?? fetchTrainingMaterialBlob;
        const viewUrlFetcher = fetchViewUrlRef.current ?? fetchTrainingMaterialViewUrl;

        if (isPresentation && isPptx) {
          const blockOfficeEmbed = officeEmbedBlockedForUserAgent(navigator.userAgent);
          if (useOfficeViewer && fetchViewUrlRef.current && !blockOfficeEmbed) {
            let officeUrl: string | null = null;
            try {
              const viewMeta = await fetchViewUrlRef.current(material.id);
              if (canUseOfficeEmbed(viewMeta.byteSize)) {
                officeUrl = buildOfficeEmbedUrl(viewMeta.viewUrl);
              }
            } catch {
              officeUrl = null;
            }

            const blobPromise = blobFetcher(material.id);
            if (officeUrl) {
              if (cancelled) return;
              officeBlobPromiseRef.current = blobPromise.then(async (blob) => blob.arrayBuffer());
              setOfficeEmbedUrl(officeUrl);
              void officeBlobPromiseRef.current
                .then(async (buffer) => {
                  if (cancelled) return;
                  await loadPptxSlideAudio(buffer);
                })
                .catch(() => {
                  if (!cancelled) setAudioMessage("Could not load presentation audio.");
                });
              return;
            }
          }

          const blob = await blobFetcher(material.id);
          if (cancelled) return;

          const buffer = await blob.arrayBuffer();
          if (cancelled) return;
          setPptxBuffer(buffer);
          void loadPptxSlideAudio(buffer);
          return;
        }

        // Video / PDF / image: stream via URL so playback starts without waiting for a full download.
        if (prefersStreamPreview(material.mimeType, material.originalFilename)) {
          try {
            const viewMeta = await viewUrlFetcher(material.id);
            if (cancelled) return;
            if (viewMeta.viewUrl) {
              previewIsStreamRef.current = true;
              setPreviewUrl(viewMeta.viewUrl);
              setLoading(false);
              return;
            }
          } catch {
            // Fall through to blob download.
          }
        }

        const blob = await blobFetcher(material.id);
        if (cancelled) return;

        if (canInlinePreview(material.mimeType, material.originalFilename)) {
          objectUrl = URL.createObjectURL(blob);
          previewIsStreamRef.current = false;
          previewObjectUrlRef.current = objectUrl;
          setPreviewUrl(objectUrl);
          setLoading(false);
          return;
        }
        if (isPresentation) {
          setError("Legacy .ppt files must be saved as .pptx for in-browser viewing.");
        } else {
          setError("This file type is not supported for in-app viewing.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load material");
        }
      } finally {
        if (!cancelled && !(isPresentation && isPptx)) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      pptxViewerRef.current?.destroy();
      pptxViewerRef.current = null;
      stopSlideAudio();
      revokePptxSlideAudio(audioBySlideRef.current);
      audioBySlideRef.current = new Map();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, [material.id, material.mimeType, material.originalFilename, isPresentation, isPptx, stopSlideAudio, useOfficeViewer]);

  useEffect(() => {
    if (!officeEmbedUrl) return;
    let cancelled = false;

    async function fallbackToPptxPreview(reason: string) {
      const bufferPromise = officeBlobPromiseRef.current;
      if (cancelled || !bufferPromise) return;
      try {
        const buffer = await bufferPromise;
        if (cancelled) return;
        setOfficeEmbedUrl(null);
        setPptxBuffer(buffer);
        setLoading(true);
        setAudioMessage(reason);
      } catch {
        if (!cancelled) {
          setOfficeEmbedUrl(null);
          setError("Could not open presentation.");
          setLoading(false);
        }
      }
    }

    const timer = window.setTimeout(() => {
      if (!cancelled) {
        void fallbackToPptxPreview(
          "Online PowerPoint viewer unavailable. Showing simplified preview (some template graphics may be missing).",
        );
      }
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [officeEmbedUrl]);

  useEffect(() => {
    if (!pptxBuffer || officeEmbedUrl || !pptxHostRef.current || hostSize.width < 100 || hostSize.height < 100) {
      return;
    }

    let cancelled = false;
    const host = pptxHostRef.current;
    const startIndex = slideIndexRef.current;

    async function mountPptx() {
      try {
        const { init } = await import("pptx-preview");
        if (cancelled || !pptxHostRef.current) return;

        pptxViewerRef.current?.destroy();
        host.innerHTML = "";

        const probe = init(host, { width: 1280, height: 720, mode: "slide" });
        const pptx = await probe.load(pptxBuffer!);
        const slideW = pptx.width || 1280;
        const slideH = pptx.height || 720;
        slideDimensionsRef.current = { width: slideW, height: slideH };
        probe.destroy();
        host.innerHTML = "";

        const fitted = fitSlideViewport(slideW, slideH, hostSize.width, hostSize.height);
        const viewer = init(host, {
          width: fitted.width,
          height: fitted.height,
          mode: "slide",
        });
        pptxViewerRef.current = viewer as PptxViewer;
        await viewer.load(pptxBuffer!);
        viewer.renderSingleSlide(startIndex);
        sanitizePptxEmbeddedMedia(host);
        normalizePptxSlideChrome(host);
        const active = viewer as PptxViewer;
        slideIndexRef.current = active.currentIndex ?? startIndex;
        setSlideIndex(slideIndexRef.current);
        slideCountRef.current = active.slideCount;
        setSlideCount(active.slideCount);
        void playSlideAudio(slideIndexRef.current);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render presentation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void mountPptx();
    return () => {
      cancelled = true;
      if (pptxViewerRef.current) {
        slideIndexRef.current = pptxViewerRef.current.currentIndex ?? slideIndexRef.current;
        pptxViewerRef.current.destroy();
        pptxViewerRef.current = null;
      }
    };
  }, [pptxBuffer, officeEmbedUrl, hostSize.width, hostSize.height, playSlideAudio]);

  const stepSlide = useCallback(
    (direction: "prev" | "next") => {
      const viewer = pptxViewerRef.current;
      if (!viewer) return;
      unlockTrainingAudioPlayback();
      stopSlideAudio();
      if (direction === "prev") viewer.renderPreSlide();
      else viewer.renderNextSlide();
      sanitizePptxEmbeddedMedia(pptxHostRef.current);
      normalizePptxSlideChrome(pptxHostRef.current);
      const nextIndex = viewer.currentIndex ?? slideIndexRef.current;
      slideIndexRef.current = nextIndex;
      setSlideIndex(nextIndex);
      void playSlideAudio(nextIndex);
    },
    [playSlideAudio, stopSlideAudio],
  );

  useEffect(() => {
    if (!isPresentation || !isPptx || officeEmbedUrl || loading || error) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepSlide("prev");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepSlide("next");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [error, isPresentation, isPptx, loading, officeEmbedUrl, stepSlide]);

  useEffect(() => {
    setTrainingAudioMuted(audioMuted);
  }, [audioMuted]);

  async function togglePlaySound() {
    // Must unlock + play from this click so the browser allows sound.
    unlockTrainingAudioPlayback();
    const tracks = audioBySlideRef.current.get(slideIndex) ?? [];
    const track = tracks.find((row) => row.objectUrl);
    if (!track?.objectUrl) {
      setAudioMessage(
        hasUnsupportedAudio
          ? "This slide uses an audio format browsers cannot play (often WMA)."
          : "No playable audio on this slide.",
      );
      return;
    }
    if (audioPlaying && playHandleRef.current) {
      playHandleRef.current.pause();
      setAudioPlaying(false);
      return;
    }
    // Always start fresh from the button — avoids stuck resume/decode state.
    playHandleRef.current?.stop();
    playHandleRef.current = null;
    await playSlideAudio(slideIndex);
  }

  async function toggleBrowserFullscreen() {
    const root = immersiveRootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      /* Some mobile browsers block fullscreen without a direct gesture. */
    }
  }

  function exitImmersive() {
    if (document.fullscreenElement === immersiveRootRef.current) {
      void document.exitFullscreen();
    }
    stopSlideAudio();
    setImmersiveOpen(false);
  }

  const shellClassName =
    useImmersivePptx && immersiveOpen
      ? officeEmbedUrl
        ? "training-pptx-shell training-pptx-shell--immersive training-pptx-shell--office d-flex align-items-stretch justify-content-center"
        : "training-pptx-shell training-pptx-shell--immersive d-flex align-items-center justify-content-center"
      : "training-pptx-shell d-flex align-items-center justify-content-center";

  const slideControls =
    !loading && !officeEmbedUrl && slideCount > 0 ? (
      <div
        className={`training-pptx-controls d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 border-top ${
          useImmersivePptx && immersiveOpen ? "training-pptx-controls--immersive" : embedded ? "" : "bg-body"
        }`}
      >
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={slideIndex <= 0}
          onClick={() => stepSlide("prev")}
          aria-label="Previous slide"
        >
          <i className="bx bx-chevron-left" aria-hidden="true" />
          Previous
        </button>
        <span className="text-muted small" aria-live="polite">
          Slide {slideIndex + 1} of {slideCount}
          {hasSlideAudio ? " · Sound available" : ""}
          {hasUnsupportedAudio ? " · Unsupported audio format" : ""}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          disabled={slideIndex >= slideCount - 1}
          onClick={() => stepSlide("next")}
          aria-label="Next slide"
        >
          Next
          <i className="bx bx-chevron-right" aria-hidden="true" />
        </button>
      </div>
    ) : null;

  const audioControls =
    !loading && slideAudioReady ? (
      <div
        className={`training-pptx-audio-controls d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-top ${
          useImmersivePptx && immersiveOpen ? "training-pptx-controls--immersive" : embedded ? "" : "bg-body"
        }`}
      >
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!hasSlideAudio}
          onClick={() => void togglePlaySound()}
        >
          <i className={`bx ${audioPlaying ? "bx-pause" : "bx-play"} me-1`} aria-hidden="true" />
          {audioPlaying ? "Pause sound" : "Play sound"}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => {
            unlockTrainingAudioPlayback();
            setAudioMuted((prev) => !prev);
          }}
        >
          <i className={`bx ${audioMuted ? "bx-volume-mute" : "bx-volume-full"} me-1`} aria-hidden="true" />
          {audioMuted ? "Unmute" : "Mute"}
        </button>
        <span className="text-muted small">
          {officeEmbedUrl
            ? "Use Play sound for narration. Advance slides with the presentation controls above."
            : hasUnsupportedAudio
              ? "Narration uses a format this browser cannot play. Re-save as MP3/M4A in PowerPoint."
              : hasSlideAudio
                ? "Audio autoplays with each slide and advances 3 seconds after narration ends."
                : "No audio on this slide."}
        </span>
        {audioMessage ? (
          <span className="text-warning small" role="status">
            {audioMessage}
          </span>
        ) : null}
      </div>
    ) : null;

  const pptxSlideShell = (
    <div ref={shellRef} className={shellClassName}>
      {officeEmbedUrl ? (
        <iframe
          src={officeEmbedUrl}
          title={material.title}
          className="training-pptx-office-embed"
          allowFullScreen
          style={{ colorScheme: "light" }}
          onLoad={() => setLoading(false)}
        />
      ) : (
        <div
          ref={pptxHostRef}
          className="training-pptx-viewer"
          style={{ visibility: loading ? "hidden" : "visible" }}
        />
      )}
    </div>
  );

  const pptxStage = (
    <>
      {pptxSlideShell}
      {slideControls}
      {audioControls}
    </>
  );

  const immersiveDeck = (
    <div className="training-pptx-immersive__deck">
      {pptxSlideShell}
      <div className="training-pptx-immersive__footer">
        {slideControls}
        {audioControls}
      </div>
    </div>
  );

  const immersiveOverlay =
    mounted && useImmersivePptx && immersiveOpen
      ? createPortal(
          <div
            ref={immersiveRootRef}
            className="training-pptx-immersive"
            role="dialog"
            aria-modal="true"
            aria-label={`${material.title} presentation`}
          >
            <div className="training-pptx-immersive__header d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="min-w-0">
                <div className="fw-semibold text-truncate">{material.title}</div>
                {!loading && !officeEmbedUrl && slideCount > 0 ? (
                  <div className="small text-muted">
                    Slide {slideIndex + 1} of {slideCount}
                  </div>
                ) : officeEmbedUrl ? (
                  <div className="small text-muted">PowerPoint viewer</div>
                ) : null}
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => void toggleBrowserFullscreen()}
                >
                  <i
                    className={`bx ${browserFullscreen ? "bx-exit-fullscreen" : "bx-fullscreen"} me-1`}
                    aria-hidden="true"
                  />
                  {browserFullscreen ? "Exit browser full screen" : "Browser full screen"}
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={exitImmersive}>
                  Exit presentation
                </button>
              </div>
            </div>
            <div className="training-pptx-immersive__body">
              {loading ? <div className="p-4 text-muted">Loading presentation…</div> : null}
              {error ? (
                <div className="alert alert-warning m-3 mb-0" role="alert">
                  {error}
                </div>
              ) : null}
              {!error ? immersiveDeck : null}
            </div>
            {!error && !loading && (officeEmbedUrl || slideCount > 1) ? (
              <div className="training-pptx-immersive__hint small text-muted px-3 py-2 border-top">
                {officeEmbedUrl
                  ? "Use the built-in presentation controls to move through slides."
                  : "Use Previous and Next, or the left and right arrow keys, to move through the deck."}
                {!officeEmbedUrl && slideAudioReady
                  ? " Slides with narration advance automatically 3 seconds after audio finishes."
                  : officeEmbedUrl && slideAudioReady
                    ? " Use Play sound below for narration."
                    : ""}
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  if (useImmersivePptx && !immersiveOpen) {
    return (
      <div className="mb-3">
        {loading ? <p className="text-muted small mb-2">Loading presentation…</p> : null}
        {error ? (
          <div className="alert alert-warning mb-2" role="alert">
            {error}
          </div>
        ) : null}
        {!error ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => setImmersiveOpen(true)}
          >
            <i className="bx bx-fullscreen me-1" aria-hidden="true" />
            Open presentation full screen
          </button>
        ) : null}
      </div>
    );
  }

  if (useImmersivePptx && immersiveOpen) {
    return immersiveOverlay;
  }

  return (
    <div className={embedded ? "mb-3" : "card border mb-4"}>
      <div className={embedded ? "mb-2" : "card-header d-flex flex-wrap justify-content-between align-items-center gap-2"}>
        <span className={embedded ? "fw-semibold d-block mb-2" : "fw-semibold text-truncate"}>
          {material.title}
        </span>
        {!embedded ? (
        <div className="d-flex flex-wrap gap-2">
          {onTakeQuiz ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => onTakeQuiz(material)}
            >
              Take quiz
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              disabled={deleteBusy}
              onClick={() => onDelete(material)}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        ) : null}
      </div>
      <div className={embedded ? "position-relative" : "card-body p-0 position-relative"}>
        {loading ? (
          <div className="p-4 text-muted">
            {isPresentation ? "Loading presentation…" : isVideo ? "Opening video…" : "Loading…"}
          </div>
        ) : null}
        {error ? (
          <div className="alert alert-warning m-3 mb-0" role="alert">
            {error}
          </div>
        ) : null}
        {isPresentation && isPptx ? pptxStage : null}
        {!isPresentation && previewUrl && isVideo ? (
          <video
            key={previewUrl}
            className="w-100"
            style={{ maxHeight: "min(56vh, 480px)", background: "#111" }}
            controls
            playsInline
            preload="metadata"
            // Prefer src on <video> so Android can sniff the container when MIME
            // metadata is wrong (e.g. QuickTime label on an MP4).
            src={previewUrl}
            ref={(el) => {
              if (!el) return;
              el.setAttribute("playsinline", "true");
              el.setAttribute("webkit-playsinline", "true");
            }}
            onError={() => void fallbackStreamPreviewToBlob()}
          >
            {/* Keep a typed source as a hint for browsers that use it. */}
            <source src={previewUrl} type={videoPlaybackType} />
          </video>
        ) : null}
        {!isPresentation && previewUrl && material.mimeType.startsWith("image/") ? (
          <img
            src={previewUrl}
            alt={material.title}
            className="img-fluid d-block mx-auto"
            style={{ maxHeight: "min(56vh, 480px)" }}
          />
        ) : null}
        {!isPresentation && previewUrl && !isVideo && !material.mimeType.startsWith("image/") ? (
          <iframe
            title={material.title}
            src={previewUrl}
            className="w-100 border-0"
            style={{ height: "min(56vh, 560px)" }}
          />
        ) : null}
      </div>
      {isPresentation && isPptx && !error && !loading && slideCount > 1 ? (
        <div className={embedded ? "text-muted small mt-2" : "card-footer text-muted small"}>
          Use Previous and Next, or the left and right arrow keys, to move through the deck.
          {slideAudioReady ? " Slides with narration advance automatically 3 seconds after audio finishes." : ""}
          {!embedded && onTakeQuiz ? " When you're finished reviewing, click Take quiz." : null}
        </div>
      ) : null}
    </div>
  );
}
