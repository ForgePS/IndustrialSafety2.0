"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { MessagingWorkspace } from "@/components/messaging-workspace";
import { useMessagingPopout } from "@/components/messaging-popout-context";
import { unlockNotificationAudio } from "@/lib/notification-sound";

const DEFAULT_SIZE = { width: 720, height: 560 };
const MIN_SIZE = { width: 360, height: 400 };

type ResizeEdge = "n" | "w" | "nw";

function clampSize(width: number, height: number): { width: number; height: number } {
  const maxWidth = Math.max(MIN_SIZE.width, Math.min(960, window.innerWidth - 24));
  const maxHeight = Math.max(MIN_SIZE.height, Math.min(720, window.innerHeight - 96));
  return {
    width: Math.min(maxWidth, Math.max(MIN_SIZE.width, Math.round(width))),
    height: Math.min(maxHeight, Math.max(MIN_SIZE.height, Math.round(height))),
  };
}

function popoutStyle(minimized: boolean, size: { width: number; height: number }): CSSProperties {
  // Only pin geometry inline — colors come from CSS so dark theme is respected.
  if (minimized) {
    return {
      position: "fixed",
      top: "auto",
      left: "auto",
      right: 16,
      bottom: 16,
      zIndex: 1085,
      width: "auto",
      height: "auto",
      maxWidth: "min(20rem, calc(100vw - 1.5rem))",
    };
  }
  return {
    position: "fixed",
    top: "auto",
    left: "auto",
    right: 16,
    bottom: 16,
    zIndex: 1085,
    width: size.width,
    height: size.height,
    maxWidth: "calc(100vw - 1.5rem)",
    maxHeight: "calc(100dvh - 5.5rem)",
  };
}

/**
 * Compact Messages dock in the bottom-right corner.
 * Portaled to document.body with inline fixed styles so it cannot break the shell layout.
 */
export function MessagingPopout() {
  const { open, minimized, threadId, closePopout, minimizePopout, restorePopout } =
    useMessagingPopout();
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const dragRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    setSize((prev) => clampSize(prev.width, prev.height));
  }, []);

  useEffect(() => {
    function onResize() {
      setSize((prev) => clampSize(prev.width, prev.height));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open || minimized) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePopout();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, minimized, closePopout]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    let nextWidth = drag.startWidth;
    let nextHeight = drag.startHeight;
    if (drag.edge === "w" || drag.edge === "nw") {
      nextWidth = drag.startWidth - deltaX;
    }
    if (drag.edge === "n" || drag.edge === "nw") {
      nextHeight = drag.startHeight - deltaY;
    }
    setSize(clampSize(nextWidth, nextHeight));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (edge: ResizeEdge) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (minimized) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: size.width,
        startHeight: size.height,
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor =
        edge === "nw" ? "nwse-resize" : edge === "n" ? "ns-resize" : "ew-resize";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, minimized, onPointerMove, size.height, size.width],
  );

  useEffect(() => () => endDrag(), [endDrag]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`messaging-popout${minimized ? " messaging-popout--minimized" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="messaging-popout-title"
      style={popoutStyle(minimized, size)}
    >
      {!minimized ? (
        <>
          <div
            className="messaging-popout__resize messaging-popout__resize--n"
            onPointerDown={startDrag("n")}
            aria-hidden="true"
          />
          <div
            className="messaging-popout__resize messaging-popout__resize--w"
            onPointerDown={startDrag("w")}
            aria-hidden="true"
          />
          <div
            className="messaging-popout__resize messaging-popout__resize--nw"
            onPointerDown={startDrag("nw")}
            title="Drag to resize"
            aria-hidden="true"
          />
        </>
      ) : null}

      <div className="messaging-popout__header">
        <button
          type="button"
          className="messaging-popout__title-btn"
          onClick={() => {
            unlockNotificationAudio();
            if (minimized) restorePopout();
          }}
          title={minimized ? "Restore Messages" : undefined}
        >
          <i className="bx bx-message-rounded-dots flex-shrink-0" aria-hidden="true" />
          <h2 id="messaging-popout-title" className="h6 mb-0 text-truncate">
            Messages
          </h2>
        </button>
        <div className="d-flex align-items-center gap-1 flex-shrink-0">
          {!minimized ? (
            <Link
              href="/modules/messaging/"
              className="btn btn-sm btn-outline-secondary"
              title="Open full Messages page"
              onClick={() => {
                unlockNotificationAudio();
                closePopout();
              }}
            >
              Expand
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-icon btn-outline-secondary"
            aria-label={minimized ? "Restore Messages" : "Minimize Messages"}
            title={minimized ? "Restore" : "Minimize"}
            onClick={() => {
              unlockNotificationAudio();
              if (minimized) restorePopout();
              else minimizePopout();
            }}
          >
            <i className={`bx ${minimized ? "bx-square" : "bx-minus"} bx-sm`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon btn-outline-secondary"
            aria-label="Close Messages"
            title="Close"
            onClick={() => {
              unlockNotificationAudio();
              closePopout();
            }}
          >
            <i className="bx bx-x bx-sm" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="messaging-popout__body" hidden={minimized}>
        <MessagingWorkspace
          moduleName="Messages"
          variant="popout"
          pollPaused={minimized}
          {...(threadId ? { initialThreadId: threadId } : {})}
        />
      </div>
    </div>,
    document.body,
  );
}
