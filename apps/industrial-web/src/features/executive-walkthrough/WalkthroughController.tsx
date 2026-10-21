"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_SESSION_EVENT,
  type WalkthroughAction,
} from "@forge/contracts";
import type { WalkthroughPlaybackMode, WalkthroughNarrationAsset, WalkthroughSessionState } from "./types";
import { WALKTHROUGH_SESSION_KEY } from "./types";
import { findWalkthroughTarget, waitForWalkthroughSceneReady } from "./utils";
import { executiveWalkthroughApi } from "./api";
import { walkthroughStudioApi } from "@/features/walkthrough-studio/api";

type WalkthroughStep = (typeof EXECUTIVE_WALKTHROUGH_STEPS)[number];

function trackStudioEvent(
  eventType: string,
  extra: { chapterKey?: string; sceneKey?: string; payload?: Record<string, unknown> } = {},
) {
  void walkthroughStudioApi
    .trackEvent({
      eventType,
      ...(extra.chapterKey ? { chapterKey: extra.chapterKey } : {}),
      ...(extra.sceneKey ? { sceneKey: extra.sceneKey } : {}),
      ...(extra.payload ? { payload: extra.payload } : {}),
    })
    .catch(() => undefined);
}

type WalkthroughControllerValue = {
  session: WalkthroughSessionState | null;
  stepIndex: number;
  step: WalkthroughStep | null;
  stepCount: number;
  start: (opts?: {
    mode?: WalkthroughPlaybackMode;
    narrationEnabled?: boolean;
    captions?: boolean;
    contentVersion?: string;
    voiceId?: string;
  }) => void;
  exit: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  restart: () => void;
  toggleMute: () => void;
  toggleCaptions: () => void;
  setHighlight: (target: string | null) => void;
  setCard: (card: "opening" | "closing" | null) => void;
  isRenderMode: boolean;
  isReadOnly: boolean;
};

const WalkthroughContext = createContext<WalkthroughControllerValue | null>(null);

function loadSession(): WalkthroughSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WALKTHROUGH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalkthroughSessionState;
    if (!parsed.voiceId) parsed.voiceId = "Stephen";
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: WalkthroughSessionState | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    sessionStorage.removeItem(WALKTHROUGH_SESSION_KEY);
    document.documentElement.removeAttribute("data-walkthrough-mode");
    document.documentElement.removeAttribute("data-presentation-readonly");
  } else {
    sessionStorage.setItem(WALKTHROUGH_SESSION_KEY, JSON.stringify(session));
    document.documentElement.setAttribute("data-walkthrough-mode", session.mode);
    document.documentElement.setAttribute("data-presentation-readonly", "true");
  }
  window.dispatchEvent(new Event(EXECUTIVE_WALKTHROUGH_SESSION_EVENT));
}

