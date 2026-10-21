"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@forge/web-kit";
import {
  fieldPushApi,
  subscribeFieldPush,
  unsubscribeFieldPush,
} from "@/lib/push-api";

export function PushNotificationsSettings() {
  const [supported, setSupported] = useState(false);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const canPush =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(canPush);
    if (!canPush) return;
    try {
      const [vapid, list] = await Promise.all([
        fieldPushApi.getVapid(),
        fieldPushApi.listSubscriptions().catch(() => ({ enabled: false, items: [] })),
      ]);
      setServerEnabled(vapid.enabled);
      const registration = await navigator.serviceWorker.ready;
      const browserSub = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(browserSub) && list.items.length > 0);
    } catch {
      setServerEnabled(false);
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await subscribeFieldPush();
      if (!result.ok) {
        setMessage(result.reason);
      } else {
        setMessage("Push notifications enabled on this device.");
        await refresh();
      }
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await unsubscribeFieldPush();
      setMessage("Push notifications disabled on this device.");
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not disable push");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <section className="ff-section" aria-labelledby="push-heading">
        <h2 id="push-heading" className="ff-section-title">
          Push notifications
        </h2>
        <p className="ff-hint ff-hint--left">
          This browser does not support Web Push. Alerts still appear in the Alerts tab.
        </p>
      </section>
    );
  }

  return (
    <section className="ff-section" aria-labelledby="push-heading">
      <h2 id="push-heading" className="ff-section-title">
        Push notifications
      </h2>
      <p className="ff-hint ff-hint--left">
        Optional device alerts for Forge Safety - Field Version. Requires HTTPS and VAPID keys on
        the API.
      </p>
      {!serverEnabled ? (
        <p className="ff-meta">
          Server push is not configured yet (set WEB_PUSH_VAPID_PUBLIC_KEY /
          WEB_PUSH_VAPID_PRIVATE_KEY).
        </p>
      ) : (
        <button
          type="button"
          className={subscribed ? "ff-btn ff-btn-secondary" : "ff-btn"}
          disabled={busy}
          onClick={() => void (subscribed ? disable() : enable())}
        >
          {busy ? "Working…" : subscribed ? "Disable push on this device" : "Enable push on this device"}
        </button>
      )}
      {message ? <p className="ff-meta">{message}</p> : null}
    </section>
  );
}
