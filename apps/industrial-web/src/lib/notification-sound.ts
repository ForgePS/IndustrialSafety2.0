/**
 * Short in-app notification chime via Web Audio API (no asset file).
 * Browsers require a user gesture before audio can play; call unlock first.
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

export function unlockNotificationAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => {
      unlocked = true;
    });
  } else {
    unlocked = true;
  }
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gainValue: number,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/** Soft two-tone chime for new messages / unread notifications. */
export function playNotificationChime(): void {
  const ctx = getContext();
  if (!ctx) return;

  const run = () => {
    const now = ctx.currentTime;
    tone(ctx, 880, now, 0.12, 0.08);
    tone(ctx, 1174.7, now + 0.1, 0.18, 0.07);
    unlocked = true;
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {
      // Autoplay still blocked until a user gesture unlocks audio.
    });
    return;
  }

  try {
    run();
  } catch {
    // Ignore audio failures; visual unread badges remain the fallback.
  }
}

export function isNotificationAudioUnlocked(): boolean {
  return unlocked && Boolean(audioCtx) && audioCtx!.state === "running";
}