const defaultSession = (opts?: {
  mode?: WalkthroughPlaybackMode;
  narrationEnabled?: boolean;
  captions?: boolean;
  contentVersion?: string;
  voiceId?: string;
}): WalkthroughSessionState => ({
  active: true,
  mode: opts?.mode ?? "interactive",
  stepIndex: 0,
  playing: true,
  muted: false,
  captions: opts?.captions ?? true,
  narrationEnabled: opts?.narrationEnabled ?? true,
  voiceId: opts?.voiceId?.trim() || "Stephen",
  startedAt: new Date().toISOString(),
  contentVersion: opts?.contentVersion ?? "local",
  highlightTarget: null,
  card: "opening",
});

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<WalkthroughSessionState | null>(null);
  const [stepsVersion, setStepsVersion] = useState(0);
  const stepsRef = useRef<readonly WalkthroughStep[]>(EXECUTIVE_WALKTHROUGH_STEPS);
  const timersRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationBySceneRef = useRef<Map<string, WalkthroughNarrationAsset>>(new Map());
  const advanceTimerRef = useRef<number | null>(null);
  const prefetchAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastSceneIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  // Load tenant scene overrides (edited narration / duration) onto playback steps.
  useEffect(() => {
    let cancelled = false;
    void executiveWalkthroughApi
      .getConfig()
      .then((cfg) => {
        if (cancelled || !Array.isArray(cfg.steps) || cfg.steps.length === 0) return;
        const byId = new Map(cfg.steps.map((s) => [s.id, s]));
        const merged = EXECUTIVE_WALKTHROUGH_STEPS.map((step) => {
          const api = byId.get(step.id);
          if (!api) return step;
          return {
            ...step,
            narrationText: api.narrationText?.trim() ? api.narrationText : step.narrationText,
            durationMs: api.durationMs > 0 ? api.durationMs : step.durationMs,
          };
        });
        stepsRef.current = merged;
        setStepsVersion((v) => v + 1);

        const map = new Map<string, WalkthroughNarrationAsset>();
        for (const apiStep of cfg.steps) {
          const asset = apiStep.narration;
          if (!asset?.downloadUrl) continue;
          map.set(apiStep.id, {
            sceneId: asset.sceneId,
            durationMs: asset.durationMs,
            downloadUrl: asset.downloadUrl,
            contentType: asset.contentType ?? "audio/mpeg",
          });
        }
        if (map.size > 0) narrationBySceneRef.current = map;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: WalkthroughSessionState | null) => {
    setSession(next);
    saveSession(next);
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const ensureNarrationMap = useCallback(async (voiceId?: string) => {
    const applyAssets = (
      assets: Array<{ sceneId: string; durationMs: number; downloadUrl: string; contentType?: string }>,
    ) => {
      const map = new Map<string, WalkthroughNarrationAsset>();
      for (const asset of assets) {
        if (!asset.downloadUrl) continue;
        map.set(asset.sceneId, {
          sceneId: asset.sceneId,
          durationMs: asset.durationMs,
          downloadUrl: asset.downloadUrl,
          contentType: asset.contentType ?? "audio/mpeg",
        });
      }
      if (map.size > 0) narrationBySceneRef.current = map;
      return map;
    };

    // Local MP4 capture injects Polly assets before start (no API required).
    const injected =
      typeof window !== "undefined"
        ? (
            window as Window & {
              __FORGE_WALKTHROUGH_NARRATION__?: Array<{
                sceneId: string;
                durationMs: number;
                downloadUrl: string;
                contentType?: string;
              }>;
            }
          ).__FORGE_WALKTHROUGH_NARRATION__
        : undefined;
    if (Array.isArray(injected) && injected.length > 0) {
      return applyAssets(injected);
    }

    try {
      const ensured = await executiveWalkthroughApi.ensureNarration(
        voiceId ? { voiceId } : {},
      );
      return applyAssets(ensured.assets);
    } catch {
      try {
        const config = await executiveWalkthroughApi.getConfig();
        return applyAssets(
          config.steps
            .map((s) => s.narration)
            .filter((n): n is NonNullable<typeof n> => Boolean(n?.downloadUrl)),
        );
      } catch {
        return narrationBySceneRef.current;
      }
    }
  }, []);

  const waitForSceneNarration = useCallback(
    async (sceneId: string, voiceId?: string, timeoutMs = 20_000) => {
      const existing = narrationBySceneRef.current.get(sceneId);
      if (existing?.downloadUrl) return existing;

      const ensurePromise = ensureNarrationMap(voiceId);
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const asset = narrationBySceneRef.current.get(sceneId);
        if (asset?.downloadUrl) return asset;
        await Promise.race([
          ensurePromise.catch(() => null),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 80);
          }),
        ]);
        const after = narrationBySceneRef.current.get(sceneId);
        if (after?.downloadUrl) return after;
      }
      await ensurePromise.catch(() => null);
      return narrationBySceneRef.current.get(sceneId) ?? null;
    },
    [ensureNarrationMap],
  );

  const prefetchStepNarration = useCallback(
    async (sceneId: string, voiceId?: string) => {
      if (!sceneId || prefetchAudioRef.current.has(sceneId)) return;
      const asset = await waitForSceneNarration(sceneId, voiceId, 20_000);
      if (!asset?.downloadUrl) return;
      try {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = asset.downloadUrl;
        prefetchAudioRef.current.set(sceneId, audio);
        void audio.load();
      } catch {
        // Prefetch is best-effort.
      }
    },
    [waitForSceneNarration],
  );

  const playStepNarration = useCallback(
    async (sceneId: string, muted: boolean, voiceId?: string): Promise<number | null> => {
      stopAudio();
      const asset = await waitForSceneNarration(sceneId, voiceId);
      if (!asset?.downloadUrl) return null;

      const prefetched = prefetchAudioRef.current.get(sceneId);
      prefetchAudioRef.current.delete(sceneId);
      const audio = prefetched ?? audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.muted = muted;
      audio.preload = "auto";
      if (!prefetched || audio.src !== asset.downloadUrl) {
        audio.src = asset.downloadUrl;
      }
      try {
        // Start as soon as enough data is buffered — do not wait for full canplaythrough.
        await new Promise<void>((resolve) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const cleanup = () => {
            window.clearTimeout(timer);
            audio.removeEventListener("canplay", onReady);
            audio.removeEventListener("error", onReady);
          };
          if (audio.readyState >= 2) {
            resolve();
            return;
          }
          const timer = window.setTimeout(onReady, 700);
          audio.addEventListener("canplay", onReady, { once: true });
          audio.addEventListener("error", onReady, { once: true });
          if (!prefetched) audio.load();
        });
        return Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : asset.durationMs;
      } catch {
        return asset.durationMs;
      }
    },
    [stopAudio, waitForSceneNarration],
  );

  const runActions = useCallback(
    async (actions: WalkthroughAction[] | undefined, playing: boolean) => {
      if (!actions?.length || !playing) return;
      clearTimers();
      let delay = 0;
      for (const action of actions) {
        const scheduledDelay = delay;
        const timer = window.setTimeout(() => {
          if (action.type === "navigate") {
            router.push(action.route);
          } else if (action.type === "highlight") {
            const el = findWalkthroughTarget(action.target);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }
            setSession((prev) => {
              if (!prev) return prev;
              const next = { ...prev, highlightTarget: action.target };
              saveSession(next);
              return next;
            });
            if (action.durationMs) {
              const clearHighlight = window.setTimeout(() => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, highlightTarget: null };
                  saveSession(next);
                  return next;
                });
              }, action.durationMs);
              timersRef.current.push(clearHighlight);
            }
          } else if (action.type === "scroll") {
            if (action.target) {
              findWalkthroughTarget(action.target)?.scrollIntoView({
                behavior: action.behavior ?? "smooth",
                block: "center",
              });
            } else if (typeof action.top === "number") {
              window.scrollTo({ top: action.top, behavior: action.behavior ?? "smooth" });
            }
          } else if (action.type === "card") {
            setSession((prev) => {
              if (!prev) return prev;
              const next = { ...prev, card: action.variant };
              saveSession(next);
              return next;
            });
            if (action.durationMs) {
              const clearCard = window.setTimeout(() => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, card: null };
                  saveSession(next);
                  return next;
                });
              }, action.durationMs);
              timersRef.current.push(clearCard);
            }
          } else if (
            action.type === "focus" ||
            action.type === "hover" ||
            action.type === "cursorMove" ||
            action.type === "callout"
          ) {
            const target =
              "target" in action && action.target ? action.target : null;
            if (target) {
              const el = findWalkthroughTarget(target);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
              }
              setSession((prev) => {
                if (!prev) return prev;
                const next = { ...prev, highlightTarget: target };
                saveSession(next);
                return next;
              });
              const duration =
                "durationMs" in action && typeof action.durationMs === "number"
                  ? action.durationMs
                  : 4_000;
              const clearHighlight = window.setTimeout(() => {
                setSession((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, highlightTarget: null };
                  saveSession(next);
                  return next;
                });
              }, duration);
              timersRef.current.push(clearHighlight);
            }
          } else if (action.type === "pause" || action.type === "wait") {
            // Timeline delay handled below.
          } else if (action.type === "click" || action.type === "selectTab" || action.type === "expand") {
            const el = findWalkthroughTarget(action.target);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              try {
                el.click();
              } catch {
                // Skip if element is not interactable; continue narration.
              }
            }
          } else if (action.type === "open-tab" || action.type === "open-panel") {
            const el = findWalkthroughTarget(action.target);
            el?.click();
          }
        }, scheduledDelay);
        timersRef.current.push(timer);
        // Advance the action timeline: waits/navigates use explicit delays;
        // highlights hold for their duration; other actions get a short beat.
        if (action.type === "wait" || action.type === "pause") delay += action.durationMs;
        else if (action.type === "navigate") delay += action.delayMs ?? 0;
        else if (
          action.type === "highlight" ||
          action.type === "focus" ||
          action.type === "hover" ||
          action.type === "callout"
        ) {
          // Overlap visual beats with narration instead of serializing long holds.
          delay += Math.min(450, action.durationMs ?? 400);
        } else if (action.type === "cursorMove") delay += action.durationMs ?? 400;
        else if (action.type === "card") delay += Math.min(500, action.durationMs ?? 400);
        else delay += 200;
      }
    },
    [clearTimers, router],
  );

  const advanceTo = useCallback(
    (index: number, playing = true) => {
      const steps = stepsRef.current;
      const clamped = Math.max(0, Math.min(steps.length - 1, index));
      const step = steps[clamped];
      if (!step) return;
      const prevSceneId = lastSceneIdRef.current;
      if (prevSceneId && prevSceneId !== step.id) {
        trackStudioEvent("chapter_exit", { chapterKey: prevSceneId, sceneKey: prevSceneId });
      }
      lastSceneIdRef.current = step.id;
      const highlightTarget = step.targetSelector ?? null;
      const card =
        step.id === "introduction" || step.id === "opening"
          ? "opening"
          : step.id === "closing"
            ? "closing"
            : null;
      const route = step.route;
      const actions = step.actions;
      setSession((prev) => {
        if (!prev) return prev;
        const next: WalkthroughSessionState = {
          ...prev,
          stepIndex: clamped,
          playing,
          highlightTarget,
          card,
        };
        saveSession(next);
        return next;
      });
      router.push(route);
      // Warm the next module route so section handoffs do not stall on navigation.
      const upcoming = steps[clamped + 1];
      if (upcoming?.route) {
        try {
          void router.prefetch(upcoming.route);
        } catch {
          // Prefetch is best-effort.
        }
      }
      void runActions(actions, playing);
    },
    [router, runActions],
  );

  const start = useCallback(
    (opts?: {
      mode?: WalkthroughPlaybackMode;
      narrationEnabled?: boolean;
      captions?: boolean;
      contentVersion?: string;
      voiceId?: string;
    }) => {
      clearTimers();
      stopAudio();
      narrationBySceneRef.current = new Map();
      lastSceneIdRef.current = null;
      const next = defaultSession(opts);
      persist(next);
      advanceTo(0, true);
      if (opts?.narrationEnabled !== false) {
        void ensureNarrationMap(next.voiceId);
      }
      if (opts?.mode === "render") {
        window.dispatchEvent(new CustomEvent("forge-walkthrough-ready"));
      }
    },
    [advanceTo, clearTimers, ensureNarrationMap, persist, stopAudio],
  );

  const exit = useCallback(() => {
    clearTimers();
    stopAudio();
    persist(null);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [clearTimers, persist, stopAudio]);

  const play = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, playing: true };
      saveSession(next);
      void runActions(stepsRef.current[prev.stepIndex]?.actions, true);
      return next;
    });
    const audio = audioRef.current;
    if (audio?.src) void audio.play().catch(() => undefined);
  }, [runActions]);

  const pause = useCallback(() => {
    clearTimers();
    audioRef.current?.pause();
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, playing: false };
      saveSession(next);
      return next;
    });
  }, [clearTimers]);

  const next = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.stepIndex + 1;
      if (nextIndex >= stepsRef.current.length) {
        if (prev.mode === "render") {
          document.documentElement.setAttribute("data-walkthrough-complete", "true");
          window.dispatchEvent(new CustomEvent("forge-walkthrough-complete"));
        }
        if (prev.mode !== "render") {
          trackStudioEvent("walkthrough_complete");
        }
        const done = { ...prev, playing: false, card: "closing" as const };
        saveSession(done);
        return done;
      }
      queueMicrotask(() => advanceTo(nextIndex, prev.playing));
      return prev;
    });
  }, [advanceTo]);

  const previous = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const prevIndex = Math.max(0, prev.stepIndex - 1);
      queueMicrotask(() => advanceTo(prevIndex, prev.playing));
      return prev;
    });
  }, [advanceTo]);

  const restart = useCallback(() => {
    trackStudioEvent("walkthrough_replay");
    advanceTo(0, true);
  }, [advanceTo]);

  const goTo = useCallback(
    (index: number) => {
      advanceTo(index, true);
    },
    [advanceTo],
  );

  const toggleMute = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, muted: !prev.muted };
      if (audioRef.current) audioRef.current.muted = next.muted;
      saveSession(next);
      return next;
    });
  }, []);

  const toggleCaptions = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, captions: !prev.captions };
      saveSession(next);
      return next;
    });
  }, []);

  const setHighlight = useCallback((target: string | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, highlightTarget: target };
      saveSession(next);
      return next;
    });
  }, []);

  const setCard = useCallback((card: "opening" | "closing" | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, card };
      saveSession(next);
      return next;
    });
  }, []);

  // Play narration for the active step and advance when audio (or fallback duration) ends.
  useEffect(() => {
    if (!session?.active || !session.playing) return;
    const steps = stepsRef.current;
    const step = steps[session.stepIndex];
    if (!step) return;

    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      if (session.stepIndex >= steps.length - 1) {
        if (session.mode === "render") {
          document.documentElement.setAttribute("data-walkthrough-complete", "true");
          window.dispatchEvent(new CustomEvent("forge-walkthrough-complete"));
        } else {
          trackStudioEvent("walkthrough_complete");
        }
        pause();
        setCard("closing");
        return;
      }
      next();
    };

    const scheduleFallback = (ms: number) => {
      if (advanceTimerRef.current != null) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(finish, Math.max(600, ms));
    };

    void (async () => {
      // Settle UI and resolve this scene's audio in parallel (don't serialize Polly wait).
      const settlePromise = waitForWalkthroughSceneReady({
        ...(step.targetSelector ? { targetSelector: step.targetSelector } : {}),
      });
      if (!session.narrationEnabled) {
        await settlePromise;
        if (cancelled) return;
        scheduleFallback(Math.min(step.durationMs, 8_000));
        return;
      }

      // Prefetch the next scene's narration while this one settles / buffers.
      const nextStep = steps[session.stepIndex + 1];
      if (nextStep) void prefetchStepNarration(nextStep.id, session.voiceId);

      const [, playedMs] = await Promise.all([
        settlePromise,
        playStepNarration(step.id, session.muted, session.voiceId),
      ]);
      if (cancelled) return;
      const audio = audioRef.current;
      if (audio?.src) {
        try {
          await audio.play();
        } catch {
          scheduleFallback(playedMs ?? Math.min(step.durationMs, 6_000));
          return;
        }
        if (cancelled) return;
        audio.onended = () => {
          if (advanceTimerRef.current != null) {
            window.clearTimeout(advanceTimerRef.current);
            advanceTimerRef.current = null;
          }
          finish();
        };
        audio.onerror = () => scheduleFallback(playedMs ?? Math.min(step.durationMs, 6_000));
        // Tight safety net if ended never fires.
        scheduleFallback((playedMs ?? step.durationMs) + 150);
        return;
      }
      // No audio yet — keep moving; don't sit on full scripted duration.
      scheduleFallback(playedMs ?? Math.min(step.durationMs, 4_500));
    })();

    return () => {
      cancelled = true;
      if (advanceTimerRef.current != null) {
        window.clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
      }
    };
  }, [
    session?.active,
    session?.playing,
    session?.stepIndex,
    session?.mode,
    session?.narrationEnabled,
    session?.muted,
    session?.voiceId,
    stepsVersion,
    next,
    pause,
    playStepNarration,
    prefetchStepNarration,
    setCard,
  ]);

  // Keep mute in sync without restarting the step.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = Boolean(session?.muted);
  }, [session?.muted]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!session?.active || session.mode === "render") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (session.playing) pause();
        else play();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        previous();
      } else if (e.key.toLowerCase() === "m") {
        toggleMute();
      } else if (e.key.toLowerCase() === "c") {
        toggleCaptions();
      } else if (e.key.toLowerCase() === "r") {
        restart();
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, play, pause, next, previous, toggleMute, toggleCaptions, restart, exit]);

  // Read-only mutation guard for presentation mode
  useEffect(() => {
    if (!session?.active) return;
    const block = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("[data-walkthrough-controls]")) return;
      const dangerous = el.closest(
        "button[type='submit'], button[data-action='save'], button[data-action='delete'], button[data-action='approve'], [data-mutating='true']",
      );
      if (dangerous) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", block, true);
    document.addEventListener("submit", block, true);
    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("submit", block, true);
    };
  }, [session?.active]);

  const value = useMemo<WalkthroughControllerValue>(
    () => ({
      session,
      stepIndex: session?.stepIndex ?? 0,
      step: session ? stepsRef.current[session.stepIndex] ?? null : null,
      stepCount: stepsRef.current.length,
      start,
      exit,
      play,
      pause,
      next,
      previous,
      goTo,
      restart,
      toggleMute,
      toggleCaptions,
      setHighlight,
      setCard,
      isRenderMode: session?.mode === "render",
      isReadOnly: Boolean(session?.active),
    }),
    [
      session,
      stepsVersion,
      start,
      exit,
      play,
      pause,
      next,
      previous,
      goTo,
      restart,
      toggleMute,
      toggleCaptions,
      setHighlight,
      setCard,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const api = {
      start: (opts?: Parameters<typeof start>[0]) => start(opts),
      next: () => next(),
      previous: () => previous(),
      exit: () => exit(),
      getStepIndex: () => session?.stepIndex ?? -1,
      isActive: () => Boolean(session?.active),
    };
    (
      window as Window & {
        __FORGE_WALKTHROUGH_API__?: typeof api;
      }
    ).__FORGE_WALKTHROUGH_API__ = api;
    return () => {
      delete (window as Window & { __FORGE_WALKTHROUGH_API__?: typeof api }).__FORGE_WALKTHROUGH_API__;
    };
  }, [start, next, previous, exit, session?.stepIndex, session?.active]);

  return <WalkthroughContext.Provider value={value}>{children}</WalkthroughContext.Provider>;
}

export function useWalkthroughController(): WalkthroughControllerValue {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) {
    throw new Error("useWalkthroughController must be used within WalkthroughProvider");
  }
  return ctx;
}

export function useOptionalWalkthroughController(): WalkthroughControllerValue | null {
  return useContext(WalkthroughContext);
}
