"use client";

import { useEffect, useState } from "react";

export type NetworkState = "online" | "offline";

/**
 * Tracks browser connectivity. Starts as "online" so server-rendered markup
 * matches the first client render, then corrects after hydration.
 */
export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>("online");

  useEffect(() => {
    const sync = () => setState(navigator.onLine ? "online" : "offline");
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    // Playwright setOffline does not always deliver the DOM offline event immediately.
    const timer = window.setInterval(sync, 500);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(timer);
    };
  }, []);

  return state;
}

/**
 * Degraded-mode banner for the shell. Status is conveyed by text and an ARIA
 * live region, never by colour alone.
 */
export function NetworkStatusBanner() {
  const state = useNetworkStatus();
  if (state === "online") return null;
  return (
    <div className="ind-network-banner" role="status" aria-live="polite">
      <span aria-hidden="true" className="ind-network-dot" />
      <strong>Offline</strong>
      <span>
        You are working offline. Cached safety records are read-only and new work is queued until
        connectivity returns.
      </span>
    </div>
  );
}
