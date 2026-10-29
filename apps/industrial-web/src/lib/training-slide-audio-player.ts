/**
 * HTMLAudioElement playback for training slide narration.
 * Prefer this over Web Audio — PowerPoint embeds (m4a/mp3/wav) decode more
 * reliably in &lt;audio&gt;, and Play-button clicks carry a user gesture for play().
 */

export type SlideAudioPlayHandle = {
  stop: () => void;
  pause: () => void;
  resume: () => Promise<void>;
  get playing(): boolean;
};

const AUDIO_KEY = "__forgeTrainingHtmlAudio";

function getSharedAudioElement(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const w = window as unknown as Record<string, HTMLAudioElement | undefined>;
  if (!w[AUDIO_KEY]) {
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);
    w[AUDIO_KEY] = audio;
  }
  return w[AUDIO_KEY] ?? null;
}

/** Unlock browser media autoplay during a user gesture (click/tap). */
export function unlockTrainingAudioPlayback(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const key = "__forgeTrainingAudioCtx";
      const w = window as unknown as Record<string, AudioContext | undefined>;
      const ctx = w[key] ?? new AudioCtx();
      w[key] = ctx;
      void ctx.resume();
    }
  } catch {
    // ignore
  }
  // Use a throwaway element — never touch the shared player (avoids wiping narration src).
  try {
    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    );
    silent.volume = 0.01;
    void silent.play().then(() => {
      silent.pause();
      silent.removeAttribute("src");
    });
  } catch {
    // ignore
  }
}

/**
 * Play a blob object URL with HTMLAudioElement (best path for Play button).
 */
export async function playTrainingObjectUrl(
  objectUrl: string,
  options: { muted?: boolean; onEnded?: () => void } = {},
): Promise<SlideAudioPlayHandle> {
  unlockTrainingAudioPlayback();
  const audio = getSharedAudioElement();
  if (!audio) {
    throw new Error("Audio element is not available");
  }

  audio.onended = null;
  audio.onerror = null;
  audio.pause();

  if (audio.src !== objectUrl) {
    audio.src = objectUrl;
    audio.load();
  }
  audio.muted = Boolean(options.muted);
  audio.volume = 1;

  await new Promise<void>((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(audio.error?.message || "Audio failed to load"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, 4000);
    const cleanup = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("loadeddata", onReady);
      audio.removeEventListener("error", onError);
    };
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("loadeddata", onReady);
    audio.addEventListener("error", onError);
  });

  try {
    await audio.play();
  } catch (error) {
    throw error instanceof Error ? error : new Error("Audio play blocked");
  }

  audio.onended = () => {
    options.onEnded?.();
  };

  return {
    get playing() {
      return !audio.paused && !audio.ended;
    },
    stop: () => {
      audio.onended = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
    pause: () => {
      audio.pause();
    },
    resume: async () => {
      unlockTrainingAudioPlayback();
      audio.muted = Boolean(options.muted);
      await audio.play();
    },
  };
}

export function setTrainingAudioMuted(muted: boolean): void {
  const audio = getSharedAudioElement();
  if (!audio) return;
  audio.muted = muted;
}

export function stopTrainingAudio(): void {
  const audio = getSharedAudioElement();
  if (!audio) return;
  audio.onended = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

export function revokeTrainingAudioBuffer(_objectUrl: string): void {
  // HTML audio has no decode cache to clear; kept for API compatibility.
}
