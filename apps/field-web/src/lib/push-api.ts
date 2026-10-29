import { apiGet, apiSend } from "@forge/web-kit";

const PUSH_API = "/api/v1/industrial/push";

export type FieldPushVapid = {
  enabled: boolean;
  publicKey: string | null;
};

export type FieldPushSubscriptionRow = {
  id: string;
  endpoint: string;
  enabled: boolean;
  createdAt?: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export const fieldPushApi = {
  getVapid: () => apiGet<FieldPushVapid>(`${PUSH_API}/vapid-public-key`),

  listSubscriptions: () =>
    apiGet<{ enabled: boolean; items: FieldPushSubscriptionRow[] }>(`${PUSH_API}/subscriptions`),

  saveSubscription: (subscription: PushSubscriptionJSON, userAgent?: string) =>
    apiSend<{ id: string; endpoint: string; enabled: boolean }>(
      `${PUSH_API}/subscriptions`,
      "POST",
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent,
      },
    ),

  removeSubscription: (endpoint: string) =>
    apiSend<{ disabled: number }>(
      `${PUSH_API}/subscriptions?endpoint=${encodeURIComponent(endpoint)}`,
      "DELETE",
      { endpoint },
    ),
};

export async function subscribeFieldPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { ok: false, reason: "Push is not supported in this browser." };
  }
  const vapid = await fieldPushApi.getVapid();
  if (!vapid.enabled || !vapid.publicKey) {
    return { ok: false, reason: "Push is not configured for this environment yet." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as BufferSource,
    }));
  await fieldPushApi.saveSubscription(subscription.toJSON(), navigator.userAgent);
  return { ok: true };
}

export async function unsubscribeFieldPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => undefined);
    await fieldPushApi.removeSubscription(endpoint).catch(() => undefined);
  }
}
