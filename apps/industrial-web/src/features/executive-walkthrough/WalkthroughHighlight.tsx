"use client";

import { useEffect, useState } from "react";
import { findWalkthroughTarget } from "./utils";

type Props = {
  target: string | null;
  padding?: number;
  label?: string | null;
};

type Box = { top: number; left: number; width: number; height: number };

export function WalkthroughHighlight({ target, padding = 8, label = null }: Props) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!target) {
      setBox(null);
      return;
    }

    const measure = () => {
      const el = findWalkthroughTarget(target);
      if (!el) {
        setBox(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        setBox(null);
        return;
      }
      setBox({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    const el = findWalkthroughTarget(target);
    if (el && ro) ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const interval = window.setInterval(measure, 400);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.clearInterval(interval);
    };
  }, [target, padding]);

  if (!box) return null;

  return (
    <div
      className="exec-walkthrough-highlight"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
      }}
      aria-hidden="true"
    >
      {label ? <span className="exec-walkthrough-spotlight-label">{label}</span> : null}
    </div>
  );
}
