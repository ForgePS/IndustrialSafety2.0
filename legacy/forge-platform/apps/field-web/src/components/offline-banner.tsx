"use client";

import { useEffect, useState } from "react";

export type NetworkState = "online" | "offline";

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>("online");

  useEffect(() => {
    const sync = () => setState(navigator.onLine ? "online" : "offline");
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return state;
}

export function OfflineBanner({ pendingCount = 0 }: { pendingCount?: number }) {
  const state = useNetworkStatus();
  if (state === "online" && pendingCount === 0) return null;

  const offline = state === "offline";
  return (
    <div className="ff-offline" role="status" aria-live="polite">
      <span className="ff-offline-dot" aria-hidden="true" />
      {offline ? (
        <>
          <strong>Offline</strong>
          <span>
            {pendingCount > 0
              ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting to sync`
              : "Working from this device. We'll sync when your connection returns."}
          </span>
        </>
      ) : (
        <>
          <strong>Synchronizing…</strong>
          <span>
            {pendingCount} item{pendingCount === 1 ? "" : "s"} waiting to sync
          </span>
        </>
      )}
    </div>
  );
}
