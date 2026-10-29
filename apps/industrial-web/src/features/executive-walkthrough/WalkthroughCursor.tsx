"use client";

import { useEffect, useState } from "react";
import { findWalkthroughTarget } from "./utils";

type Props = {
  target: string | null;
  visible?: boolean;
};

type Point = { x: number; y: number };

/**
 * Forge presentation cursor — eased movement, click ripple, auto-hide when idle.
 * Does not use the OS cursor for recorded / guided presentations.
 */
export function WalkthroughCursor({ target, visible = true }: Props) {
  const [point, setPoint] = useState<Point | null>(null);
  const [clicking, setClicking] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!visible || !target) {
      setHidden(true);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let hideTimer = 0;

    const moveTo = (next: Point, from: Point | null, durationMs = 520) => {
      const start = from ?? next;
      const began = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - began) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        setPoint({
          x: start.x + (next.x - start.x) * eased,
          y: start.y + (next.y - start.y) * eased,
        });
        if (t < 1) raf = window.requestAnimationFrame(tick);
        else {
          setClicking(true);
          window.setTimeout(() => setClicking(false), 280);
        }
      };
      raf = window.requestAnimationFrame(tick);
    };

    const sync = () => {
      const el = findWalkthroughTarget(target);
      if (!el) {
        setHidden(true);
        return;
      }
      const rect = el.getBoundingClientRect();
      const next = {
        x: rect.left + Math.min(rect.width * 0.55, Math.max(18, rect.width - 12)),
        y: rect.top + Math.min(rect.height * 0.45, Math.max(18, rect.height - 12)),
      };
      setHidden(false);
      setPoint((prev) => {
        moveTo(next, prev);
        return prev ?? next;
      });
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setHidden(true), 2200);
    };

    sync();
    const interval = window.setInterval(sync, 900);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.clearTimeout(hideTimer);
    };
  }, [target, visible]);

  if (!visible || hidden || !point) return null;

  return (
    <div
      className={`forge-walkthrough-cursor${clicking ? " is-clicking" : ""}`}
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
      aria-hidden="true"
    >
      <span className="forge-walkthrough-cursor-dot" />
      <span className="forge-walkthrough-cursor-ripple" />
    </div>
  );
}
