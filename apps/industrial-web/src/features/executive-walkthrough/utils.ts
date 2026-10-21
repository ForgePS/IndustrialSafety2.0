import {
  EXECUTIVE_WALKTHROUGH_STEPS,
  EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS,
  estimateWalkthroughRuntimeMs,
  type WalkthroughStep,
} from "@forge/contracts";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function walkthroughContentFingerprint(input: {
  voiceId: string;
  narrationSpeed: number;
  closingText?: string | null;
  steps?: readonly Pick<WalkthroughStep, "id" | "narrationText" | "durationMs" | "route">[];
}): string {
  const steps = input.steps ?? EXECUTIVE_WALKTHROUGH_STEPS;
  return JSON.stringify({
    voiceId: input.voiceId,
    narrationSpeed: input.narrationSpeed,
    closingText: input.closingText ?? "",
    steps: steps.map((s) => ({
      id: s.id,
      narrationText: s.narrationText,
      durationMs: s.durationMs,
      route: s.route,
    })),
  });
}

export async function computeContentVersion(input: {
  voiceId: string;
  narrationSpeed: number;
  closingText?: string | null;
}): Promise<string> {
  return sha256Hex(walkthroughContentFingerprint(input));
}

export function formatWalkthroughClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function projectedRuntimeWarning(
  projectedRuntimeMs: number,
): string | null {
  if (projectedRuntimeMs <= EXECUTIVE_WALKTHROUGH_WARN_RUNTIME_MS) return null;
  return `Projected runtime ${formatWalkthroughClock(projectedRuntimeMs)} exceeds 9:30. Shorten narration or disable scenes before export.`;
}

export function defaultProjectedRuntimeMs(): number {
  return estimateWalkthroughRuntimeMs();
}

export function walkthroughSelector(id: string): string {
  return `[data-walkthrough-id="${id}"], [data-walkthrough="${id}"]`;
}

export function findWalkthroughTarget(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    (document.querySelector(`[data-walkthrough-id="${id}"]`) as HTMLElement | null) ??
    (document.querySelector(`[data-walkthrough="${id}"]`) as HTMLElement | null)
  );
}

/** Brief pause after navigation so the module UI can paint before narration. */
export const WALKTHROUGH_SCENE_SETTLE_MIN_MS = 120;
export const WALKTHROUGH_SCENE_SETTLE_TIMEOUT_MS = 900;

/**
 * Wait until the step target is visible (or timeout), with a short minimum settle.
 * Returns elapsed settle time in ms. Does not burn the full timeout when the
 * target never appears — proceeds after a short miss window so demos stay tight.
 */
export async function waitForWalkthroughSceneReady(input: {
  targetSelector?: string;
  minMs?: number;
  timeoutMs?: number;
}): Promise<number> {
  if (typeof window === "undefined") return 0;
  const minMs = input.minMs ?? WALKTHROUGH_SCENE_SETTLE_MIN_MS;
  const timeoutMs = input.timeoutMs ?? WALKTHROUGH_SCENE_SETTLE_TIMEOUT_MS;
  const started = Date.now();

  if (input.targetSelector && findWalkthroughTarget(input.targetSelector)) {
    if (minMs > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, minMs);
      });
    }
    return Date.now() - started;
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.min(80, minMs));
  });

  if (input.targetSelector) {
    const missDeadline = started + Math.min(timeoutMs, 500);
    const hardDeadline = started + timeoutMs;
    while (Date.now() < hardDeadline) {
      if (findWalkthroughTarget(input.targetSelector)) break;
      // Target never mounted (module gated / missing attr) — stop waiting early.
      if (Date.now() >= missDeadline) break;
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 40);
      });
    }
  }

  const elapsed = Date.now() - started;
  if (elapsed < minMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, minMs - elapsed);
    });
  }
  return Date.now() - started;
}

export function sanitizeExportFilename(name: string): string {
  return name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
}
