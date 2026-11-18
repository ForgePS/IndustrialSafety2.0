"use client";

import { useEffect, useState } from "react";
import { pendingOfflineCount } from "@/lib/offline";

/**
 * When a new service worker is waiting, offer reload.
 * Does not clear the offline mutation queue (localStorage).
 */
export function PwaUpdateBanner() {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          if (!cancelled) setWaiting(true);
        }
      });
    };

    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaiting(true);
      }
      reg.addEventListener("updatefound", onUpdateFound);
    });

    const onControllerChange = () => {
      // New SW took control after skipWaiting — reload is already in progress or done.
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const pending = pendingOfflineCount();

  return (
    <div className="ff-pwa-update" role="status" aria-live="polite">
      <p className="ff-pwa-update__text">
        Update available
        {pending > 0 ? ` · ${pending} offline item${pending === 1 ? "" : "s"} will be kept` : ""}
      </p>
      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        onClick={() => {
          void navigator.serviceWorker.getRegistration().then((reg) => {
            reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          });
        }}
      >
        Reload
      </button>
    </div>
  );
}
